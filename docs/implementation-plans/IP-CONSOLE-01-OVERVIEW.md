# IP-CONSOLE-01-OVERVIEW -- the live connectivity graph (home)

The implementation plan for `TRD-CONSOLE-01` (Overview): the product's flagship surface -- a live,
three-column flow graph of the actual connectivity across the platform, a **live projection of the
Crucible connectivity LOG**, not a drawn diagram. Roadmap step **P1.3**. Read with `TRD-CONSOLE-01`
(the contract), `TRD-CONSOLE-00` Section 6 (design system / score ring / honeycomb) + Section 7 (the
drawer + prefetch), and the mocks `shot-01`/`shot-13`/`shot-14` (`docs/ui-examples/`).

**Named invariant:** `INV-CONSOLE-OVERVIEW-LIVE` -- every node, edge, count, and Trust Score derives from
a real `overview.graph` aggregation over the LOG; an empty platform renders an empty graph ("no
connectivity observed"), never a sample node; a new connection at the engine appears on the graph within
2 s. Composed of the per-step invariants below.

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
| `overview.graph` | **yes** -- a CrucibleQL aggregation over the LOG (source-class counts, VTZ Trust Scores, weighted source->VTZ->dest edges), bounded + time-windowed engine-side | crdb -- a parameterized CrucibleQL read; **extend CrucibleQL** (the preferred cross-surface work) only if the aggregation is not expressible. Depends on the LOG substrate (P1.2). |
| `overview.entityConnections(entityId)` | **yes** -- a scoped CrucibleQL read for one entity's connections (count + Trust + zones/dests) | crdb -- CrucibleQL read; feeds the hover highlight + drawer prefetch. |
| `overview.live` | **v1: polling** -- the F0.6 live-store polls `overview.graph` on a short interval and diffs; **`PENDING`**: the real push-stream is crdb Part B (banked). The surface swaps to push without changing | crdb -- the bounded decision/audit SUBSCRIBE surface (`IP-CONSOLE-READINESS` Part B, deferred). |
| `overview.savedViews` (View 1 / View 2) | **yes** -- a Crucible-stored UI preference on the operator Principal (NOT a Console store; `INV-CONSOLE-NO-2ND-DB`) | crdb -- a per-operator preference read/write over `:7878`. |
| `entity.isolate` (drawer Quick Action) | **command real; enforcement OFF** | torch/forge -- the containment command is real; **live kernel-level (BPF-LSM) enforcement is AG.7, deliberately off** (observe/quarantine posture). The action is audited + reflected; it does not fabricate enforcement. |

## Roster

One PR per row; each a named slice of `INV-CONSOLE-OVERVIEW-LIVE`, the full `scripts/ci.sh` green,
branch-per-PR, no-ff merge, docs separate from code, reviewed before the next.

| Step | Invariant | Deliverable |
|------|-----------|-------------|
| **O1.1** | `INV-CONSOLE-OVERVIEW-CONTRACT` | The graph contract. `@forge/contracts`: the `OverviewGraph` view model -- source nodes `{class, liveCount}`, VTZ nodes `{id, trustScore}`, dest nodes `{class, liveCount}`, edges `{from, to, volume, dominantDecision}` -- typed against the LOG DTO shape (a drifted LOG field fails the type check: the six-bug cross-module guard); plus `entityConnections` + the `overview.live` delta shape. `@forge/bindings`: register `overview.graph`/`overview.entityConnections`/`overview.live`/`overview.savedViews` (the ones without a live engine op marked `PENDING` with their owning task). `test:contract` covers it. No renderer yet. |
| **O1.2** | `INV-CONSOLE-OVERVIEW-AGGREGATION` (INV-CROSS) | The LOG aggregation. The parameterized CrucibleQL that `overview.graph` runs over the connectivity LOG (source-class counts, VTZ Trust Scores, weighted source->VTZ + VTZ->dest edges with volume + dominant decision), bounded + windowed, aggregated engine-side (the browser never gets raw LOG rows). Extend CrucibleQL in crdb only if not expressible; cite the crdb PR. `PENDING` (named) until the LOG carries connectivity records (P1.2). |
| **O1.3** | `INV-CONSOLE-OVERVIEW-BROKERED` | The BFF read routes. `overview.graph` + `overview.entityConnections(entityId)` over the `OperatorEngine` facade (F0.5b) -- brokered under the operator Principal, tier-redacted, short-TTL cached, timeout-bounded. Wires the O1.1 bindings to the O1.2 CrucibleQL. Fail-closed to the unavailable state on an engine error (no fabricated graph). |
| **O1.4** | `INV-CONSOLE-OVERVIEW-RENDERER` | The flow-graph renderer (design system). The canvas/WebGL three-column Sankey component in `@forge/design` (the flow-graph host deferred from F0.2c): source / VTZ / dest columns, the score ring per VTZ (green/amber/red), the faint honeycomb field, edge color by source class (Users blue / Devices teal / AI Agents purple / VTZ->dest amber) + weight/opacity by volume. Data-driven from the O1.1 view model; semantic color only (no hex; hex-scan gate). Loading skeleton + the empty "no connectivity observed" state. Perf: warm mount < 300 ms, delta apply non-janky. |
| **O1.5** | `INV-CONSOLE-OVERVIEW-SURFACE` | The Overview surface. Replace the F0.8 `SurfacePlaceholder` with the real surface: mount the graph from `overview.graph`; the **All / Users / Devices / AI Agents** tabs (an in-place source-class filter, not a navigation); **View 1 / View 2** saved views (`overview.savedViews`, the Crucible-stored operator preference); the Live badge. The four `TRD-CONSOLE-01` Section 7 states (loading / empty / stale / unavailable), each honest. |
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

- Every node count, VTZ score, and edge derives from a real `overview.graph` aggregation over the LOG; no
  fabricated element (contract test + a fixtureless render on an empty tenant).
- A new connection committed at the engine appears/updates on the graph within 2 s via the stream.
- Clicking any entity opens the drawer with that entity's real data; the two canonical <=3-click tasks
  pass E2E.
- Failure semantics: an engine error renders the unavailable state (no fabricated graph); a stream
  disconnect marks stale + reconnects + resyncs; an entity the operator cannot authorize does not render
  a drawer beyond its EXPLAIN tier.
