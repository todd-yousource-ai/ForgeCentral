# IP-CONSOLE-02-FORGE-DISTRIBUTION -- ForgeCentral as the Forge policy-distribution plane

Makes the authored Virtual Trust Zones *enforceable*: ForgeCentral composes the zone definitions it
already reads into a flat `EndpointPolicy`, signs it into a `SignedPolicyBundle`, and serves it to Torch
endpoints over a mutually-authenticated seam. Torch's receiving half is already built and gated
(`IP-TORCH-FORGE-CORE` FG1.1b-FG1.11, LANDED): it verifies the signature on-device, rejects downgrades and
stale leases, applies atomically with last-known-good rollback, and reports the outcome back. What has
never existed is a producer. This IP is that producer.

**The boundary this IP fixes (operator decision, 2026-07-20; carrier amended 2026-07-20):** policy
always comes from ForgeCentral. CrucibleDB is the system of record for zone *definitions* and never
composes or signs policy; ForgeCentral is 1Source, and it is the only holder of the bundle signing key.
An endpoint that verifies a bundle is verifying ForgeCentral's signature, and nothing else can produce
one.

CrucibleDB IS the distribution **carrier** (operator decision, 2026-07-20): a signed bundle travels
FC -> crdb over the Console control plane (`:7879`) and is fetched by the endpoint over its existing
`:7878` seam, as **opaque signed bytes** crdb stores and serves but can neither author nor alter --
the named invariant already binds this ("a carrier that relays a bundle cannot forge one"), and the
endpoint's verify chain is carrier-independent by construction (`INV-FRG-DISTRIBUTION-IDENTITY-AUTH`:
transport auth never substitutes for the bundle's own signature).

**Read with:** `TRD-32 v1` (the endpoint requirement set the bundle contract comes from: R-FRG-21/40/70
identity-authenticated distribution, R-FRG-22/23/24 verify/atomic/fail-closed-stale, R-FRG-42
SignatureEnvelope, R-FRG-60..63 monotonic version and may-only-tighten), `TRD-32 v2` Section 12 (the
distribution contract shapes) and Section 15 (the identifier registry), the torch
`IP-TORCH-FORGE-CORE-LEDGER` (what the endpoint already enforces, so this IP builds only its counterpart),
`TRD-CONSOLE-00` (BFF, sidecar, no-2nd-DB, audited), and `IP-CONSOLE-02-VTZ` (the zone reads reused here).

**Named invariant:** **INV-CONSOLE-FORGE-SIGNED-AT-SOURCE** -- every bundle an endpoint accepts was
composed from the live crdb zone store and signed by the ForgeCentral signing key held in the crypto
sidecar. The signing key never enters the TypeScript tier, no bundle is ever produced from a source other
than the zone system of record, and a carrier that relays a bundle cannot forge one.

---

## SPEC GAP (cite at every PR review)

The Console TRD suite does not assign ForgeCentral the Forge distribution role. `TRD-32` Section 1.3 fixes
the split as "1Source AUTHORS policy per VTZ, Forge ingests/composes/distributes/enforces, Torch's per-OS
VTZ realizes", and the platform boundary records 1Source == ForgeCentral -- but no `TRD-CONSOLE-NN` states
that the Console *is* Forge's composition and distribution plane. `TRD-CONSOLE-05` covers the Policies
surface over the TRD-04 policy engine, which is a different thing: an operator authoring view, not a
bundle producer.

