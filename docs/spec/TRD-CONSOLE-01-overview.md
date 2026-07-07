# TRD-CONSOLE-01 -- Overview: the live connectivity graph (home)

**Status:** DRAFT (authored 2026-07-07). Inherits `TRD-CONSOLE-00`. This is the Console home and the
product's signature surface: a dynamic, live graph of the actual connectivity happening across the
platform, driven by the Crucible connectivity LOG. The mock home screens (`shot-01`, `shot-13`,
`shot-14`) are the interaction target.

---

## 1. Purpose

Answer, at a glance and in real time: **who and what is connecting to what, through which trust zone,
and how healthy is each path.** The operator reads the graph, traces a flow, clicks an entity, and acts
-- the whole product's value is one screen and one click away. This surface is why the LOG matters: the
graph is a live projection of the LOG, not a drawn diagram.

## 2. The graph model

A three-column flow (Sankey-style), matching the mock:

- **Left column -- sources (principals):** aggregated entity classes -- **Users**, **Devices**, **AI
  Agents** -- each a node labelled with its live item count (e.g. "AI Agents / 63 items").
- **Middle column -- Virtual Trust Zones:** the Forge VTZs the traffic flows through (e.g.
  `YouSource.Corp`, `YouSource.AIAgents.Trusted`, `YouSource.AIAgents.Dev`), each rendered as a **score
  ring** (0-100 Trust Score, green/amber/red per `TRD-CONSOLE-00` Section 6).
- **Right column -- destinations (objects):** the resource classes traffic reaches -- **Websites**,
  **SaaS Apps**, **Private Apps**, **Data Stores**, **Servers** -- each with its live item count.

**Edges** are the aggregated connections observed in the LOG between a source class and a VTZ, and
between a VTZ and a destination class. Edge color follows the source class (Users blue, Devices
teal-green, AI Agents purple; VTZ->destination edges amber), and edge weight/opacity reflects
connection volume. The honeycomb field renders faintly behind the flow.

## 3. Data source and binding (INV-CONSOLE-NO-STUB)

The graph is a bounded aggregation of the Crucible **connectivity LOG** -- the LEG/LOG decision records
that carry, per connection, the source identity, the VTZ it traversed, the destination object, the
decision, and the Trust Score/delta (the `TRD-CONSOLE-09` Logs stream is the same substrate,
row-level). The BFF exposes:

- **Read binding `overview.graph`** -> a CrucibleQL aggregation over the LOG within the active time
  window and filter, returning: source nodes (class + live count), VTZ nodes (id + current Trust Score),
  destination nodes (class + live count), and weighted edges (source-class -> VTZ, VTZ -> dest-class,
  with volume + dominant decision). Aggregated engine-side and bounded; the browser never receives raw
  LOG rows for the whole graph.
- **Read binding `overview.entityConnections(entityId)`** -> on hover/selection, the specific entity's
  connections (count + Trust Score + the zones/destinations it touches) for the highlight + tooltip.
- **Stream binding `overview.live`** -> deltas from the Crucible decision/audit stream that update node
  counts, VTZ scores, and edge weights in place (`TRD-CONSOLE-00` Section 7). "Live" is real streaming,
  < 2 s freshness.

No node, edge, count, or score is fabricated; an empty platform renders an empty graph with an explicit
"no connectivity observed" state, never sample nodes.

## 4. Interaction (the "how I want it used" behavior)

Matching `shot-13` (highlight) and `shot-14` (drawer):

1. **Hover a flow or node** -> the connected path highlights and the rest of the graph dims; a tooltip
   shows the specific entity + its connection count + Trust Score (e.g. "Inventory-Bot - 1 connections -
   Trust: 78"). Hover prefetches the drawer payload (`TRD-CONSOLE-00` Section 7) so the click is instant.
2. **Click an entity** (a specific principal/agent within a source node, a VTZ, or a destination) ->
   the **entity drawer** (`TRD-CONSOLE-12`) opens with identity, Trust Score + trend, entity info (trust
   state, risk score, region, last seen, tags), connected VTZs, capabilities (from the Construction
   Report for a wrapped agent), effective policies, recent decisions, and Quick Actions (Isolate from
   network, Modify VTZ assignment, View Remediation, Open full report). **This is one click from home**;
   an action inside is the second.
3. **Top tabs -- All / Users / Devices / AI Agents** -- filter the graph to a source class in place
   (same-surface filter, not a navigation; `TRD-CONSOLE-00` Section 5.3).
4. **View 1 / View 2** (bottom-left) -- saved graph layouts/scopes (e.g. by environment or tenant),
   read from the operator's saved-view preference (a Crucible-stored UI preference on the operator
   Principal, not a Console-owned store).
5. **Click a VTZ score ring** -> navigates to that zone in `Virtual Trust Zones` (`TRD-CONSOLE-02`) --
   still within budget (home -> zone = the zone detail is click 1's destination).

## 5. Three-click paths (INV-CONSOLE-3-CLICKS)

| Task | Clicks |
|------|--------|
| Inspect any entity + its live connections | click node/flow (1) -> drawer (data present) |
| Isolate a misbehaving agent from the graph | click entity (1) -> "Isolate from network" (2) -> confirm (3) |
| Jump to the governing policy of a hot path | click VTZ ring (1) -> zone's policies (2) -> a policy (3) |
| Filter the whole map to AI Agents | "AI Agents" tab (1) |

## 6. Performance

The graph mounts from one `overview.graph` aggregation (< 300 ms warm), then applies stream deltas in
place -- it never full-refetches on a tick. Node/edge counts animate on delta; the flow has a subtle
continuous motion (reduced-motion honored). Hover highlight + tooltip are local (< 100 ms). Prefetch on
hover makes the drawer open instant.

## 7. States

- **Loading:** the three columns skeleton in with the honeycomb behind.
- **Empty:** "No connectivity observed in this window" with a time-range hint; never sample data.
- **Stale (stream lag):** a subtle "reconnecting" marker on the Live badge; last-known graph stays,
  marked stale, until resync from the engine.
- **Unauthorized scope:** classes/zones the operator's tier cannot see are absent (not greyed
  placeholders), per `TRD-CONSOLE-00` Section 8.

## 8. Acceptance and failure semantics

**Acceptance:**

- Every node count, VTZ score, and edge derives from a real `overview.graph` aggregation over the LOG;
  no fabricated element (contract test asserts the binding + a fixtureless render on an empty tenant
  shows the empty state).
- A new connection committed at the engine appears/updates on the graph within 2 s via the stream.
- Hover highlights the exact connected path with the entity's real count + Trust Score; click opens the
  drawer with that entity's real data.
- The three canonical tasks in Section 5 complete within budget (interaction test).

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- engine-unreachable shows a typed
unavailable state (no fabricated graph); stream disconnect marks stale + reconnects + resyncs from the
engine; an entity the operator cannot authorize does not render a drawer beyond its tier.

## 9. Six-bug-category notes

Cross-module gap: the graph view model is typed against the LOG DTO shape (a drifted field fails
compilation). Parallel execution: the source/VTZ/destination aggregations fan out tolerantly -- a failed
sub-aggregation degrades that column with an inline error, not the whole graph. Missing failure path:
the empty/stale/unauthorized/engine-down states are each tested.
