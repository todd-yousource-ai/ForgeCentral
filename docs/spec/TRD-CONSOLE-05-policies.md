# TRD-CONSOLE-05 -- Policies

**Status:** REVISED 2026-07-24 (supersedes the 2026-07-07 DRAFT). Inherits `TRD-CONSOLE-00`. The Policies
surface is the operator's authoring plane for **Forge policy** (Crucible **TRD-32 v2**, Forge Agent Runtime
Control), organized by Virtual Trust Zone. It is where 1Source (the Console) authors the source-to-destination
rules that govern a subject's access to an object, composes them into a signed bundle, distributes that bundle
to the endpoints that must enforce it, and watches it converge. Mock target: the `/policies` prototype
(`docs/ui-examples/06-*.png` collapsed list, `07-*.png` expanded table) + the Create Policy modal
(`docs/ui-examples/08-*.png`, landed with this revision). Layout guidance only; where a pixel and this TRD or
`TRD-CONSOLE-00 §6` disagree, the TRD wins.

---

## 0. What changed in this revision (and why)

The 2026-07-07 draft was authored before any policy substrate existed and mis-anchored the surface to the
**TRD-04 database access-control engine** (the engine's row-level ABAC). That is the wrong engine: a Forge
policy is a **TRD-32 v2** artifact (a per-VTZ `Ruleset` of `source -> destination -> action` rules, composed
most-restrictive-wins up the zone hierarchy, signed into a `SignedPolicyBundle`, distributed to Torch). The
two are distinct authorization surfaces (`CRAFTED_ENGINEERING_STANDARDS.md`, "two authorization surfaces").
This revision re-anchors the surface to TRD-32 v2 and records the design that the attached operator UI and
the platform's real substrate jointly dictate. The specific corrections:

1. **Engine re-anchor:** TRD-04 -> **TRD-32 v2**. Precedence is not "explicit Deny > explicit Allow > default
   Deny"; it is the **four-action restrictiveness lattice** `Permit < Monitor < Quarantine < Deny`, where both
   composition (up the VTZ hierarchy) and evaluation (within the effective ruleset) take the lattice **max**
   (R-FRG-93/94). "Most-restrictive-wins" is that single operator.
2. **Action set is FOUR, not three** (operator decision, 2026-07-24). The mock's visible rows show
   Permit/Deny/Monitor; the model and the editor's action control carry the full lattice, adding
   **Quarantine** (allow-only-into-containment -- the rung the "remediate a threat" workflow needs).
3. **Logging vocabulary reconciled to the engine** (operator decision, 2026-07-24). The mock's
   "Sampled / Triggered / Verbose" is replaced by the engine's real telemetry vocabulary
   **`Full` / `Sampled` / `Off`** (`TelemetryMode`, TRD-32 v2 / TRD-34). "Triggered" and "Verbose" do not
   exist in the engine and would be a stub; per `INV-CONSOLE-NO-STUB` a field must bind to a real engine value.
4. **Source and destination are the mandatory spine.** Every rule has a source and a destination; each is a
   TRD-32 v2 `ObjectRef` (an agent, user, group, or named object), and each may also be an **IP address /
   subnet** (`Selector::Cidr`, the Objects surface's first-class network noun) qualified by **ports** and
   **protocol**. This matches the mock's Subjects (Who) / Targets (What) + Protocol/Ports fields.
5. **Applied-To is a distinct authored field** (operator directive, 2026-07-24). *Who a rule matches*
   (source/destination) is separate from *who enforces the policy* (the distribution scope). The Applied-To
   field authors the bundle's `IdentityScope` -- the users / groups / agents / devices the policy is pushed
   toward -- rather than deriving scope implicitly from VTZ membership. See Section 3.4.
6. **Time is two things** (operator requirement, 2026-07-24): a **recurring schedule** (days-of-week +
   hours-of-day the policy is active) and an **active window** (an absolute from/until, so a policy authored to
   "block a threat for a week" auto-expires and goes inactive without an operator having to remember to remove
   it). Neither existed in the model; both are added here. See Section 3.3.
7. **Grouping by VTZ + the compose/sign/push + convergence ledger live HERE.** The `IP-CONSOLE-02-FORGE-
   DISTRIBUTION` distribution panel was built, then reverted off the VTZ surface (operator HARD rule
   2026-07-21: policy is composed and pushed from the **Policy tab, never the VTZ surface**). It is re-homed
   on this surface. This surface is the missing rule producer that FORGE-DISTRIBUTION finding 1 named
   ("destinations and resource ceilings arrive from policy rules (TRD-CONSOLE-05) ... not built").

Because the engine substrate does not exist yet, this surface opens **engine-first and heavily `PENDING`**,
driving named crdb work (`crdb IP-CONSOLE-POLICY-SUBSTRATE`) exactly as Users drove E1/E3 and Objects drove
`IP-CONSOLE-OBJECT-SUBSTRATE`.

---

## 1. Purpose

Let the operator author, version, publish, distribute, and retire the Forge policies that govern every
subject's access to every destination, grouped by the VTZ each policy targets -- with the engine's exact
four-action lattice and most-restrictive-wins composition, and with the composition + convergence made
visible. Policies are the platform's access contract; the Console authors them safely (draft -> publish ->
distribute -> converge -> expire) and never re-implements the engine's evaluation, composition, or signing.

## 2. Model

- **Grouped by VTZ** (matching `06-*.png`): each zone (`YouSource.Corp`, `YouSource.AIAgents.Trusted`,
  `YouSource.AIAgents.Dev`, ...) is an expandable accordion group carrying its policy count and last-updated
  time. A policy belongs to exactly one VTZ (`Policy.vtz: VtzName`); the accordion axis IS that binding.
- **The per-zone policy table** (matching `07-*.png`), each column a real TRD-32 v2 field:

| Column | Meaning | Real source (TRD-32 v2 / this revision) |
|--------|---------|------------------------------------------|
| **Name** (+ version, e.g. `v2`/`v3`) | the policy label + its immutable version | `Policy.name` (new) + `Policy.version` (`Version`, SemVer, R-FRG-11 immutable) |
| **Scope** | source -> destination (e.g. `Clinicians -> Clinical EHR`) | the rule's `source`/`destination` `ObjectRef`s; the cell renders the subject set -> target set |
| **Protocol/Ports** | the network scope (e.g. `HTTPS / 443`) | the policy's `NetworkMatch { protocols, ports }` (new); `--` when the policy is not network-scoped |
| **Action** | Permit / Monitor / Quarantine / Deny | `Rule.action` on the TRD-32 v2 lattice (`Permit < Monitor < Quarantine < Deny`) |
| **Restrictions** | Time / Geo / Tags | `Policy.restrictions` (new): schedule (days + hours), active window, geo, classification tags |
| **Logging** | Full / Sampled / Off | `Policy.logging` (new; the `TelemetryMode` vocabulary) |
| **Status** | Published / Draft | `Policy.lifecycle` (new; the console authoring state, `draft`/`published`) |
| (row actions) | view / edit | -> the policy detail / editor |

**One policy authors a set of rules.** The Create modal collects a set of Subjects and a set of Targets and
one Action; the authored `Policy.ruleset` is the cross-product (each `subject -> target` pair is one `Rule`
in the order-independent `Ruleset`). The Protocol/Ports/Restrictions/Logging qualify the whole policy. This
keeps the shared `Rule`/`Ruleset` types intact (a rule is still exactly `{source, destination, action,
provenance}`) while matching the mock's single Subjects/Targets/Protocol/Ports/Action form.

## 3. The authored policy (the fields the Create/Edit modal collects)

The modal is `08-*.png`: Policy Name, Virtual Trust Zone, Subjects (Who), Targets (What), Protocol, Ports,
Action, Logging Level, a **Restrictions (Optional)** collapsible, and an **Advanced Settings** collapsible,
with a Cancel / Save as Draft / Save & Publish footer. Every field binds to a real engine value; the two
collapsibles hold the fields the mock does not expand, specified here.

### 3.1 Identity, zone, and lifecycle
- **Policy Name** (`name`, required) -- the display label. New field on the `Policy` record.
- **Virtual Trust Zone** (`vtz`, required) -- the `VtzName` this policy targets; the dropdown is the live
  `vtz.tree` zones. This is the grouping axis and the composition boundary.
- **Status** (`lifecycle`) -- `draft` or `published`, set by the Save-as-Draft vs Save-&-Publish action. A
  published policy is composed into the zone's bundle; a draft is authored but never distributed. Distinct
  from the engine's distribution-side `PolicyState` (`Draft`/`Active`/`Deprecated`/`Revoked`); the console
  authoring state is `draft`/`published`, matching VTZ/Objects (`VtzLifecycle`/`ObjectLifecycle`).
- **Version** (`version`) -- immutable SemVer; an edit to a published policy mints a new version, never
  mutates the signed prior version (R-FRG-11, the SignatureEnvelope discipline).

### 3.2 The rule spine (source, destination, network match, action)
- **Subjects (Who)** (`ruleset` sources, required) -- a multi-select over the real noun catalog: agents,
  users, groups (`Objects` surface `ObjectRef`s + the Users/Agents principals). Each selection is an
  `ObjectRef` that must be principal-capable (R-FRG-86, role validity re-checked engine-side at ingest).
- **Targets (What)** (`ruleset` destinations, required) -- a multi-select over the same catalog for
  resource-capable nouns (services, servers, applications, URIs, data stores, and **network/CIDR** objects).
- **IP / subnet + ports** -- a target may be a `Network` object whose selector is `Selector::Cidr` (an IP or
  subnet; the Objects surface made this first-class). The **Ports** field (`NetworkMatch.ports`, new)
  qualifies the network match: a comma list and ranges (`80, 443, 8080-8090`), validated. The **Protocol**
  chips (`NetworkMatch.protocols`, new: `TCP` / `UDP` / `HTTPS` / `SSH`) qualify it further. Ports/protocol
  render `--` for a policy with no network target.
- **Action** (`Rule.action`, required) -- one of the four lattice actions **Permit / Monitor / Quarantine /
  Deny**. Quarantine = allow only into the containment VTZ (the remediation rung); Monitor = permit + a
  mandatory enforcement event; Deny = fail-closed block. Composition and evaluation take the lattice max.

### 3.3 Restrictions (Optional) -- the collapsible
The list view's Restrictions column (`Time` / `Geo` / `Tags`) is this section, expanded. All fields optional;
absent means unrestricted on that axis. New `Policy.restrictions` record:
- **Schedule** (`schedule`) -- the **days-of-week** (Mon..Sun) and **hours-of-day** window the policy is
  active (e.g. `Mon-Fri, 08:00-18:00`). A recurring wall-clock window. Authored + stored + carried in the
  bundle; its **runtime evaluation is an endpoint (Torch) enforcement concern** and is a named deferral until
  enforcement is engaged (`INV-*` below; enforcement is AG.7-OFF platform-wide).
- **Active window** (`active_window`) -- an absolute `{ from?, until? }`. The operator's "block a threat for a
  week" case: set `until = now + 7d`, and when it passes the policy **auto-expires**. Expiry is
  **producer-enforced**: the composer drops an out-of-window policy from the zone bundle, so the policy goes
  inactive with no operator action and no endpoint change required. This dimension is real the day it ships
  (it needs no enforcement toggle), unlike the recurring schedule.
- **Geo** (`geo`) -- an allowlist of residency codes (`US`, `US,CA`). Authored + carried; runtime evaluation
  is an endpoint enforcement concern (deferred with enforcement). New field; no geo concept existed.
- **Tags** (`tags`) -- classification/label tags (`PHI`, `PII`) carried for grouping, reporting, and the
  bundle's `max_classification` derivation. Reuses the Objects tag vocabulary.

### 3.4 Advanced Settings -- the collapsible (Applied-To + distribution)
- **Applied To** (`applied_to`, the distribution scope) -- the users / groups / agents / **devices** the
  policy is pushed toward. This authors the `SignedPolicyBundle.IdentityScope.members` (endpoint `CertIdentity`
  + optional `AgentGci`) explicitly, rather than deriving scope implicitly from VTZ membership. It is the
  operator's answer to "to determine who the policies get pushed to." Distinct from Subjects/Targets: a policy
  may *match* `Clinicians -> EHR` while being *applied to* the specific clinician workstations (devices) and
  the EHR gateway agents that must enforce it. An endpoint receives a bundle only if the verified mTLS peer
  identity is in this set (R-FRG-22/40); membership is resolved from the enrolled-device / agent records, not
  a payload-asserted name.
- **Description / priority** (optional) -- operator metadata; description is free-text (bounded), never a
  disposition input.

## 4. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

The engine substrate is `crdb IP-CONSOLE-POLICY-SUBSTRATE` (the policy store + verbs; engine-first). Until a
verb lands, its binding ships `PENDING` with the gating task named, never a stub.

- **Read `policies.byZone`** -> the zone-grouped policy list (`POLICY_LIST_BY_ZONE`: every published + draft
  policy for the tenant, grouped by `vtz`, server-bounded, tier-redacted). CrucibleQL-first; the Console reads
  the engine's records, never composes them client-side.
- **Read `policies.detail(id)`** -> a policy's full definition + version history (`POLICY_DETAIL`).
- **Command `policies.create` / `policies.edit`** -> author a draft (a new version; a published version is
  never mutated -- SignatureEnvelope). Audited.
- **Command `policies.publish`** -> promote a draft to `published` (atomic batch + audit; a publish that
  revokes prior access is flagged **breaking**, R-FRG-11).
- **Command `policies.delete`** -> retire a policy (audited, confirm-gated).
- **Command `policies.distribute`** -> compose the zone's published policies into a `SignedPolicyBundle`
  (sidecar-signed per `INV-CONSOLE-FORGE-SIGNED-AT-SOURCE`), commit it to the crdb carrier, for the endpoints
  in each policy's Applied-To scope. Re-homes `IP-CONSOLE-02-FORGE-DISTRIBUTION` compose/sign/push.
- **Read `policies.convergence(vtz)`** -> the three-state convergence ledger (applied / rejected-with-reason /
  silent) over `BUNDLE_CONVERGENCE`. Re-homes the FD.7c `DistributionPanel`.

A policy the operator's tier cannot see is **absent, not a redacted placeholder** (`ENGINE-AUTHZ`, tier
redaction). Reads express as parameterized CrucibleQL; values bind as parameters, never interpolated.

