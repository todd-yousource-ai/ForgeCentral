# IP-CONSOLE-02-VTZ -- the Virtual Trust Zones operator surface

Implements `TRD-CONSOLE-02` (Virtual Trust Zones), the first governance surface of Phase 3. The operator
sees and steers the platform's trust zones -- their hierarchy, each zone's own + effective posture, its
boundary, and its authoring lifecycle -- and creates, edits, re-scopes, or deletes a zone safely. The
engine half is already built and live: crdb `IP-CONSOLE-VTZ-SUBSTRATE` (VZ.1-VZ.N) serves the VTZ system
of record over `:7878` (deployed 2026-07-19). This IP is the ForgeCentral half: the BFF bindings and the
SPA surface that read and command it.

**Read with:** `TRD-CONSOLE-02-vtz` (the surface + its bindings + Section 8 acceptance), `TRD-CONSOLE-00`
(foundation: BFF, operator-engine, wire-client, semantic color, ≤3-clicks, audited/confirm), the crdb
`IP-CONSOLE-VTZ-SUBSTRATE` ledger (the exact wire verbs + DTOs this binds to), `TRD-32 v2` (the VTZ model:
hierarchical zones, tighten-only inheritance, the `Permit<Monitor<Quarantine<Deny` lattice, the read-only
catastrophic floor), and the six VTZ mockups landed at `docs/ui-examples/15..20-*.png` (grounding only;
`TRD-CONSOLE-00 §6` and `TRD-CONSOLE-02` win on conflict).

**Named invariant:** **INV-CONSOLE-VTZ-REAL** -- every zone, posture, count, and control on the VTZ
surface binds to the live crdb VTZ system of record over `:7878`; nothing is fabricated; a fixtureless
empty tenant renders only its seeded root zone, never a synthesized zone or a placeholder posture.

## GROUNDED RESHAPE (the substrate diverged from the mockups -- build to the substrate)

The crdb substrate we built is meaningfully different from the mockup screenshots. The mockups are a layout
guideline; the **wire contract is the model**. The surface is built to the contract, not the pixels.

- **No trust score, anywhere.** The mockup's per-card trust gauge (95/94/…), the "Avg Trust" KPI, and the
  "Trust Score Threshold" field are removed. The substrate carries no score (`WireVtzTreeNode` has no score
  field). A zone's health is shown as its **posture** plus the **decision-LOG risk band** (green/yellow/red)
  reused from the Overview substrate, joined by zone id. (This mirrors the `IP-CONSOLE-01-OVERVIEW`
  Trust-Score removal precedent.)
- **Posture is a per-domain matrix, not a single dropdown.** A zone carries `own_postures` and
  `effective_postures`: each is a list of `WireDomainPosture { domain, posture, floor }` over the TRD-32 v2
  object domains (`governed-egress`, `execution`, `ordinary-network`, `file-and-config`, `ipc`, `device`,
  `memory`, `privilege-escalation`, `kernel-module`, `credential-store`, `persistence`), each posture
  `deny` or `permit-deny-risky`. The `zone_type` archetype (`standard`/`trusted`/`isolation`/`public`) is a
  coarse preset badge, separate from the per-domain postures.
- **Effective posture is tighten-only inheritance.** `effective_postures` is the composition up the lexical
  ancestor chain (deny wins). The editor shows own vs effective and previews the effective result as the
  operator edits.
- **The read-only catastrophic floor.** `governed-egress` and `execution` are always `deny`
  (`WireDomainPosture.floor = true`); the editor renders them locked and never lets an edit relax them.
- **Hierarchy is the dotted name; parent is derived.** `id`/`name` are the dotted `VtzName`
  (`YouSource.Corp.Finance`); `parent` is the lexical prefix, not a stored pointer. "Re-scope" is a rename
  (`vtz.rescope`), not a parent-pointer edit.
- **Draft -> Published lifecycle.** `lifecycle` is `draft` or `published`; Save is a real state transition.
- **Dropped mockup fields:** Origin-ID and Encryption Mode (Standard/PQC) are not in the substrate and are
  not built. "Trust Session Duration" is the plain `reauth_interval_hours` (1-24), labelled **Session
  Duration**.
- **Counts:** `sub_zone_count` is real. The card's member counts (users/objects) and policy count are
  `PENDING` -- their substrates (zone membership; the Policies surface) do not exist yet (see INV-CROSS).

## Prerequisites