This IP is therefore filed under `TRD-CONSOLE-02` (Virtual Trust Zones), whose zones are what it
distributes, and it carries a standing amendment obligation: **`TRD-CONSOLE-00` gains a section naming
ForgeCentral as the Forge composition/distribution plane, with this IP's invariant, before FD.N closes.**
That amendment is FD.6 and is docs-only. Recording the conflict here rather than quietly implementing an
unspecified role is the `CLAUDE.md` source-hierarchy rule ("cite any conflict so the resolution is
auditable"). Precedent: `IP-CONSOLE-02-VTZ` V2.6 amended `TRD-CONSOLE-02` at all five Trust-Score sites
the same way.

---

## Prerequisites

- **torch `IP-TORCH-FORGE-CORE` FG1.1b-FG1.11 -- LANDED.** `EndpointPolicyApplier::verify_and_apply` (the
  ordered fail-closed chain), `ForgeDistribution` trait + `ForgeDistributionClient`
  (`refresh`/`receive_pushed`), atomic apply with rollback, monotonic version, freshness/partition
  fail-closed, apply audit. **The concrete transport is deferred-live and unbound** -- only an in-process
  fixture transport exists, so this IP is free to choose the seam.
- **crdb `IP-CONSOLE-VTZ-SUBSTRATE` -- LIVE over `:7878`**, and the `cdb-types` contract already carries
  `SignedPolicyBundle`, `EndpointPolicy`, `BundleVersion`, `IdentityScope`, `FreshnessLease`,
  `ApplyOutcome`.
- **crdb FD.0 `INV-FORGE-DTO-SCHEMA-EXPORTED` -- LANDED (crdb `8ac09d0e`).** Those types existed only in
  the Rust crate: the vendored `wire-dto.schema.json` is the TRD-04a `QUERY_SUBMIT` contract and carries
  none of them, so ForgeCentral had no TypeScript representation of the bundle it must compose and sign.
  crdb now emits a separate `forge-dto.schema.json`, which FC vendors and generates from.

  **This IP therefore DOES require one crdb change, contrary to the original scoping.** It was taken
  deliberately rather than hand-authoring the types: a hand-copy of a cryptographically load-bearing
  struct would sit outside the codegen drift gate, and combined with the field-order dependency below, a
  future `cdb-types` reorder or field addition would break every signature silently with no gate in
  either repo catching it. The change is export-only (no new fields, no engine logic, no wire byte, lock
  count unchanged), which is what the min-change rule asks for: minimal and flagged, not avoided.

  It also carries `x-fieldOrder` per struct. JSON Schema `properties` is an object that crdb's emitter
  alphabetizes, so struct declaration order -- which the CBOR preimage binds -- would be lost; a JSON
  array survives it. FC projects those arrays into `FORGE_FIELD_ORDER`, so a reorder upstream fails a
  gated assertion instead of invalidating signatures in the field.
- **`IP-CONSOLE-02-VTZ` -- COMPLETE.** `vtz.tree` / `vtz.detail` are live and are the only zone source.
- **crdb `INV-FORGE-PREIMAGE-SINGLE-DEFINITION` -- LANDED (crdb `d7c110b5`), and torch consumes it
  (torch `95d6243`).** FD.2 signs `sha512(preimage)`, so the producer must compute the exact bytes the
  endpoint verifies. That function was defined inside `torch-forge`, which meant the only way to agree
  with the endpoint was to take a source dependency on the endpoint's repository -- and CI could not
  fetch it, so the sidecar gate went red. It now lives in `cdb-artifact`, alongside the `sha512` and
  ML-DSA-87 provider both sides already share, pinned to a conformance vector captured from torch's
  implementation before the move. torch re-exports it. The producer therefore depends on ONE private
  repo, needs no torch credential, and agrees with the endpoint structurally rather than by fixture.
- **The ForgeCentral crypto sidecar** (`console-crypto-sidecar`, Rust + AWS-LC, already a gate step
  `[11]`) -- the home for the signing key and the ML-DSA-87 operation.

---

## The three findings that shape this IP

**1. A zone-only bundle carries exactly ONE authored bit, and that is a property of the model, not a
defect.** `EndpointPolicy` is the TRD-32 *v1* disposition; a v2 `TrustZoneRecord` carries eleven
`ObjectDomain` postures plus metadata. Verified field by field against `cdb-types`, the real mapping is:

| `EndpointPolicy` field | Zone source | Result |
|---|---|---|
| `allow_ordinary_internet` | `OrdinaryNetwork` effective posture | **the one real mapping** |
| `exec` | `Execution` (a catastrophic-floor domain, always `Deny`) | constant `DenyUnwrappedExec` |
| `brokered` | none | **empty** -- a destination SET, not a posture |
| `restricted` | none | **empty** -- likewise |
| `resource_bound` | none | grant-derived (R-FRG-4), not zone-derived |
| `max_classification` | none | not a field on `TrustZoneRecord` |

`GovernedEgress` does NOT map to `brokered`: a posture is a disposition, a `ModelMcpDestSet` is a list of
destinations, and a zone holds no destinations. Destinations and resource ceilings arrive from policy
rules (`TRD-CONSOLE-05`) and capability grants, neither of which is built.

The result is still enforceable and still fail-closed. With `brokered` and `restricted` empty,
`EndpointPolicy::egress_class` classifies **every** destination as restricted unless
`allow_ordinary_internet` is true -- so a zone denying `OrdinaryNetwork` produces a bundle that denies all
egress, and a zone permitting it produces one that allows direct ordinary egress. That is a real,
verifiable disposition reaching a real endpoint.

The NINE domains with no v1 field must not be silently dropped -- `GovernedEgress`,
`PrivilegeEscalation`, `KernelModule`, `CredentialStore`, `Persistence`, `FileAndConfig`, `Memory`,
`Ipc`, and `Device`. `GovernedEgress` belongs on that list for exactly the reason the mapping table
gives: it reads as though it maps to `brokered` and does not. Only `OrdinaryNetwork` and `Execution`
are expressible, so FD.1 derives the list as "every domain that is not one of those two" rather than
hardcoding it, and the record cannot drift as the bundle learns new fields -- and neither
must the four authored zone FIELDS with no v1 carrier (`micro_segmentation`, `telemetry`,
`reauth_interval_hours`, `zone_type`), which are equally operator-visible in the VTZ surface.

**The bundle cannot carry that record.** `contributors` is `Vec<PolicyVersionRef>`, and a
`PolicyVersionRef` is `{ policy: PolicyId, version: Version }` -- a typed reference to an authored policy
version, with no free-text field. There is no way to state "PrivilegeEscalation: Deny was dropped" inside
a v1 bundle. So the record lives **Console-side**: FD.1 emits the dropped domains and fields into the
audited composition record and the bundle detail view, where the operator sees what their zone authored
against what the bundle actually carries. The gap is visible without a `cdb-types` change.

Carrying the eight domains for real in the bundle is a **named deferral**
(`FD-DEFER-V2-POSTURE-BUNDLE`), gated on extending `SignedPolicyBundle` in `cdb-types` -- a crdb change,
deliberately out of this IP. **It lands with the Objects IP (`TRD-CONSOLE-10`)** (operator decision,
2026-07-20): `ObjectDomain` is the Objects surface's own vocabulary, so the bundle extension is authored
where those domains become real rather than bolted onto the distribution plane.

**2. `BundleVersion` monotonicity vs `INV-CONSOLE-NO-2ND-DB`.** The endpoint rejects any bundle whose
version is not strictly newer, so the producer needs a monotonic counter -- but the Console persists no
durable domain data. Resolution: **derive the version from the crdb commit version of the zone read**, not
from Console state. It is monotonic by construction, it is the system of record's own clock, two Console
replicas composing the same zones agree without coordination, and a zone edit is exactly what should
produce a new bundle. FD.2 proves a re-composition with no zone change yields the *same* version (so the
endpoint idempotently no-ops) and a zone edit yields a strictly greater one.

**3. The distribution channel is the endpoint's EXISTING `:7878` seam (operator decision,
2026-07-20).** The original plan had ForgeCentral host a new mTLS listener (Wire-CA server cert, ZTP
client trust) that every endpoint would connect to -- a SECOND seam on every torch node. That was
fighting the endpoint's own design: `torch-forge/src/distribution.rs` states "the endpoint pulls its
bundle over the one mutually-authenticated torch-core seam" and that the real transport "rides
`torch_core::SeamClient`". Torch was built expecting bundles on `:7878`.

