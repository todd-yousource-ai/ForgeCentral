# TRD-CONSOLE-08 -- Reports

**Status:** PARTLY BUILT (authored 2026-07-07; refreshed 2026-09-25 by `IP-CONSOLE-11-guide` GD.9 against
the configuration census). The built page (built under `IP-CONSOLE-03` S3.16 / S3.17) is recorded in
Section 0b and wins where Sections 2 to 6 differ; every unbuilt requirement is kept in Section 8.
Inherits `TRD-CONSOLE-00`. Reports are the operator's
composed, time-ranged, exportable summaries for review, audit, and executive communication -- each an
aggregation over real engine data with rationale (EXPLAIN) behind the high-risk items. Mock target:
`shot-09`.

---

## 0b. As built (2026-09-25)

One page, two panels:
- **Weekly volume and coverage** (`soc.weekly`, `SOC_WEEKLY_SUMMARY`): the last 12 ISO weeks (Monday, UTC),
  oldest first, the last row the current partial week. Columns: Week of, Firings, Opened, Promoted, Muted,
  Techniques fired, Incidents opened, Incidents closed. A coverage line gives the corpus coverage now (not
  per week); an undercount note appears when the engine's episode scan reaches its ceiling. No range
  control (the gateway accepts 1 to 12 weeks).
- **Incident report** (`soc.report`, `SOC_INCIDENT_REPORT`): choose an open incident from the engine's
  queue. A narrative-state line (published, refused with its reason, no model bound, or no run recorded;
  plus "needs human review" when flagged), then six sections, each labelled model (adjudicated), engine
  (record) or template (declared fallback): Executive summary and What happened are model or template;
  Business impact is model or engine; Immediate actions is engine (the plan's steps) or template (no
  plan); Severity justification and Confidence explanation are always engine. A published narrative is
  followed by its cited evidence.
- **Export as text / Export as JSON:** a browser download of exactly the report read, not audited; no
  share. Only open incidents can be reported on.
- **States:** loading; empty ("No open incidents to report on"); a refused weekly or report read; any other
  failure is "could not be read" with Retry (401, 403, 502 and 503 are not told apart, Section 8 G-7).

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

Not built; see Section 0b for the page that exists and Section 8 (G-1 to G-4).

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
- **Built bindings:** `soc.report` (`soc_incident_report_v1`) and `soc.weekly` (`soc_weekly_summary_v1`), both
  LIVE reads. No `report.*` binding exists; `entity.fullReport` is `PENDING`.
- `PENDING` / `INV-CROSS`: where a report aggregate needs data not yet exposed, the preferred work is a
  CrucibleQL extension; the binding is `PENDING` with the engine work named.

## 4. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Switch report tab (in place); set the range; Share/Export.
- **See the rationale for a high-risk event:** the event's Rationale button (1) -> EXPLAIN.
- **Drill to an attested entity:** an attestation row (1) -> the entity drawer (2).
- **Export the current report:** Export (1) -> format/confirm (2).
- **As built:** choose an incident (1), then Export as text or Export as JSON (2); no confirm step, because the
  download changes no engine state.

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
- The Rationale button shows the event's real EXPLAIN, tier-redacted. (NOT MET: not built, G-2.)
- Export/share produce a real audited engine export of exactly the shown report + range, tier-respecting.
  (NOT MET: the export is an unaudited browser download and there is no share, G-5.)
- The Section 4 tasks complete within budget.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- a failed section degrades in place;
engine-unreachable shows a typed state; an unauthorized export/share is refused with the typed error; a
`PENDING` section renders no fabricated data.

## 7. Six-bug-category notes

Cross-module gap: report section view models typed in `@forge/contracts`. Parallel execution: section
fan-out tolerant. Missing failure path: empty-range, failed-section, unauthorized-export, `PENDING`
tested. Schema bypass: EXPLAIN comes from the typed rationale shape, never an ad-hoc parse.

## 8. Known gaps (recorded 2026-09-25; kept as requirements)

| Gap | Requirement | Census id |
|---|---|---|
| G-1 | The seven report tabs | D-08 |
| G-2 | Trust Score Distribution, Reflex Actions Summary, High-Risk Events with a Rationale button (EXPLAIN), Identity Attestation Report | D-08 |
| G-3 | A time range (Last 7d default) and range-driven recompute | D-08, REP-03 |
| G-4 | `report.*` aggregation bindings; `entity.fullReport` still `PENDING` | D-08 |
| G-5 | An audited engine export (PDF / CSV / JSON) and a tier-respecting share link | D-08, REP-02 |
| G-6 | Reports on closed incidents | REP-01 |
| G-7 | Typed refusal states: 401, 403, 502 and 503 render as the generic failure | REP-01, REP-03 |
| G-8 | The incident picker shows the raw subject, not the resolved subject name the SOC queue uses | REP-01 |
| G-9 | Drill from an attestation row to the entity drawer | D-08 |
| G-10 | The mock `shot-09` layout | D-08 |
