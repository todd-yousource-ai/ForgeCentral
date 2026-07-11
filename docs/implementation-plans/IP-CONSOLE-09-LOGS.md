# IP-CONSOLE-09-LOGS -- the decision and audit stream (the LOG)

The implementation plan for `TRD-CONSOLE-09` (Logs): the authoritative, searchable, live-tailing record
of every governed decision -- the Crucible **LOG**, which is the substrate the Overview graph aggregates.
**Roadmap step P1.2 -- built SECOND in Phase 1** (after the drawer it clicks through to, before the
Overview that aggregates it). Read with `TRD-CONSOLE-09`, `TRD-CONSOLE-00` Section 5 (IA/paging), and the
mock Logs screen (`docs/ui-examples/`).

> **Phase-1 build order:** P1.1 `IP-CONSOLE-12` (drawer) -> **P1.2 `IP-CONSOLE-09` (this, Logs)** ->
> P1.3 `IP-CONSOLE-01` (Overview). `IP-CONSOLE-ROADMAP.md` is the authoritative sequence.

**Named invariant:** `INV-CONSOLE-LOGS-REAL` -- every row is a real DecisionObject/audit record read via
CrucibleQL over the append-only, engine-owned LOG; filtering/ordering/paging are engine-side; the tail is
real streaming (< 2 s); the Console never writes to the LOG and never fabricates a row. **This surface
establishes + proves the LOG substrate the Overview (P1.3) aggregates.**

## Prerequisites

- **P1.1 `IP-CONSOLE-12` (drawer)** -- a Logs row click opens the entity drawer (LG.5 reuses it).
- **Phase 0** (landed): `@forge/contracts`, the design system **data table** + tab strip, the BFF +
  `OperatorEngine`, the binding registry + `test:contract`, the F0.6 live-store (polling), the SPA shell.
- **The LOG is engine-written:** crdb writes DecisionObjects (`Keyspace::DetectDecision`) + audit events;
  this surface reads them. Where a column's field is not yet emitted, that column is `PENDING` (named),
  not fabricated.

## INV-CROSS -- the bindings and their backend

| Binding | Real today? | Backend / note |
|---------|-------------|----------------|
| `logs.query` | **yes** -- a CrucibleQL query over the LOG (time range + filters), cursor-paged, bounded, engine-side | crdb -- a parameterized CrucibleQL read over the DecisionObject/audit stream; **extend CrucibleQL** only if a filter is not expressible. |
| `logs.explain(decisionId)` | **yes** -- the signed, replayable decision rationale (TRD-03 Section 8), tier-redacted | crdb -- the EXPLAIN read for a decision. |
| `logs.export` | **yes** -- a real audited engine export of the filtered set (recorded on the audit chain), bounded/streamed | crdb -- the export operation; never a client-side CSV of fetched rows. |
| `logs.tail` | **v1: polling** the recent window; **`PENDING`**: the real push-stream is crdb Part B (banked) | crdb -- the bounded decision/audit SUBSCRIBE (`IP-CONSOLE-READINESS` Part B). Swaps in without changing the surface. |
| the row `Confidence` / any not-yet-emitted column field | column-dependent | crdb -- present where the detector emits it; a missing field renders empty for that cell, not fabricated. |

## Roster

One PR per row; a named slice of `INV-CONSOLE-LOGS-REAL`, full `scripts/ci.sh` green, branch-per-PR,
no-ff merge, docs separate from code, reviewed before the next.

| Step | Invariant | Deliverable |
|------|-----------|-------------|
| **LG.1** | `INV-CONSOLE-LOGS-CONTRACT` | The Logs contract. `@forge/contracts`: the `LogRow` view model (time, entity + kind, category, decision, trust delta, VTZ, confidence) typed against the DecisionObject DTO, + the `logs.query`/`logs.tail`/`logs.explain`/`logs.export` shapes. `@forge/bindings`: register them (`logs.tail` push + any not-yet-emitted column `PENDING`). `test:contract`. No table yet. |
| **LG.2** | `INV-CONSOLE-LOGS-QUERY` (the LOG substrate) | `logs.query` over the LOG. The parameterized CrucibleQL (time range + structured filters + free-text search compiled to the predicate), cursor-paged, bounded, aggregated/filtered engine-side; the BFF route over `OperatorEngine`, tier-redacted. **This is the read the Overview's `overview.graph` aggregation is built on** -- landing it de-risks P1.3. |
| **LG.3** | `INV-CONSOLE-LOGS-TABLE` | The table (design system). The virtualized, server-paged Logs table (the mock columns, decision color cues) + the search/filter/time-range controls that compile to the `logs.query` predicate (engine-side, never a client filter). Loading + the honest empty ("no decisions match", filters echoed) states. |
| **LG.4** | `INV-CONSOLE-LIVE` | `logs.tail`. Live deltas prepended **in place** when the range includes "now" (< 2 s), never a re-fetch on a tick; the stale "reconnecting" marker on the Live badge; reconnect + resync. v1 polls the recent window (F0.6 live-store); the push-stream (crdb Part B) swaps in without touching the surface. |
| **LG.5** | `INV-CONSOLE-3-CLICKS` | Row interaction. Click a row -> the **entity drawer** (`IP-CONSOLE-12`, reused) for the acting entity; click the decision cell -> the **EXPLAIN** rationale inline (`logs.explain`, tier-redacted); the row -> EXPLAIN -> AIOps **Rewind** deep-link (`TRD-CONSOLE-07`, `PENDING` until Phase 2). The <=3-click canonical tasks (see a decision's why; filter to one entity's blocked decisions) proven. |
| **LG.6** | `INV-CONSOLE-LOGS-EXPORT` | `logs.export`. A real audited engine export of the current filtered set -- bounded/streamed, recorded on the audit chain, confirm/scope-gated. Never a fabricated or client-assembled export. |
| **LG.N** | `INV-CONSOLE-LOGS-COMPLETE` | The capstone. Playwright E2E: the table over real decisions; a filter recomputes the query engine-side; a new decision appears at the top < 2 s; a row opens the drawer; a decision shows EXPLAIN. All `TRD-CONSOLE-09` Section 8 acceptance rows green. **Proves the LOG substrate for P1.3.** |

## Sequencing note

LG.1 -> LG.2 land the contract + the CrucibleQL LOG read (the substrate); LG.3 -> LG.4 the live table;
LG.5 -> LG.6 the interaction + export. LG.2 is the highest-leverage step -- it is the same LOG read the
Overview's `overview.graph` aggregates, so landing it first de-risks P1.3. `logs.tail` push and the Rewind
deep-link ship `PENDING` and flip live when their engine/Phase-2 tasks land.

## Acceptance (from `TRD-CONSOLE-09` Section 8)

- Every row + column derives from a real DecisionObject/audit record via `logs.query`; filtering/paging
  are engine-side; no fabricated row (contract test + a fixtureless render on an empty tenant).
- A new decision committed at the engine appears at the top within 2 s via `logs.tail`.
- A row opens the drawer for the acting entity; a decision shows its EXPLAIN rationale (tier-redacted);
  export is a real audited engine operation. Failure semantics: an engine error renders unavailable (no
  fabricated rows); a stale tail marks reconnecting + resyncs.
