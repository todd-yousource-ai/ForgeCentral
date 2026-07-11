# IP-CONSOLE-01-OVERVIEW -- landing ledger

Per-PR landing record for `IP-CONSOLE-01-OVERVIEW.md` (the live connectivity graph, `TRD-CONSOLE-01`,
roadmap P1.3). One PR per roster row, a named slice of `INV-CONSOLE-OVERVIEW-LIVE`, the full
`scripts/ci.sh` green, branch-per-PR off local `main`, no-ff merge, push to `origin`, docs separate from
code. Reviewed with the maintainer before each merge.

Status: **OPEN -- not started.** Prerequisites: P1.1 `IP-CONSOLE-12` (drawer) + P1.2 `IP-CONSOLE-09`
(Logs/LOG substrate); the Overview does not block on the drawer for O1.1-O1.5, and O1.2 is `PENDING`
behind the LOG carrying connectivity records. Phase 0 foundation + the browsable `:8443` enabler are
landed.

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| O1.1 | INV-CONSOLE-OVERVIEW-CONTRACT | OPEN | -- | The `OverviewGraph` view model in `@forge/contracts` (typed against the LOG DTO) + the `overview.*` binding-registry entries + `test:contract`. |
| O1.2 | INV-CONSOLE-OVERVIEW-AGGREGATION (INV-CROSS) | OPEN | -- | The parameterized CrucibleQL LOG aggregation `overview.graph` runs (crdb; extend CrucibleQL only if not expressible). `PENDING` until the LOG carries connectivity records. |
| O1.3 | INV-CONSOLE-OVERVIEW-BROKERED | OPEN | -- | The BFF `overview.graph` + `overview.entityConnections` routes over `OperatorEngine`, tier-redacted, cached, bounded, fail-closed to unavailable. |
| O1.4 | INV-CONSOLE-OVERVIEW-RENDERER | OPEN | -- | The canvas/WebGL three-column Sankey flow component in `@forge/design` (score rings, honeycomb, source-class edge color/weight); semantic color only; loading + empty states; warm mount < 300 ms. |
| O1.5 | INV-CONSOLE-OVERVIEW-SURFACE | OPEN | -- | The real Overview surface (replaces the F0.8 placeholder): mount + tabs (source-class filter) + saved views + the four states. |
| O1.6 | INV-CONSOLE-3-CLICKS | OPEN | -- | Hover highlight + tooltip + drawer prefetch; click entity -> the drawer (`TRD-CONSOLE-12`) + Quick Actions; VTZ ring -> zone nav; the two canonical <=3-click tasks by contract. |
| O1.7 | INV-CONSOLE-LIVE | OPEN | -- | `overview.live` applies deltas in place (< 2 s) over the F0.6 live-store; stale/reconnect/resync; push-stream swap-in later. |
| O1.N | INV-CONSOLE-OVERVIEW-COMPLETE | OPEN | -- | Playwright E2E of the flagship tasks + the fixtureless empty-tenant render + a < 2 s live delta; all `TRD-CONSOLE-01` Section 8 acceptance rows green. |
