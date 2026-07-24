//! The Forge bundle signer (FD.2, INV-CONSOLE-FORGE-SIGNED-AT-SOURCE).
//!
//! ForgeCentral is the only holder of the Forge signing key: an endpoint that verifies a bundle is
//! verifying ForgeCentral's signature and nothing else can produce one. This module owns that key and
//! is the only place a [`SignedPolicyBundle`] is assembled.
//!
//! The signature is over `sha512(bundle_preimage_bytes(bundle))`, computed with
//! [`cdb_artifact::bundle_preimage_bytes`] -- the same implementation the endpoint verifies with, so
//! the two agree structurally rather than by fixture. Neither the seed nor the assembled preimage ever
//! enters the TypeScript tier; the BFF sends a [`BundleDraft`] and receives the signed bundle.
//!
//! # Key lifecycle
//!
//! FD.2 owns the SEED; FD.5 owns the ANCHOR. This module generates a 32-byte FIPS 204 seed on first
//! install and persists it `0600` under the sidecar's own user. Only the public verifying key ever
//! leaves, via [`BundleSigner::verifying_key`], for the installer to publish as the endpoint's
//! `DistributionAnchor`. An installer-minted seed would exist in installer memory, shell history and
//! possibly logs, which is a far wider blast radius than "never leaves the sidecar" implies.
//!
//! **Generation is a one-time explicit act, never an implicit repair.** [`BundleSigner::load`] refuses
//! a missing seed rather than minting a replacement. A silently re-minted key orphans every deployed
//! anchor and stops every bundle verifying, and it presents as a crypto fault rather than a lost file,
//! so the failure is made loud and local instead. [`BundleSigner::generate`] is the separate,
//! deliberate entry point and refuses to overwrite an existing seed.
//!
//! The seed at rest is the weakest link in the chain; sealing it to the TPM is the named follow-on.

use std::fs;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};

use cdb_artifact::{bundle_preimage_bytes, sha512, MlDsa87Signer, Signer};
use cdb_types::{
    BundleVersion, EndpointPolicy, FreshnessLease, IdentityScope, KeyId, PolicyVersionRef,
    SignatureAlgorithm, SignedPolicyBundle,
};
use serde::{Deserialize, Serialize};

/// The FIPS 204 seed length ML-DSA-87 key derivation takes.
const SEED_LEN: usize = 32;

/// The permission bits a seed file must NOT carry: any access for group or other.
const FORBIDDEN_SEED_MODE_BITS: u32 = 0o077;

/// How many hex characters of the verifying-key digest form the key id.
///
/// 32 hex characters is 128 bits of a SHA-512 digest -- far beyond collision reach for the number of
/// signing keys a deployment will ever hold, and short enough to read in an audit line.
const KEY_ID_HEX_LEN: usize = 32;

/// The typed reasons the signer refuses. Every one is fail-closed: no path returns an unsigned or
/// partially-signed bundle.
#[derive(Debug, thiserror::Error)]
pub enum SigningError {
    /// The seed file is absent. NOT a cue to generate one: see the module docs.
    #[error(
        "signing seed not found at {0}; refusing to mint a replacement (run the install step)"
    )]
    SeedMissing(PathBuf),
    /// The seed file is readable by group or other.
    #[error("signing seed at {path} has mode {mode:o}; it must not be group or world accessible")]
    SeedPermissions { path: PathBuf, mode: u32 },
    /// The seed file exists but is not exactly [`SEED_LEN`] bytes.
    #[error("signing seed at {path} is {len} bytes; expected {SEED_LEN}")]
    SeedMalformed { path: PathBuf, len: usize },
    /// Generation was asked to overwrite an existing seed.
    #[error("a signing seed already exists at {0}; refusing to overwrite it")]
    SeedExists(PathBuf),
    /// The seed could not be read or written.
    #[error("signing seed io at {path}: {source}")]
    SeedIo {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    /// The provider rejected the seed or the signing operation.
    #[error("the ML-DSA-87 provider refused the operation")]
    Provider,
    /// The bundle could not be encoded into its signed preimage.
    #[error("the bundle preimage could not be formed")]
    Preimage,
}