## 5. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Expand a zone (in place) -> its policy table. A row's view -> read-only detail; edit -> the editor.
- **Create a policy:** Create (1) -> author in the modal (2) -> Save & Publish (3, confirm-gated with the
  effect).
- **Publish an edit:** Policies (1) -> edit a policy (2) -> Save & Publish (3, confirm-gated; a breaking
  publish flagged).
- **Distribute + watch converge:** a published zone (1) -> Distribute (2, confirm-gated showing the target
  endpoint set) -> the convergence ledger updates in place.
- **Retire a threat-block early:** a policy (1) -> edit / delete (2) -> confirm (3); or let the active window
  expire it with no click.

The editor is a **structured form** (subjects, targets, protocol/ports, action from the lattice, logging,
restrictions, applied-to), not free text; it validates against the typed policy schema before publish, so an
invalid policy cannot be submitted.

## 6. Performance, states

Server-bounded per zone; the editor validates client-side against the typed schema for instant feedback, the
engine is authoritative on publish. Loading skeletons; empty ("no policies in this zone"); a publish/distribute
in flight shows optimistic-pending then the engine-confirmed state; unauthorized policies absent per tier; a
publish or distribute refused by the engine surfaces the typed `PolicyError` with a request id. The
convergence ledger streams (`LIVE`, < 2s) the endpoint apply outcomes.

