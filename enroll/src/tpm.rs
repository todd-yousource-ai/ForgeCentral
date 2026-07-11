//! The Linux TPM 2.0 backend over the TSS ESAPI (`libtss2`), IP-CONSOLE-00-SIDECAR-TPM.
//!
//! The concrete hardware backend for the shared `cdb_device_identity::KeystoreBackend` seam: the
//! Console's engine identity is a non-exportable, hardware-resident key, so it enrolls exactly like a
//! torch edge device and the node's `require_attestation` stays enforced (no server weakening). The
//! private key is generated inside the TPM and never exported. The only dev/prod difference is the
//! TCTI: a swtpm socket for a HW-agnostic test, the host TPM (`device:/dev/tpmrm0`) in production --
//! same code, same seam.
//!
//! This module is a faithful port of the proven torch-core TPM backend (verified against this node's
//! pinned EK roots); it lives here (not in the engine's `cdb-device-identity` leaf crate) so the
//! engine's hermetic, offline build never links the `tss-esapi`/`libtss2` C toolchain.

use std::str::FromStr as _;

use cdb_device_identity::{KeyHandle, KeyResidency, KeystoreBackend, KeystoreError};
use rustls::pki_types::pem::PemObject as _;
use rustls::pki_types::CertificateDer;
use tss_esapi::attributes::ObjectAttributesBuilder;
use tss_esapi::handles::{KeyHandle as TpmKeyHandle, NvIndexHandle, NvIndexTpmHandle};
use tss_esapi::interface_types::algorithm::{HashingAlgorithm, PublicAlgorithm};
use tss_esapi::interface_types::ecc::EccCurve;
use tss_esapi::interface_types::key_bits::RsaKeyBits;
use tss_esapi::interface_types::resource_handles::{Hierarchy, NvAuth};
use tss_esapi::structures::{
    Data, EccPoint, EccScheme, HashScheme, KeyDerivationFunctionScheme, MaxBuffer,
    PcrSelectionListBuilder, PcrSlot, Public, PublicBuilder, PublicEccParametersBuilder,
    PublicKeyRsa, PublicRsaParametersBuilder, RsaExponent, RsaScheme, Signature, SignatureScheme,
    SymmetricDefinitionObject,
};
use tss_esapi::traits::Marshall as _;
use tss_esapi::{Context, TctiNameConf};

/// The TPM 2.0 backend.
///
/// Holds the live [`Context`] and the generated key's transient handle (valid for the backend's
/// lifetime). Points at swtpm in a test and `/dev/tpmrm0` in production via the `tcti` string.
pub struct TpmBackend {
    tcti: String,
    context: Option<Context>,
    key: Option<TpmKeyHandle>,
    ek_cert_override: Option<Vec<u8>>,
}

impl TpmBackend {
    /// A TPM backend reachable over `tcti` (e.g. `swtpm:host=127.0.0.1,port=2321` or
    /// `device:/dev/tpmrm0`). The caller owns the TPM lifecycle.
    #[must_use]
    pub fn new(tcti: impl Into<String>) -> Self {
        Self {
            tcti: tcti.into(),
            context: None,
            key: None,
            ek_cert_override: None,
        }
    }

    /// Sources the EK certificate out-of-band from `pem` (the first certificate) instead of TPM NV.
    ///
    /// On a GCE Shielded VM the EK certificate is not in TPM NV -- only the EK public is -- so the EK
    /// certificate is supplied out-of-band and pinned here (the GCE per-instance cert from
    /// `getShieldedInstanceIdentity`, chaining to Google's vTPM CA, or an operator-issued cert over the
    /// real EK public). When set, [`attest`](KeystoreBackend::attest) presents this certificate; the
    /// node still verifies it chains to the pinned attestation root and that the AK is
    /// credential-activation-bound to that EK (so the device must hold the real EK private key). Unset,
    /// the backend reads the TCG-standard NV index (swtpm, or a manufacturer-provisioned TPM).
    ///
    /// # Errors
    /// [`KeystoreError::Operation`] if `pem` contains no certificate.
    pub fn with_ek_cert_pem(mut self, pem: &[u8]) -> Result<Self, KeystoreError> {
        let cert = CertificateDer::pem_slice_iter(pem)
            .next()
            .ok_or_else(|| {
                KeystoreError::Operation("EK certificate PEM contains no certificate".to_owned())
            })?
            .map_err(|e| KeystoreError::Operation(e.to_string()))?;
        self.ek_cert_override = Some(cert.as_ref().to_vec());
        Ok(self)
    }

