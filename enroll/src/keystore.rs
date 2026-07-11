//! The software keystore: a P-384 wire key generated + used in software (no TPM), on the platform's
//! AWS-LC module. It generates the Console's engine-identity key, produces the PKCS#10 CSR the enrollment
//! service + step-ca verify (proof-of-possession), exports the private key as a PKCS#8 PEM the crypto
//! sidecar reads as `engine_key`, and signs arbitrary messages (the DPoP proof that binds the MFA token to
//! this key, D.3a-console.2, and later the wire-plane TLS handshake).
//!
//! One key material (PKCS#8 DER) drives two views: `rcgen` (CSR + PEM) and `aws_lc_rs` (raw ECDSA signing).
//! This is the service-key half of `IP-CONSOLE-00-DEPLOY` D.3a-console; the TPM-resident variant is the
//! parked `IP-CONSOLE-00-SIDECAR-TPM`.

use aws_lc_rs::rand::SystemRandom;
use aws_lc_rs::signature::{EcdsaKeyPair, KeyPair as _, ECDSA_P384_SHA384_FIXED_SIGNING};
use rcgen::{CertificateParams, DnType, KeyPair};

/// A failure generating the software key, the CSR, or a signature.
#[derive(Debug, thiserror::Error)]
pub enum EnrollError {
    /// The P-384 key could not be generated or loaded.
    #[error("key generation failed: {0}")]
    Keygen(String),
    /// The CSR could not be built or serialized.
    #[error("CSR generation failed: {0}")]
    Csr(String),
    /// A signing operation failed.
    #[error("signing failed: {0}")]
    Sign(String),
    /// Configuration was missing/invalid, or a file could not be read/written.
    #[error("{0}")]
    Provision(String),
}

/// A software-resident P-384 keystore for the Console's engine identity.
///
/// The private key never touches the TPM (that is the parked `IP-CONSOLE-00-SIDECAR-TPM` variant); it is
/// generated here and exported as a PKCS#8 PEM for the sidecar. Attestation is not required (the enrollment
/// service admits an attestation-less issuance by policy); the identity's strength is MFA + the DPoP
/// token-to-key binding + the ZTP-CA chain + the AIG registration, not hardware residency.
pub struct SoftwareKeystore {
    /// The CSR + PEM view (rcgen), holding the same key material as `signer`.
    key_pair: KeyPair,
    /// The raw-signing view (aws-lc-rs), holding the same key material as `key_pair`.
    signer: EcdsaKeyPair,
    rng: SystemRandom,
}

impl SoftwareKeystore {
    /// Generate a fresh P-384 (secp384r1) keypair on the AWS-LC module.
    ///
    /// # Errors
    /// [`EnrollError::Keygen`] if the key cannot be generated or loaded into either view.
    pub fn generate() -> Result<Self, EnrollError> {
        let rng = SystemRandom::new();
        let pkcs8 = EcdsaKeyPair::generate_pkcs8(&ECDSA_P384_SHA384_FIXED_SIGNING, &rng)
            .map_err(|_| EnrollError::Keygen("pkcs8 generation failed".to_owned()))?;
        let pkcs8_der = pkcs8.as_ref();
        let signer = EcdsaKeyPair::from_pkcs8(&ECDSA_P384_SHA384_FIXED_SIGNING, pkcs8_der)
            .map_err(|e| EnrollError::Keygen(format!("load signer: {e}")))?;
        let key_pair = KeyPair::try_from(pkcs8_der)
            .map_err(|e| EnrollError::Keygen(format!("load rcgen: {e}")))?;
        Ok(Self {
            key_pair,
            signer,
            rng,
        })
    }

    /// The private key as a PKCS#8 PEM -- the sidecar's `engine_key`. This is the one exportable copy of
    /// the software identity; the provisioner writes it mode-restricted and owned by the sidecar user.
    #[must_use]
    pub fn key_pem(&self) -> String {
        self.key_pair.serialize_pem()
    }

    /// The raw uncompressed EC public point (`0x04 || X || Y`, 97 bytes for P-384). The enroll protocol
    /// (D.3a-console.2) derives the JWK thumbprint (`jkt`) from `X`/`Y` to DPoP-bind the MFA token to this
    /// key, and verifies signatures against it.
    #[must_use]
    pub fn public_point(&self) -> Vec<u8> {
        self.signer.public_key().as_ref().to_vec()
    }