- **crdb `IP-CONSOLE-VTZ-SUBSTRATE` -- LIVE over `:7878`.** Verbs: `VtzTree`, `VtzDetail` (reads),
  `VtzCreate`/`VtzEdit`/`VtzRescope`/`VtzDelete` (audited writes). DTOs: `WireVtzTreeNode`,
  `WireDomainPosture`, `WireVtzSpec`, `WireVtzMutation`. Deployed to the node 2026-07-19.
- **`IP-CONSOLE-00` foundation** -- the BFF, `operator-engine` delegation, `wire-client` over the crypto
  sidecar, session/authz, and the `@forge/contracts` codegen (`packages/contracts/scripts/generate.mjs`).
- **`IP-CONSOLE-01-OVERVIEW`** -- the source of the per-VTZ risk band (`WireRiskBand` on the graph, joined
  by zone id) and the Overview VTZ-ring the surface is reached from (≤3-click landing).
- **`IP-CONSOLE-12` entity drawer** -- the shared drawer + `ConfirmDialog` reused for the confirm-gated
  Save/Delete third click.

## INV-CROSS -- the bindings and their backend

| Binding | Real today? | Backend / note |
|---|---|---|
| `vtz.tree` (grid + zone tree) | **LIVE** | crdb `VtzTree` over `:7878` (own + effective posture, sub-zone count) |
| `vtz.detail(id)` (editor) | **LIVE** | crdb `VtzDetail` (zone + effective-posture ancestor contributors) |
| `vtz.create` / `vtz.edit` / `vtz.rescope` / `vtz.delete` | **LIVE** (command real; audited) | crdb audited write verbs (`WireVtzSpec` -> `WireVtzMutation`); server-attributed, floor + inheritance re-validated engine-side |
| `vtz.riskBand` (card focal) | **LIVE** (join) | reuse `overview.graph`'s per-VTZ `WireRiskBand` by zone id; no new engine op |
| `vtz.memberCounts` (users/objects on the card) | **PENDING** | crdb zone-membership substrate not built (`VtzSetMembership` deferred, `TRD-CONSOLE-12`); card shows the count only when the binding is live, never a fabricated number |
| `vtz.policyCount` (policies on the card) | **PENDING** | needs the Policies surface `CONSOLE-05` (crdb policy store); count is absent until then |
| `vtz.setMembership` ("Modify VTZ assignment") | **PENDING** | crdb `VtzSetMembership` deferred; the control is a labelled non-live affordance |
| `vtz.subZoneCount` | **LIVE** | crdb `WireVtzTreeNode.sub_zone_count` |

Per `INV-CONSOLE-NO-STUB`, every `PENDING` binding is registered `{ kind: 'pending', owningRepo, gatingTask }`
in the binding manifest and never ships a fabricated value; the surface renders the honest absence.

## Roster

One PR per row; each a named slice of `INV-CONSOLE-VTZ-REAL`, the full `scripts/ci.sh` green, branch-per-PR,
no-ff merge, docs separate from code, reviewed before the next.

