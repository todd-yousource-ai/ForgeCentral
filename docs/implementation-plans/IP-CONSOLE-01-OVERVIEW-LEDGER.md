# IP-CONSOLE-01-OVERVIEW -- landing ledger

Per-PR landing record for `IP-CONSOLE-01-OVERVIEW.md` (the live connectivity graph, `TRD-CONSOLE-01`,
roadmap P1.3). One PR per roster row, a named slice of `INV-CONSOLE-OVERVIEW-LIVE`, the full
`scripts/ci.sh` green, branch-per-PR off local `main`, no-ff merge, push to `origin`, docs separate from
code. Reviewed with the maintainer before each merge.

Status: **IN PROGRESS -- interactive + live + E2E-capstoned (O1.6 <=3-click, O1.7 live deltas, and overflow honesty all LANDED through PR-4). ONLY OPEN: O1.N (PR-5), the formal `TRD-CONSOLE-01` Section 8 acceptance capstone -- much already proven by `overview.spec.ts` (both flagship tasks + the <2s live delta) + the empty-tenant render test.**
The data path (O1.1/O1.3), the renderer + surface (superseded by the Sankey redesign RD.1/RD.2/RD.4a/RD.4b),
and a run of post-redesign polish (reverse-DNS naming, the four-ring classifier, distinct counts, the VTZ
profile, the request bound) are all LANDED. The crdb INV-CROSS substrate (O1.2 aggregation, RD.3 VTZ
dimension + agent routing, the live overlay, volume-weighted edges) is SATISFIED. **Remaining to close
P1.3: O1.6 (interaction + click-through to the drawer, the <=3-click flagship), O1.7 (live deltas -- the
surface today shows "Live channel not enabled yet"), the "+N more" overflow-honesty fix, and O1.N (the
Playwright E2E + `TRD-CONSOLE-01` Section 8 acceptance capstone).** The finish-up PR plan is Section "PR
PLAN" below.

## Original roster (O1.x)

> O1.4/O1.5 (the three-column "Public placeholder" renderer + surface) were SUPERSEDED by the Sankey
> redesign (RD.x) -- they landed, then RD.4b swapped the render path. They stay recorded as landed history.

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| O1.1 | INV-CONSOLE-OVERVIEW-CONTRACT | LANDED | `36a3ff1` | Vendored crdb wire schema re-synced + `wire-dto.ts` regenerated (`WireConnectivityQuery`/`Graph`/`ConnClass`/`ConnEdge`/`RiskBand`). `@forge/contracts` `overview.ts` view models + shared `toOverviewGraph`/`toRiskBand`/`toRiskLevel` projection (fails closed on an unknown risk tag). `@forge/bindings`: `overview.graph` (LIVE) + `overview.entityConnections` (LIVE) + `overview.live` (PENDING). Contract tests on both packages. |
| O1.2 | INV-CONSOLE-OVERVIEW-AGGREGATION (INV-CROSS) | SATISFIED (crdb) | crdb `f344aaff`/`d7884070` | The tenant-wide connectivity aggregation is the crdb `IP-CONSOLE-CONNECTIVITY` producer (`CONNECTIVITY_GRAPH`, CN.1-CN.N): LEG `ConnectsTo` roll-up -> class nodes + weighted edges + risk band, bounded + tenant-private + exposure-gated, live over `:7878`. No FC code. |
| O1.3 | INV-CONSOLE-OVERVIEW-BROKERED | LANDED | `6e1afab` | BFF `overview.graph` over `OperatorEngine`: `GET /api/overview/graph` brokers the tenant-wide `CONNECTIVITY_GRAPH` read + shared projection. `@forge/wire`: byte-exact CBOR encoder proven against the crdb CN.2 golden. Session/engine-gated, bounded, tenant-scoped short-TTL cache, fail-closed mapping. NOTE: `overview.entityConnections` deferred to O1.6 (no consumer yet -- shipping an unconsumed route would be a stub). |
| O1.4 | INV-CONSOLE-OVERVIEW-RENDERER | LANDED (superseded by RD.2) | `5f9ca8b` | `@forge/design` `OverviewFlow`: three-column connectivity flow as static SVG, source/risk-zone/dest columns, honeycomb ambient, semantic-token color only, four honest states, a11y `role="img"`. 7 tests. |
| O1.5 | INV-CONSOLE-OVERVIEW-SURFACE | LANDED (superseded by RD.4b) | `d399c30` | Real Overview surface replaced the F0.8 placeholder; `useOverview` (TanStack Query) reads `GET /api/overview/graph`; risk header badge + source-class lane tabs (view filter); four honest states; registered in `routing/routes.tsx`; `no-stub` `REAL_SURFACES += overview`. |
| O1.6 | INV-CONSOLE-3-CLICKS | **LANDED** | PR-1..PR-2c-2 | Interaction + click-through to the drawer + the two canonical <=3-click tasks. PR-1 (O1.6a data path) + PR-2a (crdb CONNECTIVITY_MEMBERS) + PR-2b (FC data path) + PR-2c-1 (drawer LIST->detail) + PR-2c-2 (node hover + source highlight + Playwright <=3-click capstone) all LANDED. Both operator tasks proven in a real browser (`overview.spec.ts`). See PR plan below. |
| O1.7 | INV-CONSOLE-LIVE | **LANDED** | `7255f02` | Live deltas (<2s): the Overview re-polls `/api/overview/sankey` every 2s applying the result in place (counts/VTZ risk/edge weights update; last-known graph stays -- no wipe), drives the shared live-store from the poll (real Live badge; reconnecting marker on lag; honest "Not live" when no surface drives freshness), and Playwright proves a count updates in place. PR-3. |
| O1.N | INV-CONSOLE-OVERVIEW-COMPLETE | **OPEN** | -- | Playwright E2E of the flagship tasks + `TRD-CONSOLE-01` Section 8 acceptance. See PR plan PR-5. |