So the channel is: FC commits the signed bundle to crdb over `:7879` (the Console's existing control
plane), crdb stores it as opaque signed bytes, and the endpoint fetches it over `:7878` with its
enrolled identity -- the fetch is scope-gated to the verified peer, exactly as the old FD.3 required.
No new listener, no new cert plumbing, no second trust decision on any endpoint, and store-and-forward
falls out for free: a bundle waits in crdb for an endpoint that is offline, which -- together with the
freshness lease failing closed -- is the durable-delivery story (see FD.7 and Out of scope).

"Push" over this channel is honest pull: torchd's `refresh` loop fetches on its own cadence, so the
refresh interval is the delivery latency and the lease bounds staleness. Server-initiated push waits on
a wire push-stream, already deferred platform-wide. Independently of all of it, the endpoint still
verifies the bundle's own ML-DSA-87 signature against the `DistributionAnchor`;
`torch-forge/src/distribution.rs:5-7` is explicit that transport auth never substitutes for it. The
anchor remains a provisioning deliverable (FD.5), not a side effect of the channel choice.

---

## INV-CROSS -- what is real, and what is not

| Piece | Real today? | Note |
|---|---|---|
| Zone definitions (`vtz.tree`) | **LIVE** | crdb `:7878`, the only composition input |
| `SignedPolicyBundle` / `EndpointPolicy` types | **LIVE** | `cdb-types/src/forge.rs`; shared contract, frozen |
| Endpoint verify + atomic apply | **LIVE (torch)** | FG1.2-FG1.6, gated, fixture-proven |
| Endpoint distribution client | **LIVE (torch, trait only)** | FG1.7; concrete transport deferred-live -- FD.4 supplies it |
| Bundle composition | **THIS IP** | FD.1 |
| Bundle signing | **THIS IP** | FD.2, sidecar-held key |
| Distribution listener + Section 12 frames | **THIS IP** | FD.3 |
| Membership (which principal is in which zone) | **DEFERRED** | crdb `VtzSetMembership` not built; scope is the enrolled device identity only. See "Out of scope" |
| Enforcement | **OFF** | AG.7-OFF throughout; an applied bundle realizes nothing until enforcement is turned on separately |

