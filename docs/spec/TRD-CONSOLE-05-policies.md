# TRD-CONSOLE-05 -- Policies

**Status:** DRAFT (authored 2026-07-07). Inherits `TRD-CONSOLE-00`. The Policies surface is the operator
view of the Crucible policy engine (TRD-04), organized by Virtual Trust Zone. Mock target: `shot-06`,
`shot-07`.

---

## 1. Purpose

Let the operator see, understand, author, version, and publish the policies that govern every subject's
access to every object, per VTZ -- with the engine's exact precedence and action semantics, and with the
rationale (EXPLAIN) for how a policy resolves. Policies are the platform's access contract; the Console
edits them safely (draft -> review -> publish) and never bypasses the engine's evaluation.

## 2. Model

- **Grouped by VTZ** (matching the mock): each zone (`YouSource.Corp`, `YouSource.AIAgents.Trusted`,
  `YouSource.AIAgents.Dev`, ...) is an expandable group with its policy count and last-updated time.
- **The policy table** (per zone), each column a real TRD-04 field:

| Column | Meaning | Real source |
|--------|---------|-------------|
| **Name** (+ version, e.g. `v2`/`v3`) | the policy label + its version | the policy record + version (TRD-04 Section 10 versioning) |
| **Scope** | subject -> object (e.g. `Clinicians -> Clinical EHR`) | the policy's principal(s) -> resource(s) |
| **Protocol/Ports** | the network scope (e.g. HTTPS/443) | the policy's protocol/port constraints |
| **Action** | Permit / Deny / Monitor / Quarantine | the TRD-32 v2 action lattice (`Permit < Monitor < Quarantine < Deny`) |
| **Restrictions** | Time / Geo / Tags (PHI, PII, ...) | the policy's conditions (time window, residency/geo, classification tags) |
| **Logging** | Sampled / Triggered / Verbose | the policy's logging posture |
| **Status** | Published / Draft | the policy lifecycle state |
| (row actions) | view / edit | -> the policy detail / editor |

## 3. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

- **Read binding `policies.byZone`** -> a CrucibleQL query over the policy registry grouped by VTZ,
  server-paged, tier-redacted. The Console never evaluates policy; it reads the engine's records.
- **Read binding `policies.detail(id)`** -> a policy's full definition + version history.
- **Read binding `policies.explain(id | scenario)`** -> EXPLAIN of how the policy resolves for a subject/
  object, including precedence (TRD-04 Section 6.1: **explicit Deny > explicit Allow > default Deny**) --
  the operator sees exactly why access is granted or denied, tier-redacted.
- **Command bindings** (each a real, audited engine operation, confirm-gated where it changes enforcement):
  - `policies.create` / `policies.edit` -> author a draft (a new version; existing signed versions are
    never mutated -- TRD-04 SignatureEnvelope pattern).
  - `policies.publish` -> promote a draft to Published (the change commits through the atomic batch +
    audit; a publish that revokes prior access is flagged as breaking, TRD-04 Section 10).
  - `policies.simulate` -> dry-run the policy's effect before publishing (links to AIOps Simulations,
    `TRD-CONSOLE-07`).

Reads/edits express the policy as the engine's typed policy DTO; values bind as parameters. A policy the
operator's tier cannot see is absent (not a redacted placeholder).

## 4. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Expand a zone (in place) -> its policy table. Click a policy -> detail/editor; click view -> the
  read-only detail + EXPLAIN.
- **Publish an edit:** Policies (1) -> edit a policy (2) -> Publish (3, confirm-gated with the effect).
- **See why a policy denies a subject:** a policy (1) -> EXPLAIN/Rationale (2).
- **Create a policy:** Create (1) -> author in the editor (2) -> Publish (3).

The editor is a structured form (scope, action from the lattice, restrictions, logging), not free text;
it validates against the engine's policy schema before allowing publish, so an invalid policy cannot be
submitted.

## 5. Performance, states

Server-paged per zone; the editor validates client-side against the typed schema for instant feedback but
the engine is authoritative on publish. Loading skeletons; empty ("no policies in this zone"); a publish
in flight shows optimistic-pending then the engine-confirmed state; unauthorized policies/actions absent
per tier; a publish refused by the engine (e.g. a policy conflict) surfaces the typed error.

## 6. Acceptance and failure semantics

**Acceptance:**
- Every policy row/field derives from a real engine policy record via `policies.byZone`; no fabricated
  policy (contract test + fixtureless render).
- EXPLAIN shows the engine's real resolution with correct precedence (Deny > Allow > default Deny).
- Create/edit produces a draft version without mutating a published version; publish commits through the
  atomic batch + audit and is confirm-gated; a breaking publish is flagged.
- The action lattice matches TRD-32 v2 exactly (Permit/Monitor/Quarantine/Deny).
- The Section 4 tasks complete within budget.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- engine-unreachable shows a typed state; an
invalid or unauthorized publish returns the engine's typed error (`PolicyError`) with a request id; a
concurrent edit is resolved by the engine's versioning, never by a client overwrite.

## 7. Six-bug-category notes

Cross-module gap: policy view models + the editor schema are typed in `@forge/contracts` against the
TRD-04 policy DTO. Schema bypass: the editor emits the typed policy shape, never hand-built JSON. Missing
failure path: invalid-policy, breaking-publish, unauthorized, and concurrent-edit are tested. Dead code:
every action column maps to a real command binding (contract test).
