//! The bootstrap-TLS enrollment wire client.
//!
//! Connects to the node's enrollment service over the **bootstrap** TLS (server-auth-only, TLS 1.3, the
//! `X25519MLKEM768`/`X25519` hybrid KX, pinning the enroll-CA root -- byte-identical to the torch
//! client's `bootstrap_client_config`) and exchanges one frame per call:
//!
//! - [`request_identity_offer`]: send `EnrollIdentityOffer` carrying a [`WireIdentityRequest`] (the
//!   token + the TPM attestation), read `EnrollIdentityResult` carrying a [`WireIdentityOffer`] -- the
//!   FQDN bound to this device's attested identity, or an invitation to propose one (first enrollment).
//! - [`submit_enrollment`]: send `EnrollSubmit` carrying a [`WireEnrollRequest`] (the token + the CSR
//!   DER + the attestation), read `EnrollResult` carrying a [`WireEnrollResponse`], return the minted
//!   leaf on `Issued`.
//!
//! The wire contract (the frame header + the messages) is the `cdb-wire`/`cdb-types` git deps, so it is
//! byte-exact to the engine. `cdb-wire`'s async `read_frame`/`write_frame` are `io`-gated (tokio); this
//! blocking client hand-rolls the 16-byte header + CBOR framing over the rustls stream. Integration
//! glue, exercised against the live node at D.3c, not the offline gate.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;

use cdb_types::DeviceAttestation;
use cdb_wire::frame::{flags, FrameType, Header, HEADER_LEN};
use cdb_wire::handshake::{
    WireEnrollRequest, WireEnrollResponse, WireIdentityOffer, WireIdentityRequest,
};
use rustls::pki_types::{CertificateDer, ServerName};
use rustls::{ClientConfig, ClientConnection, RootCertStore};

use crate::error::EnrollError;

/// The protocol version the enrollment frame carries: v1.0 packed as `major << 8 | minor`.
const PROTOCOL_V1_0: u16 = 0x0100;
/// A generous payload ceiling for a minted-cert response frame.
const MAX_PAYLOAD: u32 = 1 << 20;

/// Where + how to reach the node's enrollment service.
pub struct EnrollWireConfig {
    /// The enrollment service `host:port` (the bootstrap listener).
    pub addr: String,
    /// The TLS server name to validate (the enroll leaf's SAN).
    pub server_name: String,
    /// The pinned enroll-CA root(s), PEM.
    pub ca_pem: Vec<u8>,
}

/// The minted leaf returned on a successful enrollment.
pub struct IssuedLeaf {
    /// The leaf certificate, DER (the wire cert the sidecar presents; the chain is provisioned separately).
    pub certificate_der: Vec<u8>,
    /// The certificate serial (hex).
    pub serial: String,
    /// The certificate `notAfter` (RFC 3339).
    pub not_after: String,
}

/// Build the bootstrap-TLS client config: pin `ca_pem`, hybrid PQC KX, TLS 1.3, server-auth only, AWS-LC.
fn bootstrap_config(ca_pem: &[u8]) -> Result<ClientConfig, EnrollError> {
    let mut reader = std::io::BufReader::new(ca_pem);
    let mut roots = RootCertStore::empty();
    for cert in rustls_pemfile::certs(&mut reader) {
        let cert: CertificateDer<'static> =
            cert.map_err(|e| EnrollError::Sign(format!("enroll CA PEM: {e}")))?;
        roots
            .add(cert)
            .map_err(|e| EnrollError::Sign(format!("enroll CA add: {e}")))?;
    }
    if roots.is_empty() {
        return Err(EnrollError::Sign(
            "enroll CA PEM had no certificates".to_owned(),
        ));
    }
    let mut provider = rustls::crypto::aws_lc_rs::default_provider();
    provider.kx_groups = vec![
        rustls::crypto::aws_lc_rs::kx_group::X25519MLKEM768,
        rustls::crypto::aws_lc_rs::kx_group::X25519,
    ];
    let config = ClientConfig::builder_with_provider(Arc::new(provider))
        .with_protocol_versions(&[&rustls::version::TLS13])
        .map_err(|e| EnrollError::Sign(format!("tls versions: {e}")))?
        .with_root_certificates(roots)
        .with_no_client_auth();
    Ok(config)
}

/// Write one enroll frame (header + CBOR payload) over `stream`.
fn write_frame(
    stream: &mut impl Write,
    frame_type: FrameType,
    payload: &[u8],
) -> Result<(), EnrollError> {
    let payload_len = u32::try_from(payload.len())
        .map_err(|_| EnrollError::Sign("payload too large".to_owned()))?;
    let header = Header {
        protocol_version: PROTOCOL_V1_0,
        frame_type: frame_type.code(),
        stream_id: 0,
        flags: flags::END_STREAM,
        reserved: 0,
        payload_len,
    };
    stream
        .write_all(&header.encode())
        .map_err(|e| EnrollError::Sign(format!("frame header write: {e}")))?;
    stream
        .write_all(payload)
        .map_err(|e| EnrollError::Sign(format!("frame payload write: {e}")))?;
    Ok(())
}