## Sankey redesign roster (RD.x) -- design LOCKED 2026-07-14, the CURRENT render path

A user-driven redesign into a true three-column Sankey: source-class rings -> up to 3 VTZ corona nodes
(each with its OWN detection-driven risk band) -> destination-category rings. The three demo VTZs
(`Demo.Users.Public` = all other traffic, `Demo.Private.Agent` = Demo Agent, `Demo.Public.Agent` =
Claude Code + Codex) are permanent live config.

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| RD.1 | INV-CONSOLE-OVERVIEW-SANKEY-CONTRACT | LANDED | `123078b` | `@forge/contracts` `OverviewSankey` v2 view model: `sources`/`vtzs` (per-VTZ risk)/`destinations` (`apps` + `moreCount`) + two-stage `sourceEdges`/`destEdges`. Paging + `overviewHighlight` helpers. 3 contract tests. |
| RD.2 | INV-CONSOLE-OVERVIEW-SANKEY-RENDERER | LANDED | `ddc0beb` | `@forge/design` `OverviewSankeyFlow`: source dotted-mist rings -> up to 3 VTZ corona nodes (risk tint) -> amber dest rings; two-stage ribbons with a radial-hole mask + sorted ports (no crossings); hover-a-destination linked highlight; semantic-token color only; loading/empty states; a11y name. 5 tests. |
| RD.3 | INV-CONSOLE-CONNECTIVITY-VTZ (crdb INV-CROSS) | **SATISFIED (crdb)** | crdb `ae4a5aec` (PR-3) + IP-CONSOLE-AGENT-CONNECTIVITY PR-0..4 | crdb `CONNECTIVITY_GRAPH` gained the VTZ dimension: source->VTZ->dest via VTZ assignment, per-VTZ risk from detections, the 3 demo VTZs seeded as permanent config; agents routed to VTZs by resolved AIG label. Live-proven on the box (3 VTZs render with detection-driven risk). |
| RD.4a | INV-CONSOLE-OVERVIEW-SANKEY-BROKERED | LANDED | `68fc32a` | Re-synced wire (`WireConnectivityGraph` gains `vtzs`/`source_edges`/`dest_edges`); `toOverviewSankey` projection (fail-closed); BFF `resolveOverviewSankey` + `GET /api/overview/sankey`; contract + resolver/route tests. |
| RD.4b | INV-CONSOLE-OVERVIEW-SANKEY-SURFACE | LANDED | `7c2b08d` | `useOverview` reads `/api/overview/sankey`; `OverviewSurface` mounts `OverviewSankeyFlow` with VTZ paging, hover-a-destination linked highlight, worst-zone risk badge; retired the lane-tab/`OverviewFlow` path. Design + surface tests (17) + Playwright e2e green. |
| RD.5 | INV-CONSOLE-OVERVIEW-APPS-DNS | **LANDED** | `8671c0f` + `d3a072d` + `b9d5c52` | Named destinations, four rings, same-host merge -- see the polish table below (RD.5 is the sum of those three PRs). App names now render live (Cloudflare DNS / Google DNS / GitHub / Postgres / Redis / ...). |

