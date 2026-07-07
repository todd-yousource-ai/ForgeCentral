# TRD-CONSOLE-08 -- Reports

**Status:** DRAFT (authored 2026-07-07). Inherits `TRD-CONSOLE-00`. Reports are the operator's
composed, time-ranged, exportable summaries for review, audit, and executive communication -- each an
aggregation over real engine data with rationale (EXPLAIN) behind the high-risk items. Mock target:
`shot-09`.

---

## 1. Purpose

Give operators, auditors, and executives authoritative, shareable reports over the platform's activity --
score distributions, automated-action summaries, high-risk events with their rationale, attestation
status, compliance posture -- each derived from real engine data and each item traceable to its
decision. Reports summarize and communicate; they never fabricate, and every headline number drills to
its evidence.

## 2. Model

- **Report tabs** (matching the mock, retermed per `TRD-CONSOLE-00` Section 3): `Operational`,
  `AI Governance`, `VTZ & Apps`, `Reflex & Autonomy`, `Zero-Trust Impact`, `Compliance & Audit`,
  `Exec Summary`.
- **Sections** (per the mock's Operational tab, generalizing): a **Trust Score Distribution** histogram
  (0-20 ... 80-100), a **Reflex Actions Summary** (Auto Isolate / Re-Auth / Block / Limit Scope /
  Allow-With-Monitor counts), **High-Risk Events** (each with its actions + timestamp + a **Rationale**
  button), and an **Identity Attestation Report** (per-entity attestation status + failure counts).
- **Time range** (Last 7d default) + **Share/Export**.

## 3. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

- Each section is a **read binding** resolving to a **CrucibleQL aggregation** over the engine (the
  decision stream, reflex-action records, attestation records, compliance tags), engine-side and tier-
  redacted. Examples: `report.scoreDistribution(range)`, `report.reflexSummary(range)`,
  `report.highRiskEvents(range)`, `report.attestation(range)`.
- **The Rationale button** -> `report.explain(eventId)` -> the event's **EXPLAIN** (TRD-03 Section 8:
  the signed, replayable decision rationale), tier-redacted. This is the report's evidence trail: every
  high-risk item shows exactly why the engine acted, from the engine, not a UI summary.
- **`report.export` / `report.share`** -> a real, audited engine export (PDF/CSV/JSON) of the current
  report + range; the share is a tier-respecting link, not a public dump. Exports are bounded/streamed.
- `PENDING` / `INV-CROSS`: where a report aggregate needs data not yet exposed, the preferred work is a
  CrucibleQL extension; the binding is `PENDING` with the engine work named.

## 4. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Switch report tab (in place); set the range; Share/Export.
- **See the rationale for a high-risk event:** the event's Rationale button (1) -> EXPLAIN.
- **Drill to an attested entity:** an attestation row (1) -> the entity drawer (2).
- **Export the current report:** Export (1) -> format/confirm (2).

Reports are read + export surfaces; they expose no destructive command (remediation is taken from the
drilled-in entity/AIOps).

## 5. Performance, states

Sections load in parallel (tolerant); the range recomputes engine-side; export streams. Loading
skeletons; empty ("no data in this range"); unauthorized sections/reports absent per tier; a failed
section degrades in place.

## 6. Acceptance and failure semantics

**Acceptance:**
- Every report number, distribution, and event derives from a real engine aggregate; no fabricated
  figure (contract test + fixtureless render).
- The Rationale button shows the event's real EXPLAIN, tier-redacted.
- Export/share produce a real audited engine export of exactly the shown report + range, tier-respecting.
- The Section 4 tasks complete within budget.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- a failed section degrades in place;
engine-unreachable shows a typed state; an unauthorized export/share is refused with the typed error; a
`PENDING` section renders no fabricated data.

## 7. Six-bug-category notes

Cross-module gap: report section view models typed in `@forge/contracts`. Parallel execution: section
fan-out tolerant. Missing failure path: empty-range, failed-section, unauthorized-export, `PENDING`
tested. Schema bypass: EXPLAIN comes from the typed rationale shape, never an ad-hoc parse.
