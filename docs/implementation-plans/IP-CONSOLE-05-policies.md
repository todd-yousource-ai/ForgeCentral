# IP-CONSOLE-05-POLICIES -- the Forge policy authoring surface

Implements `TRD-CONSOLE-05` (Policies, revised 2026-07-24), the Phase-3 access-contract surface: the operator
authors, versions, publishes, distributes, and retires the per-VTZ Forge policies that govern every subject's
access to every destination, grouped by the VTZ each targets. The engine half is `crdb
IP-CONSOLE-POLICY-SUBSTRATE` (PS.1-PS.N, authored the same date, engine-first). This IP is the ForgeCentral
half: the `@forge/contracts` view models, the BFF bindings, the grouped surface, the Create/Edit modal, and
-- re-homed here from the VTZ surface -- the compose -> sign -> push trigger and the convergence ledger.

**Read with:** `TRD-CONSOLE-05-policies` (the surface + bindings + Section 7 acceptance), `TRD-CONSOLE-00`
(BFF, operator-engine, wire-client over the crypto sidecar, semantic color, <=3-clicks, audited/confirm,
`INV-CONSOLE-FORGE-SIGNED-AT-SOURCE`), the crdb `IP-CONSOLE-POLICY-SUBSTRATE` ledger (the exact wire verbs +
DTOs this binds to), `TRD-32 v2` (the policy model: per-VTZ rulesets, the `Permit<Monitor<Quarantine<Deny`
lattice, most-restrictive-wins composition), `IP-CONSOLE-02-FORGE-DISTRIBUTION` (the compose/sign/carry/fetch/
apply/report plane already built -- this IP hosts its trigger + ledger on the correct surface), `IP-CONSOLE-
02-VTZ` (the zone reads reused for the grouping axis + the VTZ dropdown), `IP-CONSOLE-10-objects` (the noun
catalog the subject/target pickers read), and the policy mockups `docs/ui-examples/06,07,08-*.png` (grounding
only; the TRD wins on conflict).

**Named invariant:** **INV-CONSOLE-POLICIES-REAL** -- every policy, rule, action, restriction, and control on
the Policies surface binds to the live crdb policy store over the mTLS seam; nothing is fabricated; the action
control offers exactly the four-action lattice and the logging control exactly Full/Sampled/Off (no value the
engine cannot store); a fixtureless empty tenant renders honest empty zones, never a synthesized policy; the
compose -> sign -> push path signs only in the crypto sidecar (`INV-CONSOLE-FORGE-SIGNED-AT-SOURCE`), never
in the TypeScript tier.

## GROUNDED RESHAPE (the substrate + operator decisions diverge from the mock -- build to the substrate)

The mockups are layout guidance; the wire contract + the operator decisions are the model.

- **Four-action lattice, not three.** The visible rows show Permit/Deny/Monitor; the action control offers the
  full `Permit / Monitor / Quarantine / Deny` lattice (operator decision 2026-07-24). Quarantine is the
  remediation rung the "block a threat" workflow needs.
- **Logging is Full / Sampled / Off**, not the mock's Sampled/Triggered/Verbose (operator decision
  2026-07-24; the engine `TelemetryMode` vocabulary -- "Triggered"/"Verbose" do not exist and would be a stub).
- **Source + destination are the spine.** Subjects (Who) and Targets (What) are each a multi-select over the
  real noun catalog (`objects.list` + Users/Agents principals); a target may be an IP/subnet (`Selector::Cidr`
  object) qualified by the Ports field + Protocol chips (`NetworkMatch`). One policy authors the cross-product
  ruleset (subject x target -> a `Rule`), so the shared `Rule` type is unchanged.
- **Applied-To is an explicit authored field** (operator directive) under Advanced Settings: the users /
  groups / agents / devices the policy is pushed toward. It authors the bundle `IdentityScope`, distinct from
  the source/destination match. Not derived from VTZ membership (that substrate is deferred).
- **Restrictions carry two time concepts.** A recurring **schedule** (days-of-week + hours-of-day) and an
  absolute **active window** (`from`/`until`) so a policy auto-expires. Absolute-window expiry is
  producer-enforced (real now); the recurring schedule + geo are authored-and-carried, their runtime
  evaluation deferred with enforcement.
- **Distribution lives here, not on VTZ.** The reverted FD.7c `DistributionPanel` (compose -> sign -> push +
  the three-state convergence ledger) is re-homed onto this surface (the HARD operator rule, 2026-07-21).
