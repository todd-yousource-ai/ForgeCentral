//! The software keystore: a P-384 wire key generated + used in software (no TPM), on the platform's
//! AWS-LC module (rcgen's `aws_lc_rs` backend). It generates the Console's engine-identity key, produces
//! the PKCS#10 CSR the enrollment service + step-ca verify (proof-of-possession of the key the cert is
//! for), and exports the private key as a PKCS#8 PEM the crypto sidecar reads as `engine_key`.
//!
//! This is the service-key half of `IP-CONSOLE-00-DEPLOY` D.3a-console: the enrollment is still MFA +
//! step-ca + AIG-registered (so the `operator` role -> `[Data, Delegation]` grant works), but the key is
//! software-resident so the sidecar can present it. The TPM-resident variant is the parked
//! `IP-CONSOLE-00-SIDECAR-TPM`.

use rcgen::{CertificateParams, DnType, KeyPair, PKCS_ECDSA_P384_SHA384};

/// A failure generating the software key or the enrollment CSR.
#[derive(Debug, thiserror::Error)]
pub enum EnrollError {
    /// The P-384 key could not be generated.
    #[error("key generation failed: {0}")]
    Keygen(String),
    /// The CSR could not be built or serialized.
    #[error("CSR generation failed: {0}")]
    Csr(String),
}

/// A software-resident P-384 keystore for the Console's engine identity.
///
/// The private key never touches the TPM (that is the parked `IP-CONSOLE-00-SIDECAR-TPM` variant); it is
/// generated here and exported as a PKCS#8 PEM for the sidecar. Attestation is not required (the enrollment
/// service admits an attestation-less issuance by policy); the identity's strength is MFA + the ZTP-CA
/// chain + the AIG registration, not hardware residency.
pub struct SoftwareKeystore {
    key_pair: KeyPair,
}

impl SoftwareKeystore {
    /// Generate a fresh P-384 (secp384r1) keypair on the AWS-LC module.
    ///
    /// # Errors
    /// [`EnrollError::Keygen`] if the key cannot be generated.
    pub fn generate() -> Result<Self, EnrollError> {
        let key_pair = KeyPair::generate_for(&PKCS_ECDSA_P384_SHA384)
            .map_err(|e| EnrollError::Keygen(e.to_string()))?;
        Ok(Self { key_pair })
    }

    /// The private key as a PKCS#8 PEM -- the sidecar's `engine_key`. This is the one exportable copy of
    /// the software identity; the provisioner writes it mode-restricted and owned by the sidecar user.
    #[must_use]
    pub fn key_pem(&self) -> String {
        self.key_pair.serialize_pem()
    }

    /// The public key in DER (SubjectPublicKeyInfo). The enroll protocol (D.3a-console.2) binds the MFA
    /// token to this key (the JWK thumbprint / `jkt`) so the issued cert is bound to the key it is for.
    #[must_use]
    pub fn public_key_der(&self) -> Vec<u8> {
        self.key_pair.public_key_der()
    }

    /// A PKCS#10 CSR PEM for `common_name` + the DNS `sans` (the proposed `console-bff` FQDN), signed by
    /// the software key. This is the proof-of-possession the enrollment service + step-ca require.
    ///
    /// # Errors
    /// [`EnrollError::Csr`] if the CSR cannot be built or serialized.
    pub fn csr_pem(&self, common_name: &str, sans: &[String]) -> Result<String, EnrollError> {
        let mut params =
            CertificateParams::new(sans.to_vec()).map_err(|e| EnrollError::Csr(e.to_string()))?;
        params
            .distinguished_name
            .push(DnType::CommonName, common_name);
        let csr = params
            .serialize_request(&self.key_pair)
            .map_err(|e| EnrollError::Csr(e.to_string()))?;
        csr.pem().map_err(|e| EnrollError::Csr(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_a_p384_key_exportable_as_pkcs8_pem() {
        let ks = SoftwareKeystore::generate().unwrap();
        let pem = ks.key_pem();
        assert!(
            pem.contains("-----BEGIN PRIVATE KEY-----"),
            "key is a PKCS#8 PEM"
        );
        assert!(!ks.public_key_der().is_empty(), "public key is present");
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
        // A signed P-384 CSR carrying a CN + SAN is well above this; a bare/empty request is not.
        assert!(csr.len() > 300, "CSR carries the signed request body");
    }

    #[test]
    fn an_empty_san_list_still_builds_a_csr_with_the_cn() {
        let ks = SoftwareKeystore::generate().unwrap();
        let csr = ks.csr_pem("console-bff.node.test.crucibledb", &[]).unwrap();
        assert!(csr.starts_with("-----BEGIN CERTIFICATE REQUEST-----"));
    }

    #[test]
    fn each_keystore_is_a_distinct_key() {
        let a = SoftwareKeystore::generate().unwrap();
        let b = SoftwareKeystore::generate().unwrap();
        assert_ne!(a.public_key_der(), b.public_key_der(), "keys are unique");
    }
}
