//! The outbound engine originator (CS.3, INV-CONSOLE-CRYPTO-AWSLC engine leg).
//!
//! Listens on a loopback egress socket for the BFF's outbound wire bytes, originates the mTLS channel to
//! the engine's control-plane `:7879` gateway on CrucibleDB's `cdb-mtls` hybrid profile (TLS 1.3,
//! X25519MLKEM768-only, mutual auth -- byte-identical to the engine), and byte-tunnels between them. The
//! sidecar presents the permanent, pinned SOFTWARE Console-CA leaf the node installer generates
//! (IP-CONSOLE-CONTROL-PLANE D2, `/etc/cdb/control/client.key`) and signs the handshake in-process. The
//! wire framing + reactor handshake run in the BFF (`@forge/wire`); this leg is a transparent byte tunnel,
//! so byte-exactness is unchanged.

use std::sync::Arc;

use tokio::io::copy_bidirectional;
use tokio::net::{TcpListener, TcpStream};
use tokio_rustls::client::TlsStream;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::ClientConfig;
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
    /// to `engine_addr`, verifying the engine server certificate as `server_name` and presenting the
    /// mutually-authenticating `client_config` the caller built from the software Console-CA leaf
    /// (IP-CONSOLE-CONTROL-PLANE D2). The key signs in-process, so no device gate is needed.
    ///
    /// # Errors
    /// [`SidecarError::Config`] on a non-loopback egress or a bad server name; [`SidecarError::Listen`] if
    /// the egress socket cannot bind.
    pub async fn bind(
        egress_addr: &str,
        engine_addr: String,
        server_name: &str,
        client_config: ClientConfig,
    ) -> Result<Self, SidecarError> {
        assert_loopback_addr(egress_addr)?;
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
    let mut up = connector
        .connect(name, tcp)
        .await
        .map_err(|e| SidecarError::Serve(format!("engine mtls handshake: {e}")))?;
    copy_bidirectional(&mut down, &mut up)
        .await
        .map_err(|e| SidecarError::Serve(format!("engine tunnel: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]
    use super::EngineOriginator;

    /// A throwaway self-signed software leaf so `bind` can build a client config (the runtime never mints
    /// certs). Returns `(ca_pem, cert_pem, key_pem)`.
    fn software_leaf() -> (Vec<u8>, Vec<u8>, Vec<u8>) {
        let key = rcgen::KeyPair::generate().unwrap();
        let params = rcgen::CertificateParams::new(vec!["console.local".to_owned()]).unwrap();
        let cert = params.self_signed(&key).unwrap();
        (
            cert.pem().into_bytes(),
            cert.pem().into_bytes(),
            key.serialize_pem().into_bytes(),
        )
    }

    fn software_client_config() -> tokio_rustls::rustls::ClientConfig {
        let (ca_pem, cert_pem, key_pem) = software_leaf();
        cdb_mtls::client_config(&ca_pem, &cert_pem, &key_pem)
            .expect("a software mTLS client config should build")
    }

    #[tokio::test]
    async fn refuses_a_routable_egress_bind() {
        let result = EngineOriginator::bind(
            "10.0.0.5:0",
            "127.0.0.1:7879".to_owned(),
            "control.localhost",
            software_client_config(),
        )
        .await;
        assert!(result.is_err(), "a routable egress bind must be refused");
    }

    #[tokio::test]
    async fn binds_a_loopback_egress_with_the_software_leaf() {
        // IP-CONSOLE-CONTROL-PLANE D2: the sidecar presents the software Console-CA leaf on :7879.
        let originator = EngineOriginator::bind(
            "127.0.0.1:0",
            "127.0.0.1:7879".to_owned(),
            "control.localhost",
            software_client_config(),
        )
        .await
        .expect("loopback egress + software client config should build");
        assert!(originator.local_addr().unwrap().ip().is_loopback());
    }

    /// Software live capstone (IP-CONSOLE-CONTROL-PLANE F1/D2): present the software Console-CA leaf and
    /// dial the running control plane on `:7879`, proving the software mTLS handshake completes. Env:
    /// `SIDECAR_TEST_ENGINE_CA` / `_CERT` / `_KEY` (the control `ca.pem` / `client.pem` / `client.key`),
    /// `SIDECAR_TEST_ENGINE_ADDR` (default `127.0.0.1:7879`), `SIDECAR_TEST_ENGINE_SNI` (default
    /// `control.localhost`).
    #[tokio::test]
    #[ignore = "requires the live control plane + the software Console-CA leaf"]
    async fn dials_the_live_control_plane_over_software_mtls() {
        let ca = std::fs::read(std::env::var("SIDECAR_TEST_ENGINE_CA").unwrap()).unwrap();
        let cert = std::fs::read(std::env::var("SIDECAR_TEST_ENGINE_CERT").unwrap()).unwrap();
        let key = std::fs::read(std::env::var("SIDECAR_TEST_ENGINE_KEY").unwrap()).unwrap();
        let addr = std::env::var("SIDECAR_TEST_ENGINE_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:7879".to_owned());
        let sni = std::env::var("SIDECAR_TEST_ENGINE_SNI")
            .unwrap_or_else(|_| "control.localhost".to_owned());
        let cc =
            cdb_mtls::client_config(&ca, &cert, &key).expect("build the software client config");
        let originator = EngineOriginator::bind("127.0.0.1:0", addr, &sni, cc)
            .await
            .expect("originator builds from the software Console-CA leaf");
        originator
            .dial_engine()
            .await
            .expect("software mTLS handshake to the live control plane :7879 completes");
    }
}