/// The unsigned parts of a bundle, as the BFF sends them.
///
/// Everything the signature binds EXCEPT `signing_key_id` and `signature_algorithm`, which the signer
/// fills from the key it actually holds. A caller cannot assert which key signed its bundle.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BundleDraft {
    /// The monotonic version, derived from the crdb commit version of the zone read.
    pub version: BundleVersion,
    /// The flat effective policy composed from the zone.
    pub policy: EndpointPolicy,
    /// The zone's effective published rules (P5.5): the authored-ruleset carriage the producer
    /// composed from POLICY_EFFECTIVE. Absent/empty on a zone-posture-only draft (`serde(default)`),
    /// which signs the unchanged v1 preimage; a non-empty ruleset signs in the v2 domain.
    #[serde(default)]
    pub rules: Vec<cdb_types::BundleRule>,
    /// The authored policy versions the policy was composed from.
    pub contributors: Vec<PolicyVersionRef>,
    /// The endpoints this bundle binds to.
    pub scope: IdentityScope,
    /// The freshness lease.
    pub lease: FreshnessLease,
}

/// The Forge signing key, held only here.
pub struct BundleSigner {
    signer: MlDsa87Signer,
    key_id: KeyId,
    verifying_key: Vec<u8>,
}

impl BundleSigner {
    /// Loads the signer from an existing seed file.
    ///
    /// Fail-closed on every abnormality: a missing seed, a seed reachable by group or other, or a seed
    /// of the wrong length all refuse rather than proceeding with a key of unknown provenance.
    ///
    /// # Errors
    /// [`SigningError::SeedMissing`], [`SigningError::SeedPermissions`],
    /// [`SigningError::SeedMalformed`], [`SigningError::SeedIo`], or [`SigningError::Provider`].
    pub fn load(seed_path: &Path) -> Result<Self, SigningError> {
        if !seed_path.exists() {
            return Err(SigningError::SeedMissing(seed_path.to_path_buf()));
        }
        let meta = fs::metadata(seed_path).map_err(|source| SigningError::SeedIo {
            path: seed_path.to_path_buf(),
            source,
        })?;
        let mode = meta.permissions().mode();
        if mode & FORBIDDEN_SEED_MODE_BITS != 0 {
            return Err(SigningError::SeedPermissions {
                path: seed_path.to_path_buf(),
                mode: mode & 0o7777,
            });
        }
        let bytes = fs::read(seed_path).map_err(|source| SigningError::SeedIo {
            path: seed_path.to_path_buf(),
            source,
        })?;
        let seed: [u8; SEED_LEN] =
            bytes
                .as_slice()
                .try_into()
                .map_err(|_| SigningError::SeedMalformed {
                    path: seed_path.to_path_buf(),
                    len: bytes.len(),
                })?;
        Self::from_seed(&seed)
    }

    /// Generates a new seed at `seed_path` and returns the signer for it.
    ///
    /// The deliberate, one-time install act. It refuses to overwrite an existing seed, because doing so
    /// would orphan every anchor already provisioned from the old key.
    ///
    /// # Errors
    /// [`SigningError::SeedExists`] if a seed is already present, [`SigningError::SeedIo`] on a write
    /// failure, or [`SigningError::Provider`] if the provider rejects the material.
    pub fn generate(seed_path: &Path) -> Result<Self, SigningError> {
        let mut seed = [0u8; SEED_LEN];
        aws_lc_rs::rand::fill(&mut seed).map_err(|_| SigningError::Provider)?;

        if let Some(parent) = seed_path.parent() {
            fs::create_dir_all(parent).map_err(|source| SigningError::SeedIo {
                path: seed_path.to_path_buf(),
                source,
            })?;
        }

        // One atomic create carries both guarantees. `create_new` fails if the path exists, so the
        // refusal to overwrite cannot be raced by a seed appearing between a check and a write; and
        // `mode` applies at creation, so the seed is never briefly readable at the umask default.
        // Checking existence first and chmod-ing afterwards would leave a window under each.
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(seed_path)
            .map_err(|source| {
                if source.kind() == std::io::ErrorKind::AlreadyExists {
                    SigningError::SeedExists(seed_path.to_path_buf())
                } else {
                    SigningError::SeedIo {
                        path: seed_path.to_path_buf(),
                        source,
                    }
                }
            })?;
        std::io::Write::write_all(&mut file, &seed).map_err(|source| SigningError::SeedIo {
            path: seed_path.to_path_buf(),
            source,
        })?;
        Self::from_seed(&seed)
    }

