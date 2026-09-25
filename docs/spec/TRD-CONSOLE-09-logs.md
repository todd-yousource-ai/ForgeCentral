# TRD-CONSOLE-09 -- Logs: the decision and audit stream (the LOG)

**Status:** BUILT IN PART (authored 2026-07-07; refreshed 2026-09-25 by `IP-CONSOLE-11-guide` GD.9 against the
configuration census). Section 0b records the built surface and wins where Sections 2 to 7 differ; every
unbuilt requirement is kept in Section 10. Inherits `TRD-CONSOLE-00`. Logs is the row-level view of the
Crucible LOG -- the stream of governed decisions and audit events that is the substrate for the Overview
graph (`TRD-CONSOLE-01`) and the AIOps command center (`TRD-CONSOLE-07`). Mock target: `shot-10`.

The LOG is why the connectivity graph can be live: the graph is an aggregation of this same stream. Logs
exposes it unaggregated, searchable, and replayable at the row.

---

## 0b. As built (2026-09-25)

- **Rows.** On a node with episode mode on (the installed default) each row is one episode per condition
  (rule, technique, subject), timed at its most recent fire, with an empty scope; otherwise one
  DecisionObject. Decisions carry no signature today.
- **Table.** A bounded, newest-first table with five columns: Time (UTC), Decision (the finding plus the
  rule id, a button), ATT&CK (the technique or `--`), Confidence (the tier tag HIGH / MEDIUM / LOW /
  CONTESTED or `--`), Outcome (a badge with the posture tag `escalate` / `candidate` / `observe-only`,
  colored critical / caution / good). Not virtualized.
- **`logs.query`** (`GET /api/logs`, LOG_QUERY): the gateway bounds `limit` to 500 (default 100) and forwards
  `offset`; the engine caps at the per-tenant result limit and, in episode mode, trims a page to 256 KiB.
  The engine applies every filter.
- **`logs.tail`** is `PENDING` (the bounded push stream); the surface re-polls `logs.query` every 2 s while
  not paused.
- **`logs.explain`** (`GET /api/logs/explain/<id>`, LOG_EXPLAIN): finding, rule, technique and tactics,
  scope, evidence and the acting entity; an absent or denied id is a 404 that does not reveal which.
- **`logs.export`** (audited command, `POST /api/logs/export`, LOG_EXPORT): the current filter at the page
  limit of 100, as one JSON download `{exportId, rows}`; the engine commits a receipt to the audit chain,
  idempotent by `commandId` (the Console mints a new one per click). In episode mode the export reads
  decisions as well as episodes, so it can hold rows the table did not show.
- **Filters.** Search (a case-insensitive substring over finding, rule id and evidence), Confidence (an exact
  tier), Outcome (an exact posture), Time range (All time default, 24 h, 7 days, 30 days) compiled to `since`
  only: every range ends now, and `since` is fixed when a control changes. The filter is component state,
  not saved and not in the URL.
- **Interaction.** Clicking a row opens the acting entity's drawer (or the rationale when there is none);
  the Decision cell toggles the rationale inline; hovering prefetches it. Export has no confirm.
- **States.** A Reconnecting badge when a background poll fails and rows are kept; a first-load failure
  shows "Could not load the decision log." with Retry; the empty state echoes the filters. The export names
  each failure status; the list and rationale reads do not (Section 10).

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
- A committed decision appears in the live tail within 2 s. (Met by polling every 2 s; the stream is `PENDING`.)
- Clicking a decision yields its real EXPLAIN rationale, tier-redacted; clicking the entity opens the
  drawer with that entity's real data.
- Filters/search change the engine-side result set (not a client filter of one page); export produces an
  audited engine export of exactly the filtered set. (NOT MET: the export is capped at the page limit, CD-14.)
- The Section 5 tasks complete within budget.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- engine-unreachable shows a typed state (no
fabricated log); tail disconnect marks stale + resyncs from the engine; an unauthorized export is refused
with the sanitized error.

## 9. Six-bug-category notes

Cross-module gap: the row + EXPLAIN view models are typed in `@forge/contracts` against the DecisionObject
shape. Async boundary: the tail is backpressured; a burst does not starve the loop. Missing failure path:
empty/stale/unauthorized/export-denied are tested. Schema bypass: rows are the typed DecisionObject
projection, never an ad-hoc JSON parse.

## 10. Known gaps (recorded 2026-09-25; kept as requirements)

- The Entity, Category, Trust Delta and VTZ columns, the confidence percentage and virtualization; cursor
  paging (D-09, LOG-04).
- The push tail (`logs.tail`) and in-place deltas (LOG-03, D-09).
- Entity, category, VTZ, tag, threshold, technique, tactic and rule filter controls, an end bound (`until`)
  for the time range, the Last 24 h default, and saved or URL filter state (LOG-02, D-09).
- An export of the full filtered set, streamed, and CSV (CD-14, LOG-01, D-09); a confirm on export (CD-30).
- The AIOps Rewind link and signed, replayable decisions (LOG-04, D-09).
- Typed 401 / 403 / 502 / 503 states for the list and rationale reads.
- An export in episode mode can contain rows the table did not show (census CD-61).
- The gateway dropped `offset`, so the background pager fetched page 0 for every page: FIXED by GD.9 (CD-13).