## 7. Acceptance and failure semantics

**Acceptance:**
- Every policy row/field derives from a real engine policy record via `policies.byZone`; no fabricated policy
  (contract test + fixtureless empty-tenant render).
- Grouping is by the real `Policy.vtz` binding; the accordion axis is the live `vtz.tree`.
- The action control offers exactly the four-action lattice (Permit/Monitor/Quarantine/Deny); the logging
  control offers exactly Full/Sampled/Off; neither carries a value the engine cannot store.
- Source and destination are each a real `ObjectRef`; an IP/subnet target is a `Selector::Cidr` object;
  ports/protocol are the typed `NetworkMatch`; a malformed port list / CIDR is refused typed, never stored.
- Applied-To authors a real `IdentityScope`; a policy is distributed only to the endpoints it names.
- Create/edit produces a draft version without mutating a published version; publish commits through the
  atomic batch + audit and is confirm-gated; a breaking publish is flagged.
- An active-window `until` in the past excludes the policy from the composed bundle (producer-enforced
  expiry), proven by a composition test.
- The compose -> sign -> push path signs in the sidecar (`INV-CONSOLE-FORGE-SIGNED-AT-SOURCE`); the
  convergence ledger shows the three real states.
- The Section 5 three-click tasks complete within budget.

**Failure semantics:** inherit `TRD-CONSOLE-00 §11`. Engine-unreachable shows a typed state; an invalid or
unauthorized publish/distribute returns the engine's typed `PolicyError` with a request id; a concurrent edit
is resolved by the engine's versioning, never by a client overwrite; a distribute to an endpoint outside a
policy's Applied-To is refused, never silently widened.

