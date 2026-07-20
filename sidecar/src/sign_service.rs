//! The BFF -> signer loopback service (FD.2 transport, INV-CONSOLE-FORGE-SIGNED-AT-SOURCE).
//!
//! The BFF composes a bundle's unsigned parts and needs them signed by a key it must never hold. This
//! is the seam: it accepts a [`BundleDraft`] on a loopback socket and returns the assembled
//! [`SignedPolicyBundle`](cdb_types::SignedPolicyBundle).
//!
//! Unlike the sidecar's other two legs, this is NOT a byte tunnel. `admin` and `engine` forward opaque
//! bytes and never inspect them; this leg parses a typed request and produces a typed response,
//! because the thing being protected is not a channel but a key. Signing a payload the sidecar has not
//! parsed would make it a blind oracle: anything reaching the socket could have arbitrary bytes signed
//! under ForgeCentral's identity. Taking a typed draft means the signer decides the shape of what it
//! signs, and fills `signing_key_id` and `signature_algorithm` itself, so a caller cannot assert which
//! key signed its bundle.
//!
//! # Protocol
//!
//! Newline-delimited JSON, one request per line, one response per line, on a persistent connection.
//! No framing library and no HTTP server: `serde_json` is already a dependency and this seam is one
//! request shape on loopback, so a dependency for it would not earn its place.
//!
//! # Bounds
//!
//! The socket is loopback-only, refused at bind. Each request is read under a PER-REQUEST byte cap,
//! so a peer cannot exhaust memory by withholding a newline; an oversized request is answered with a
//! typed refusal and the connection ends, since framing cannot be trusted past a truncated request.
//! A malformed request never signs.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

use crate::bind::{assert_loopback_addr, SidecarError};
use crate::signing::{BundleDraft, BundleSigner};

/// The largest request accepted, in bytes.
///
/// TUNE: a draft is a flat policy plus an identity scope; the scope is the only part that grows, one
/// entry per endpoint the bundle binds. 1 MiB holds thousands of members with room to spare, and is
/// small enough that a stuck or hostile peer cannot pressure the process. Raise it only with a scope
/// size that demonstrably needs it.
const MAX_REQUEST_BYTES: usize = 1024 * 1024;

/// The response to a sign request.
///
/// Externally tagged so the BFF matches on the variant rather than sniffing fields, and so a refusal
/// can never be mistaken for a bundle with an empty signature.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignResponse {
    /// The assembled, signed bundle.
    Signed(Box<cdb_types::SignedPolicyBundle>),
    /// The request was refused, with the reason. Carries no key material and no internal paths.
    Refused { reason: String },
}

/// The bound signing service.
pub struct SignService {
    listener: TcpListener,
    signer: Arc<BundleSigner>,
}

impl SignService {
    /// Bind the loopback `addr` (fail-closed: must be loopback) and prepare to sign with `signer`.
    ///
    /// # Errors
    /// [`SidecarError::Config`] on a non-loopback or malformed address; [`SidecarError::Listen`] if
    /// the socket cannot bind.
    pub async fn bind(addr: &str, signer: Arc<BundleSigner>) -> Result<Self, SidecarError> {
        // The signing key is reachable through this socket, so a routable bind would expose it to the
        // network. Refused before the listener exists, not after.
        assert_loopback_addr(addr)?;
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| SidecarError::Listen(format!("sign service {addr}: {e}")))?;
        Ok(Self { listener, signer })
    }

    /// The address actually bound, for a caller that passed port 0.
    ///
    /// # Errors
    /// [`SidecarError::Listen`] if the socket address cannot be read back.
    pub fn local_addr(&self) -> Result<std::net::SocketAddr, SidecarError> {
        self.listener
            .local_addr()
            .map_err(|e| SidecarError::Listen(format!("sign service local addr: {e}")))
    }

    /// Accept and serve connections until the listener fails.
    ///
    /// One failed connection never takes down the service: a peer that disconnects mid-request, or
    /// sends something unparseable, ends that connection only.
    ///
    /// # Errors
    /// [`SidecarError::Listen`] if accepting fails.
    pub async fn run(self) -> Result<(), SidecarError> {
        loop {
            let (stream, _peer) = self
                .listener
                .accept()
                .await
                .map_err(|e| SidecarError::Listen(format!("sign service accept: {e}")))?;
            let signer = Arc::clone(&self.signer);
            tokio::spawn(async move {
                // A per-connection failure is not a service failure; the connection simply ends.
                let _ = serve_connection(stream, signer).await;
            });
        }
    }
}

