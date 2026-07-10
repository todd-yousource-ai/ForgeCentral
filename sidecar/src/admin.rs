//! The inbound admin-plane terminator (CS.2, INV-CONSOLE-ADMIN-PLANE).
//!
//! Binds the node's own IP on the admin port, terminates the browser TLS on `aws-lc-rs` (hybrid PQC +
//! P-384 CNSA-1.0 floor, [`crate::tls`]), and byte-tunnels the decrypted stream to the BFF's admin HTTP
//! listener on loopback. The sidecar never inspects the tunnelled bytes; it is a transparent proxy whose
//! only job on this leg is the crypto boundary. It holds no engine client -- no engine byte crosses this
//! leg (leg separation is structural).

use std::net::SocketAddr;
use std::sync::Arc;

use tokio::io::copy_bidirectional;
use tokio::net::{TcpListener, TcpStream};
use tokio_rustls::rustls::ServerConfig;
use tokio_rustls::TlsAcceptor;

use crate::bind::{assert_node_ip_bind, SidecarError};

/// The bound admin terminator: a TLS-terminating loopback proxy for the browser -> Console admin leg.
pub struct AdminTerminator {
    listener: TcpListener,
    acceptor: TlsAcceptor,
    upstream: String,
}

impl AdminTerminator {
    /// Bind `bind_ip:port` (fail-closed: `bind_ip` must be the node's own IP literal) and prepare to
    /// terminate with `config`, forwarding decrypted connections to the BFF admin listener at `upstream`.
    ///
    /// # Errors
    /// [`SidecarError::WidenedBind`] on a widened bind; [`SidecarError::Listen`] if the socket cannot bind.
    pub async fn bind(
        bind_ip: &str,
        port: u16,
        upstream: String,
        config: ServerConfig,
    ) -> Result<Self, SidecarError> {
        assert_node_ip_bind(bind_ip)?;
        let addr = format!("{bind_ip}:{port}");
        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| SidecarError::Listen(format!("admin bind {addr}: {e}")))?;
        Ok(Self {
            listener,
            acceptor: TlsAcceptor::from(Arc::new(config)),
            upstream,
        })
    }

    /// The address actually bound (useful when `port` was 0).
    ///
    /// # Errors
    /// [`SidecarError::Listen`] if the local address cannot be read.
    pub fn local_addr(&self) -> Result<SocketAddr, SidecarError> {
        self.listener
            .local_addr()
            .map_err(|e| SidecarError::Listen(e.to_string()))
    }

    /// Accept connections forever, terminating each on its own task. Never returns under normal operation.
    ///
    /// # Errors
    /// [`SidecarError::Listen`] if `accept` fails at the listener level.
    pub async fn run(self) -> Result<(), SidecarError> {
        loop {
            let (tcp, _peer) = self
                .listener
                .accept()
                .await
                .map_err(|e| SidecarError::Listen(format!("admin accept: {e}")))?;
            let acceptor = self.acceptor.clone();
            let upstream = self.upstream.clone();
            tokio::spawn(async move {
                // A single connection's failure (a stray probe, a client that drops mid-handshake) must
                // not take the listener down; it is dropped here. CS.5 adds structured logging.
                let _ = serve(&acceptor, tcp, &upstream).await;
            });
        }
    }
}

