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
//!
//! DEFERRED (gating dependency: a CI credential with torch read access). Two further tests belong here
//! and are held back with the `torch-forge` / `cdb-artifact` edges: that the endpoint's own
//! `bundle_preimage_bytes` is reachable from this process, is deterministic, and excludes its own
//! signature; and that a bundle signed with `cdb-artifact`'s ML-DSA-87 signer verifies against torch's
//! real `DistributionAnchor` while a tampered one does not. Both passed locally before the edges were
//! backed out (CRUCIBLE_TOKEN 403s on the torch repo, so the gate went red on main). They return with
//! FD.2, which is the step that needs those crates anyway.

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