- **Draft/Published lifecycle.** `lifecycle` is `draft` or `published`; Save-as-Draft vs Save-&-Publish is a
  real state transition. Enforcement stays AG.7-OFF: a published+distributed bundle realizes nothing until
  enforcement is separately engaged.

## Prerequisites

- **crdb `IP-CONSOLE-POLICY-SUBSTRATE` -- COMPLETE IN CODE (PS.1-PS.N ALL LANDED 2026-07-24)**: PS.5
  (reads) + the `wire-dto.schema.json` export unblock P5.1/P5.2; PS.6 (commands) unblocks P5.4; PS.7
  (`effective_published_policies`) unblocks P5.5's distribute. Nothing on this surface waits on the engine;
  the deferred-live :7878 drive folds into P5.N (the crdb PS.N deferred-live leg).
- **`IP-CONSOLE-02-VTZ` -- COMPLETE** (`vtz.tree` is the grouping axis + the VTZ dropdown source).
- **`IP-CONSOLE-10-objects` -- COMPLETE** (`objects.list`/`objects.detail` are the subject/target pickers'
  real nouns; `Selector::Cidr` IP objects; the noun-only catalog whose "governing policies" this surface fills).
- **`IP-CONSOLE-02-FORGE-DISTRIBUTION`** -- the compose/sign/carry/fetch/apply/report plane is built; FD.7c's
  `DistributionPanel` + `useDistribution` (`useBundleConvergence`/`useDistribute`) + `apps/bff/src/engine/
  distribute.ts` (`composeEndpointPolicy` -> sidecar `signBundle` -> crdb carrier) exist and the convergence
  read is proven live; the panel awaits re-homing HERE. The `packages/wire` CBOR codecs for `BundleCommit`/
  `BundleConvergence` were fixed 2026-07-21; land them with P5.5. `FC_SIGNER_PORT` must be in the running BFF
  env (restart after editing `config.env`) or distribute 503s.
- **`IP-CONSOLE-00` foundation** -- BFF, `operator-engine` delegation, `wire-client` over the sidecar,
  session/authz, `@forge/contracts` codegen.

## INV-CROSS -- the bindings and their backend

| Binding | Real when | Backend / note |
|---|---|---|
| `policies.byZone` (grouped list) | PS.5 | crdb `POLICY_LIST_BY_ZONE` (zone-grouped, bounded, tier-redacted) |
| `policies.detail(id)` (editor + view) | PS.5 | crdb `POLICY_DETAIL` (ruleset + network match + restrictions + logging + applied-to + version history) |
| `policies.create` / `policies.edit` / `policies.publish` / `policies.delete` | PS.6 | crdb audited command verbs; typed refusals (dup name -> 409, malformed port/CIDR/schedule -> 400, edit-of-published -> 409, unauthorized -> 403); breaking-publish flagged |
| `policies.distribute` (compose -> sign -> push) | PS.7 + FD plane | reuse `apps/bff/src/engine/distribute.ts`; compose the zone's `effective_published_policies` -> sidecar `signBundle` -> crdb carrier for each policy's Applied-To scope |
| `policies.convergence(vtz)` (the ledger) | FD.7a LIVE | reuse the FD.7c projection over `BUNDLE_CONVERGENCE`; the three states (applied / rejected-with-reason / silent) |
| `vtz.tree` (grouping axis + VTZ dropdown) | **LIVE** | reuse `IP-CONSOLE-02-VTZ` |
| `objects.list` (subject/target pickers) | **LIVE** | reuse `IP-CONSOLE-10-objects` |
| runtime enforcement of schedule/geo/ports | **PENDING** | `torch IP-TORCH-POLICY-ENFORCE`, gated on the enforcement toggle (AG.7-OFF); the fields are authored + distributed, the host does not yet realize them |

Per `INV-CONSOLE-NO-STUB`, every `PENDING` binding is registered `{ kind: 'pending', owningRepo, gatingTask }`
in the manifest and never ships a fabricated value; the surface renders the honest absence (a distribute
control is present-but-labelled while its runtime enforcement is deferred, exactly as the platform's
enforcement-OFF posture requires -- authoring + distribution + audit ARE real).

## Roster

One PR per row; each a named slice of `INV-CONSOLE-POLICIES-REAL`, the full `scripts/ci.sh` green +
the full local Playwright suite before every push, branch-per-PR, no-ff merge, docs separate, reviewed
before the next.

