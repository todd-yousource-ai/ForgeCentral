//! The Forge contract seam gate (INV-CONSOLE-FORGE-CONTRACT-SEAM-GATED).
//!
//! ForgeCentral produces a `SignedPolicyBundle` across two tiers, and each tier learns the bundle's
//! shape from a DIFFERENT crdb revision:
//!
//!   - this sidecar signs a `cdb_types::SignedPolicyBundle` pinned at the rev `torch-forge` pins, and
//!   - `@forge/contracts` generates its TypeScript from `packages/contracts/schema/forge-dto.schema.json`,
//!     which is vendored from crdb `main`.
//!
//! Two gates already exist and neither covers that pair. crdb's own conformance tests tie its emitted
//! schema to its Rust types; ForgeCentral's codegen round-trip ties the vendored schema to the generated
//! TypeScript. Nothing compares the sidecar's Rust against the vendored schema, so a change to
//! `cdb-types` `forge.rs` landing between the two revs would diverge the producer's Rust from the
//! producer's own TypeScript in silence -- and the symptom would be signatures the endpoint refuses,
//! which reads like a crypto fault rather than a contract drift.
//!
//! This test is that missing comparison. It serializes a real instance of every type the bundle preimage
//! contains and asserts the field set matches the vendored schema's `$def`, so a field added, removed, or
//! renamed on either side fails here. It deliberately does NOT re-verify what the other two gates already
//! prove; it only closes the seam between them.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::collections::BTreeSet;
use std::path::PathBuf;

use cdb_types::{
    AgentGci, BundleVersion, CertIdentity, Classification, EndpointPolicy, ExecDisposition,
    FreshnessLease, Hlc, IdentityScope, KeyId, ModelMcpDest, ModelMcpDestSet, PolicyId,
    PolicyVersionRef, ResourceBound, ScopeMember, SignatureAlgorithm, SignedPolicyBundle, Version,
    VtzId,
};
use serde_json::Value;

/// The vendored contract the TypeScript tier is generated from.
fn vendored_schema() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("packages")
        .join("contracts")
        .join("schema")
        .join("forge-dto.schema.json");
    let raw =
        std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    serde_json::from_str(&raw).expect("the vendored forge schema is valid JSON")
}

/// The property names the vendored schema declares for `def`.
fn schema_fields(schema: &Value, def: &str) -> BTreeSet<String> {
    schema["$defs"][def]["properties"]
        .as_object()
        .unwrap_or_else(|| panic!("vendored schema has no object $def {def}"))
        .keys()
        .cloned()
        .collect()
}

/// The field names this crate's Rust type actually serializes.
fn rust_fields(instance: &impl serde::Serialize) -> BTreeSet<String> {
    let value = serde_json::to_value(instance).expect("the type serializes");
    value
        .as_object()
        .expect("the type serializes as an object")
        .keys()
        .cloned()
        .collect()
}

/// Asserts one type's Rust field set equals the vendored schema's field set for that `$def`.
fn assert_seam(schema: &Value, def: &str, instance: &impl serde::Serialize) {
    let rust = rust_fields(instance);
    let vendored = schema_fields(schema, def);
    assert_eq!(
        rust, vendored,
        "{def}: the sidecar's cdb-types shape and the vendored forge schema have diverged. \
         The signing tier and the TypeScript tier would disagree about what is signed. \
         Re-vendor packages/contracts/schema/forge-dto.schema.json and realign the crdb pins."
    );
}

fn sample_identity() -> CertIdentity {
    CertIdentity {
        cn: "node.crucible".to_owned(),
        sans: vec!["node.crucible".to_owned()],
    }
}

fn sample_policy() -> EndpointPolicy {
    EndpointPolicy {
        max_classification: Classification::Unclassified,
        brokered: ModelMcpDestSet::new([ModelMcpDest::new("api.anthropic.com")]),
        restricted: vec!["known-malware-c2.example".to_owned()],
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
    }
}

fn sample_bundle() -> SignedPolicyBundle {
    SignedPolicyBundle {
        version: BundleVersion(7),
        policy: sample_policy(),
        contributors: vec![PolicyVersionRef::new(
            PolicyId(uuid::Uuid::nil()),
            Version::new(1, 0, 0),
        )],
        scope: IdentityScope::new(
            VtzId::new("YouSource.Corp"),
            [
                ScopeMember::endpoint(sample_identity()),
                ScopeMember::agent(sample_identity(), AgentGci("gci-abc".to_owned())),
            ],
        ),
        lease: FreshnessLease::new(Hlc(100), Hlc(200)),
        signing_key_id: KeyId("forge-signing-1".to_owned()),
        signature_algorithm: SignatureAlgorithm::MlDsa87,
        signature: vec![1, 2, 3, 4],
    }
}

