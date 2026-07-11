//! The PKCS#10 certificate-signing request, signed in the keystore (IP-CONSOLE-00-SIDECAR-TPM, R-SED-9).
//!
//! [`build_csr`] assembles a `CertificationRequest` whose `subjectPublicKeyInfo` is the keystore key's
//! public and whose signature is produced by that key (proof of possession). The TBS
//! (`CertificationRequestInfo`) is encoded, handed to the keystore to sign in-place (the private key
//! never leaves the device), and wrapped with `ecdsa-with-SHA384`. The result is the DER the node's
//! enrollment bootstrap listener accepts in `WireEnrollRequest.csr_der`.
//!
//! Generic over `cdb_device_identity::KeystoreBackend`, so the same builder drives the TPM path
//! (`console_tpm::TpmBackend`) in production and a software signer in the unit test.

use cdb_device_identity::{KeystoreBackend, KeystoreError};
use der::asn1::{BitString, Ia5String, ObjectIdentifier, OctetString};
use der::{Decode as _, Encode as _};
use x509_cert::attr::{Attribute, Attributes};
use x509_cert::ext::pkix::name::GeneralName;
use x509_cert::ext::pkix::SubjectAltName;
use x509_cert::ext::Extension;
use x509_cert::name::Name;
use x509_cert::request::{CertReq, CertReqInfo, ExtensionReq, Version};
use x509_cert::spki::{AlgorithmIdentifierOwned, SubjectPublicKeyInfoOwned};

/// The `ecdsa-with-SHA384` signature algorithm OID (RFC 5758).
const ECDSA_WITH_SHA_384: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.10045.4.3.3");

/// The `id-ce-subjectAltName` extension OID (RFC 5280 4.2.1.6).
const SUBJECT_ALT_NAME: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.5.29.17");

/// The Subject Alternative Names a CSR carries.
///
/// The device FQDN rides as a `DNS` name, and provenance URIs (e.g. the SPIFFE id of the approving
/// operator) as `URI` names. When empty, the CSR carries no `extensionRequest` (the legacy CN-only
/// shape).
#[derive(Debug, Default, Clone)]
pub struct CsrSubjectAltNames {
    /// `DNS` SANs -- the device FQDN.
    pub dns: Vec<String>,
    /// `URI` SANs -- the SPIFFE provenance identity.
    pub uris: Vec<String>,
}

impl CsrSubjectAltNames {
    /// Whether there are no SANs (so no `extensionRequest` is emitted).
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.dns.is_empty() && self.uris.is_empty()
    }
}

