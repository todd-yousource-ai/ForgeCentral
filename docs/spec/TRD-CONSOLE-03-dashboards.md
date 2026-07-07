# TRD-CONSOLE-03 -- Dashboards

**Status:** DRAFT (authored 2026-07-07). Inherits `TRD-CONSOLE-00`. Dashboards are the operator's
at-a-glance operational summaries -- KPI cards and charts over engine aggregates, selectable by focus
area. Mock target: `shot-02`.

---

## 1. Purpose

Give the operator a fast, focused overview of platform health and activity through a small set of
purpose-built dashboards, each a composition of real engine aggregates, with drill-through to the
underlying entities and decisions. Dashboards summarize; they never become a source of truth, and every
number is a live aggregate, not a stored rollup.

## 2. Model

- **Dashboard selector** (dropdown, matching the mock): a fixed set of focus dashboards --
  `Overview`, `VTZ Management`, `User & Identity`, `Device & Endpoint`, `Endpoint Health`,
  `Policy & Enforcement`, `Telemetry & TrustFlow`, `Security Incident & Reflex`. (Retermed per
  `TRD-CONSOLE-00` Section 3 where the mock said "Trust".)
- **KPI cards** (e.g. Active VTZs, Active Sessions, KeyLock Rotations) with a Live/Today badge.
- **Charts**: a trend line (e.g. aggregate score over time), a Policy Enforcement Summary time-series
  (Deny/Monitor/Permit/Quarantine -- the action lattice), a Top-N Anomalies list, an Activity Heatmap
  (Agents/Devices/Users by hour).
- **Time range** (Last 24 Hours default) + refresh; Live-badged cards stream.

## 3. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

- Each panel is a **read binding** resolving to a **CrucibleQL aggregation** over the engine (the LOG /
  decision stream / session state / VTZ + policy registries), using CrucibleQL's windowing/aggregation
  (`WINDOW`, `GROUP BY`, time bucketing) so the rollup is computed engine-side, bounded, and tier-
  redacted. Examples: `dash.kpis(dashboardId, range)`, `dash.enforcementSummary(range)`,
  `dash.anomaliesTopN(range)`, `dash.activityHeatmap(range)`.
- **Live** KPI cards stream from the decision/session stream (`LIVE`, < 2 s freshness); the rest refresh
  on range change or the refresh control.
- No panel stores or precomputes a rollup in the Console; a stale cache entry is re-read authoritatively.
- `PENDING` / `INV-CROSS`: where a specific aggregate is not yet expressible in CrucibleQL, the preferred
  cross-surface work is to extend CrucibleQL (not add a bespoke BFF rollup); the binding is `PENDING` and
  the implementing IP names the CrucibleQL work.

## 4. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Switch dashboard (selector, in place); set the time range (in place); refresh.
- **Drill from a summary to the detail:** click an anomaly/KPI/chart segment (1) -> the underlying
  entities/decisions (the drawer or a filtered Logs view) (2).
- A Top-5 Anomaly row -> the entity drawer or the incident in AIOps (`TRD-CONSOLE-07`).

Dashboards are read-only summaries; they expose no destructive command directly (actions are taken from
the drilled-in entity/decision), which keeps them safe and fast.

## 5. Performance, states

Each panel is one bounded aggregate query; panels load in parallel (tolerant -- a failed panel shows an
inline error, the rest render). Live cards stream. First paint < 300 ms warm. Loading skeletons per
panel; empty ("no activity in this window"); stale markers on stream lag; unauthorized panels/dashboards
absent per tier.

## 6. Acceptance and failure semantics

**Acceptance:**
- Every KPI and chart value derives from a real engine aggregate via CrucibleQL; no fabricated number
  (contract test + fixtureless render on an empty tenant shows zeros/empty, not sample data).
- Live KPI cards update within 2 s; changing the range recomputes engine-side.
- Every drill-through lands on the real underlying entities/decisions.
- The Section 4 tasks complete within budget.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- a failed panel degrades in place; engine-
unreachable shows a typed state; a `PENDING` panel shows a labelled "coming" placeholder that renders no
fabricated data.

## 7. Six-bug-category notes

Cross-module gap: panel view models typed in `@forge/contracts` against the aggregate shapes. Parallel
execution: panel fan-out is tolerant. Missing failure path: empty-window, failed-panel, stale,
unauthorized, `PENDING` tested. Async boundary: streamed KPI updates are backpressured.