## Post-redesign polish (LANDED -- previously unrostered)

Real work that shipped after RD.4b and belongs to P1.3's Overview surface; recorded here for provenance.

| PR | What landed | Commit | crdb counterpart |
|----|-------------|--------|------------------|
| Honeycomb dim | Dim the honeycomb backdrop so the flow reads (canvas-color color-mix scrim) | `b2cc2fa` | -- |
| Reverse-DNS names (RD.5) | Name the top destinations via BFF `ReverseDnsResolver` (cached + background batch PTR); top-5 + clickable fan-out ("+N more") | `8671c0f` | crdb `27f89a62` (`top_destinations` on `CONNECTIVITY_GRAPH`) |
| Four-ring classifier (RD.5) | BFF `destination-classifier.ts`: port/IP-based buckets -> Network / SaaS / Private Apps / Data Stores; `toOverviewSankey` re-buckets the flat network class into 4 rings + merges same-named apps | `d3a072d` | crdb `c8faebb5` (sensor_edge derives `ip:port` endpoint id so port classification can fire) |
| Same-host merge (RD.5) | Merge same-host destinations + dedupe the single "+N more" affordance | `b9d5c52` | -- |
| VTZ profile (PR-3b) | Surface the VTZ enforcement profile (Observe default) on the zone corona | `81fb445` | crdb `d67806aa` |
| Distinct counts + truncation | Ring nodes count distinct entities (never edges) + surface the engine `truncated` flag as a badge | `b8069eb` | crdb `59316de8` + `2bdd81ff` |
| Request bound 10k | Raise the Console connectivity request bound 1000 -> 10k (operator steer) | `84cfff8` | crdb scan ceiling 25k (`3aef2160`) |
| Volume-weighted edges (INV-CROSS) | Ribbon width by real octets/packets | (consumes) | crdb PR-A `19e35097` + PR-B `a2c0fbaa` |
| Live overlay (INV-CROSS, O1.7 substrate) | Scan-free Overview reads from an in-memory commit-observer overlay | (consumes at O1.7) | crdb `81b6d2d2` |
| Retire `/api/overview/graph` (O1.3/O1.5 route) | The pre-redesign flat route + its whole chain removed: BFF route arm + `resolveOverviewGraph`, contracts `OverviewGraph`/`OverviewClassNode`/`OverviewEdge`/`toClassNode`/`toEdge`/`toOverviewGraph`, design `OverviewFlow`; bindings `overview.graph`/`overview.live` view models re-pointed to `OverviewSankey` (the engine op `connectivity_graph_v1` is unchanged -- the Sankey route brokers it). RD.4b retired the SPA consumer; an unconsumed route is a stub in reverse (`INV-CONSOLE-NO-STUB`), so the route follows. The shared-behavior coverage (401 / 503 / unknown-tag / cache identity / cache tenant-keying) migrated to `/api/overview/sankey`, never deleted. O1.3/O1.5 stay LANDED above as history. | (this PR) | -- |