## 8. Named deferrals (honest, gating work named)

- **Runtime enforcement of the new dimensions** (schedule day/hours, geo, protocol/ports matching) --
  `IP-TORCH-POLICY-ENFORCE`, gated on the platform enforcement toggle (AG.7-OFF today). Authoring, storage,
  composition, signing, distribution, and audit are real now; the *host realizing* a time/geo/port rule is the
  Torch enforcement epic. Active-window absolute expiry is the exception: producer-enforced, real now.
- **Zone membership as an Applied-To default** -- the crdb `VtzSetMembership` substrate (deferred,
  `TRD-CONSOLE-12`) would let Applied-To default to "the zone's members"; until then Applied-To is authored
  explicitly (which the operator directive asks for regardless).
- **Simulate / dry-run** (`policies.simulate`) -- links to AIOps Simulations (`TRD-CONSOLE-07`); a later phase.
- **v2 posture bundles** -- carrying the per-domain postures + the full rule set in `SignedPolicyBundle` is
  `FD-DEFER-V2-POSTURE-BUNDLE` (extend `cdb-types`); this surface authors the rules the extension carries.

## 9. Six-bug-category notes

Cross-module gap: policy view models + the editor schema are typed in `@forge/contracts` against the TRD-32 v2
policy DTO (regenerated from the crdb schema export), never hand-built. Schema bypass: the editor emits the
typed policy shape, never hand-built JSON; ports/CIDR validated at the boundary. Missing failure path:
invalid-policy, breaking-publish, unauthorized, concurrent-edit, distribute-out-of-scope, and expired-window
are each tested. Dead code: every column + control maps to a real binding (contract test); the Applied-To,
schedule, and geo fields each bind to a real (possibly PENDING-for-enforcement) engine field, never a display
stub.
