# IP-CONSOLE-01-OVERVIEW -- the live connectivity graph (home)

The implementation plan for `TRD-CONSOLE-01` (Overview): the product's flagship surface -- a live,
three-column flow graph of the actual connectivity across the platform, a **live projection of the
Crucible connectivity LOG**, not a drawn diagram. Roadmap step **P1.3**. Read with `TRD-CONSOLE-01`
(the contract), `TRD-CONSOLE-00` Section 6 (design system / score ring / honeycomb) + Section 7 (the
drawer + prefetch), and the mocks `shot-01`/`shot-13`/`shot-14` (`docs/ui-examples/`).

**Named invariant:** `INV-CONSOLE-OVERVIEW-LIVE` -- every node, edge, count, and risk band derives from a
real `overview.graph` aggregation over the connectivity graph; an empty platform renders an empty graph
("no connectivity observed"), never a sample node; a new connection at the engine appears on the graph
within 2 s. Composed of the per-step invariants below.

**GROUNDED RESHAPE (steer 2026-07-13, engine reality).** The original mock/TRD specced the middle column as
per-VTZ **Trust-Score rings**; grounded against what the engine carries, this is REPLACED and the plan below
reflects the grounded design:
- **Trust score is REMOVED** (a legacy of the old architecture, dropped in the drawer's DR.1). The zone is
  colored by a **risk band** (green/yellow/red) derived from DETECTED ALERTS (the decision LOG:
  escalate -> red, candidate -> yellow, else green).
- **The middle column is a single Console-side "Public" placeholder VTZ** (all non-agent traffic routes
  through it; real Forge VTZ + agent zones land later -- a named cross-repo deferral), colored by that risk
  band. There are NO per-VTZ score rings.
- **`overview.graph` is LIVE, not a pending LOG aggregation.** Its backend is the crdb
  `IP-CONSOLE-CONNECTIVITY` producer (`CONNECTIVITY_GRAPH` over `:7878`, landed CN.1-CN.N): a tenant-wide
  roll-up of the LEG `ConnectsTo` graph (fed by torch's 4-octet TCP/IP capture; netflow enriches later) into
  source-class/destination-class nodes + weighted edges + a risk band. O1.2 below is therefore satisfied
  cross-repo, not deferred.

## Prerequisites (what P1.3 leans on)

- **P1.1 `IP-CONSOLE-12` Entity drawer (`TRD-CONSOLE-12`)** -- the click-through target (step O1.6). If the
  drawer IP has not landed, O1.6 lands a minimal drawer body and the full drawer supersedes it; the
  Overview does not block on it for O1.1-O1.5.
- **P1.2 `IP-CONSOLE-09` Logs (`TRD-CONSOLE-09`)** -- the **LOG substrate** the graph aggregates. The
  `overview.graph` aggregation reads the same LEG/LOG connectivity decision records the Logs stream
  surfaces row-level. If the LOG is not yet populated with connectivity records, O1.2 is `PENDING` behind
  the LOG being written (named in the ledger), and the surface renders the honest empty/unavailable state.
- **Phase 0** (all landed): `@forge/contracts` (F0.1), the design system (F0.2), the BFF + wire client
  (F0.3), the binding registry + `test:contract` (F0.4), the operator auth + `OperatorEngine` facade
  (F0.5), the polling live-store (F0.6), the admin plane + browsable `:8443` (F0.7 / the SPA-serving
  enabler), the SPA shell with the Overview `SurfacePlaceholder` (F0.8).

## INV-CROSS -- the bindings and their backend

Per `IP-CONSOLE-ROADMAP` Section 6, the plan owns the backend work. The Overview's bindings:

| Binding | Real today? | Backend / note |
|---------|-------------|----------------|
| `overview.graph` | **LIVE** -- the tenant-wide connectivity roll-up (source-class/destination-class counts, weighted source->dest edges, a risk band), bounded + time-windowed engine-side | crdb `IP-CONSOLE-CONNECTIVITY` (`CONNECTIVITY_GRAPH`, CN.1-CN.N, landed). op `connectivity_graph_v1`. NO trust score; the risk band colors the "Public" zone. |
| `overview.entityConnections(entityId)` | **LIVE** -- a scoped read for one entity's outbound connections (destination + observed-at) | crdb `ENTITY_CONNECTIONS` (IP-CONSOLE-ENTITY-READ ER.5). op `entity_connections_v1`; feeds the hover highlight + drawer prefetch. |
| `overview.live` | **v1: polling** -- the F0.6 live-store polls `overview.graph` on a short interval and diffs; **`PENDING`**: the real push-stream is crdb Part B (banked). The surface swaps to push without changing | crdb -- the bounded connectivity SUBSCRIBE surface (`IP-CONSOLE-READINESS` Part B, deferred). |
| `entity.isolate` (drawer Quick Action) | **command real; enforcement OFF** | torch/forge -- the containment command is real; **live kernel-level (BPF-LSM) enforcement is AG.7, deliberately off** (observe/quarantine posture). The action is audited + reflected; it does not fabricate enforcement. |

## Roster

One PR per row; each a named slice of `INV-CONSOLE-OVERVIEW-LIVE`, the full `scripts/ci.sh` green,
branch-per-PR, no-ff merge, docs separate from code, reviewed before the next.

| Step | Invariant | Deliverable |
|------|-----------|-------------|
| **O1.1** | `INV-CONSOLE-OVERVIEW-CONTRACT` | The graph contract. `@forge/contracts`: the `OverviewGraph` view model -- source nodes `{class, count}`, dest nodes `{class, count}`, edges `{sourceClass, destClass, weight}`, a `risk` band `{level, escalate, candidate, observe}` (NO trust score) -- typed against the generated `WireConnectivityGraph` DTO via a shared projection (a drifted wire field fails the type check: the six-bug cross-module guard); plus the `OverviewQuery` filter. `@forge/bindings`: register `overview.graph` (LIVE, `connectivity_graph_v1`) + `overview.entityConnections` (LIVE, `entity_connections_v1`) + `overview.live` (`PENDING`, crdb Part B push). Re-syncs the vendored crdb wire schema + regenerates the DTOs. `test:contract` covers it. No renderer yet. |
| **O1.2** | `INV-CONSOLE-OVERVIEW-AGGREGATION` (INV-CROSS) | The connectivity aggregation. **SATISFIED cross-repo** by crdb `IP-CONSOLE-CONNECTIVITY` (`CONNECTIVITY_GRAPH`, CN.1-CN.N, landed): a tenant-wide scan of the LEG `ConnectsTo` graph (torch 4-octet capture) rolled up into source-class/destination-class nodes + weighted edges + a risk band, bounded + windowed, aggregated engine-side (the browser never gets raw edges); operator-delegated + query-exposure-gated + tenant-private. Cite the crdb commits; no FC code (the O1.3 route consumes it). |
| **O1.3** | `INV-CONSOLE-OVERVIEW-BROKERED` | The BFF read routes. `overview.graph` + `overview.entityConnections(entityId)` over the `OperatorEngine` facade (F0.5b) -- brokered under the operator Principal, tier-redacted, short-TTL cached, timeout-bounded. Wires the O1.1 bindings to the crdb `CONNECTIVITY_GRAPH` / `ENTITY_CONNECTIONS` reads via the wire client + the shared `toOverviewGraph` projection. Fail-closed to the unavailable state on an engine error or an unknown risk-level tag (no fabricated graph). |
| **O1.4** | `INV-CONSOLE-OVERVIEW-RENDERER` | The flow-graph renderer (design system). The three-column flow component in `@forge/design`: source / **"Public" zone** / dest columns, edge color by source class (Users blue / Devices teal / AI Agents purple / zone->dest amber) + weight/opacity by volume, the faint honeycomb field. The middle zone is a single band colored by the graph's **risk level** (green/yellow/red) -- NO per-VTZ score rings. Data-driven from the O1.1 view model; semantic color only (no hex; hex-scan gate). Loading skeleton + the empty "no connectivity observed" state. Perf: warm mount < 300 ms, delta apply non-janky. |
| **O1.5** | `INV-CONSOLE-OVERVIEW-SURFACE` | The Overview surface. Replace the F0.8 `SurfacePlaceholder` with the real surface: mount the graph from `overview.graph`; the **All / Users / Devices / AI Agents** tabs (an in-place source-class filter, not a navigation); the Live badge; the risk-colored "Public" zone. The four `TRD-CONSOLE-01` Section 7 states (loading / empty / stale / unavailable), each honest. (Saved views defer to a later step; not on the P1.3 critical path.) |
| **O1.6** | `INV-CONSOLE-3-CLICKS` | Interaction + the drawer. Hover a node/flow -> the path highlights + the rest dims + a tooltip (entity + connection count + Trust) + a drawer prefetch (`overview.entityConnections`); click an entity -> the **entity drawer** (`IP-CONSOLE-12`, reused; a minimal body only if P1.1 has not yet landed) with the entity's real data + Quick Actions (Isolate from network = `entity.isolate`, audited, enforcement OFF); click a VTZ ring -> navigate to that zone (`TRD-CONSOLE-02`). The two canonical <=3-click tasks (inspect entity + its connections; isolate a misbehaving agent -> confirm) proven by contract. |
| **O1.7** | `INV-CONSOLE-LIVE` | Live deltas. `overview.live` applies deltas to node counts / VTZ scores / edge weights **in place** (< 2 s freshness) over the F0.6 live-store; the stale "reconnecting" marker on the Live badge on stream lag; reconnect + resync from the engine (last-known graph stays, never a wipe). v1 is short-interval `overview.graph` polling; the push-stream (crdb Part B) swaps in without touching the surface. |
| **O1.N** | `INV-CONSOLE-OVERVIEW-COMPLETE` | The capstone. Playwright E2E of the flagship canonical tasks (inspect an entity + its live connections; isolate a misbehaving agent -> confirm) over the real graph; the fixtureless empty-tenant render (no fabricated element); a connection committed at the engine appears on the graph < 2 s. All `TRD-CONSOLE-01` Section 8 acceptance rows green. Phase 1 Overview exit. |

## Sequencing note

O1.1 -> O1.3 build the data path (contract -> aggregation -> brokered routes); O1.4 -> O1.5 build the
rendered surface; O1.6 -> O1.7 the interaction + live. O1.4 (the renderer) can proceed in parallel with
O1.2/O1.3 against the O1.1 view-model fixtures (the empty/loading states need no live data). The surface
ships its non-`PENDING` parts on P1.3; `overview.live` push and `entity.isolate` live enforcement flip on
when their engine tasks land (both tracked here + in `IP-CONSOLE-ROADMAP` Section 6).

## Acceptance (from `TRD-CONSOLE-01` Section 8)

- Every node count, risk band, and edge derives from a real `overview.graph` aggregation over the
  connectivity graph; no fabricated element (contract test + a fixtureless render on an empty tenant).
- A new connection committed at the engine appears/updates on the graph within 2 s via the stream.
- Clicking any entity opens the drawer with that entity's real data; the two canonical <=3-click tasks
  pass E2E.
- Failure semantics: an engine error renders the unavailable state (no fabricated graph); a stream
  disconnect marks stale + reconnects + resyncs; an entity the operator cannot authorize does not render
  a drawer beyond its EXPLAIN tier.
