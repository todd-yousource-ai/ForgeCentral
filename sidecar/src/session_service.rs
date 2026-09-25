//! The BFF -> sidecar admin-session lookup (IP-CONSOLE-11 ST.5b, TRD-CONSOLE-11 Section 9.2 Security).
//!
//! The admin terminator ([`crate::admin`]) tunnels each browser TLS session to the BFF over its own
//! loopback TCP connection, and never inspects the tunnelled bytes. The BFF therefore cannot see which
//! key exchange the browser negotiated. This leg answers exactly that, without the sidecar parsing
//! HTTP: the terminator REGISTERS each live tunnel's negotiated group under the tunnel's loopback
//! SOURCE PORT (the port the BFF sees as the request's remote port), and the BFF asks by that port.
//!
//! The registration happens before any tunnelled byte is forwarded and is removed when the tunnel
//! ends, so a lookup made while a request is being served always names that request's own session. A
//! port with no live tunnel answers `null`: a loopback connection that did not come through the
//! terminator has no admin-plane session to describe, and the BFF must say so rather than guess.
//!
//! # Protocol
//!
//! Newline-delimited JSON on a persistent loopback connection, one request per line: `{"port": N}` in,
//! `{"group": "X25519MLKEM768" | "secp384r1" | "other" | null}` out. A malformed request is answered
//! `{"error": ...}`. Each request is read under a small byte cap; an oversized one ends the connection.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio_rustls::rustls::NamedGroup;

use crate::bind::{assert_loopback_addr, SidecarError};

/// The largest request accepted, in bytes. A request is one port number in a one-field object.
const MAX_REQUEST_BYTES: usize = 256;

/// The stable name of a negotiated group, as the BFF and the Console show it. Only the two groups the
/// admin terminator admits are named; anything else (which the terminator refuses today) is `other`.
#[must_use]
pub fn group_name(group: NamedGroup) -> &'static str {
    match group {
        NamedGroup::X25519MLKEM768 => "X25519MLKEM768",
        NamedGroup::secp384r1 => "secp384r1",
        _ => "other",
    }
}

/// The live admin tunnels: loopback source port -> negotiated group name.
#[derive(Debug, Default)]
pub struct SessionRegistry {
    live: Mutex<HashMap<u16, &'static str>>,
}

impl SessionRegistry {
    /// An empty registry, shared between the terminator and the lookup service.
    #[must_use]
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// Register a live tunnel; the returned guard removes it when dropped (the tunnel ended).
    #[must_use]
    pub fn register(self: &Arc<Self>, port: u16, group: &'static str) -> SessionGuard {
        if let Ok(mut live) = self.live.lock() {
            live.insert(port, group);
        }
        SessionGuard {
            registry: Arc::clone(self),
            port,
        }
    }

    /// The group negotiated by the live tunnel from `port`, if one exists.
    #[must_use]
    pub fn lookup(&self, port: u16) -> Option<&'static str> {
        self.live
            .lock()
            .ok()
            .and_then(|live| live.get(&port).copied())
    }
}

/// Removes a tunnel's registration when the tunnel ends.
#[derive(Debug)]
pub struct SessionGuard {
    registry: Arc<SessionRegistry>,
    port: u16,
}

