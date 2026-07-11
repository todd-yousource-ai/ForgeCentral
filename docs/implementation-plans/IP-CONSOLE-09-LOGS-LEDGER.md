# IP-CONSOLE-09-LOGS -- landing ledger

Per-PR landing record for `IP-CONSOLE-09-LOGS.md` (the decision/audit LOG stream, `TRD-CONSOLE-09`,
roadmap **P1.2 -- the second Phase-1 surface**). One PR per roster row, a named slice of
`INV-CONSOLE-LOGS-REAL`, the full `scripts/ci.sh` green, branch-per-PR off local `main`, no-ff merge,
push to `origin`, docs separate from code. Reviewed with the maintainer before each merge.

Status: **OPEN -- not started.** Prerequisite: P1.1 `IP-CONSOLE-12` (drawer, for the row click). This
surface establishes the LOG substrate the Overview (P1.3) aggregates. Phase 0 + the `:8443` enabler are
landed.

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| LG.1 | INV-CONSOLE-LOGS-CONTRACT | OPEN | -- | The `LogRow` view model (typed vs the DecisionObject DTO) + `logs.query/tail/explain/export` shapes in `@forge/contracts`; binding-registry entries; `test:contract`. |
| LG.2 | INV-CONSOLE-LOGS-QUERY (the LOG substrate) | OPEN | -- | `logs.query` = parameterized CrucibleQL over the LOG (range + filters + search -> predicate), cursor-paged, engine-side; BFF route over `OperatorEngine`. The read the Overview aggregates. |
| LG.3 | INV-CONSOLE-LOGS-TABLE | OPEN | -- | The virtualized server-paged table + the filter/search/time-range controls compiling to the query; loading + empty states. |
| LG.4 | INV-CONSOLE-LIVE | OPEN | -- | `logs.tail` deltas prepended in place (< 2 s); stale/reconnect/resync; v1 polling, push (crdb Part B) later. |
| LG.5 | INV-CONSOLE-3-CLICKS | OPEN | -- | Row -> entity drawer (`IP-CONSOLE-12`); decision cell -> EXPLAIN inline; row -> Rewind deep-link (`PENDING` until Phase 2); the canonical tasks. |
| LG.6 | INV-CONSOLE-LOGS-EXPORT | OPEN | -- | `logs.export` = a real audited engine export of the filtered set, bounded/streamed, on the audit chain. |
| LG.N | INV-CONSOLE-LOGS-COMPLETE | OPEN | -- | Playwright E2E: real table + engine-side filter + < 2 s new decision + row->drawer + decision->EXPLAIN; all `TRD-CONSOLE-09` Section 8 rows green. Proves the LOG substrate for P1.3. |