    /// The TPM template for the device key: an unrestricted ECC (NIST P-384) ECDSA-SHA384 signing key,
    /// non-exportable (`fixed_tpm`/`fixed_parent`/`sensitive_data_origin`). P-384 meets the node's CNSA
    /// 2.0 floor (R-SED-16). Used for the CSR proof-of-possession and the mTLS handshake.
    fn signing_key_template() -> Result<Public, KeystoreError> {
        let op = |e: tss_esapi::Error| KeystoreError::Operation(e.to_string());
        let attributes = ObjectAttributesBuilder::new()
            .with_fixed_tpm(true)
            .with_fixed_parent(true)
            .with_sensitive_data_origin(true)
            .with_user_with_auth(true)
            .with_sign_encrypt(true)
            .with_restricted(false)
            .build()
            .map_err(op)?;
        let ecc_parameters = PublicEccParametersBuilder::new()
            .with_ecc_scheme(EccScheme::EcDsa(HashScheme::new(HashingAlgorithm::Sha384)))
            .with_curve(EccCurve::NistP384)
            .with_is_signing_key(true)
            .with_is_decryption_key(false)
            .with_restricted(false)
            .with_symmetric(SymmetricDefinitionObject::Null)
            .with_key_derivation_function_scheme(KeyDerivationFunctionScheme::Null)
            .build()
            .map_err(op)?;
        PublicBuilder::new()
            .with_public_algorithm(PublicAlgorithm::Ecc)
            .with_name_hashing_algorithm(HashingAlgorithm::Sha256)
            .with_object_attributes(attributes)
            .with_ecc_parameters(ecc_parameters)
            .with_ecc_unique_identifier(EccPoint::default())
            .build()
            .map_err(op)
    }

    /// The attestation-key template: an RSA-2048 RSASSA-SHA256 RESTRICTED signing key. The verifier
    /// requires a restricted RSA AK (it only verifies RSA quotes), distinct from the ECC device key.
    fn ak_template() -> Result<Public, KeystoreError> {
        let op = |e: tss_esapi::Error| KeystoreError::Operation(e.to_string());
        let attributes = ObjectAttributesBuilder::new()
            .with_fixed_tpm(true)
            .with_fixed_parent(true)
            .with_sensitive_data_origin(true)
            .with_user_with_auth(true)
            .with_restricted(true)
            .with_sign_encrypt(true)
            .build()
            .map_err(op)?;
        let rsa_parameters = PublicRsaParametersBuilder::new()
            .with_scheme(RsaScheme::RsaSsa(HashScheme::new(HashingAlgorithm::Sha256)))
            .with_key_bits(RsaKeyBits::Rsa2048)
            .with_exponent(RsaExponent::default())
            .with_is_signing_key(true)
            .with_is_decryption_key(false)
            .with_restricted(true)
            .with_symmetric(SymmetricDefinitionObject::Null)
            .build()
            .map_err(op)?;
        PublicBuilder::new()
            .with_public_algorithm(PublicAlgorithm::Rsa)
            .with_name_hashing_algorithm(HashingAlgorithm::Sha256)
            .with_object_attributes(attributes)
            .with_rsa_parameters(rsa_parameters)
            .with_rsa_unique_identifier(PublicKeyRsa::default())
            .build()
            .map_err(op)
    }

    /// Reads the RSA EK certificate. When sourced out-of-band (a GCE Shielded VM; see
    /// [`with_ek_cert_pem`](Self::with_ek_cert_pem)) the pinned certificate is returned directly;
    /// otherwise it is read from the TCG-standard NV index 0x01c00002.
    fn read_ek_cert(&mut self) -> Result<Vec<u8>, KeystoreError> {
        if let Some(ek_cert) = &self.ek_cert_override {
            // Clone: the pinned certificate is retained for any later re-attestation.
            return Ok(ek_cert.clone());
        }
        let context = self.context.as_mut().ok_or(KeystoreError::Unavailable)?;
        let op = |e: tss_esapi::Error| KeystoreError::Operation(e.to_string());
        let nv_index = NvIndexTpmHandle::new(0x01c0_0002).map_err(op)?;
        let data = context
            .execute_with_nullauth_session(|ctx| {
                let handle: NvIndexHandle = ctx.tr_from_tpm_public(nv_index.into())?.into();
                let (nv_public, _name) = ctx.nv_read_public(handle)?;
                let size = u16::try_from(nv_public.data_size()).unwrap_or(u16::MAX);
                ctx.nv_read(NvAuth::Owner, handle, size, 0)
            })
            .map_err(op)?;
        Ok(data.to_vec())
    }