impl Drop for SessionGuard {
    fn drop(&mut self) {
        if let Ok(mut live) = self.registry.live.lock() {
            live.remove(&self.port);
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct LookupRequest {
    port: u16,
}

/// One lookup answer: the group, or null when no live admin tunnel uses that port.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum LookupResponse {
    /// The lookup ran.
    Found {
        /// The group name, or `None` for a port with no live admin tunnel.
        group: Option<String>,
    },
    /// The request was malformed.
    Refused {
        /// Why.
        error: String,
    },
}

/// The bound session-lookup service.
pub struct SessionService {
    listener: TcpListener,
    registry: Arc<SessionRegistry>,
}

impl SessionService {
    /// Bind the loopback `addr` (fail-closed: must be loopback) over `registry`.
    ///
    /// # Errors
    /// [`SidecarError::Config`] on a non-loopback address; [`SidecarError::Listen`] if it cannot bind.
    pub async fn bind(addr: &str, registry: Arc<SessionRegistry>) -> Result<Self, SidecarError> {
        assert_loopback_addr(addr)?;
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| SidecarError::Listen(format!("session service {addr}: {e}")))?;
        Ok(Self { listener, registry })
    }

    /// The address actually bound, for a caller that passed port 0.
    ///
    /// # Errors
    /// [`SidecarError::Listen`] if the socket address cannot be read back.
    pub fn local_addr(&self) -> Result<std::net::SocketAddr, SidecarError> {
        self.listener
            .local_addr()
            .map_err(|e| SidecarError::Listen(format!("session service local addr: {e}")))
    }

    /// Accept and serve connections until the listener fails. One failed connection ends only itself.
    ///
    /// # Errors
    /// [`SidecarError::Listen`] if accepting fails.
    pub async fn run(self) -> Result<(), SidecarError> {
        loop {
            let (stream, _peer) = self
                .listener
                .accept()
                .await
                .map_err(|e| SidecarError::Listen(format!("session service accept: {e}")))?;
            let registry = Arc::clone(&self.registry);
            tokio::spawn(async move {
                let _ = serve_connection(stream, &registry).await;
            });
        }
    }
}

async fn serve_connection(
    stream: TcpStream,
    registry: &SessionRegistry,
) -> Result<(), SidecarError> {
    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let mut line = Vec::new();
    loop {
        line.clear();
        let read = (&mut reader)
            .take(MAX_REQUEST_BYTES as u64 + 1)
            .read_until(b'\n', &mut line)
            .await
            .map_err(|e| SidecarError::Serve(format!("session service read: {e}")))?;
        if read == 0 {
            return Ok(());
        }
        let complete = line.last() == Some(&b'\n');
        if !complete && line.len() > MAX_REQUEST_BYTES {
            let refusal = LookupResponse::Refused {
                error: format!("request exceeds {MAX_REQUEST_BYTES} bytes"),
            };
            write_response(&mut writer, &refusal).await?;
            return Ok(());
        }
        if line.iter().all(u8::is_ascii_whitespace) {
            if complete {
                continue;
            }
            return Ok(());
        }
        let response = match serde_json::from_slice::<LookupRequest>(&line) {
            Ok(request) => LookupResponse::Found {
                group: registry.lookup(request.port).map(str::to_owned),
            },
            Err(err) => LookupResponse::Refused {
                error: format!("malformed lookup: {err}"),
            },
        };
        write_response(&mut writer, &response).await?;
        if !complete {
            return Ok(());
        }
    }
}

async fn write_response(
    writer: &mut tokio::net::tcp::OwnedWriteHalf,
    response: &LookupResponse,
) -> Result<(), SidecarError> {
    let mut encoded = serde_json::to_vec(response)
        .map_err(|e| SidecarError::Serve(format!("session service encode: {e}")))?;
    encoded.push(b'\n');
    writer
        .write_all(&encoded)
        .await
        .map_err(|e| SidecarError::Serve(format!("session service write: {e}")))
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
    use super::*;

    async fn ask(addr: std::net::SocketAddr, line: &str) -> String {
        let mut stream = TcpStream::connect(addr).await.unwrap();
        stream.write_all(line.as_bytes()).await.unwrap();
        let mut reader = BufReader::new(stream);
        let mut out = String::new();
        reader.read_line(&mut out).await.unwrap();
        out
    }

    async fn serving(registry: &Arc<SessionRegistry>) -> std::net::SocketAddr {
        let service = SessionService::bind("127.0.0.1:0", Arc::clone(registry))
            .await
            .unwrap();
        let addr = service.local_addr().unwrap();
        tokio::spawn(service.run());
        addr
    }

    #[test]
    fn names_only_the_two_admitted_groups() {
        assert_eq!(group_name(NamedGroup::X25519MLKEM768), "X25519MLKEM768");
        assert_eq!(group_name(NamedGroup::secp384r1), "secp384r1");
        assert_eq!(group_name(NamedGroup::X25519), "other");
    }

    #[tokio::test]
    async fn a_live_tunnel_is_found_by_its_port_and_forgotten_when_it_ends() {
        let registry = SessionRegistry::new();
        let addr = serving(&registry).await;
        let guard = registry.register(50_001, "X25519MLKEM768");
        assert_eq!(
            ask(addr, "{\"port\":50001}\n").await.trim(),
            "{\"group\":\"X25519MLKEM768\"}"
        );
        assert_eq!(
            ask(addr, "{\"port\":50002}\n").await.trim(),
            "{\"group\":null}"
        );
        drop(guard);
        assert_eq!(
            ask(addr, "{\"port\":50001}\n").await.trim(),
            "{\"group\":null}"
        );
    }

    #[tokio::test]
    async fn a_malformed_or_oversized_request_is_refused() {
        let registry = SessionRegistry::new();
        let addr = serving(&registry).await;
        assert!(ask(addr, "{\"port\":\"x\"}\n").await.contains("\"error\""));
        assert!(ask(addr, "{\"port\":1,\"extra\":2}\n")
            .await
            .contains("\"error\""));
        let long = format!("{{\"port\":{}}}\n", "1".repeat(400));
        assert!(ask(addr, &long).await.contains("exceeds"));
    }

    #[tokio::test]
    async fn a_routable_bind_is_refused() {
        assert!(SessionService::bind("0.0.0.0:0", SessionRegistry::new())
            .await
            .is_err());
    }
}