| Step | Invariant | Deliverable |
|------|-----------|-------------|
| **P5.1** | `INV-CONSOLE-POLICIES-CONTRACT` | The contract. Re-copy the crdb `wire-dto.schema.json` (the PS.5 export; the policy DTOs regen into the wire-dto artifact `@forge/contracts` vendors -- the VZ.3a/OB.3 precedent, deviation flagged in the crdb ledger) into `packages/contracts/schema/`, `node scripts/generate.mjs` (drift-guarded) so the `Policy`/`Rule`/`NetworkMatch`/`PolicyRestrictions`/`DistributionScope`/verb DTOs land. `@forge/contracts` `policies.ts`: the `PolicyRow` view model (name + version chip, scope = subject set -> target set, protocol/ports rendered from `NetworkMatch`, action, restrictions summary, logging, lifecycle) + `PolicyDetailView` + `PolicyDraft` (the Create form shape) + **fail-closed projections** -- an unknown action/logging/selector/protocol tag collapses the whole projection to `null` (a mis-rendered action on a governance surface is a security-relevant lie); the action enum narrowed CLOSED to the four; logging CLOSED to the three. Register the `policies.*` bindings (reads/commands PENDING until PS.5/PS.6; enforcement-runtime PENDING naming torch). `test:contract`. No UI. |
| **P5.2** | `INV-CONSOLE-POLICIES-BROKERED` | The read path. Wire codecs (`PolicyListByZone`/`PolicyDetail` over the QuerySubmit opcode w/ CBOR encoders) + reply parsers + client methods + delegated `OperatorEngine` actions; BFF `engine/policies.ts` resolvers (whole-list fail-closed collapse -> `PoliciesUnavailableError` -> 503; honest-empty zone) + `GET /api/policies`(+`/detail`). Tenant-scoped short-TTL cache. Route tests 200/401/503/tenant-isolation. No surface yet. |
| **P5.3** | `INV-CONSOLE-POLICIES-GROUPED` | The grouped read-only surface (`PoliciesSurface.tsx`): the header + search + filter + Create button; the **net-new accordion group component** (a VTZ card w/ policy-count badge + updated date, expandable in place -- the first collapsible-group primitive in `packages/design`, grounded on `06-*.png`); each expanded zone renders the **policy table** (`DataTable`) with the `07-*.png` columns (Name+version chip, Scope, Protocol/Ports, Action `Badge`, Restrictions summary, Logging, Status), row view/edit affordances. Reads `policies.byZone` grouped by the live `vtz.tree`. Honest loading/empty/error states; the `policies` nav destination replaces its placeholder. Reads-only (no author yet). Surface + accordion design tests. |
| **P5.4** | `INV-CONSOLE-POLICIES-AUTHOR` | Create/edit + publish/delete. Wire codecs (`PolicyCreate/Edit/Publish/Delete`) + delegated actions + resolvers + the POST route family w/ typed refusal mapping (409/400/403) + fail-closed draft parse. The **Create Policy modal** (net-new form design component, grounded on `08-*.png`): Policy Name; VTZ dropdown (`vtz.tree`); **Subjects (Who)** + **Targets (What)** multi-selects over `objects.list` + principals; **Protocol** chips (TCP/UDP/HTTPS/SSH) + **Ports** input (validated `80, 443, 8080-8090`); **Action** select (the four lattice actions); **Logging Level** select (Full/Sampled/Off); the **Restrictions (Optional)** collapsible (days-of-week toggles + hours-of-day window; the absolute active-window from/until; geo allowlist; tags); the **Advanced Settings** collapsible (**Applied To** multi-select over users/groups/agents/devices; description); Cancel / Save as Draft / Save & Publish. Save-as-Draft -> `policies.create` (lifecycle draft); Save-&-Publish -> create/edit + `policies.publish` (confirm-gated, breaking-publish flagged); per-row Edit; Delete behind a critical ConfirmDialog. Client-side typed-schema validation before submit; success refetches (the row is the engine record). The <=3-click paths (`TRD-CONSOLE-05 §5`). `usePolicyMutation` (invalidates the list). Surface + contract tests incl. every refusal + the validation states. |
| **P5.5** | `INV-CONSOLE-POLICIES-DISTRIBUTED` | Compose -> sign -> push + the convergence ledger, **re-homed here** (the FD.7c follow-up). Land the `packages/wire` `BundleCommit`/`BundleConvergence` CBOR codecs (fixed 2026-07-21, awaiting a home); mount the FD.7c `DistributionPanel` on the Policy surface (per-zone: a Distribute action confirm-gated showing the target endpoint set from the zone's policies' Applied-To, composing `effective_published_policies` (PS.7) -> sidecar `signBundle` -> crdb carrier); the three-state convergence ledger (applied / rejected-with-reason / silent) streaming over `policies.convergence`. NO distribute/commit control is added to the VTZ surface (structurally asserted). The signing key never enters the TS tier (hygiene test). Surface + projection tests; the live leg folds into P5.N. |
| **P5.6** | `INV-CONSOLE-POLICIES-GROUNDED` | Land the policy mockups into `docs/ui-examples/06,07,08-*.png` + the README table rows (grounding, not truth). Amend `TRD-CONSOLE-05` at any residual pixel-vs-substrate sites already covered by the 2026-07-24 revision's Section 0, and cross-reference `IP-CONSOLE-02-FORGE-DISTRIBUTION` so its FD.7c re-home points here. Docs-only PR, separate from code. |
| **P5.N** | `INV-CONSOLE-POLICIES-COMPLETE` | The Playwright capstone (`policies.spec.ts`) over the real surface: the zone-grouped accordion over a mocked BFF; expand a zone -> the policy table with real columns; Create a policy (subjects x targets, a `Network`+CIDR target w/ ports 443 + HTTPS chip, action Quarantine, logging Full, a 7-day active window, Applied-To a device set) -> it posts the typed draft and appears as the engine's row; Save-&-Publish confirm-gated; a malformed port list reads back the 400; edit-of-published mints a new version chip; Distribute confirm-gated shows the Applied-To endpoint set and the convergence ledger's three states; NO distribute control exists on the VTZ surface (structural sweep); the action control offers exactly four actions + logging exactly three (structural); the empty tenant renders honest empty zones. Add `policies` to the `REAL_SURFACES` no-stub allowlist. Acceptance sweep against `TRD-CONSOLE-05 §7`. Live leg: the box redeploy so the node serves the whole Policies surface + compose->sign->torchd-pull convergence (the FORGE-DISTRIBUTION FD.N precedent), enforcement OFF. |