    /// Builds the signer from raw seed material, deriving the key id from the resulting public key.
    fn from_seed(seed: &[u8; SEED_LEN]) -> Result<Self, SigningError> {
        // The key id must name THIS key, so it is derived rather than configured: signing_key_id sits
        // inside the signed preimage, and an id that can drift from its key is a hazard.
        let provisional = MlDsa87Signer::from_seed(KeyId(String::new()), seed)
            .map_err(|_| SigningError::Provider)?;
        let verifying_key = provisional.verifying_key_bytes();
        let key_id = KeyId(derive_key_id(&verifying_key));

        let signer = MlDsa87Signer::from_seed(key_id.clone(), seed).map_err(|_| {
            // Unreachable in practice: the same seed just built a signer above.
            SigningError::Provider
        })?;
        Ok(Self {
            signer,
            key_id,
            verifying_key,
        })
    }

    /// The key id every bundle this signer produces carries.
    #[must_use]
    pub fn key_id(&self) -> &KeyId {
        &self.key_id
    }

    /// The public verifying key, for the installer to publish as the endpoints' `DistributionAnchor`.
    ///
    /// The only key material that ever leaves this process.
    #[must_use]
    pub fn verifying_key(&self) -> &[u8] {
        &self.verifying_key
    }

    /// Assembles and signs a bundle from the draft.
    ///
    /// The signature is over `sha512` of the preimage, which excludes the `signature` field, so the
    /// bundle is assembled with an empty signature, the preimage taken, and the signature written back.
    ///
    /// # Errors
    /// [`SigningError::Preimage`] if the bundle cannot be encoded, [`SigningError::Provider`] if
    /// signing fails.
    pub fn sign_bundle(&self, draft: BundleDraft) -> Result<SignedPolicyBundle, SigningError> {
        let mut bundle = SignedPolicyBundle {
            version: draft.version,
            policy: draft.policy,
            rules: draft.rules,
            contributors: draft.contributors,
            scope: draft.scope,
            lease: draft.lease,
            signing_key_id: self.key_id.clone(),
            signature_algorithm: SignatureAlgorithm::MlDsa87,
            signature: Vec::new(),
        };
        let preimage = bundle_preimage_bytes(&bundle).map_err(|_| SigningError::Preimage)?;
        let digest = sha512(&preimage);
        let signature = self
            .signer
            .sign(digest.as_bytes())
            .map_err(|_| SigningError::Provider)?;
        bundle.signature = signature.0;
        Ok(bundle)
    }
}

/// The key id for a verifying key: the leading [`KEY_ID_HEX_LEN`] hex characters of its SHA-512.
fn derive_key_id(verifying_key: &[u8]) -> String {
    use std::fmt::Write as _;
    let digest = sha512(verifying_key);
    let mut out = String::with_capacity(KEY_ID_HEX_LEN);
    for byte in digest.as_bytes() {
        if out.len() >= KEY_ID_HEX_LEN {
            break;
        }
        let _ = write!(out, "{byte:02x}");
    }
    out.truncate(KEY_ID_HEX_LEN);
    out
}

#[cfg(test)]
mod tests {
    // Sanctioned test relaxation per Rust_Dev_Rules.md section 13.
    #![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
    use super::*;
    use cdb_artifact::{MlDsa87Verifier, Signature, Verifier};
    use cdb_types::{Classification, ExecDisposition, Hlc, ModelMcpDestSet, ResourceBound, VtzId};