---

# PR PLAN -- remaining to complete P1.3 (Overview)

Five PRs close the flagship. One PR at a time, branch-per-PR through `scripts/ci.sh`, no-ff merge, docs
separate from code, reviewed before the next. Each names its TRD acceptance row + invariant. The surface
in question is the Sankey (`OverviewSurface.tsx` / `OverviewSankeyFlow`); O1.4/O1.5's retired renderer is
not touched.

| PR | Step | Invariant | Scope | Acceptance |
|----|------|-----------|-------|-----------|
| **PR-1** ✅ **LANDED** (this PR) | O1.6a | `INV-CONSOLE-OVERVIEW-BROKERED` (extends O1.3) | The `overview.entityConnections` read path deferred at O1.3: `@forge/wire` `EntityConnections` request/reply + byte-exact CBOR (crdb `ENTITY_CONNECTIONS` golden); `wire-client` + `operator-engine.entityConnections`; BFF `GET /api/overview/entity-connections?id=` -> a `ConnectionList` view model (`toConnectionList` projection, bounded, tier-redacted, fail-closed); session/engine-gated, tenant-scoped cache. No UI yet -- lands with its consumer in PR-2 (contract-tested route). | Route 200/401/503/unavailable/tenant-isolation; projection + empty + unknown-tag; wire byte-exact vectors. |
**PR-2 RE-SCOPED 2026-07-17 (operator steer): the Sankey nodes are CLASS AGGREGATES, but the engine
`ENTITY_CONNECTIONS` + the drawer + Isolate are ENTITY-level (`handler.rs:2189` parses a concrete
`LegNodeKey`). A class node has no single entity to open. Operator decision: add a `class -> members`
engine read for ALL SEVEN containers (3 source classes agents/users/devices + 4 dest rings
network/saas/private-apps/data-stores), so clicking a container lists its member entities; open one ->
drawer + PR-1 connections + Isolate. This makes PR-2 a CROSS-REPO sequence:**

