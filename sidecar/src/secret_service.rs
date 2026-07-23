//! The BFF -> sidecar secret-set loopback service (IP-CONSOLE-04 ID.4 part 3).
//!
//! The onboarding form lets an operator enter an IdAM connector's client secret. The secret must reach
//! the node's mode-protected secret store WITHOUT ever being stored by the Console or crossing the
//! engine wire. This is the seam: the BFF forwards the secret on a loopback socket, and the sidecar --
//! the one on-node, Console-owned process that already owns a mode-protected secret file (the signing
//! seed) -- writes it to the configured path. The engine then holds only a `client_secret_ref` (the
//! path) and reads the secret from disk (crdb `INV-IDAM-NO-SECRET-INGEST` -- no secret VALUE on the
//! engine wire).
//!
//! Like `sign_service` and unlike the `admin`/`engine` byte tunnels, this is a TYPED leg: it parses a
//! request and produces a typed response, because what it protects is not a channel but a credential.
//! The secret is written atomically (a temp file in the same directory + an explicit `0640` mode +
//! rename), so a reader never observes a half-written secret, and is NEVER logged or returned.
//!
//! # Ownership (a deployment binding)
//!
//! The file is written `0640` (owner rw, group r). The engine runs as a different user (`cdb`) and
//! reads it via a shared group: the installer must run the sidecar in a group `cdb` can read, or make
//! the secret directory setgid `cdb`. The sidecar writes the mode; it does not `chown` (that needs
//! privilege it does not hold). The signing seed is `0600` under the sidecar's own user; the connector
//! secret is `0640` because a second user must read it.
//!
//! # Protocol
//!
//! Newline-delimited JSON, one request per line, one response per line, on a persistent loopback
//! connection. Bounded PER REQUEST so a peer cannot exhaust memory by withholding a newline; an
//! oversized or malformed request writes no secret.

use std::io::Write as _;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

use crate::bind::{assert_loopback_addr, SidecarError};

/// The largest request accepted, in bytes.
///
/// TUNE: a request is a provider slug plus one client secret. Provider secrets are short (Auth0's are
/// tens of characters); 64 KiB is orders of magnitude beyond any real secret and small enough that a
/// stuck or hostile peer cannot pressure the process. Raise it only for a secret that demonstrably
/// needs it.
const MAX_REQUEST_BYTES: usize = 64 * 1024;

/// The only provider whose secret this leg accepts. A single connector today; extending it is a
/// deliberate change, not an open door.
const AUTH0_PROVIDER: &str = "auth0";

/// A request to place a connector's client secret on the node.
#[derive(Debug, Deserialize)]
pub struct SecretSetRequest {
    /// The connector this secret belongs to (`auth0`).
    pub provider: String,
    /// The client secret VALUE. Written to disk and dropped; never logged or returned.
    pub secret: String,
}

/// The response to a secret-set request. Externally tagged so a refusal can never be mistaken for a
/// success, and carrying NO secret and no internal path.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SecretSetResponse {
    /// The secret was written to the node's secret store.
    Ok,
    /// The request was refused, with a reason that names no secret and no path.
    Refused { reason: String },
}

/// The bound secret-set service.
pub struct SecretService {
    listener: TcpListener,
    path: PathBuf,
}

impl SecretService {
    /// Bind the loopback `addr` (fail-closed: must be loopback) and write accepted secrets to `path`.
    ///
    /// # Errors
    /// [`SidecarError::Config`] on a non-loopback or malformed address; [`SidecarError::Listen`] if
    /// the socket cannot bind.
    pub async fn bind(addr: &str, path: PathBuf) -> Result<Self, SidecarError> {
        // The secret is written through this socket, so a routable bind would expose the write to the
        // network. Refused before the listener exists, not after.
        assert_loopback_addr(addr)?;
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| SidecarError::Listen(format!("secret service {addr}: {e}")))?;
        Ok(Self { listener, path })
    }

    /// The address actually bound, for a caller that passed port 0.
    ///
    /// # Errors
    /// [`SidecarError::Listen`] if the socket address cannot be read back.
    pub fn local_addr(&self) -> Result<std::net::SocketAddr, SidecarError> {
        self.listener
            .local_addr()
            .map_err(|e| SidecarError::Listen(format!("secret service local addr: {e}")))
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
                .map_err(|e| SidecarError::Listen(format!("secret service accept: {e}")))?;
            let path = self.path.clone();
            tokio::spawn(async move {
                // A per-connection failure is not a service failure; the connection simply ends.
                let _ = serve_connection(stream, &path).await;
            });
        }
    }
}