/// Terminate one connection's TLS and tunnel it to the BFF admin listener.
async fn serve(acceptor: &TlsAcceptor, tcp: TcpStream, upstream: &str) -> Result<(), SidecarError> {
    let mut tls = acceptor
        .accept(tcp)
        .await
        .map_err(|e| SidecarError::Serve(format!("admin tls accept: {e}")))?;
    let mut up = TcpStream::connect(upstream)
        .await
        .map_err(|e| SidecarError::Serve(format!("admin upstream {upstream}: {e}")))?;
    copy_bidirectional(&mut tls, &mut up)
        .await
        .map_err(|e| SidecarError::Serve(format!("admin tunnel: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    // Tests unwrap known-good fixtures and use a test-minted P-384 leaf; production denies unwrap.
    #![allow(clippy::unwrap_used)]

    use std::net::Ipv4Addr;
    use std::sync::Arc;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::{TcpListener, TcpStream};
    use tokio_rustls::rustls::crypto::{aws_lc_rs, CryptoProvider, SupportedKxGroup};
    use tokio_rustls::rustls::pki_types::pem::PemObject;
    use tokio_rustls::rustls::pki_types::{CertificateDer, ServerName};
    use tokio_rustls::rustls::{version, ClientConfig, RootCertStore};
    use tokio_rustls::TlsConnector;

    use super::AdminTerminator;
    use crate::tls::admin_server_config_from_pem;

    /// Mint a throwaway P-384 self-signed leaf with a `127.0.0.1` SAN (test-only; the runtime never mints).
    fn mint_p384_leaf() -> (Vec<u8>, Vec<u8>) {
        let key = rcgen::KeyPair::generate_for(&rcgen::PKCS_ECDSA_P384_SHA384).unwrap();
        let params = rcgen::CertificateParams::new(vec!["127.0.0.1".to_owned()]).unwrap();
        let cert = params.self_signed(&key).unwrap();
        (cert.pem().into_bytes(), key.serialize_pem().into_bytes())
    }

    /// A loopback echo server (stands in for the BFF admin listener); returns its address.
    async fn spawn_echo() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap().to_string();
        tokio::spawn(async move {
            while let Ok((mut sock, _)) = listener.accept().await {
                tokio::spawn(async move {
                    let mut buf = [0u8; 64];
                    while let Ok(n) = sock.read(&mut buf).await {
                        if n == 0 || sock.write_all(&buf[..n]).await.is_err() {
                            break;
                        }
                    }
                });
            }
        });
        addr
    }

    /// A rustls client that offers exactly one key-exchange group, trusting the test leaf as its root.
    fn client_with_group(group: &'static dyn SupportedKxGroup, root_pem: &[u8]) -> TlsConnector {
        let base = aws_lc_rs::default_provider();
        let provider = Arc::new(CryptoProvider {
            kx_groups: vec![group],
            ..base
        });
        let mut roots = RootCertStore::empty();
        for cert in CertificateDer::pem_slice_iter(root_pem) {
            roots.add(cert.unwrap()).unwrap();
        }
        let config = ClientConfig::builder_with_provider(provider)
            .with_protocol_versions(&[&version::TLS13])
            .unwrap()
            .with_root_certificates(roots)
            .with_no_client_auth();
        TlsConnector::from(Arc::new(config))
    }

    /// Try a full admin handshake with a single-group client; on success, prove the tunnel by echoing.
    async fn handshake_ok(terminator: &str, connector: TlsConnector, leaf: &[u8]) -> bool {
        let tcp = match TcpStream::connect(terminator).await {
            Ok(s) => s,
            Err(_) => return false,
        };
        let name = ServerName::IpAddress(Ipv4Addr::LOCALHOST.into());
        let mut tls = match connector.connect(name, tcp).await {
            Ok(s) => s,
            Err(_) => return false,
        };
        let _ = leaf; // the leaf is the trust root, already installed in the connector
        if tls.write_all(b"ping").await.is_err() {
            return false;
        }
        let mut buf = [0u8; 4];
        tls.read_exact(&mut buf).await.is_ok() && &buf == b"ping"
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn admits_hybrid_and_p384_floor_refuses_sub_floor_groups() {
        let (leaf, key) = mint_p384_leaf();
        let upstream = spawn_echo().await;
        let config = admin_server_config_from_pem(&leaf, &key).unwrap();
        let terminator = AdminTerminator::bind("127.0.0.1", 0, upstream, config)
            .await
            .unwrap();
        let addr = terminator.local_addr().unwrap().to_string();
        tokio::spawn(terminator.run());

        // Hybrid PQC group: negotiated -> OK.
        assert!(
            handshake_ok(
                &addr,
                client_with_group(aws_lc_rs::kx_group::X25519MLKEM768, &leaf),
                &leaf,
            )
            .await,
            "hybrid X25519MLKEM768 client should be admitted",
        );
        // Classical P-384 floor: negotiated -> OK.
        assert!(
            handshake_ok(
                &addr,
                client_with_group(aws_lc_rs::kx_group::SECP384R1, &leaf),
                &leaf,
            )
            .await,
            "classical P-384 client should meet the floor",
        );
        // Sub-floor X25519-only: no shared group -> refused.
        assert!(
            !handshake_ok(
                &addr,
                client_with_group(aws_lc_rs::kx_group::X25519, &leaf),
                &leaf,
            )
            .await,
            "X25519-only (sub-floor) client must be refused",
        );
        // Sub-floor P-256-only: no shared group -> refused.
        assert!(
            !handshake_ok(
                &addr,
                client_with_group(aws_lc_rs::kx_group::SECP256R1, &leaf),
                &leaf,
            )
            .await,
            "P-256-only (sub-floor) client must be refused",
        );
    }

    #[tokio::test]
    async fn refuses_a_widened_bind() {
        let (leaf, key) = mint_p384_leaf();
        let config = admin_server_config_from_pem(&leaf, &key).unwrap();
        let result = AdminTerminator::bind("0.0.0.0", 0, "127.0.0.1:1".to_owned(), config).await;
        assert!(result.is_err(), "a wildcard admin bind must be refused");
    }
}
