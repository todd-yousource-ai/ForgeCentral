# IP-CONSOLE-12-ENTITY-DRAWER -- the shared detail + quick-actions panel

The implementation plan for `TRD-CONSOLE-12` (the entity drawer): the shared right-side panel that opens
from any entity on any surface, showing that entity's real detail and its confirm-gated quick actions.
**Roadmap step P1.1 -- built FIRST in Phase 1**, because Logs (P1.2) and the Overview graph (P1.3) both
click through to it. Read with `TRD-CONSOLE-12`, `TRD-CONSOLE-00` Section 7 (prefetch + the select-then-act
model), and the mock `shot-14` (`docs/ui-examples/`).

> **Phase-1 build order (the file numbers follow the TRD, NOT the order):**
> **P1.1 `IP-CONSOLE-12` (this, the drawer) -> P1.2 `IP-CONSOLE-09` (Logs) -> P1.3 `IP-CONSOLE-01`
> (Overview).** `IP-CONSOLE-ROADMAP.md` is the authoritative sequence.

**Named invariant:** `INV-CONSOLE-DRAWER-REAL` -- every section is a real read and every quick action a
real, engine-authorized operation; nothing is fabricated; a destructive action is confirm-gated with its
exact effect shown; an unauthorized section/action is absent, not a disabled placeholder.

## Prerequisites

- **Phase 0** (all landed): `@forge/contracts` (F0.1), the design system + the `Drawer`/`ScoreRing`
  primitives + the deferred drawer-host shell (F0.2b/c), the BFF + `OperatorEngine` facade (F0.3/F0.5),
  the binding registry + `test:contract` (F0.4), the SPA shell's `DrawerHost` (F0.8).
- **No surface prerequisite:** the drawer is built first and stands alone; Logs (P1.2) and Overview (P1.3)
  reuse it. It is exercised from a thin test harness until Logs provides the first real open site.

## INV-CROSS -- the bindings and their backend

| Binding | Real today? | Backend / note |
|---------|-------------|----------------|
| `entity.header` / `entity.trustScore` (score + trend sparkline) | **yes** -- CrucibleQL read | crdb -- the entity's Trust Score + recent-window trend. |
| `entity.info` (trust state, risk, region, last seen, tags) | **yes** -- CrucibleQL read | crdb -- the entity record projection (tier-redacted). |
| `entity.zones(ref)` (connected VTZs) | **yes** -- CrucibleQL read | crdb/forge -- the entity's current VTZ membership/traversal. |
| `entity.effectivePolicies(ref)` | **yes** -- the engine's policy resolution | crdb -- resolved effective policies (direct vs inherited from a VTZ), tier-redacted. |
| `entity.recentDecisions(ref)` | **yes** -- CrucibleQL over the LOG | crdb -- a scoped LOG query for this entity; shares the LOG substrate Logs (P1.2) surfaces. |
| `entity.capabilities(ref)` (wrapped agent Construction Report) | **`PENDING`** | crdb/torch -- a read binding over the Torch `torch-inspect` signed Construction Report (govern-lane output). The section renders an honest empty/PENDING until it lands. |
| `entity.isolate(ref)` (Quick Action) | **command real; enforcement OFF** | torch/forge -- the containment command (TRD-32 v2 `Quarantine`/`Deny`) is real + audited; **live kernel-level (BPF-LSM) enforcement is AG.7, deliberately off** (observe/quarantine posture). Never fabricates enforcement. |
| `entity.modifyVtz` / `entity.viewRemediation` / `entity.openReport` (Quick Actions) | mixed | crdb/forge/torch -- each an audited engine op; `PENDING` where a live command is not yet exposed (named). |

## Roster

One PR per row; a named slice of `INV-CONSOLE-DRAWER-REAL`, full `scripts/ci.sh` green, branch-per-PR,
no-ff merge, docs separate from code, reviewed before the next.