/// Serve one connection: read newline-delimited requests, answer each with a response line.
async fn serve_connection(stream: TcpStream, path: &Path) -> Result<(), SidecarError> {
    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let mut line: Vec<u8> = Vec::new();

    loop {
        line.clear();
        match read_request_line(&mut reader, &mut line).await? {
            RequestRead::Eof => return Ok(()),
            RequestRead::Oversized => {
                let refusal = SecretSetResponse::Refused {
                    reason: format!("secret request exceeds {MAX_REQUEST_BYTES} bytes"),
                };
                write_response(&mut writer, &refusal).await?;
                return Ok(());
            }
            RequestRead::Line => {}
        }
        if line.iter().all(u8::is_ascii_whitespace) {
            continue;
        }
        let response = handle_request(&line, path);
        write_response(&mut writer, &response).await?;
    }
}

/// Parse and apply one request. A request that does not parse, names an unknown provider, or carries
/// an empty secret writes NOTHING. Never includes the secret in its result.
fn handle_request(line: &[u8], path: &Path) -> SecretSetResponse {
    let request: SecretSetRequest = match serde_json::from_slice(line) {
        Ok(request) => request,
        Err(err) => {
            return SecretSetResponse::Refused {
                reason: format!("malformed secret request: {err}"),
            }
        }
    };
    if request.provider != AUTH0_PROVIDER {
        return SecretSetResponse::Refused {
            reason: "unknown provider".to_owned(),
        };
    }
    if request.secret.is_empty() {
        return SecretSetResponse::Refused {
            reason: "empty secret".to_owned(),
        };
    }
    match write_secret_file(path, &request.secret) {
        Ok(()) => SecretSetResponse::Ok,
        // The io error may name the path; it never names the secret.
        Err(err) => SecretSetResponse::Refused {
            reason: format!("could not place the secret: {err}"),
        },
    }
}

/// Write `secret` to `path` atomically and mode-protected (`0640`): a temp file in the same directory,
/// its mode forced regardless of umask, fsync'd, then renamed over the target. A reader never sees a
/// half-written secret, and a failed write leaves any prior secret in place.
fn write_secret_file(path: &Path, secret: &str) -> Result<(), SidecarError> {
    let dir = path
        .parent()
        .ok_or_else(|| SidecarError::Config("secret path has no parent directory".to_owned()))?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| SidecarError::Config("secret path has no file name".to_owned()))?;
    let tmp = dir.join(format!(".{name}.tmp"));

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o640)
        .open(&tmp)
        .map_err(|e| SidecarError::Serve(format!("open secret temp: {e}")))?;
    // Force the mode regardless of the process umask (open's mode is masked by umask).
    file.set_permissions(std::fs::Permissions::from_mode(0o640))
        .map_err(|e| SidecarError::Serve(format!("secret temp mode: {e}")))?;
    file.write_all(secret.as_bytes())
        .map_err(|e| SidecarError::Serve(format!("write secret temp: {e}")))?;
    file.sync_all()
        .map_err(|e| SidecarError::Serve(format!("fsync secret temp: {e}")))?;
    drop(file);
    std::fs::rename(&tmp, path).map_err(|e| {
        // Best-effort cleanup so a failed rename does not leave the temp behind.
        let _ = std::fs::remove_file(&tmp);
        SidecarError::Serve(format!("rename secret into place: {e}"))
    })
}

/// How one attempt to read a request line ended.
enum RequestRead {
    /// A complete newline-terminated request is in the buffer.
    Line,
    /// The peer closed cleanly between requests.
    Eof,
    /// The request exceeded [`MAX_REQUEST_BYTES`] before its newline arrived.
    Oversized,
}

