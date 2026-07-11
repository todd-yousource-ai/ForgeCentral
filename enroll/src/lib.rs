//! The Console-owned ZTP enrollment client (IP-CONSOLE-00-DEPLOY D.3a-console / IP-CONSOLE-00-SIDECAR-TPM).
//!
//! The Console enrolls its engine identity as a non-exportable, hardware-resident TPM key -- exactly
//! like a torch edge device -- so the node's `require_attestation` stays enforced (no server
//! weakening). Operator MFA + step-ca mint + AIG registration yield the leaf cert the crypto sidecar
//! presents on the engine leg; the private key never leaves the TPM (the sidecar signs the mTLS
//! handshake in the device via `cdb_device_identity`).
//!
//! [`tpm`] is the concrete `cdb_device_identity::KeystoreBackend` (Linux, `tss-esapi`/`libtss2`). The
//! device-code MFA flow ([`device_flow`]/[`device_grant`]) obtains the operator token; the wire client
//! ([`wire_client`]) submits the CSR + the real attestation. The software keystore + DPoP token binding
//! are retired with the flow rewire (D.3a-console TPM PR2b).

pub mod csr;
pub mod device_flow;
pub mod device_grant;
pub mod http;
pub mod keystore;
pub mod provision;
pub mod token_binding;
#[cfg(target_os = "linux")]
pub mod tpm;
pub mod transport;
pub mod wire_client;

pub use csr::{build_csr, CsrError, CsrSubjectAltNames};
pub use keystore::{EnrollError, SoftwareKeystore};
pub use token_binding::{access_token_hash, canonical_ec_jwk, dpop_proof, jwk_thumbprint};
#[cfg(target_os = "linux")]
pub use tpm::TpmBackend;
