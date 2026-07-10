//! The outbound engine originator (CS.3, INV-CONSOLE-CRYPTO-AWSLC engine leg).
//!
//! Listens on a loopback egress socket for the BFF's outbound wire bytes, originates the mTLS channel to
//! the engine's `:7878` wire gateway using CrucibleDB's `cdb-mtls` client profile (TLS 1.3,
//! X25519MLKEM768-only, mutual auth -- byte-identical to the engine), and byte-tunnels between them. The
//! wire framing + reactor handshake run in the BFF (`@forge/wire`); this leg is a transparent byte tunnel,
//! so byte-exactness to crdb is unchanged. The sidecar presents the Console's enrolled client identity;
//! no browser byte reaches `:7878` (leg separation).

use std::sync::Arc;

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
    /// Bind the loopback `egress_addr` (fail-closed: must be loopback) and prepare the `cdb-mtls` client
    /// channel to `engine_addr`, verifying the engine server certificate as `server_name` against `ca_pem`
    /// and presenting `cert_pem`/`key_pem` (the Console's enrolled client identity).
    ///
    /// # Errors
    /// [`SidecarError::Config`] on a non-loopback egress, a bad server name, or malformed mTLS material;
    /// [`SidecarError::Listen`] if the egress socket cannot bind.
    pub async fn bind(
        egress_addr: &str,
        engine_addr: String,
        server_name: &str,
        ca_pem: &[u8],
        cert_pem: &[u8],
        key_pem: &[u8],
    ) -> Result<Self, SidecarError> {
        assert_loopback_addr(egress_addr)?;
        let client_config = cdb_mtls::client_config(ca_pem, cert_pem, key_pem)
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

    /// Mint a throwaway self-signed leaf (its own CA) so `cdb_mtls::client_config` can be exercised without
    /// the live node; the runtime never mints certs.
    fn self_signed() -> (Vec<u8>, Vec<u8>) {
        let key = rcgen::KeyPair::generate().unwrap();
        let params = rcgen::CertificateParams::new(vec!["console.local".to_owned()]).unwrap();
        let cert = params.self_signed(&key).unwrap();
        (cert.pem().into_bytes(), key.serialize_pem().into_bytes())
    }

    #[tokio::test]
    async fn refuses_a_routable_egress_bind() {
        let (cert, key) = self_signed();
        let result = EngineOriginator::bind(
            "10.0.0.5:0",
            "127.0.0.1:7878".to_owned(),
            "wire.localhost",
            &cert,
            &cert,
            &key,
        )
        .await;
        assert!(result.is_err(), "a routable egress bind must be refused");
    }

    #[tokio::test]
    async fn binds_a_loopback_egress_with_the_cdb_mtls_profile() {
        let (cert, key) = self_signed();
        let originator = EngineOriginator::bind(
            "127.0.0.1:0",
            "127.0.0.1:7878".to_owned(),
            "wire.localhost",
            &cert,
            &cert,
            &key,
        )
        .await
        .expect("loopback egress + cdb-mtls client config should build");
        assert!(originator.local_addr().unwrap().ip().is_loopback());
    }

    /// Live capstone leg (run manually / in the full live run): dial the running engine on `:7878` through
    /// the `cdb-mtls` profile and prove the mTLS handshake completes. Needs the node's wire identity:
    /// `SIDECAR_TEST_ENGINE_CA`, `SIDECAR_TEST_ENGINE_CERT`, `SIDECAR_TEST_ENGINE_KEY`,
    /// `SIDECAR_TEST_ENGINE_ADDR` (default `127.0.0.1:7878`), `SIDECAR_TEST_ENGINE_SNI` (default
    /// `wire.localhost`).
    #[tokio::test]
    #[ignore = "requires the live engine node + its wire client identity"]
    async fn dials_the_live_engine_over_mtls() {
        let read = |var: &str| std::fs::read(std::env::var(var).unwrap()).unwrap();
        let ca = read("SIDECAR_TEST_ENGINE_CA");
        let cert = read("SIDECAR_TEST_ENGINE_CERT");
        let key = read("SIDECAR_TEST_ENGINE_KEY");
        let addr = std::env::var("SIDECAR_TEST_ENGINE_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:7878".to_owned());
        let sni = std::env::var("SIDECAR_TEST_ENGINE_SNI")
            .unwrap_or_else(|_| "wire.localhost".to_owned());
        let originator = EngineOriginator::bind("127.0.0.1:0", addr, &sni, &ca, &cert, &key)
            .await
            .expect("originator should build from the node's wire identity");
        originator
            .dial_engine()
            .await
            .expect("mTLS handshake to the live engine :7878 should complete");
    }
}
