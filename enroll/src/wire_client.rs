//! The bootstrap-TLS enrollment wire client (`IP-CONSOLE-00-DEPLOY` D.3a-console.2c-3).
//!
//! Connects to the node's enrollment service over the **bootstrap** TLS (server-auth-only, TLS 1.3, the
//! `X25519MLKEM768`/`X25519` hybrid KX, pinning the enroll-CA root -- byte-identical to the torch client's
//! `bootstrap_client_config`), then exchanges one enroll frame: send `EnrollSubmit` carrying a CBOR
//! [`WireEnrollRequest`] (the `cnf`-bound token + the CSR DER + the attestation), read `EnrollResult`
//! carrying a [`WireEnrollResponse`], and return the minted leaf on `Issued`.
//!
//! The wire contract (the frame header + the messages) is the `cdb-wire`/`cdb-types` git deps, so it is
//! byte-exact to the engine. `cdb-wire`'s async `read_frame`/`write_frame` are `io`-gated (tokio); this
//! blocking client hand-rolls the 16-byte header + CBOR framing over the rustls stream. Integration glue,
//! exercised against the live node at D.3c, not the offline gate.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;

use cdb_types::DeviceAttestation;
use cdb_wire::frame::{flags, FrameType, Header, HEADER_LEN};
use cdb_wire::handshake::{WireEnrollRequest, WireEnrollResponse};
use rustls::pki_types::{CertificateDer, ServerName};
use rustls::{ClientConfig, ClientConnection, RootCertStore};

use crate::keystore::EnrollError;

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

/// A stand-in `DeviceAttestation` for a software-key (no-TPM) enrollment: only `ek_cert_der` is used, as
/// the stable, unverified device anchor for the FQDN binding (attestation is not verified when the token
/// is `cnf`-bound and the issuance policy's `require_attestation` is false). `anchor` MUST be stable across
/// re-enrollments of the same identity (e.g. derived from the FQDN).
#[must_use]
pub fn software_attestation(anchor: Vec<u8>) -> DeviceAttestation {
    DeviceAttestation {
        ek_cert_der: anchor,
        ak_pub: Vec::new(),
        binding: Vec::new(),
    }
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

    let request = WireEnrollRequest {
        token,
        csr_der,
        attestation,
    };
    let mut payload = Vec::new();
    ciborium::into_writer(&request, &mut payload)
        .map_err(|e| EnrollError::Sign(format!("encode enroll request: {e}")))?;
    write_frame(&mut tls, FrameType::EnrollSubmit, &payload)?;

    let (frame_type, resp_payload) = read_frame(&mut tls)?;
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
    fn software_attestation_carries_only_the_anchor() {
        let att = software_attestation(b"stable-anchor".to_vec());
        assert_eq!(att.ek_cert_der, b"stable-anchor");
        assert!(att.ak_pub.is_empty() && att.binding.is_empty());
    }

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