    /// Creates the RSA AK (under the endorsement hierarchy) and runs `TPM2_Quote(AK, PCR0, nonce)`,
    /// returning the AK public (TPM2B_PUBLIC) and the binding (`TPM2B(quote) || TPMT_SIGNATURE`).
    fn attestation_quote(&mut self, nonce: &[u8]) -> Result<(Vec<u8>, Vec<u8>), KeystoreError> {
        let template = Self::ak_template()?;
        let context = self.context.as_mut().ok_or(KeystoreError::Unavailable)?;
        let op = |e: tss_esapi::Error| KeystoreError::Operation(e.to_string());
        let ak = context
            .execute_with_nullauth_session(|ctx| {
                ctx.create_primary(Hierarchy::Endorsement, template, None, None, None, None)
            })
            .map_err(op)?;
        let ak_pub = tpm2b(&ak.out_public.marshall().map_err(op)?);

        let qualifying = Data::try_from(nonce.to_vec()).map_err(op)?;
        let scheme = SignatureScheme::RsaSsa {
            hash_scheme: HashScheme::new(HashingAlgorithm::Sha256),
        };
        let pcr_selection = PcrSelectionListBuilder::new()
            .with_selection(HashingAlgorithm::Sha256, &[PcrSlot::Slot0])
            .build()
            .map_err(op)?;
        let ak_handle = ak.key_handle;
        let (attest, signature) = context
            .execute_with_nullauth_session(|ctx| {
                ctx.quote(ak_handle, qualifying, scheme, pcr_selection)
            })
            .map_err(op)?;

        let mut binding = tpm2b(&attest.marshall().map_err(op)?);
        binding.extend_from_slice(&signature.marshall().map_err(op)?);
        Ok((ak_pub, binding))
    }
}

/// Prefixes `data` with its big-endian u16 length (a TPM2B wrapper).
fn tpm2b(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(2 + data.len());
    out.extend_from_slice(&u16::try_from(data.len()).unwrap_or(u16::MAX).to_be_bytes());
    out.extend_from_slice(data);
    out
}

/// Builds a DER `SubjectPublicKeyInfo` for a NIST P-384 public key from its raw `x`/`y` coordinates.
///
/// The coordinates are left-padded to 48 bytes and assembled into the uncompressed SEC1 point, which
/// p384 encodes into the `id-ecPublicKey` + `secp384r1` SPKI.
fn p384_spki_der(x: &[u8], y: &[u8]) -> Result<Vec<u8>, KeystoreError> {
    use p384::pkcs8::EncodePublicKey as _;
    let mut point = Vec::with_capacity(1 + 96);
    point.push(0x04); // uncompressed-point indicator
    for coord in [x, y] {
        let mut padded = [0u8; 48];
        let take = coord.len().min(48);
        padded[48 - take..].copy_from_slice(&coord[coord.len() - take..]);
        point.extend_from_slice(&padded);
    }
    let key = p384::PublicKey::from_sec1_bytes(&point)
        .map_err(|e| KeystoreError::Operation(e.to_string()))?;
    Ok(key
        .to_public_key_der()
        .map_err(|e| KeystoreError::Operation(e.to_string()))?
        .as_bytes()
        .to_vec())
}

impl KeystoreBackend for TpmBackend {
    fn open(&mut self) -> Result<(), KeystoreError> {
        // Connecting the TCTI + a get-random probe is the reachability check; an unreachable TPM
        // (swtpm down, or no device) fails closed here, never a software fallback.
        let tcti = TctiNameConf::from_str(&self.tcti).map_err(|_| KeystoreError::Unavailable)?;
        let mut context = Context::new(tcti).map_err(|_| KeystoreError::Unavailable)?;
        context
            .get_random(8)
            .map_err(|_| KeystoreError::Unavailable)?;
        self.context = Some(context);
        Ok(())
    }