    /// A clean per-test directory, so one test's seed never satisfies another's precondition.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("fc-forge-signing-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
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
            rules: Vec::new(),
            contributors: Vec::new(),
            scope: IdentityScope::new(VtzId::new("YouSource.Corp"), []),
            lease: FreshnessLease::new(Hlc(100), Hlc(200)),
        }
    }

    #[test]
    fn a_generated_seed_is_owner_only_and_reloads_to_the_same_key() {
        let path = scratch("generate").join("seed");
        let signer = BundleSigner::generate(&path).unwrap();

        let mode = fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600, "the seed must be owner-only at rest");

        // The key is what the anchor was provisioned from, so a restart must not change it.
        let reloaded = BundleSigner::load(&path).unwrap();
        assert_eq!(signer.key_id(), reloaded.key_id());
        assert_eq!(signer.verifying_key(), reloaded.verifying_key());
    }

    #[test]
    fn generation_refuses_to_overwrite_an_existing_seed() {
        // Overwriting mints a new key and orphans every anchor already provisioned from the old one.
        let path = scratch("overwrite").join("seed");
        BundleSigner::generate(&path).unwrap();
        assert!(matches!(
            BundleSigner::generate(&path),
            Err(SigningError::SeedExists(_))
        ));
    }

    #[test]
    fn a_missing_seed_refuses_rather_than_minting_a_replacement() {
        // The failure this whole design exists to prevent: a silently re-minted key stops every
        // deployed endpoint verifying, and presents as a crypto fault rather than a lost file.
        let path = scratch("missing").join("seed");
        assert!(matches!(
            BundleSigner::load(&path),
            Err(SigningError::SeedMissing(_))
        ));
    }

    #[test]
    fn a_seed_readable_by_anyone_else_is_refused() {
        let path = scratch("perms").join("seed");
        BundleSigner::generate(&path).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
        assert!(matches!(
            BundleSigner::load(&path),
            Err(SigningError::SeedPermissions { .. })
        ));
    }

    #[test]
    fn a_truncated_seed_is_refused() {
        let path = scratch("malformed").join("seed");
        fs::write(&path, [0u8; 8]).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        assert!(matches!(
            BundleSigner::load(&path),
            Err(SigningError::SeedMalformed { len: 8, .. })
        ));
    }

    #[test]
    fn the_key_id_is_derived_from_the_key_it_names() {
        // signing_key_id is inside the signed preimage, so an id that can drift from its key is a
        // hazard. Two different seeds must never produce the same id, and one seed always the same.
        let a = BundleSigner::generate(&scratch("kid-a").join("seed")).unwrap();
        let b = BundleSigner::generate(&scratch("kid-b").join("seed")).unwrap();
        assert_eq!(a.key_id().0.len(), KEY_ID_HEX_LEN);
        assert!(a.key_id().0.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a.key_id(), b.key_id());
        assert_eq!(a.key_id().0, derive_key_id(a.verifying_key()));
    }

    #[test]
    fn a_signed_bundle_verifies_with_the_endpoints_provider() {
        let signer = BundleSigner::generate(&scratch("sign").join("seed")).unwrap();
        let bundle = signer.sign_bundle(draft()).unwrap();

        // The signer fills these from the key it holds; a caller cannot assert which key signed.
        assert_eq!(&bundle.signing_key_id, signer.key_id());
        assert_eq!(bundle.signature_algorithm, SignatureAlgorithm::MlDsa87);
        assert!(!bundle.signature.is_empty());

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
            .expect("a bundle this signer produced verifies");
    }

    #[test]
    fn a_bundle_altered_after_signing_does_not_verify() {
        let signer = BundleSigner::generate(&scratch("tamper").join("seed")).unwrap();
        let bundle = signer.sign_bundle(draft()).unwrap();

        let mut tampered = bundle.clone();
        tampered.policy.allow_ordinary_internet = true;

        let verifier = MlDsa87Verifier::default()
            .with_key(signer.key_id().clone(), signer.verifying_key().to_vec());
        let digest = sha512(&bundle_preimage_bytes(&tampered).unwrap());
        assert!(
            verifier
                .verify(
                    digest.as_bytes(),
                    &Signature(bundle.signature),
                    &tampered.signing_key_id,
                    tampered.signature_algorithm,
                )
                .is_err(),
            "flipping the one authored bit must break the signature"
        );
    }
}