    /// Sign `message` with the software key, ECDSA P-384 / SHA-384, returning a **fixed** `r || s`
    /// signature (96 bytes, the JOSE `ES384` encoding the DPoP proof needs).
    ///
    /// # Errors
    /// [`EnrollError::Sign`] if the signature cannot be produced.
    pub fn sign(&self, message: &[u8]) -> Result<Vec<u8>, EnrollError> {
        self.signer
            .sign(&self.rng, message)
            .map(|sig| sig.as_ref().to_vec())
            .map_err(|_| EnrollError::Sign("ecdsa p-384 sign failed".to_owned()))
    }

    /// Build a PKCS#10 CSR for `common_name` + the DNS `sans` (the proposed `console-bff` FQDN), signed by
    /// the software key. The proof-of-possession the enrollment service + step-ca require.
    fn build_csr(
        &self,
        common_name: &str,
        sans: &[String],
    ) -> Result<rcgen::CertificateSigningRequest, EnrollError> {
        let mut params =
            CertificateParams::new(sans.to_vec()).map_err(|e| EnrollError::Csr(e.to_string()))?;
        params
            .distinguished_name
            .push(DnType::CommonName, common_name);
        params
            .serialize_request(&self.key_pair)
            .map_err(|e| EnrollError::Csr(e.to_string()))
    }

    /// The CSR as a PEM.
    ///
    /// # Errors
    /// [`EnrollError::Csr`] if the CSR cannot be built or serialized.
    pub fn csr_pem(&self, common_name: &str, sans: &[String]) -> Result<String, EnrollError> {
        self.build_csr(common_name, sans)?
            .pem()
            .map_err(|e| EnrollError::Csr(e.to_string()))
    }

    /// The CSR as DER -- what the enrollment wire request (`WireEnrollRequest.csr_der`) carries.
    ///
    /// # Errors
    /// [`EnrollError::Csr`] if the CSR cannot be built or serialized.
    pub fn csr_der(&self, common_name: &str, sans: &[String]) -> Result<Vec<u8>, EnrollError> {
        Ok(self.build_csr(common_name, sans)?.der().to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aws_lc_rs::signature::{UnparsedPublicKey, ECDSA_P384_SHA384_FIXED};

    #[test]
    fn generates_a_p384_key_exportable_as_pkcs8_pem() {
        let ks = SoftwareKeystore::generate().unwrap();
        assert!(
            ks.key_pem().contains("-----BEGIN PRIVATE KEY-----"),
            "key is a PKCS#8 PEM"
        );
        // The raw P-384 public point is 0x04 || X(48) || Y(48) = 97 bytes.
        assert_eq!(ks.public_point().len(), 97, "P-384 uncompressed point");
        assert_eq!(ks.public_point()[0], 0x04, "uncompressed point marker");
    }

    #[test]
    fn signs_a_message_verifiable_against_its_public_point() {
        let ks = SoftwareKeystore::generate().unwrap();
        let message = b"dpop-proof-bytes";
        let sig = ks.sign(message).unwrap();
        assert_eq!(sig.len(), 96, "fixed r||s for P-384 (48+48)");
        UnparsedPublicKey::new(&ECDSA_P384_SHA384_FIXED, ks.public_point())
            .verify(message, &sig)
            .expect("signature verifies against the key's own public point");
        // A tampered message does not verify.
        assert!(
            UnparsedPublicKey::new(&ECDSA_P384_SHA384_FIXED, ks.public_point())
                .verify(b"other", &sig)
                .is_err()
        );
    }

    #[test]
    fn builds_a_well_formed_csr_for_the_proposed_fqdn() {
        let ks = SoftwareKeystore::generate().unwrap();
        let fqdn = "console-bff.node.test.crucibledb".to_owned();
        let csr = ks.csr_pem(&fqdn, std::slice::from_ref(&fqdn)).unwrap();
        assert!(
            csr.starts_with("-----BEGIN CERTIFICATE REQUEST-----"),
            "CSR is a PKCS#10 PEM",
        );
        assert!(
            csr.contains("-----END CERTIFICATE REQUEST-----"),
            "CSR PEM is complete",
        );
        assert!(csr.len() > 300, "CSR carries the signed request body");
    }

    #[test]
    fn each_keystore_is_a_distinct_key() {
        let a = SoftwareKeystore::generate().unwrap();
        let b = SoftwareKeystore::generate().unwrap();
        assert_ne!(a.public_point(), b.public_point(), "keys are unique");
    }
}
