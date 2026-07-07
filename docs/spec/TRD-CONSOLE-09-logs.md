# TRD-CONSOLE-09 -- Logs: the decision and audit stream (the LOG)

**Status:** DRAFT (authored 2026-07-07). Inherits `TRD-CONSOLE-00`. Logs is the row-level view of the
Crucible LOG -- the stream of governed decisions and audit events that is the substrate for the Overview
graph (`TRD-CONSOLE-01`) and the AIOps command center (`TRD-CONSOLE-07`). Mock target: `shot-10`.

The LOG is why the connectivity graph can be live: the graph is an aggregation of this same stream. Logs
exposes it unaggregated, searchable, and replayable at the row.

---

## 1. Purpose

Give the operator the authoritative, searchable, live record of **every governed decision** on the
platform: who/what acted, in which category, through which VTZ, what the engine decided, how the entity's
Trust Score changed, and with what confidence -- each row a real, signed, replayable DecisionObject on
the engine's hash-chained audit log. From any row the operator reaches the full rationale (EXPLAIN) and
the acting entity (the drawer) in one more click.

## 2. The table model

A virtualized, server-paged, live-tailing table matching the mock columns, each bound to a real field:

| Column | Meaning | Real source |
|--------|---------|-------------|
| **Time** | when the decision committed | the DecisionObject commit time |
| **Entity** | the acting principal (user/device/service/agent), with a kind icon | the decision's attributed source identity (the LEG `{host}:pid`/principal join, DT.4c) |
| **Category** | the decision class (Identity, DeviceAttestation, Behavior, Session, AIAgent, Reflex, VTZPath, SystemIntegrity, TrustKey, AISuggestedDecision, ...) | the DecisionObject category / detector class |
| **Decision** | the outcome (Allowed, Warned, Blocked, Downgraded, Isolated) | the decision disposition / posture (mapped from the TRD-32 v2 action lattice + trust change) |
| **Trust Delta** | the entity's Trust Score change (e.g. 87 -> 92) with a direction arrow | the engine's pre/post score on the decision |
| **VTZ** | the zone the decision occurred in | the DecisionObject's VTZ |
| **Confidence** | the engine's confidence in the decision (%) | the engine confidence value (present where the detector emits one) |

Rows are color-cued by decision (Allowed green, Warned amber, Blocked/Isolated red, Downgraded orange)
per the `TRD-CONSOLE-00` Section 6 status palette.

## 3. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

- **Read binding `logs.query`** -> a **CrucibleQL** query over the LOG (the DecisionObject / audit
  stream) within the active time range + filters, server-paged by cursor, returning the row view models.
  CrucibleQL carries the filtering, ordering, and pagination into the engine (one round trip, bounded);
  authorization + classification redaction happen in candidate generation (TRD-04), so an operator never
  sees a row above their tier.
- **Stream binding `logs.tail`** -> live deltas from the Crucible decision/audit stream, prepended to
  the table in place when the range includes "now" and the tail is enabled (`LIVE`, < 2 s freshness);
  a lag shows the staleness marker.
- **Read binding `logs.explain(decisionId)`** -> the decision's **EXPLAIN / rationale** (TRD-03 Section 8;
  the signed, replayable decision rationale), tier-redacted -- the "why".
- **Command binding `logs.export`** -> a real, audited engine export of the current filtered set (the
  export is itself a Crucible operation recorded on the audit chain; it is bounded/streamed, never an
  unbounded client-side dump).

The LOG is append-only and engine-owned; the Console never writes to it and never fabricates a row.

## 4. Search, filter, time range

- **Search** (free text) and **structured filters** (by entity, category, decision, VTZ, confidence
  threshold, tag) compile into the `logs.query` CrucibleQL predicate -- filtering is engine-side, not a
  client-side scan of a page. Values bind as parameters (never interpolated).
- **Time range** (Last 24h default, matching the mock) scopes the query; including "now" enables the
  live tail.
- The filter state is a shareable, URL-encoded view (a Crucible-stored operator preference, not a
  Console datastore).

## 5. Interaction and three-click paths

- **Click a row** -> the **entity drawer** (`TRD-CONSOLE-12`) for the acting entity, OR (on the decision
  cell) the **EXPLAIN rationale** inline. One click.
- **Row -> EXPLAIN -> full replay:** a decision links into AIOps Rewind (`TRD-CONSOLE-07`) positioned at
  that decision's moment.

| Task | Clicks |
|------|--------|
| See why a decision was made | click the decision (1) -> EXPLAIN inline |
| Inspect the acting entity | click the row entity (1) -> drawer |
| Filter to one entity's blocked decisions today | set filters (1 interaction) |
| Export the current view | Export (1) -> confirm/download (2) |

## 6. Performance

Virtualized rows (render only the visible window); server-paged by cursor (no unbounded load); the live
tail applies deltas in place (never re-fetches on a tick); filters recompute the query server-side.
First page < 300 ms warm; new decisions appear at the top within 2 s (`LIVE`).

## 7. States

- **Loading:** row skeletons under the header.
- **Empty:** "No decisions match" with the active filters echoed; never sample rows.
- **Stale tail:** the Live badge marks reconnecting; the table holds last-known, marked stale, until
  resync from the engine.
- **Unauthorized:** rows/fields above tier are absent; an export beyond tier is refused by the engine.

## 8. Acceptance and failure semantics

**Acceptance:**
- Every column value on every row derives from a real DecisionObject/audit field via `logs.query`; no
  fabricated row or value (contract test + fixtureless render on an empty tenant).
- A committed decision appears in the live tail within 2 s.
- Clicking a decision yields its real EXPLAIN rationale, tier-redacted; clicking the entity opens the
  drawer with that entity's real data.
- Filters/search change the engine-side result set (not a client filter of one page); export produces an
  audited engine export of exactly the filtered set.
- The Section 5 tasks complete within budget.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- engine-unreachable shows a typed state (no
fabricated log); tail disconnect marks stale + resyncs from the engine; an unauthorized export is refused
with the sanitized error.

## 9. Six-bug-category notes

Cross-module gap: the row + EXPLAIN view models are typed in `@forge/contracts` against the DecisionObject
shape. Async boundary: the tail is backpressured; a burst does not starve the loop. Missing failure path:
empty/stale/unauthorized/export-denied are tested. Schema bypass: rows are the typed DecisionObject
projection, never an ad-hoc JSON parse.