    fn generate_key(&mut self) -> Result<KeyHandle, KeystoreError> {
        let context = self.context.as_mut().ok_or(KeystoreError::Unavailable)?;
        let template = Self::signing_key_template()?;
        // Create the primary under the owner hierarchy. A TPM primary is derived deterministically
        // from the owner-hierarchy seed + this fixed template, so a FRESH process re-derives the SAME
        // key -- the enrolled identity survives restarts with no key material ever on disk. A
        // TPM2_Clear changes the seed (and thus the key).
        let primary = context
            .execute_with_nullauth_session(|ctx| {
                ctx.create_primary(Hierarchy::Owner, template, None, None, None, None)
            })
            .map_err(|e| KeystoreError::Operation(e.to_string()))?;
        let public_der = match primary.out_public {
            Public::Ecc { unique, .. } => p384_spki_der(unique.x(), unique.y())?,
            _ => return Err(KeystoreError::Operation("non-ECC primary".to_owned())),
        };
        let reference = format!("0x{:08x}", primary.key_handle.value());
        self.key = Some(primary.key_handle);
        // The key is generated inside the TPM with fixed_tpm/fixed_parent set: non-exportable.
        Ok(KeyHandle {
            reference,
            public_der,
            residency: KeyResidency::HardwareNonExportable,
        })
    }

    fn sign(&mut self, message: &[u8]) -> Result<Vec<u8>, KeystoreError> {
        let key = self.key.ok_or(KeystoreError::Unavailable)?;
        let context = self.context.as_mut().ok_or(KeystoreError::Unavailable)?;
        let op = |e: tss_esapi::Error| KeystoreError::Operation(e.to_string());
        let data = MaxBuffer::try_from(message.to_vec()).map_err(op)?;
        // Hash the message with SHA-384 inside the TPM (the P-384 device key signs with SHA-384); the
        // validation ticket it returns lets the TPM sign the digest it produced (no null ticket).
        let (digest, ticket) = context
            .execute_with_nullauth_session(|ctx| {
                ctx.hash(data, HashingAlgorithm::Sha384, Hierarchy::Owner)
            })
            .map_err(op)?;
        let scheme = SignatureScheme::EcDsa {
            hash_scheme: HashScheme::new(HashingAlgorithm::Sha384),
        };
        let signature = context
            .execute_with_nullauth_session(|ctx| ctx.sign(key, digest, scheme, ticket))
            .map_err(op)?;
        match signature {
            Signature::EcDsa(ecc) => ecdsa_sig_der(ecc.signature_r(), ecc.signature_s()),
            _ => Err(KeystoreError::Operation("non-ECDSA signature".to_owned())),
        }
    }

    fn attest(&mut self, nonce: &[u8]) -> Result<cdb_types::DeviceAttestation, KeystoreError> {
        let ek_cert_der = self.read_ek_cert()?;
        let (ak_pub, binding) = self.attestation_quote(nonce)?;
        Ok(cdb_types::DeviceAttestation::new(
            ek_cert_der,
            ak_pub,
            binding,
        ))
    }
}

/// Assembles a DER-encoded P-384 ECDSA signature from the TPM's raw `r`/`s` (left-padded to 48 bytes).
fn ecdsa_sig_der(r: &[u8], s: &[u8]) -> Result<Vec<u8>, KeystoreError> {
    let pad = |v: &[u8]| -> [u8; 48] {
        let mut out = [0u8; 48];
        let take = v.len().min(48);
        out[48 - take..].copy_from_slice(&v[v.len() - take..]);
        out
    };
    let sig = p384::ecdsa::Signature::from_scalars(pad(r), pad(s))
        .map_err(|e| KeystoreError::Operation(e.to_string()))?;
    Ok(sig.to_der().as_bytes().to_vec())
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]
    use super::*;
    use cdb_device_identity::NonExportableKey;

    // A live TPM round-trip against the host device. #[ignore] by default: it needs a real TPM
    // (`/dev/tpmrm0`, present on the deploy node) and mutates no persistent state (a transient primary).
    // Run explicitly: `cargo test -p console-enroll --features _live-tpm -- --ignored tpm_`.
    #[test]
    #[ignore = "needs a real TPM at /dev/tpmrm0"]
    fn tpm_generates_a_nonexportable_key_and_signs_p384() {
        let mut tpm = TpmBackend::new("device:/dev/tpmrm0");
        tpm.open().expect("the host TPM is reachable");
        let handle = tpm.generate_key().expect("a primary is created");
        assert_eq!(handle.residency, KeyResidency::HardwareNonExportable);
        // The handle is structurally a production key (a software key could not become one).
        NonExportableKey::new(handle).expect("the TPM key is non-exportable");

        let sig = tpm
            .sign(b"console-enroll csr proof")
            .expect("the TPM signs");
        // A DER ECDSA-P384 signature over SHA-384 is a non-trivial SEQUENCE (two INTEGERs).
        assert!(sig.len() > 8 && sig[0] == 0x30, "DER SEQUENCE");
    }
}