/// A CSR construction failure.
#[derive(Debug, thiserror::Error)]
pub enum CsrError {
    /// A field could not be parsed or the request could not be DER-encoded.
    #[error("CSR encoding failed: {0}")]
    Encode(String),
    /// The keystore refused or failed to sign the request (proof of possession).
    #[error("CSR signing failed")]
    Sign(#[from] KeystoreError),
}

/// Builds a DER PKCS#10 CSR for `common_name` over `public_der` (an SPKI DER), signed by `signer`'s key.
///
/// The keystore signs the `CertificationRequestInfo` TBS in-place with ECDSA-SHA384; the returned bytes
/// are a complete `CertificationRequest` ready for `WireEnrollRequest.csr_der`.
///
/// # Errors
/// [`CsrError::Encode`] on a malformed name / public key / encoding failure; [`CsrError::Sign`] if the
/// keystore cannot sign (e.g. an unsupported backend or unreachable device).
pub fn build_csr(
    common_name: &str,
    sans: &CsrSubjectAltNames,
    public_der: &[u8],
    signer: &mut dyn KeystoreBackend,
) -> Result<Vec<u8>, CsrError> {
    let enc = |e: der::Error| CsrError::Encode(e.to_string());
    let subject = format!("CN={common_name}")
        .parse::<Name>()
        .map_err(|e| CsrError::Encode(e.to_string()))?;
    let public_key = SubjectPublicKeyInfoOwned::from_der(public_der).map_err(enc)?;

    // The SubjectAltName extension request: the device FQDN as a DNS name plus the provenance URIs. The
    // CN is the device identity; the SANs carry the same FQDN and the auth provenance.
    let mut attributes = Attributes::default();
    if !sans.is_empty() {
        let mut names: Vec<GeneralName> = Vec::with_capacity(sans.dns.len() + sans.uris.len());
        for dns in &sans.dns {
            names.push(GeneralName::DnsName(
                Ia5String::new(dns.as_str()).map_err(enc)?,
            ));
        }
        for uri in &sans.uris {
            names.push(GeneralName::UniformResourceIdentifier(
                Ia5String::new(uri.as_str()).map_err(enc)?,
            ));
        }
        let san_value = SubjectAltName(names).to_der().map_err(enc)?;
        let extension = Extension {
            extn_id: SUBJECT_ALT_NAME,
            critical: false,
            extn_value: OctetString::new(san_value).map_err(enc)?,
        };
        let attribute = Attribute::try_from(ExtensionReq(vec![extension])).map_err(enc)?;
        attributes.insert(attribute).map_err(enc)?;
    }

    let info = CertReqInfo {
        version: Version::V1,
        subject,
        public_key,
        attributes,
    };

    let tbs = info.to_der().map_err(enc)?;
    let signature = signer.sign(&tbs)?;

    let request = CertReq {
        info,
        algorithm: AlgorithmIdentifierOwned {
            oid: ECDSA_WITH_SHA_384,
            parameters: None,
        },
        signature: BitString::from_bytes(&signature).map_err(enc)?,
    };
    request.to_der().map_err(enc)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]
    use super::*;
    use cdb_device_identity::{KeyHandle, KeyResidency};
    use p384::ecdsa::signature::{Signer as _, Verifier as _};
    use p384::ecdsa::{Signature, SigningKey, VerifyingKey};
    use p384::pkcs8::{DecodePublicKey as _, EncodePublicKey as _};

    /// A software ECDSA signer standing in for a keystore in CI (the live TPM path is the ignored test
    /// below). Reports software residency -- never a production credential.
    struct SoftwareSigner {
        key: SigningKey,
    }

    impl KeystoreBackend for SoftwareSigner {
        fn open(&mut self) -> Result<(), KeystoreError> {
            Ok(())
        }
        fn generate_key(&mut self) -> Result<KeyHandle, KeystoreError> {
            Ok(KeyHandle {
                reference: "software".to_owned(),
                public_der: self.public_der(),
                residency: KeyResidency::Software,
            })
        }
        fn sign(&mut self, message: &[u8]) -> Result<Vec<u8>, KeystoreError> {
            let signature: Signature = self.key.sign(message);
            Ok(signature.to_der().as_bytes().to_vec())
        }
        fn attest(&mut self, _nonce: &[u8]) -> Result<cdb_types::DeviceAttestation, KeystoreError> {
            Err(KeystoreError::Unsupported)
        }
    }

    impl SoftwareSigner {
        fn public_der(&self) -> Vec<u8> {
            VerifyingKey::from(&self.key)
                .to_public_key_der()
                .unwrap()
                .as_bytes()
                .to_vec()
        }
    }

    // INV-SED-CSR-POSSESSION: the CSR is self-signed by the key it carries, and the signature verifies
    // against that public key. (Software signer here; the TPM-signed path is the ignored live test.)
    #[test]
    fn csr_is_signed_by_its_own_key_and_verifies() {
        let mut signer = SoftwareSigner {
            key: SigningKey::from_slice(&[7u8; 48]).unwrap(),
        };
        let public_der = signer.public_der();
        let csr_der = build_csr(
            "console-bff",
            &CsrSubjectAltNames::default(),
            &public_der,
            &mut signer,
        )
        .expect("build CSR");

        // Re-parse and verify the signature over the re-encoded CertReqInfo against the carried key.
        let csr = CertReq::from_der(&csr_der).expect("parse CSR");
        assert_eq!(csr.algorithm.oid, ECDSA_WITH_SHA_384);
        let tbs = csr.info.to_der().unwrap();
        let spki = csr.info.public_key.to_der().unwrap();
        let verifying_key = VerifyingKey::from_public_key_der(&spki).unwrap();
        let signature = Signature::from_der(csr.signature.as_bytes().unwrap()).unwrap();
        verifying_key
            .verify(&tbs, &signature)
            .expect("CSR signature verifies against its own public key");
    }

