//! The outbound engine originator (CS.3, INV-CONSOLE-CRYPTO-AWSLC engine leg).
//!
//! Listens on a loopback egress socket for the BFF's outbound wire bytes, originates the mTLS channel to
//! the engine's `:7878` wire gateway on CrucibleDB's `cdb-mtls` hybrid profile (TLS 1.3,
//! X25519MLKEM768-only, mutual auth -- byte-identical to the engine), and byte-tunnels between them. The
//! sidecar presents the Console's enrolled leaf and signs the handshake with the NON-EXPORTABLE,
//! TPM-resident engine key (via `cdb_device_identity::tpm_mtls_client_config`): the private key never
//! leaves the TPM. Because rustls signs synchronously inside the async handshake and that call blocks the
//! worker on a TPM round-trip, each handshake first acquires the process `tpm_signing_gate` so at most one
//! connect is parked in the device at a time (no pool starvation). The wire framing + reactor handshake
//! run in the BFF (`@forge/wire`); this leg is a transparent byte tunnel, so byte-exactness is unchanged.

use std::sync::Arc;

use cdb_device_identity::{tpm_signing_gate, SharedKeystore};
use tokio::io::copy_bidirectional;
use tokio::net::{TcpListener, TcpStream};
use tokio_rustls::client::TlsStream;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::TlsConnector;

use crate::bind::{assert_loopback_addr, SidecarError};

/// The bound engine originator: a loopback-plaintext-to-engine-mTLS tunnel for the Console -> engine leg.
pub struct EngineOriginator {
    listener: TcpListener,
    connector: TlsConnector,
    engine_addr: String,
    server_name: ServerName<'static>,
}

impl EngineOriginator {
    /// Bind the loopback `egress_addr` (fail-closed: must be loopback) and prepare the mTLS client channel
    /// to `engine_addr`, verifying the engine server certificate as `server_name` against `ca_pem` and
    /// presenting `cert_chain_der` (the Console's enrolled leaf, DER) signed by the TPM-resident key in
    /// `keystore` (the private key never leaves the device).
    ///
    /// # Errors
    /// [`SidecarError::Config`] on a non-loopback egress, a bad server name, or malformed mTLS material;
    /// [`SidecarError::Listen`] if the egress socket cannot bind.
    pub async fn bind(
        egress_addr: &str,
        engine_addr: String,
        server_name: &str,
        ca_pem: &[u8],
        cert_chain_der: Vec<Vec<u8>>,
        keystore: SharedKeystore,
    ) -> Result<Self, SidecarError> {
        assert_loopback_addr(egress_addr)?;
        let client_config =
            cdb_device_identity::tpm_mtls_client_config(ca_pem, cert_chain_der, keystore)
                .map_err(|e| SidecarError::Config(format!("engine mtls config: {e}")))?;
        let name = ServerName::try_from(server_name.to_owned())
            .map_err(|e| SidecarError::Config(format!("engine server name {server_name}: {e}")))?;
        let listener = TcpListener::bind(egress_addr)
            .await
            .map_err(|e| SidecarError::Listen(format!("egress bind {egress_addr}: {e}")))?;
        Ok(Self {
            listener,
            connector: TlsConnector::from(Arc::new(client_config)),
            engine_addr,
            server_name: name,
        })
    }

    /// The loopback egress address actually bound (useful when the port was 0).
    ///
    /// # Errors
    /// [`SidecarError::Listen`] if the local address cannot be read.
    pub fn local_addr(&self) -> Result<std::net::SocketAddr, SidecarError> {
        self.listener
            .local_addr()
            .map_err(|e| SidecarError::Listen(e.to_string()))
    }

    /// Establish the mTLS channel to the engine once (the handshake proves the crypto leg). Used by the
    /// run loop's per-connection tunnel and by the live capstone.
    ///
    /// # Errors
    /// [`SidecarError::Serve`] if the engine cannot be reached or the mTLS handshake fails.
    pub async fn dial_engine(&self) -> Result<TlsStream<TcpStream>, SidecarError> {
        let tcp = TcpStream::connect(&self.engine_addr).await.map_err(|e| {
            SidecarError::Serve(format!("engine connect {}: {e}", self.engine_addr))
        })?;
        // Serialize the in-TPM handshake signature so at most one connect parks a worker in the device.
        let _permit = tpm_signing_gate()
            .acquire()
            .await
            .map_err(|e| SidecarError::Serve(format!("tpm signing gate: {e}")))?;
        self.connector
            .connect(self.server_name.clone(), tcp)
            .await
            .map_err(|e| SidecarError::Serve(format!("engine mtls handshake: {e}")))
    }

    /// Accept egress connections forever, tunnelling each to the engine over mTLS on its own task.
    ///
    /// # Errors
    /// [`SidecarError::Listen`] if `accept` fails at the listener level.
    pub async fn run(self) -> Result<(), SidecarError> {
        loop {
            let (down, _peer) = self
                .listener
                .accept()
                .await
                .map_err(|e| SidecarError::Listen(format!("egress accept: {e}")))?;
            let connector = self.connector.clone();
            let engine_addr = self.engine_addr.clone();
            let name = self.server_name.clone();
            tokio::spawn(async move {
                let _ = tunnel(&connector, name, &engine_addr, down).await;
            });
        }
    }
}