/// Read one newline-terminated request into `line`, holding the per-request byte cap (mirrors the
/// sign leg's transport: bounded per request, so a well-behaved long-lived peer is unaffected).
async fn read_request_line(
    reader: &mut BufReader<tokio::net::tcp::OwnedReadHalf>,
    line: &mut Vec<u8>,
) -> Result<RequestRead, SidecarError> {
    loop {
        let buf = reader
            .fill_buf()
            .await
            .map_err(|e| SidecarError::Serve(format!("secret service read: {e}")))?;
        if buf.is_empty() {
            return Ok(if line.is_empty() {
                RequestRead::Eof
            } else {
                RequestRead::Oversized
            });
        }
        if let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            if line.len() + pos > MAX_REQUEST_BYTES {
                return Ok(RequestRead::Oversized);
            }
            line.extend_from_slice(&buf[..pos]);
            reader.consume(pos + 1);
            return Ok(RequestRead::Line);
        }
        let taken = buf.len();
        if line.len() + taken > MAX_REQUEST_BYTES {
            return Ok(RequestRead::Oversized);
        }
        line.extend_from_slice(buf);
        reader.consume(taken);
    }
}

/// Encode and write one response line.
async fn write_response(
    writer: &mut tokio::net::tcp::OwnedWriteHalf,
    response: &SecretSetResponse,
) -> Result<(), SidecarError> {
    let mut encoded = serde_json::to_vec(response)
        .map_err(|e| SidecarError::Serve(format!("secret service encode: {e}")))?;
    encoded.push(b'\n');
    writer
        .write_all(&encoded)
        .await
        .map_err(|e| SidecarError::Serve(format!("secret service write: {e}")))
}

#[cfg(test)]
mod tests {
    // Sanctioned test relaxation per Rust_Dev_Rules.md section 13.
    #![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
    use super::*;

    fn tmpdir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("idam-secret-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn writes_the_secret_mode_protected_and_atomic() {
        let path = tmpdir().join("auth0.secret");
        let _ = std::fs::remove_file(&path);
        let req =
            serde_json::to_vec(&serde_json::json!({ "provider": "auth0", "secret": "s3cr3t" }))
                .unwrap();
        assert_eq!(handle_request(&req, &path), SecretSetResponse::Ok);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "s3cr3t");
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(
            mode, 0o640,
            "the connector secret is group-readable, owner-writable"
        );
        // No temp file is left behind.
        assert!(!tmpdir().join(".auth0.secret.tmp").exists());
    }

    #[test]
    fn refuses_an_unknown_provider_and_an_empty_secret_without_writing() {
        let path = tmpdir().join("unwritten.secret");
        let _ = std::fs::remove_file(&path);
        let unknown =
            serde_json::to_vec(&serde_json::json!({ "provider": "okta", "secret": "x" })).unwrap();
        assert!(matches!(
            handle_request(&unknown, &path),
            SecretSetResponse::Refused { .. }
        ));
        let empty =
            serde_json::to_vec(&serde_json::json!({ "provider": "auth0", "secret": "" })).unwrap();
        assert!(matches!(
            handle_request(&empty, &path),
            SecretSetResponse::Refused { .. }
        ));
        assert!(!path.exists(), "a refused request writes nothing");
    }

    #[test]
    fn a_malformed_request_writes_nothing() {
        let path = tmpdir().join("malformed.secret");
        let _ = std::fs::remove_file(&path);
        assert!(matches!(
            handle_request(b"not json", &path),
            SecretSetResponse::Refused { .. }
        ));
        assert!(!path.exists());
    }

    #[test]
    fn overwrites_an_existing_secret_in_place() {
        let path = tmpdir().join("rotated.secret");
        write_secret_file(&path, "old").unwrap();
        let req = serde_json::to_vec(&serde_json::json!({ "provider": "auth0", "secret": "new" }))
            .unwrap();
        assert_eq!(handle_request(&req, &path), SecretSetResponse::Ok);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
    }
}