| **PR-2a (crdb)** ✅ **LANDED** (crdb `1330335b`) | CONNECTIVITY_MEMBERS | new engine read | `WireConnectivityMembers { request_id, operator?, class, limit }` -> `WireMemberList { members: [{ id, kind, display_name, connection_count }] }` (confirmed member fields: id/kind/name/connectionCount). Handler scans the tenant OUT `ConnectsTo` edges (the `aggregate_connectivity` scan, reusing `source_class`/`dest_class`/`source_entity_id`), collects the DISTINCT entities classifying to `class`, counts each entity's edges, returns top `limit` sorted desc; tenant-scoped, tier-redacted, delegation-gated (identical guardrails to `entity_connections`). Source classes returned directly (`users` -> empty, no substrate); dest rings: the BFF requests `class=network` and re-buckets with `destination-classifier.ts` (the 4 rings are a BFF re-bucket, not engine taxonomy). Wire DTO + `schema.rs` $defs + regen the vendored `wire-dto.schema.json` + golden vectors. | golden byte-exact; cyber `class_members` (per-class distinct + top-N + tier-redact); handler 200/refused/tenant-isolation. |
| **PR-2b (FC data path)** ✅ **LANDED** (`aa3b38e`) | O1.6b-1 | `INV-CONSOLE-OVERVIEW-BROKERED` | Regen `@forge/contracts` from the new schema; `OverviewMember`/`OverviewMemberList` + `toMemberList`; `operator-engine.connectivityMembers`; BFF `GET /api/overview/members?container=<agents\|users\|devices\|network\|saas\|private-apps\|data-stores>` -> maps source containers to the engine class directly, dest containers to `class=network` + re-bucket-filter with the classifier; session/engine-gated, tenant+container-scoped cache, fail-closed. No UI. | route 200/400/401/503/refused/tenant-cache; projection + dest re-bucket; wire byte-exact. |
| **PR-2c (FC UI)** ✅ **LANDED** (split: 2c-1 `c14acb0` + 2c-2 `1177084`) | O1.6b-2 | `INV-CONSOLE-3-CLICKS` | The interaction on `OverviewSankeyFlow` + `OverviewSurface` + the drawer, shipped as two PRs. **2c-1** (`c14acb0`): click a container -> the entity drawer in LIST mode (`ContainerMembersView`) over its members (via `/api/overview/members`); click a member -> the drawer swaps to that entity's detail (+ Isolate quick action, enforcement OFF) with a BACK affordance (`Drawer`/`EntityDrawer` `onBack`); rings mouse-clickable + a screen-reader/keyboard container nav (never mouse-only); `memberEntityRef` maps a member's LEG kind to the drawer ref. **2c-2** (`1177084`): node hover tooltips (label + count; VTZ risk + posture) + the RD.2 ribbon highlight extended to source-lane hover (`overviewHighlightSource`); the two <=3-click tasks proven in a real browser (`overview.spec.ts`). VTZ-ring -> zone nav still DEFERRED (`TRD-CONSOLE-02`). | design + surface tests for hover/tooltip/list-mode/member->detail/back/Isolate; both <=3-click tasks by contract + Playwright; full gate + 6-spec e2e green. |
| **PR-3** ✅ **LANDED** (`7255f02`) | O1.7 | `INV-CONSOLE-LIVE` | Live deltas over the F0.6 live-store: v1 short-interval re-poll of `/api/overview/sankey` applying deltas **in place** (node counts / VTZ risk / edge weights, no wipe); replace the "Live channel not enabled yet" banner with a real Live badge + a stale "reconnecting" marker on stream lag; reconnect + resync (last-known graph stays). The crdb live overlay (`81b6d2d2`) already makes the read scan-free; the crdb push-stream (`overview.live`, Part B) swaps in later without touching the surface. | A committed connection appears < 2 s; stale marker on lag; resync keeps last-known; surface + live-store tests. |
| **PR-4** ✅ **LANDED** (`2e31dc1`) | overflow-honesty | `INV-CONSOLE-OVERFLOW-HONEST` | Display-only: `OverviewSankeyFlow`'s collapsed ring overflow now sums BOTH tails -- hidden NAMED apps + the unnamed remainder (`moreCount`) -- so shown + overflow == the ring count (`+905 more`, not the under-telling `+16 more`). Data already in the view model; no BFF/wire/engine change. Design tests assert the sum + a 910/21-named/889-unnamed ring. The `IP-CONSOLE-01-MORECOUNT-HONESTY-DRAFT.md` draft is retired (implemented). | design unit tests: displayed + hidden-named + unnamed == ring count. |
| **PR-5** | O1.N | `INV-CONSOLE-OVERVIEW-COMPLETE` | The capstone: Playwright E2E of the two flagship tasks over the real graph (inspect an entity + its connections; isolate an agent -> confirm); the fixtureless empty-tenant render (no fabricated element); a connection committed at the engine visible < 2 s. All `TRD-CONSOLE-01` Section 8 acceptance rows green. Phase 1 Overview exit. | Playwright green on both journeys + empty-tenant + the < 2 s live delta; §8 rows checked off. |

**Deferred beyond P1.3 (tracked, not blocking the exit):**
- **Loopback destination treatment** -- the `127.0.0.1` self-traffic rollup on the Data Stores / Private
  Apps rings (operator decision pending; noted in the more-count draft as explicitly separate).
- **VTZ-ring -> zone navigation** (O1.6 clause) -- lands with `TRD-CONSOLE-02` (VTZ surface, Phase 3).
- **Push-stream live** (`overview.live` crdb Part B) -- swaps into PR-3's polling shell when the crdb
  push leg lands; the surface does not change.

**Sequence:** PR-1 -> PR-2 (data path then the click-through), then PR-3 (live), PR-4 (honesty, independent
-- can slot anywhere), PR-5 (E2E capstone last, once interaction + live are in). PR-1+PR-2 deliver the
flagship <=3-click value; PR-3 makes it live; PR-5 proves it.