| Step | Invariant | Deliverable |
|------|-----------|-------------|
| **DR.1** | `INV-CONSOLE-DRAWER-CONTRACT` | The drawer contract. `@forge/contracts`: the section view models (header + trust, info, zones, capabilities, effective policies, recent decisions) + the quick-action command shapes, typed against the engine DTOs. `@forge/bindings`: register `entity.*` (capabilities + isolate + the not-yet-exposed commands marked `PENDING` with owning tasks). `test:contract` covers it. No live data yet. |
| **DR.2** | `INV-CONSOLE-DRAWER-SHELL` | The drawer body (design system). The `@forge/design` drawer-host + the section layout: header (identity + `ScoreRing` + trend sparkline), entity info, connected VTZs, capabilities, effective policies, recent decisions, the quick-action bar. Data-driven from the DR.1 view model; section-level **loading skeletons**; semantic color only (hex-scan gate). Fixtures only (no live read). |
| **DR.3** | `INV-CONSOLE-DRAWER-BROKERED` | The read sections, live. The BFF routes `entity.header`/`info`/`zones`/`effectivePolicies`/`recentDecisions` over `OperatorEngine` -- CrucibleQL-first, tier-redacted, short-TTL cached, bounded. `recentDecisions` reads the LOG (shares the P1.2 substrate; `PENDING` if the LOG is not yet populated). A per-section engine error degrades **that section** with an inline error, not the whole drawer. |
| **DR.4** | `INV-CONSOLE-DRAWER-CAPABILITIES` (INV-CROSS) | Capabilities. `entity.capabilities(ref)` binds the Torch signed Construction Report (crdb/torch read binding). `PENDING` until the read binding lands; the section shows the honest empty/PENDING state (never a fabricated capability). Capabilities are typed against the Construction Report DTO (schema-bypass guard). |
| **DR.5** | `INV-CONSOLE-DRAWER-ACTIONS` | Quick actions. The command bindings -- **Isolate from network** (`entity.isolate`, confirm-gated, exact effect shown, enforcement OFF), Modify VTZ assignment, View Remediation, Open full report -- each a real audited engine op, each authorized engine-side, destructive ones confirm-gated (the third click). `PENDING` where a live command is not exposed. Each action's denial path (beyond-tier -> sanitized refusal) tested. |
| **DR.6** | `INV-CONSOLE-DRAWER-PREFETCH` | Prefetch + tier states. The hover/select **prefetch** seam (`TRD-CONSOLE-00` Section 7) so the open is < 100 ms with the panel populated; the **unauthorized** state (sections/actions above the operator's EXPLAIN tier absent, not disabled); the stale marker on a streaming sparkline. |
| **DR.N** | `INV-CONSOLE-DRAWER-COMPLETE` | The capstone. Playwright E2E over a thin harness (and, once P1.2 lands, from a Logs row): open the drawer, the sections render real data, a quick action confirm-gates + audits with the effect shown, a beyond-tier section is absent + its action returns the sanitized refusal. All `TRD-CONSOLE-12` Section 7 acceptance rows green. |

## Sequencing note

DR.1 -> DR.2 build the contract + the rendered shell on fixtures (no engine dependency). DR.3 -> DR.5 make
the sections + actions live; DR.6 the prefetch + tier states. DR.4 (capabilities) and the not-yet-exposed
commands ship `PENDING` and flip live when their engine tasks land (tracked here + in
`IP-CONSOLE-ROADMAP` Section 6). The drawer is the reusable panel every later surface opens.

## Acceptance (from `TRD-CONSOLE-12` Section 7)

- Every section is a real read; a destructive action is confirm-gated with its effect shown + recorded on
  the audit chain; a `PENDING` action is not shipped live.
- The drawer opens < 100 ms on a prefetch hit; a per-section error degrades that section only.
- Sections/actions above the operator's tier are absent (not disabled); a beyond-tier action returns the
  engine's sanitized refusal. No fabricated section, capability, or decision.
