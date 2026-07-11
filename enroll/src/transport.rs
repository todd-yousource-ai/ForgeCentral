//! The blocking TLS `PostTransport` to the federated IdP (`IP-CONSOLE-00-DEPLOY` D.3a-console.2c-2c).
//!
//! A one-shot HTTPS/1.1 POST over `rustls` + AWS-LC to the IdP's public host: connect, TLS handshake
//! (trusting the public web PKI via `webpki-roots`), write the request the HTTP codec built, read the whole
//! response (the server closes after it, `Connection: close`), and parse it. This is the real half of the
//! device-grant transport; the poll/state logic ([`crate::device_flow`]) is transport-agnostic and
//! mock-tested. This module is integration glue -- it is exercised against the live IdP at D.3c, not the
//! offline gate.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;

use rustls::pki_types::ServerName;
use rustls::{ClientConfig, ClientConnection, RootCertStore};

use crate::device_flow::PostTransport;
use crate::http::{build_post, parse_response, HttpResponse};
use crate::keystore::EnrollError;

/// A TLS POST transport that trusts the public web PKI (for the IdP host), on the AWS-LC provider.
pub struct WebPkiPostTransport {
    config: Arc<ClientConfig>,
    port: u16,
}

impl WebPkiPostTransport {
    /// Build a transport trusting the Mozilla web PKI roots, TLS 1.2/1.3 on AWS-LC. `port` is normally 443.
    ///
    /// # Errors
    /// [`EnrollError::Sign`] if the TLS client config cannot be assembled.
    pub fn new(port: u16) -> Result<Self, EnrollError> {
        let mut roots = RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let config = ClientConfig::builder_with_provider(Arc::new(
            rustls::crypto::aws_lc_rs::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .map_err(|e| EnrollError::Sign(format!("tls versions: {e}")))?
        .with_root_certificates(roots)
        .with_no_client_auth();
        Ok(Self {
            config: Arc::new(config),
            port,
        })
    }
}

impl Default for WebPkiPostTransport {
    fn default() -> Self {
        // 443 with a valid webpki root store never fails to assemble.
        Self::new(443).expect("web PKI TLS client config")
    }
}

impl PostTransport for WebPkiPostTransport {
    fn post(
        &mut self,
        host: &str,
        path: &str,
        headers: &[(&str, &str)],
        body: &[u8],
    ) -> Result<HttpResponse, EnrollError> {
        let request = build_post(
            host,
            path,
            "application/x-www-form-urlencoded",
            headers,
            body,
        );

        let server_name = ServerName::try_from(host.to_owned())
            .map_err(|_| EnrollError::Sign(format!("invalid IdP host: {host}")))?;
        let mut conn = ClientConnection::new(Arc::clone(&self.config), server_name)
            .map_err(|e| EnrollError::Sign(format!("tls client: {e}")))?;
        let mut socket = TcpStream::connect((host, self.port))
            .map_err(|e| EnrollError::Sign(format!("connect {host}:{}: {e}", self.port)))?;
        let mut tls = rustls::Stream::new(&mut conn, &mut socket);

        tls.write_all(&request)
            .map_err(|e| EnrollError::Sign(format!("tls write: {e}")))?;
        let mut response = Vec::new();
        // Read to EOF: the server closes the connection after the response (`Connection: close`).
        match tls.read_to_end(&mut response) {
            Ok(_) => {}
            // A close without a TLS close_notify surfaces as this after a complete response; the parse below
            // is the real check that we got a full HTTP message.
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof && !response.is_empty() => {}
            Err(e) => return Err(EnrollError::Sign(format!("tls read: {e}"))),
        }
        parse_response(&response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_transport_config_assembles_on_aws_lc() {
        // The AWS-LC provider + the web PKI roots assemble a usable client config (no network).
        let t = WebPkiPostTransport::new(443).unwrap();
        assert_eq!(t.port, 443);
    }
}