    // INV-SED-CSR-CARRIES-SANS: the CSR carries CN=FQDN plus a SubjectAltName extension whose value is
    // exactly a DNS name (the FQDN) and a URI name (the SPIFFE provenance), re-parsed from the DER.
    #[test]
    fn csr_carries_the_subject_alt_names() {
        let mut signer = SoftwareSigner {
            key: SigningKey::from_slice(&[9u8; 48]).unwrap(),
        };
        let public_der = signer.public_der();
        let fqdn = "console-bff.node.test.crucibledb";
        let spiffe = "spiffe://dev-6rcwumbp1tsae8me.us.auth0.com/auth0|abc";
        let sans = CsrSubjectAltNames {
            dns: vec![fqdn.to_owned()],
            uris: vec![spiffe.to_owned()],
        };
        let csr_der = build_csr(fqdn, &sans, &public_der, &mut signer).expect("build CSR");
        let csr = CertReq::from_der(&csr_der).expect("parse CSR");

        // The common name is the FQDN.
        assert!(
            csr.info.subject.to_string().contains(fqdn),
            "CN is the FQDN"
        );

        // The extensionRequest attribute carries a non-critical SubjectAltName whose value is exactly the
        // DNS (FQDN) + URI (SPIFFE) names.
        let ext_req_oid = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.14");
        let attribute = csr
            .info
            .attributes
            .iter()
            .find(|a| a.oid == ext_req_oid)
            .expect("extensionRequest attribute");
        let value = attribute.values.iter().next().expect("one attribute value");
        let ext_req =
            ExtensionReq::from_der(&value.to_der().unwrap()).expect("decode ExtensionReq");
        let san_ext = ext_req
            .0
            .iter()
            .find(|e| e.extn_id == SUBJECT_ALT_NAME)
            .expect("SubjectAltName extension");

        let expected = SubjectAltName(vec![
            GeneralName::DnsName(Ia5String::new(fqdn).unwrap()),
            GeneralName::UniformResourceIdentifier(Ia5String::new(spiffe).unwrap()),
        ])
        .to_der()
        .unwrap();
        assert_eq!(
            san_ext.extn_value.as_bytes(),
            expected.as_slice(),
            "SAN = DNS(FQDN) + URI(SPIFFE)"
        );
        assert!(!san_ext.critical, "SubjectAltName is non-critical");
    }

    // The live TPM path: a CSR built over the real /dev/tpmrm0 key is signed IN the device and its
    // signature verifies against the TPM's public key. #[ignore] (needs a real TPM); run via sudo.
    #[cfg(target_os = "linux")]
    #[test]
    #[ignore = "needs a real TPM at /dev/tpmrm0"]
    fn a_csr_built_over_the_tpm_key_verifies() {
        use console_tpm::TpmBackend;

        let mut tpm = TpmBackend::new("device:/dev/tpmrm0");
        tpm.open().expect("the host TPM is reachable");
        let handle = tpm.generate_key().expect("a primary is created");

        let fqdn = "console-bff.node.test.crucibledb";
        let sans = CsrSubjectAltNames {
            dns: vec![fqdn.to_owned()],
            uris: Vec::new(),
        };
        let csr_der = build_csr(fqdn, &sans, &handle.public_der, &mut tpm).expect("build TPM CSR");

        let csr = CertReq::from_der(&csr_der).expect("parse CSR");
        let tbs = csr.info.to_der().unwrap();
        let spki = csr.info.public_key.to_der().unwrap();
        let verifying_key = VerifyingKey::from_public_key_der(&spki).unwrap();
        let signature = Signature::from_der(csr.signature.as_bytes().unwrap()).unwrap();
        verifying_key
            .verify(&tbs, &signature)
            .expect("the TPM-signed CSR verifies against the TPM public key");
    }
}