| Step | Invariant | Deliverable |
|---|---|---|
| V2.1 | INV-CONSOLE-VTZ-CONTRACT | Re-copy the crdb `wire-dto.schema.json` into `packages/contracts/schema/`, `node scripts/generate.mjs` (drift-guarded) so `WireVtzTreeNode`/`WireDomainPosture`/`WireVtzSpec`/`WireVtzMutation` + the six `Vtz*` verb variants land in `wire-dto.ts`. Add `@forge/contracts` view models (`VtzTree`, `VtzDetail`, `VtzZone`, `DomainPosture`) + fail-closed projections (`toVtzTree`/`toVtzDetail`, narrowing posture/lifecycle/archetype enums closed on an unknown tag). Register the `vtz.*` bindings in the manifest (reads/commands LIVE; member/policy/setMembership PENDING). Contract test on the projections. |
| V2.2 | INV-CONSOLE-VTZ-BROKERED | BFF read path: `operator-engine` `vtzTree`/`vtzDetail` (inject operator delegation), `wire-client` `replyToVtzTree`/`replyToVtzDetail` + `dispatch({ VtzTree }/{ VtzDetail })`, resolvers (`resolveVtzTree`/`resolveVtzDetail`, fail-closed -> 503), routes `GET /api/vtz/tree` + `GET /api/vtz/detail?id=`. Session/engine-gated, tenant-scoped short-TTL cache. Route tests: 200/401/503/tenant-isolation. |
| V2.3 | INV-CONSOLE-VTZ-MGMT-BROKERED | BFF write path: `operator-engine` `vtzCreate`/`vtzEdit`/`vtzRescope`/`vtzDelete`, `wire-client` command dispatch + `replyToVtzMutation`, a mutation resolver mapping crdb `Conflict`/`Denied` refusals to typed BFF errors, routes (`POST /api/vtz`, `PUT /api/vtz/:id`, `POST /api/vtz/:id/rescope`, `DELETE /api/vtz/:id`). `audited: true`, confirm-gated. Route tests incl. the refusal mappings. |
| V2.4 | INV-CONSOLE-VTZ-GRID | Active VTZs grid (`VtzSurface.tsx`): the header `KpiCard` row (Total VTZs, High-Sensitivity zone count -- **no Avg Trust**), the `Active`/`Configure` `TabStrip`, search, and the net-new **zone card** design component -- name, **posture badge** (`zone_type` -> `Badge` variant) + **risk band** (Overview join), `sub_zone_count`; member/policy counts rendered only when their binding is live (else absent, labelled). Reads `vtz.tree`. Card focal is posture + risk band -- no gauge. `useVtzTree` hook. Design + surface tests; the fixtureless empty tenant shows only the seeded root. |
| V2.5 | INV-CONSOLE-VTZ-AUTHOR | The Configure editor + Create modal (net-new form design component): name, VTZ Type (archetype), Parent (derived, display), Description, Session Duration (`reauth_interval_hours`), Micro-Segmentation, Telemetry Mode, and the **per-domain posture editor** -- the eleven domains, the two floor domains locked, with a **live effective-posture preview** (tighten-only). Draft/Publish lifecycle. Create -> `vtz.create`; Save -> `vtz.edit`; Delete -> `vtz.delete` (confirm-gated); rename/parent-change -> `vtz.rescope`. The ≤3-click paths (`TRD-CONSOLE-02 §4`): re-scope a zone in 3 clicks; see own-vs-effective + the contributing ancestor. `useVtzMutation` (invalidates the tree). Surface + contract tests incl. floor-locked, inheritance-preview, refusal states. |
| V2.6 | INV-CONSOLE-VTZ-GROUNDED | Land the six VTZ mockups into `docs/ui-examples/15..20-*.png` + the README table rows (grounding, not truth). Amend `TRD-CONSOLE-02-vtz` striking Trust Score at the five sites (`:5`, `:12`, `:29`, `:33-34`, `:72`) -> **posture + a decision-LOG risk band**, citing the substrate (the wire DTOs carry no score). Docs-only PR, separate from code. |
| V2.N | INV-CONSOLE-VTZ-COMPLETE | Playwright E2E over the real surface: author a zone in ≤3 clicks -> it appears on the grid with its posture badge + risk band; edit its per-domain posture with the floor locked and the effective-posture preview updating; the fixtureless empty-tenant render shows only the seeded root (no fabricated zone). Add `vtz` to the `REAL_SURFACES` no-stub allowlist. All `TRD-CONSOLE-02 §8` acceptance rows green; Phase-3 VTZ surface exit. |

## Sequencing note

V2.1 (contract) -> V2.2 (reads) -> V2.4 (grid, needs reads) -> V2.3 (writes) -> V2.5 (editor, needs
writes) -> V2.6 (mockups + TRD amendment, independent, can slot anywhere) -> V2.N (capstone last, once the
grid + editor are live). V2.1-V2.2 deliver the read-only grid value; V2.3+V2.5 make it authorable; V2.N
proves it.

## Acceptance (from TRD-CONSOLE-02 Section 8, as amended)

- The zone tree, postures (own + effective), and sub-zone counts derive from the real crdb VTZ store; no
  fabricated zone, posture, or count (contract test + fixtureless empty-tenant render showing only the
  seeded root).
- Tighten-only inheritance is shown correctly (a child never displays a laxer effective posture than an
  ancestor's); the read-only catastrophic floor cannot be edited away (locked in the form and re-enforced
  by the engine).
- Create / edit / re-scope / delete commit through the crdb audited path; confirm-gated; a floor or
  inheritance violation returns the typed refusal, surfaced honestly (never silently accepted).
- Clicking a VTZ ring on the Overview graph lands on that zone (≤3-click budget preserved).
- **No trust score** is shown anywhere; the only zone-health signal is the posture badge + the
  decision-LOG risk band, absent by design when no decisions drive it.

## Out of scope (named)

- **torch-forge ingest** of the crdb zone store (the endpoint compose/distribute path) -- a separate
  cross-repo epic; enforcement stays AG.7-OFF.
- **Zone membership** (`vtz.setMembership`, member counts) and **policy counts** -- `PENDING`, gated on the
  crdb membership substrate and the `CONSOLE-05` Policies surface respectively.