#[test]
fn the_signing_tier_and_the_vendored_contract_agree_on_every_bundle_shape() {
    let schema = vendored_schema();
    assert_seam(&schema, "SignedPolicyBundle", &sample_bundle());
    assert_seam(&schema, "EndpointPolicy", &sample_policy());
    assert_seam(&schema, "ResourceBound", &sample_policy().resource_bound);
    assert_seam(&schema, "CertIdentity", &sample_identity());
    assert_seam(
        &schema,
        "ScopeMember",
        &ScopeMember::endpoint(sample_identity()),
    );
    assert_seam(
        &schema,
        "IdentityScope",
        &IdentityScope::new(VtzId::new("YouSource.Corp"), []),
    );
    assert_seam(
        &schema,
        "FreshnessLease",
        &FreshnessLease::new(Hlc(1), Hlc(2)),
    );
    assert_seam(
        &schema,
        "ModelMcpDestSet",
        &ModelMcpDestSet::new([ModelMcpDest::new("example.test")]),
    );
    assert_seam(
        &schema,
        "PolicyVersionRef",
        &PolicyVersionRef::new(PolicyId(uuid::Uuid::nil()), Version::new(1, 0, 0)),
    );
    assert_seam(&schema, "Version", &Version::new(1, 0, 0));
}

#[test]
fn the_vendored_field_order_matches_what_the_signing_tier_serializes() {
    // `x-fieldOrder` is what a TypeScript preimage builder would encode in. It must name exactly the
    // fields this tier serializes -- an order over a stale field set is worse than no order at all.
    let schema = vendored_schema();
    for def in [
        "SignedPolicyBundle",
        "EndpointPolicy",
        "ResourceBound",
        "CertIdentity",
    ] {
        let ordered: BTreeSet<String> = schema["$defs"][def]["x-fieldOrder"]
            .as_array()
            .unwrap_or_else(|| panic!("vendored schema $def {def} has no x-fieldOrder"))
            .iter()
            .map(|v| v.as_str().expect("a field name is a string").to_owned())
            .collect();
        assert_eq!(
            ordered,
            schema_fields(&schema, def),
            "{def}: x-fieldOrder and properties name different fields"
        );
    }
}

#[test]
fn the_preimage_is_reachable_and_deterministic_from_this_process() {
    // De-risks FD.2: the signing tier can compute the endpoint's own preimage, and the same bundle
    // always yields the same bytes, which is what makes a detached signature verifiable at all. The
    // signature field is excluded from the preimage, so changing it must not change the bytes -- that
    // is what lets the signer compute the preimage BEFORE it has a signature to put in the bundle.
    let mut bundle = sample_bundle();
    let first = torch_forge::bundle_preimage_bytes(&bundle).expect("the preimage encodes");
    assert!(!first.is_empty(), "a preimage is never empty");
    assert_eq!(
        first,
        torch_forge::bundle_preimage_bytes(&bundle).expect("the preimage encodes"),
        "the preimage is deterministic for one bundle"
    );

    bundle.signature = vec![9, 9, 9];
    assert_eq!(
        first,
        torch_forge::bundle_preimage_bytes(&bundle).expect("the preimage encodes"),
        "the signature is excluded from its own preimage"
    );

    // A change to any SIGNED field must change the bytes, or tampering would go undetected.
    let mut tampered = sample_bundle();
    tampered.policy.allow_ordinary_internet = true;
    assert_ne!(
        first,
        torch_forge::bundle_preimage_bytes(&tampered).expect("the preimage encodes"),
        "flipping the one authored bit must change the signed bytes"
    );
}

#[test]
fn the_signing_provider_round_trips_against_the_endpoint_verifier() {
    // The cross-repo proof in miniature: sign with cdb-artifact's ML-DSA-87 signer, verify with torch's
    // DistributionAnchor -- the same code path the endpoint runs. FD.2 builds the service around this.
    use cdb_artifact::{sha512, MlDsa87Signer, Signer};

    let key_id = KeyId("forge-signing-1".to_owned());
    let signer = MlDsa87Signer::from_seed(key_id.clone(), &[7u8; 32]).expect("the seed is valid");

    let mut bundle = sample_bundle();
    bundle.signing_key_id = key_id.clone();
    bundle.signature_algorithm = SignatureAlgorithm::MlDsa87;
    let preimage = torch_forge::bundle_preimage_bytes(&bundle).expect("the preimage encodes");
    bundle.signature = signer
        .sign(sha512(&preimage).as_bytes())
        .expect("signing succeeds")
        .0;

    let anchor =
        torch_forge::DistributionAnchor::new().with_key(key_id, signer.verifying_key_bytes());
    anchor
        .verify_bundle(&bundle)
        .expect("a bundle this tier signed verifies at the endpoint");

    // And a tampered bundle does not.
    let mut tampered = bundle.clone();
    tampered.policy.allow_ordinary_internet = true;
    assert!(
        anchor.verify_bundle(&tampered).is_err(),
        "a bundle altered after signing must fail verification"
    );
}
