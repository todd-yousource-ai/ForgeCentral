//! The Console-owned service-key ZTP enrollment client (IP-CONSOLE-00-DEPLOY D.3a-console).
//!
//! `torch-enroll` is TPM-only and refuses a software key for a production identity, so the Console owns
//! this small client: it enrolls the engine identity with a SOFTWARE P-384 key (still operator MFA +
//! step-ca mint + AIG registration, so the enrolled-role permissions work), yielding the cert + key PEM
//! the crypto sidecar presents on the engine leg. No TPM; the AWS-LC posture is unchanged.
//!
//! D.3a-console.1 (this): the [`keystore`] -- P-384 keygen + PKCS#10 CSR + PEM export. The enroll protocol
//! client (device-code MFA + CSR submit + cert receive) and the provisioning wrapper are D.3a-console.2/.3.

pub mod device_flow;
pub mod device_grant;
pub mod http;
pub mod keystore;
pub mod token_binding;

pub use keystore::{EnrollError, SoftwareKeystore};
pub use token_binding::{access_token_hash, canonical_ec_jwk, dpop_proof, jwk_thumbprint};