/// Read one enroll frame (header + CBOR payload) from `stream`.
fn read_frame(stream: &mut impl Read) -> Result<(u16, Vec<u8>), EnrollError> {
    let mut header_bytes = [0u8; HEADER_LEN];
    stream
        .read_exact(&mut header_bytes)
        .map_err(|e| EnrollError::Sign(format!("frame header read: {e}")))?;
    let header = Header::decode(&header_bytes, MAX_PAYLOAD)
        .map_err(|e| EnrollError::Sign(format!("frame header decode: {e}")))?;
    let mut payload = vec![0u8; header.payload_len as usize];
    stream
        .read_exact(&mut payload)
        .map_err(|e| EnrollError::Sign(format!("frame payload read: {e}")))?;
    Ok((header.frame_type, payload))
}

/// Open a fresh bootstrap-TLS connection, send one `send_type` frame carrying `payload`, and return the
/// response frame's `(type, payload)`. Each enroll exchange is a single request/reply.
fn exchange(
    config: &EnrollWireConfig,
    send_type: FrameType,
    payload: &[u8],
) -> Result<(u16, Vec<u8>), EnrollError> {
    let tls_config = bootstrap_config(&config.ca_pem)?;
    let server_name = ServerName::try_from(config.server_name.clone()).map_err(|_| {
        EnrollError::Sign(format!(
            "invalid enroll server name: {}",
            config.server_name
        ))
    })?;
    let mut conn = ClientConnection::new(Arc::new(tls_config), server_name)
        .map_err(|e| EnrollError::Sign(format!("tls client: {e}")))?;
    let mut socket = TcpStream::connect(&config.addr)
        .map_err(|e| EnrollError::Sign(format!("connect {}: {e}", config.addr)))?;
    let mut tls = rustls::Stream::new(&mut conn, &mut socket);
    write_frame(&mut tls, send_type, payload)?;
    read_frame(&mut tls)
}

/// The identity pre-flight: learn the FQDN bound to this device's attested TPM identity, or `None` to
/// invite a first-use proposal. The device never asserts a name once it is bound.
///
/// # Errors
/// [`EnrollError::Sign`] on a TLS/frame failure or an unexpected response frame.
pub fn request_identity_offer(
    config: &EnrollWireConfig,
    token: String,
    attestation: DeviceAttestation,
) -> Result<WireIdentityOffer, EnrollError> {
    let request = WireIdentityRequest { token, attestation };
    let mut payload = Vec::new();
    ciborium::into_writer(&request, &mut payload)
        .map_err(|e| EnrollError::Sign(format!("encode identity request: {e}")))?;
    let (frame_type, resp_payload) = exchange(config, FrameType::EnrollIdentityOffer, &payload)?;
    if frame_type != FrameType::EnrollIdentityResult.code() {
        return Err(EnrollError::Sign(format!(
            "unexpected identity frame type: 0x{frame_type:04X}"
        )));
    }
    ciborium::from_reader(resp_payload.as_slice())
        .map_err(|e| EnrollError::Sign(format!("decode identity offer: {e}")))
}

/// Submit the enrollment over the bootstrap TLS and return the minted leaf.
///
/// # Errors
/// [`EnrollError::Sign`] on a TLS/transport/frame failure, an unexpected frame, or a `Refused` response.
pub fn submit_enrollment(
    config: &EnrollWireConfig,
    token: String,
    csr_der: Vec<u8>,
    attestation: DeviceAttestation,
) -> Result<IssuedLeaf, EnrollError> {
    let request = WireEnrollRequest {
        token,
        csr_der,
        attestation,
    };
    let mut payload = Vec::new();
    ciborium::into_writer(&request, &mut payload)
        .map_err(|e| EnrollError::Sign(format!("encode enroll request: {e}")))?;
    let (frame_type, resp_payload) = exchange(config, FrameType::EnrollSubmit, &payload)?;
    if frame_type != FrameType::EnrollResult.code() {
        return Err(EnrollError::Sign(format!(
            "unexpected enroll frame type: 0x{frame_type:04X}"
        )));
    }
    let response: WireEnrollResponse = ciborium::from_reader(resp_payload.as_slice())
        .map_err(|e| EnrollError::Sign(format!("decode enroll response: {e}")))?;
    match response {
        WireEnrollResponse::Issued {
            certificate_der,
            serial,
            not_after,
        } => Ok(IssuedLeaf {
            certificate_der,
            serial,
            not_after,
        }),
        WireEnrollResponse::Refused => Err(EnrollError::Sign(
            "enrollment refused by the node".to_owned(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_frame_round_trips_through_the_blocking_codec() {
        // The hand-rolled header+payload framing round-trips (the same 16-byte header cdb-wire encodes).
        let mut buf = Vec::new();
        write_frame(&mut buf, FrameType::EnrollSubmit, b"cbor-bytes").unwrap();
        let mut cursor = std::io::Cursor::new(buf);
        let (frame_type, payload) = read_frame(&mut cursor).unwrap();
        assert_eq!(frame_type, FrameType::EnrollSubmit.code());
        assert_eq!(payload, b"cbor-bytes");
    }

    #[test]
    fn an_empty_ca_pem_is_refused() {
        assert!(bootstrap_config(b"not a pem").is_err());
    }
}
