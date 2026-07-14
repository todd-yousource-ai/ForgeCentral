# IP-CONSOLE-01-OVERVIEW -- landing ledger

Per-PR landing record for `IP-CONSOLE-01-OVERVIEW.md` (the live connectivity graph, `TRD-CONSOLE-01`,
roadmap P1.3). One PR per roster row, a named slice of `INV-CONSOLE-OVERVIEW-LIVE`, the full
`scripts/ci.sh` green, branch-per-PR off local `main`, no-ff merge, push to `origin`, docs separate from
code. Reviewed with the maintainer before each merge.

Status: **IN PROGRESS -- O1.1 landed; grounded reshape (risk band, "Public" placeholder VTZ, crdb
CONNECTIVITY_GRAPH substrate) applied.** Prerequisites: P1.1 `IP-CONSOLE-12` (drawer) + P1.2 `IP-CONSOLE-09`
(Logs) landed; O1.2 is SATISFIED cross-repo by crdb `IP-CONSOLE-CONNECTIVITY` (CN.1-CN.N). Phase 0
foundation + the browsable `:8443` enabler are landed.

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| O1.1 | INV-CONSOLE-OVERVIEW-CONTRACT | LANDED | `36a3ff1` | Re-synced the vendored crdb wire schema (+ regenerated `wire-dto.ts` with `WireConnectivityQuery`/`Graph`/`ConnClass`/`ConnEdge`/`RiskBand` + the `ConnectivityGraph` request/reply variants). `@forge/contracts` `overview.ts`: `OverviewGraph`/`OverviewClassNode`/`OverviewEdge`/`OverviewRiskBand`/`RiskLevel`/`OverviewQuery` view models + the shared `toOverviewGraph`/`toRiskBand`/`toRiskLevel`/`toClassNode`/`toEdge` projection (typed against the generated DTO, fails closed on an unknown risk-level tag). `@forge/bindings`: `overview.graph` (LIVE, `connectivity_graph_v1`) + `overview.entityConnections` (LIVE, `entity_connections_v1`) + `overview.live` (PENDING, crdb Part B). Contract tests on both packages (projection + empty-tenant green + unknown-tag fail-closed; binding registration + LIVE/PENDING). |
| O1.2 | INV-CONSOLE-OVERVIEW-AGGREGATION (INV-CROSS) | SATISFIED (crdb) | crdb `f344aaff`/`d7884070` | The tenant-wide connectivity aggregation is the crdb `IP-CONSOLE-CONNECTIVITY` producer (`CONNECTIVITY_GRAPH`, CN.1-CN.N): LEG `ConnectsTo` roll-up -> source/dest class nodes + weighted edges + risk band, bounded + tenant-private + exposure-gated, live over `:7878`. No FC code; the O1.3 route consumes it. |
| O1.3 | INV-CONSOLE-OVERVIEW-BROKERED | OPEN | -- | The BFF `overview.graph` + `overview.entityConnections` routes over `OperatorEngine`, tier-redacted, cached, bounded, fail-closed to unavailable. |
| O1.4 | INV-CONSOLE-OVERVIEW-RENDERER | OPEN | -- | The three-column flow component in `@forge/design`: source / risk-colored "Public" zone / dest columns (NO per-VTZ score rings), honeycomb field, source-class edge color/weight; semantic color only; loading + empty states; warm mount < 300 ms. |
| O1.5 | INV-CONSOLE-OVERVIEW-SURFACE | OPEN | -- | The real Overview surface (replaces the F0.8 placeholder): mount + source-class tabs + the risk-colored "Public" zone + the four states (saved views deferred, off the P1.3 critical path). |
| O1.6 | INV-CONSOLE-3-CLICKS | OPEN | -- | Hover highlight + tooltip + drawer prefetch (`overview.entityConnections`); click entity -> the drawer (`TRD-CONSOLE-12`) + Quick Actions; the two canonical <=3-click tasks by contract (zone nav deferred with the real VTZ store). |
| O1.7 | INV-CONSOLE-LIVE | OPEN | -- | `overview.live` applies deltas in place (< 2 s) over the F0.6 live-store; stale/reconnect/resync; push-stream swap-in later. |
| O1.N | INV-CONSOLE-OVERVIEW-COMPLETE | OPEN | -- | Playwright E2E of the flagship tasks + the fixtureless empty-tenant render + a < 2 s live delta; all `TRD-CONSOLE-01` Section 8 acceptance rows green. |
