//! The enrollment client error taxonomy.
//!
//! One typed error across the client (keygen/attestation, CSR, wire/sign, and config/provision), so a
//! caller maps a single `EnrollError` at the `console-enroll` boundary.

/// A failure in the enrollment client: key/attestation, CSR, wire, or provisioning.
#[derive(Debug, thiserror::Error)]
pub enum EnrollError {
    /// The device key could not be generated, or the TPM was unreachable / refused attestation.
    #[error("key/attestation failed: {0}")]
    Keygen(String),
    /// The CSR could not be built or serialized.
    #[error("CSR generation failed: {0}")]
    Csr(String),
    /// A wire, TLS, framing, or signing operation failed.
    #[error("wire/sign failed: {0}")]
    Sign(String),
    /// Configuration was missing/invalid, a token was malformed, or a file could not be read/written.
    #[error("{0}")]
    Provision(String),
}