/// Tunnel one egress connection to the engine over mTLS.
async fn tunnel(
    connector: &TlsConnector,
    name: ServerName<'static>,
    engine_addr: &str,
    mut down: TcpStream,
) -> Result<(), SidecarError> {
    let tcp = TcpStream::connect(engine_addr)
        .await
        .map_err(|e| SidecarError::Serve(format!("engine connect {engine_addr}: {e}")))?;
    // Gate only the handshake (the in-TPM signature); the permit is released before the long-lived tunnel.
    let mut up = {
        let _permit = tpm_signing_gate()
            .acquire()
            .await
            .map_err(|e| SidecarError::Serve(format!("tpm signing gate: {e}")))?;
        connector
            .connect(name, tcp)
            .await
            .map_err(|e| SidecarError::Serve(format!("engine mtls handshake: {e}")))?
    };
    copy_bidirectional(&mut down, &mut up)
        .await
        .map_err(|e| SidecarError::Serve(format!("engine tunnel: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]
    use std::sync::{Arc, Mutex};

    use cdb_device_identity::{
        KeyHandle, KeyResidency, KeystoreBackend, KeystoreError, SharedKeystore,
    };
    use tokio_rustls::rustls::pki_types::pem::PemObject as _;
    use tokio_rustls::rustls::pki_types::CertificateDer;

    use super::EngineOriginator;

    /// A no-op keystore: the client config only needs a signer to BUILD (it signs nothing without a live
    /// handshake). The runtime backend is `console_tpm::TpmBackend`.
    struct NullKeystore;
    impl KeystoreBackend for NullKeystore {
        fn open(&mut self) -> Result<(), KeystoreError> {
            Ok(())
        }
        fn generate_key(&mut self) -> Result<KeyHandle, KeystoreError> {
            Ok(KeyHandle {
                reference: "null".to_owned(),
                public_der: Vec::new(),
                residency: KeyResidency::HardwareNonExportable,
            })
        }
        fn sign(&mut self, _message: &[u8]) -> Result<Vec<u8>, KeystoreError> {
            Err(KeystoreError::Unsupported)
        }
        fn attest(&mut self, _nonce: &[u8]) -> Result<cdb_types::DeviceAttestation, KeystoreError> {
            Err(KeystoreError::Unsupported)
        }
    }

    fn null_keystore() -> SharedKeystore {
        Arc::new(Mutex::new(NullKeystore))
    }

    /// A throwaway self-signed leaf so bind can build a client config (PEM for the CA root, DER for the
    /// presented chain) without the live node; the runtime never mints certs.
    fn self_signed() -> (Vec<u8>, Vec<u8>) {
        let key = rcgen::KeyPair::generate().unwrap();
        let params = rcgen::CertificateParams::new(vec!["console.local".to_owned()]).unwrap();
        let cert = params.self_signed(&key).unwrap();
        (cert.pem().into_bytes(), cert.der().to_vec())
    }

    #[tokio::test]
    async fn refuses_a_routable_egress_bind() {
        let (ca_pem, leaf_der) = self_signed();
        let result = EngineOriginator::bind(
            "10.0.0.5:0",
            "127.0.0.1:7878".to_owned(),
            "wire.localhost",
            &ca_pem,
            vec![leaf_der],
            null_keystore(),
        )
        .await;
        assert!(result.is_err(), "a routable egress bind must be refused");
    }

    #[tokio::test]
    async fn binds_a_loopback_egress_with_the_tpm_signed_profile() {
        let (ca_pem, leaf_der) = self_signed();
        let originator = EngineOriginator::bind(
            "127.0.0.1:0",
            "127.0.0.1:7878".to_owned(),
            "wire.localhost",
            &ca_pem,
            vec![leaf_der],
            null_keystore(),
        )
        .await
        .expect("loopback egress + TPM-signed client config should build");
        assert!(originator.local_addr().unwrap().ip().is_loopback());
    }

    /// Live capstone leg (run manually / in the full live run): re-derive the enrolled TPM key, present the
    /// enrolled leaf, and dial the running engine on `:7878`, proving the TPM-signed mTLS handshake
    /// completes. Needs the enrolled identity: `SIDECAR_TEST_ENGINE_CA`, `SIDECAR_TEST_ENGINE_CERT` (the
    /// enrolled leaf PEM), `SIDECAR_TEST_TCTI` (default `device:/dev/tpmrm0`), `SIDECAR_TEST_ENGINE_ADDR`
    /// (default `127.0.0.1:7878`), `SIDECAR_TEST_ENGINE_SNI` (default `wire.localhost`).
    #[tokio::test]
    #[ignore = "requires the live engine node + the enrolled TPM identity"]
    async fn dials_the_live_engine_over_mtls() {
        let ca = std::fs::read(std::env::var("SIDECAR_TEST_ENGINE_CA").unwrap()).unwrap();
        let cert_pem = std::fs::read(std::env::var("SIDECAR_TEST_ENGINE_CERT").unwrap()).unwrap();
        let leaf_der = CertificateDer::pem_slice_iter(&cert_pem)
            .next()
            .unwrap()
            .unwrap()
            .as_ref()
            .to_vec();
        let tcti =
            std::env::var("SIDECAR_TEST_TCTI").unwrap_or_else(|_| "device:/dev/tpmrm0".to_owned());
        let addr = std::env::var("SIDECAR_TEST_ENGINE_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:7878".to_owned());
        let sni = std::env::var("SIDECAR_TEST_ENGINE_SNI")
            .unwrap_or_else(|_| "wire.localhost".to_owned());

        let mut tpm = console_tpm::TpmBackend::new(tcti);
        tpm.open().expect("open the host TPM");
        tpm.generate_key().expect("re-derive the enrolled TPM key");
        let keystore: SharedKeystore = Arc::new(Mutex::new(tpm));

        let originator =
            EngineOriginator::bind("127.0.0.1:0", addr, &sni, &ca, vec![leaf_der], keystore)
                .await
                .expect("originator builds from the enrolled TPM identity");
        originator
            .dial_engine()
            .await
            .expect("TPM-signed mTLS handshake to the live engine :7878 completes");
    }
}