---

## Roster

| Step | Invariant | Deliverable |
|---|---|---|
| FD.1 | `INV-CONSOLE-FORGE-COMPOSED-FROM-RECORD` | Compose an `EndpointPolicy` from the live zone tree: a pure, deterministic function in `@forge/contracts` over the zone's **effective** (not own) postures, per the verified mapping in finding 1 -- `OrdinaryNetwork` drives `allow_ordinary_internet`, `exec` is the floor constant, `brokered`/`restricted` are empty, and `resource_bound`/`max_classification` take their most-restrictive fail-closed values because no zone field supplies them. Every unexpressible domain AND field is recorded in the audited composition record and the bundle detail view (not on the contributor list, which is typed `Vec<PolicyVersionRef>` and cannot hold it -- see finding 1). Fail-closed at every gap: an absent posture, an unknown enum tag, or an unreadable zone yields the most restrictive value, never a permissive default. Tier 1: the egress mapping both ways, floor preservation, a zone with an unknown tag composing closed, and a test asserting the fail-closed defaults are the restrictive ones. Tier 4 vector: a fixture zone composes byte-for-byte to the expected `EndpointPolicy` under **ciborium's serde encoding** -- definite-length maps, text keys, in struct **field-declaration order**. This is deterministic but NOT RFC 8949 canonical form: keys are NOT sorted. `packages/wire/src/cbor.ts` already encodes this way (`Object.keys` insertion order); do not add sorting. The corollary is a real constraint: the TS preimage object literal's property order must mirror `BundlePreimage` exactly (`domain, version, policy, contributors, scope, lease, signing_key_id, signature_algorithm`), so FD.1 pins that order with its own test -- an innocuous reordering silently invalidates every signature, and would surface only in FD.2 Tier 2. |
| FD.2 | `INV-CONSOLE-FORGE-SIGNED-AT-SOURCE` | Signing in the crypto sidecar: ML-DSA-87 over SHA-512 of the canonical CBOR preimage, computed by `cdb_artifact::bundle_preimage_bytes`, the one implementation the endpoint also verifies with; `SignedPolicyBundle` assembly (version derived from the crdb commit version per finding 2, `IdentityScope` from the target's enrolled identity, `FreshnessLease`, `signing_key_id` + `signature_algorithm` travelling for rotation). **Key lifecycle (operator decision, 2026-07-20).** FD.2 owns the SEED, FD.5 owns the ANCHOR: the sidecar generates the 32-byte FIPS 204 seed on first install and persists it `0600` under its own user, the installer never mints it, and only the public verifying key leaves. That is what makes "never leaves the sidecar" true -- an installer-generated seed would exist in installer memory, shell history, and possibly logs. Generation is a ONE-TIME EXPLICIT ACT, never an implicit repair: a missing seed on a running system refuses startup rather than minting a replacement, because a silently re-minted key orphans every deployed anchor and stops every bundle verifying in a way that reads as a crypto fault. `key_id` is DERIVED from the verifying key (a hash prefix), not hand-picked, because `signing_key_id` is inside the signed preimage and a key id that can drift from the key it names is a hazard. The BFF sends the bundle's unsigned parts and receives the assembled signed bundle; the seed never enters the TypeScript tier. Tier 1: preimage equality against a torch fixture. Tier 2: a bundle this step produces passes torch's real `EndpointPolicyApplier` unmodified (the cross-repo proof that matters). Tier 3: version monotonicity -- unchanged zones re-compose to an equal version, an edited zone to a strictly greater one; a tampered byte fails verification. |
| FD.3 | `INV-CONSOLE-FORGE-DISTRIBUTION-AUTHED` | The crdb bundle carrier (a crdb PR, flagged per the min-change rule; the second and last crdb change of this IP). A committed, audited store for opaque `SignedPolicyBundle` bytes plus two verbs: FC commits a bundle over `:7879` (Console-plane identity required), and an endpoint fetches the latest bundle whose `IdentityScope` includes the VERIFIED peer identity over `:7878` -- never a payload-asserted name. An unauthenticated, unscoped, or revoked peer gets a typed refusal, not an empty bundle. crdb serves bytes it cannot author: it holds no signing key, and a stored bundle is returned exactly as committed (byte-identical, or the endpoint's signature check fails -- which is the tamper evidence). `report_apply` stays torch FG1.10's advisory facts, which already land in crdb; no new report path. Tier 2: scope enforcement + refusal paths. Tier 3: a valid-cert peer outside scope receives nothing; a bundle round-trips byte-identical. |
| FD.4| FD.4 | `INV-TORCH-FORGE-TRANSPORT-REAL` (torch) | torch: the concrete `ForgeDistribution` impl over `torch_core::SeamClient` and the FD.3 wire verbs on `:7878` -- the transport FG1.7's own docs anticipated ("rides torch_core::SeamClient"; deferred-live, gated on the service half, which FD.3 is). Plus its config: the fetch cadence knob and the anchor path. Closes FG1.7's deferred-live transport. Tier 2 against an in-process verb fixture; the live leg folds into FD.N. **Torch's verify/apply path is untouched** -- this step supplies a transport, nothing else. |
| FD.5| FD.5 | `INV-CONSOLE-FORGE-ANCHOR-PROVISIONED` | Provisioning, in installer code and not by hand (the live-stitching rule): the sidecar's signing seed GENERATED BY THE SIDECAR on first start and the public verifying key read back and published as the `DistributionAnchor` (provisioned at install, not generated at install -- see FD.2), the `DistributionAnchor` (public half) delivered to endpoints at enrollment, the Wire-CA-issued listener cert issued, and the ZTP intermediate added to the listener's client-trust set. Must survive the daily ZTP rotation -- the endpoint's 24h leaf changes under the anchor, and the anchor does not rotate with it. Idempotent re-run; a missing anchor fails the install loudly rather than starting an unverifiable plane. |
| FD.6 | (docs) | `TRD-CONSOLE-00` amendment naming ForgeCentral as the Forge composition/distribution plane, resolving the SPEC GAP above; `IP-CONSOLE-02-VTZ-LEDGER` cross-reference so the VTZ IP points at where its zones become enforceable. Docs-only, scoped separately from code. |
| FD.7 | `INV-CONSOLE-FORGE-CONVERGENCE-VISIBLE` | The distribution convergence ledger: for any bundle, which endpoints have acknowledged it and which have not, as a **projection** and never a Console-held table (`INV-CONSOLE-NO-2ND-DB`). The numerator already exists as durable fact: torch FG1.10 (LANDED) emits a typed, payload-free, GCI-attributed `ForgeAudit::Apply` fact for every apply AND every rejection onto the TRD-21 advisory path, so no outcome is silent (R-FRG-25/52). The denominator is the bundle's own `IdentityScope` members, which FD.2 authored -- so this needs no endpoint inventory, unlike push. The ledger is the delta, per bundle version, with the typed `ApplyError` carried through for a rejection rather than collapsed to "failed". Surfaces the three states an operator must tell apart: acknowledged-applied, acknowledged-rejected (with the reason), and silent. Tier 2: an endpoint that reports `Applied` leaves the not-converged set and one that reports `Rejected` does not. Tier 3: an endpoint that reports nothing is rendered as silent, never as converged -- the fail-closed reading, since absence of evidence is not delivery. |
| FD.N | `INV-CONSOLE-FORGE-LIVE` | Live capstone on the node: author a zone in the Console -> compose -> sign -> torchd pulls over the real seam -> verifies -> applies -> reports the outcome -> the Console shows it. Enforcement stays OFF, so the proof is that the *policy plane* is real end to end, not that anything is enforced. Requires a fresh ZTP enrollment (the leaf expires daily). |

## Sequencing

FD.1 -> FD.2 -> FD.3 gate each other (compose before sign before serve). FD.4 needs FD.3's listener.
FD.5 can start after FD.2 fixes the key shape and must land before FD.N. FD.6 is independent and may land
any time after FD.1. FD.7 needs FD.3 (the `report_apply` path) and FD.2 (the `IdentityScope` it counts
against). FD.N closes the set.

FD.1 and FD.2 touch **only ForgeCentral**, and torch is not modified until FD.4. crdb contributes
exactly twice, both flagged per the min-change rule: FD.0 (the contract export, landed) and FD.3 (the
bundle carrier -- store plus two verbs, no policy semantics; crdb can neither author nor alter what it
carries).

## Acceptance

1. A bundle ForgeCentral produces is accepted by torch's unmodified `EndpointPolicyApplier` (FD.2 Tier 2).
2. A bundle whose bytes are altered after signing is refused on-device (FD.2 Tier 3).
3. An endpoint outside a bundle's `IdentityScope` cannot obtain it (FD.3 Tier 3).
4. Re-composing unchanged zones does not advance the version; a zone edit does (FD.2 Tier 3).
5. A zone domain or field the v1 bundle cannot express is recorded in the audited composition record and
   surfaced in the bundle detail view, never silently dropped (FD.1).
6. The signing key is absent from the TypeScript tier and from every log (FD.2, hygiene test).
7. The full plane runs live on the node with enforcement OFF (FD.N).

## Out of scope (named, with the gating dependency)

- **Membership.** Which *principal* is in which zone -- the IdAM-group anchor, session-vs-device binding,
  signed membership sets, `Selector::GroupRef` expansion (torch VM1.7, currently inert:
  `taxonomy.rs:121` returns `false`) -- is gated on crdb's deferred `VtzSetMembership` substrate and is
  its own IP. This IP scopes a bundle to the **enrolled device identity**, which already exists.
- **v2 posture bundles.** `FD-DEFER-V2-POSTURE-BUNDLE`, gated on extending `SignedPolicyBundle` in
  `cdb-types` (a crdb change). Lands with the **Objects IP (`TRD-CONSOLE-10`)**, which owns the
  `ObjectDomain` vocabulary those postures are expressed in. Composition, signing, the listener, and the
  transport are all bundle-shape-independent, so that extension is additive here, not rework.
- **Enforcement.** AG.7-OFF. Realizing an applied bundle as OS controls is `IP-TORCH-VTZ-ENFORCE`.
- **Policy authoring beyond zones.** The rules an operator writes *against* a zone are `TRD-CONSOLE-05`
  (Policies). This IP distributes the zone disposition, not the rule set.
- **TPM sealing of the signing seed.** FD.2 persists the seed as a `0600` file owned by the sidecar
  user, which is the weakest link in the chain. `IP-CONSOLE-00-SIDECAR-TPM` is COMPLETE and
  LIVE-PROVEN; it was parked for ENGINE IDENTITY when the control plane moved to a software key
  (D2), but that reasoning does not apply to a signing seed, which is exactly what sealing is for.
  Named follow-on rather than an FD.2 blocker.

- **Key rotation is overlap, never replacement.** `DistributionAnchor` is a SET keyed by id, and
  `signing_key_id` + `signature_algorithm` travel inside every bundle (the TRD-04 section 11.3
  SignatureEnvelope discipline), so a rotation provisions the new public key ALONGSIDE the old, starts
  signing with the new, and retires the old only once FD.7's convergence ledger shows every endpoint on
  a bundle signed by it. Retiring a key before that is what makes an endpoint fail closed on a bundle
  it cannot verify. Not built in this IP; recorded so the first rotation is not improvised.

- **Push, and with it server-driven retry.** Only `pull` is built (plus `receive_pushed`, which torch
  already has). Server-initiated push is a later step once the endpoint inventory exists.

  This is also the honest answer to "retry until the policy update goes through". In a pull model the
  producer sends nothing, so it has nothing to retry: convergence is driven by the endpoint's own
  `ForgeDistributionClient::refresh` loop, and an endpoint that never receives an update does not drift
  on stale policy -- its freshness lease expires and it **fails closed** (R-FRG-24). That is a stronger
  property than a delivery queue, and it is already built. FD.7 therefore makes non-convergence VISIBLE
  rather than driving delivery.

  A true server-initiated push with a durable retry queue is a separate step with two hard gates: the
  endpoint inventory (the set of endpoints expected to hold a bundle, absent today), and a durable home
  for the queue. That home cannot be ForgeCentral -- retry state is durable domain data and
  `INV-CONSOLE-NO-2ND-DB` forbids it -- so it needs a crdb substrate, which is not built.