/// Serve one connection: read newline-delimited drafts, answer each with a response line.
async fn serve_connection(
    stream: TcpStream,
    signer: Arc<BundleSigner>,
) -> Result<(), SidecarError> {
    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let mut line: Vec<u8> = Vec::new();

    loop {
        line.clear();
        match read_request_line(&mut reader, &mut line).await? {
            RequestRead::Eof => return Ok(()),
            RequestRead::Oversized => {
                // Bounded per REQUEST, not per connection: a long-lived well-behaved peer is
                // unaffected, and one oversized request cannot grow memory past the cap. Framing
                // cannot be trusted after a truncated request, so refuse and end the connection.
                let refusal = SignResponse::Refused {
                    reason: format!("sign request exceeds {MAX_REQUEST_BYTES} bytes"),
                };
                write_response(&mut writer, &refusal).await?;
                return Ok(());
            }
            RequestRead::Line => {}
        }
        if line.iter().all(u8::is_ascii_whitespace) {
            continue;
        }
        let response = match serde_json::from_slice::<BundleDraft>(&line) {
            // The signer owns the key id and algorithm, so what comes back is signed under the key
            // this process actually holds, whatever the caller asked for.
            Ok(draft) => match signer.sign_bundle(draft) {
                Ok(bundle) => SignResponse::Signed(Box::new(bundle)),
                Err(err) => SignResponse::Refused {
                    reason: err.to_string(),
                },
            },
            // A request that does not parse is never signed. The reason is the parse failure, which
            // describes the caller's own payload and leaks nothing about this process.
            Err(err) => SignResponse::Refused {
                reason: format!("malformed sign request: {err}"),
            },
        };
        write_response(&mut writer, &response).await?;
    }
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

/// Read one newline-terminated request into `line`, holding the per-request byte cap.
///
/// `read_until`-shaped, but with the bound applied per request: the standard helpers either grow
/// without bound (`read_until`) or cap the CONNECTION cumulatively (`take`), which would end a
/// well-behaved long-lived peer after the cap in total traffic.
async fn read_request_line(
    reader: &mut BufReader<tokio::net::tcp::OwnedReadHalf>,
    line: &mut Vec<u8>,
) -> Result<RequestRead, SidecarError> {
    loop {
        let buf = reader
            .fill_buf()
            .await
            .map_err(|e| SidecarError::Serve(format!("sign service read: {e}")))?;
        if buf.is_empty() {
            // EOF. A partial request with no newline is not a request; drop it rather than parse a
            // truncated payload.
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
    response: &SignResponse,
) -> Result<(), SidecarError> {
    let mut encoded = serde_json::to_vec(response)
        .map_err(|e| SidecarError::Serve(format!("sign service encode: {e}")))?;
    encoded.push(b'\n');
    writer
        .write_all(&encoded)
        .await
        .map_err(|e| SidecarError::Serve(format!("sign service write: {e}")))
}

#[cfg(test)]
mod tests {
    // Sanctioned test relaxation per Rust_Dev_Rules.md section 13.
    #![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
    use super::*;
    use crate::signing::BundleDraft;
    use cdb_artifact::{bundle_preimage_bytes, sha512, MlDsa87Verifier, Signature, Verifier};
    use cdb_types::{
        BundleVersion, Classification, EndpointPolicy, ExecDisposition, FreshnessLease, Hlc,
        IdentityScope, ModelMcpDestSet, ResourceBound, SignatureAlgorithm, VtzId,
    };

    fn test_signer(name: &str) -> Arc<BundleSigner> {
        let dir = std::env::temp_dir().join(format!("fc-sign-service-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Arc::new(BundleSigner::generate(&dir.join("seed")).unwrap())
    }

    fn draft() -> BundleDraft {
        BundleDraft {
            version: BundleVersion(7),
            policy: EndpointPolicy {
                max_classification: Classification::Unclassified,
                brokered: ModelMcpDestSet::default(),
                restricted: Vec::new(),
                allow_ordinary_internet: false,
                exec: ExecDisposition::DenyUnwrappedExec,
                resource_bound: ResourceBound {
                    cpu_millicores: 0,
                    memory_bytes: 0,
                    pids: 0,
                    io_bytes_per_sec: 0,
                    cost_micros: 0,
                    storage_bytes: 0,
                    rate_per_sec: 0,
                },
            },
            contributors: Vec::new(),
            scope: IdentityScope::new(VtzId::new("YouSource.Corp"), []),
            lease: FreshnessLease::new(Hlc(100), Hlc(200)),
        }
    }

    /// Send one raw line and read one response line.
    async fn round_trip(addr: std::net::SocketAddr, request: &str) -> SignResponse {
        let stream = TcpStream::connect(addr).await.unwrap();
        let (reader, mut writer) = stream.into_split();
        writer.write_all(request.as_bytes()).await.unwrap();
        writer.write_all(b"\n").await.unwrap();
        let mut lines = BufReader::new(reader).lines();
        let line = lines.next_line().await.unwrap().expect("a response line");
        serde_json::from_str(&line).unwrap()
    }

    async fn serving(name: &str) -> (std::net::SocketAddr, Arc<BundleSigner>) {
        let signer = test_signer(name);
        let service = SignService::bind("127.0.0.1:0", Arc::clone(&signer))
            .await
            .unwrap();
        let addr = service.local_addr().unwrap();
        tokio::spawn(async move {
            let _ = service.run().await;
        });
        (addr, signer)
    }

    #[tokio::test]
    async fn a_routable_bind_is_refused() {
        // The signing key is reachable through this socket, so binding it anywhere routable would
        // expose the key to the network.
        let signer = test_signer("routable");
        match SignService::bind("0.0.0.0:0", signer).await {
            Err(SidecarError::Config(_)) => {}
            Err(other) => panic!("expected a Config refusal, got {other:?}"),
            Ok(_) => panic!("a routable bind must be refused"),
        }
    }

    #[tokio::test]
    async fn a_draft_comes_back_signed_and_verifiable() {
        let (addr, signer) = serving("signed").await;
        let request = serde_json::to_string(&draft()).unwrap();
        let SignResponse::Signed(bundle) = round_trip(addr, &request).await else {
            panic!("expected a signed bundle");
        };

        assert_eq!(&bundle.signing_key_id, signer.key_id());
        assert_eq!(bundle.signature_algorithm, SignatureAlgorithm::MlDsa87);

        let verifier = MlDsa87Verifier::default()
            .with_key(signer.key_id().clone(), signer.verifying_key().to_vec());
        let digest = sha512(&bundle_preimage_bytes(&bundle).unwrap());
        verifier
            .verify(
                digest.as_bytes(),
                &Signature(bundle.signature.clone()),
                &bundle.signing_key_id,
                bundle.signature_algorithm,
            )
            .expect("a bundle returned by the service verifies");
    }

    #[tokio::test]
    async fn a_malformed_request_is_refused_and_never_signed() {
        let (addr, _signer) = serving("malformed").await;
        let response = round_trip(addr, "{\"not\":\"a draft\"}").await;
        assert!(
            matches!(response, SignResponse::Refused { .. }),
            "a request that does not parse must not produce a bundle"
        );
    }

    #[tokio::test]
    async fn a_caller_cannot_choose_the_signing_key() {
        // signing_key_id is inside the signed preimage. A draft carries no key fields at all, so even
        // a caller that adds them cannot steer which key signs -- the signer overwrites both.
        let (addr, signer) = serving("keyid").await;
        let mut value = serde_json::to_value(draft()).unwrap();
        value["signing_key_id"] = serde_json::json!("attacker-chosen");
        value["signature_algorithm"] = serde_json::json!("BatchAnchoredSha512");

        let SignResponse::Signed(bundle) = round_trip(addr, &value.to_string()).await else {
            panic!("expected a signed bundle");
        };
        assert_eq!(&bundle.signing_key_id, signer.key_id());
        assert_eq!(bundle.signature_algorithm, SignatureAlgorithm::MlDsa87);
    }

    #[tokio::test]
    async fn the_connection_serves_more_than_one_request() {
        let (addr, _signer) = serving("pipeline").await;
        let stream = TcpStream::connect(addr).await.unwrap();
        let (reader, mut writer) = stream.into_split();
        let request = serde_json::to_string(&draft()).unwrap();
        for _ in 0..3 {
            writer.write_all(request.as_bytes()).await.unwrap();
            writer.write_all(b"\n").await.unwrap();
        }
        let mut lines = BufReader::new(reader).lines();
        for _ in 0..3 {
            let line = lines.next_line().await.unwrap().expect("a response line");
            let response: SignResponse = serde_json::from_str(&line).unwrap();
            assert!(matches!(response, SignResponse::Signed(_)));
        }
    }

    #[tokio::test]
    async fn an_oversized_request_is_refused_and_ends_the_connection() {
        // The cap is per request: the refusal is typed, and the connection closes because framing
        // cannot be trusted past a truncated request. Memory never grows past the cap.
        let (addr, _signer) = serving("oversized").await;
        let stream = TcpStream::connect(addr).await.unwrap();
        let (reader, mut writer) = stream.into_split();
        let blob = vec![b'x'; MAX_REQUEST_BYTES + 4096];
        // The peer may see the connection close mid-write; that is the bound working.
        let _ = writer.write_all(&blob).await;
        let _ = writer.write_all(b"\n").await;
        let mut lines = BufReader::new(reader).lines();
        let line = lines.next_line().await.unwrap().expect("a refusal line");
        let response: SignResponse = serde_json::from_str(&line).unwrap();
        assert!(
            matches!(response, SignResponse::Refused { .. }),
            "an oversized request must refuse, never sign"
        );
        assert!(
            lines.next_line().await.unwrap().is_none(),
            "the connection ends after an oversized request"
        );
    }

    #[tokio::test]
    async fn a_wellbehaved_connection_outlives_the_cap_in_total_traffic() {
        // The cap must be per request, not cumulative: a long-lived BFF connection sends many
        // requests whose TOTAL exceeds the cap, and must keep being served.
        let (addr, _signer) = serving("cumulative").await;
        let stream = TcpStream::connect(addr).await.unwrap();
        let (reader, mut writer) = stream.into_split();
        // A large (but under-cap) draft, so a handful of requests crosses the cap in TOTAL traffic
        // without a handful of thousand signing operations blowing the suite's time budget.
        let mut big = draft();
        big.policy.restricted = (0..4000)
            .map(|i| format!("host-{i}.restricted.example"))
            .collect();
        let request = serde_json::to_string(&big).unwrap();
        assert!(
            request.len() < MAX_REQUEST_BYTES,
            "each request stays under the cap"
        );
        let repeats = (MAX_REQUEST_BYTES / request.len()) + 2;
        let mut lines = BufReader::new(reader).lines();
        for _ in 0..repeats {
            writer.write_all(request.as_bytes()).await.unwrap();
            writer.write_all(b"\n").await.unwrap();
            let line = lines.next_line().await.unwrap().expect("a response line");
            let response: SignResponse = serde_json::from_str(&line).unwrap();
            assert!(matches!(response, SignResponse::Signed(_)));
        }
    }
}