## Sequencing note

Engine-first: crdb PS.5 -> P5.1/P5.2; PS.6 -> P5.4; PS.7 -> P5.5. Within FC: P5.1 (contract) -> P5.2 (reads)
-> P5.3 (grouped grid, needs reads) -> P5.4 (author, needs commands) -> P5.5 (distribute + ledger, needs PS.7
+ the FD plane) -> P5.6 (mockups + TRD grounding, independent) -> P5.N (capstone last). P5.1-P5.3 deliver the
read-only grouped value; P5.4 makes it authorable; P5.5 makes it enforceable-plane-real (enforcement still
OFF); P5.N proves it.

## Acceptance (from TRD-CONSOLE-05 Section 7)

- Every policy row/field derives from a real engine record via `policies.byZone`; no fabricated policy
  (contract fail-closed projections + BFF resolver tests + fixtureless empty-tenant render).
- Grouping is by the real `Policy.vtz` binding over the live `vtz.tree`.
- The action control offers exactly Permit/Monitor/Quarantine/Deny; the logging control exactly
  Full/Sampled/Off; neither stores a value the engine cannot (contract closed-enum + capstone structural sweep).
- Source/destination are real `ObjectRef`s; an IP/subnet target is a `Selector::Cidr` object; ports/protocol
  are the typed `NetworkMatch`; a malformed port list / CIDR reads back a typed 400.
- Applied-To authors a real `IdentityScope`; distribute targets only the named endpoints; out-of-scope refused.
- Create/edit produces a draft without mutating a published version; publish is atomic + audited +
  confirm-gated; a breaking publish is flagged.
- An active-window `until` in the past excludes the policy from the composed bundle (producer expiry, proven
  against PS.7).
- Compose -> sign -> push signs in the sidecar (`INV-CONSOLE-FORGE-SIGNED-AT-SOURCE`); the convergence ledger
  shows the three real states; no distribute control exists on the VTZ surface.
- The Section 5 three-click tasks complete within budget.

## Out of scope (named, with the gating dependency)

- **Runtime enforcement** of schedule (day/hours), geo, and protocol/port matching on the host --
  `torch IP-TORCH-POLICY-ENFORCE`, gated on the enforcement toggle (AG.7-OFF). Authoring + distribution +
  audit are real now; the host realizing a time/geo/port rule is the Torch epic. Absolute active-window expiry
  is the exception (producer-enforced, real now).
- **Zone-membership-defaulted Applied-To** -- gated on crdb `VtzSetMembership` (deferred, `TRD-CONSOLE-12`);
  Applied-To is authored explicitly here.
- **Simulate / dry-run** (`policies.simulate`) -- `TRD-CONSOLE-07` (AIOps Simulations); a later phase.
- **EXPLAIN / rationale** over a composed effective policy -- a later enrichment once the torch-forge compose
  is wired end to end; the surface shows the authored ruleset, not a re-derived resolution.
