# IP-CONSOLE-12-ENTITY-DRAWER -- landing ledger

Per-PR landing record for `IP-CONSOLE-12-ENTITY-DRAWER.md` (the shared detail + quick-actions panel,
`TRD-CONSOLE-12`, roadmap **P1.1 -- the first Phase-1 surface**). One PR per roster row, a named slice of
`INV-CONSOLE-DRAWER-REAL`, the full `scripts/ci.sh` green, branch-per-PR off local `main`, no-ff merge,
push to `origin`, docs separate from code. Reviewed with the maintainer before each merge.

Status: **IN PROGRESS -- DR.1 landed.** No surface prerequisite (built first; Logs P1.2 + Overview P1.3
reuse it). Phase 0 foundation + the browsable `:8443` enabler are landed.

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| DR.1 | INV-CONSOLE-DRAWER-CONTRACT | LANDED | (this PR) | `@forge/contracts/src/entity.ts`: the entity ref (kind-branded union), the six section view models (header+trust, info, zones, capabilities, effective policies, recent decisions) as PROJECTIONS of the engine DTOs (`WireDecision`/`WireAuditEntry` + branded ids), the `SectionState<T>` envelope (ok/empty/not-applicable/pending/unauthorized/error, TRD-12 Sec 6), the aggregate `EntityDetailView`, and the quick-action command shapes (idempotent `commandId`; `IsolateEffect.enforcementActive=false`, AG.7 off). `@forge/bindings`: registered the 10 `entity.*` bindings -- 5 CrucibleQL section reads LIVE, `entity.capabilities` PENDING (torch DR.4 Construction Report read binding), `entity.isolate` LIVE audited command, `reassignZone`/`remediation`/`fullReport` PENDING (named gating surface). **Design note:** this puts the first tracked PENDING deferrals into the committed manifest, so `assertReleaseReady` now correctly gates a release; the F0.4 contract test inverted from "release-ready" to "dev-valid, only blocker is the named PENDING set" (the intended "PENDING passes DEV, fails release" behavior). Updated the F0.8 shell no-stub test (registry no longer empty; shell still consumes none of it -- drawer is DR.2). `test:contract` covers the registry; contracts `test/entity.test.ts` proves the DTO-projection typing. Full `scripts/ci.sh` green. |
| DR.2 | INV-CONSOLE-DRAWER-SHELL | OPEN | -- | The drawer body in `@forge/design` (header/ScoreRing/sparkline, info, zones, capabilities, policies, recent decisions, actions), section skeletons, semantic color, fixtures only. |
| DR.3 | INV-CONSOLE-DRAWER-BROKERED | OPEN | -- | The BFF read routes (`entity.header/info/zones/effectivePolicies/recentDecisions`) over `OperatorEngine`, tier-redacted, cached, per-section degrade. `recentDecisions` shares the P1.2 LOG substrate. |
| DR.4 | INV-CONSOLE-DRAWER-CAPABILITIES (INV-CROSS) | OPEN | -- | `entity.capabilities` binds the Torch Construction Report (crdb/torch). `PENDING` until the read binding lands; honest empty state. |
| DR.5 | INV-CONSOLE-DRAWER-ACTIONS | OPEN | -- | The quick-action commands (Isolate/Modify VTZ/View Remediation/Open report), audited + confirm-gated (destructive), enforcement OFF for isolate; denial paths tested; `PENDING` where a command is not exposed. |
| DR.6 | INV-CONSOLE-DRAWER-PREFETCH | OPEN | -- | The hover/select prefetch (< 100 ms open) + the unauthorized (tier-absent) state + the stale streaming marker. |
| DR.N | INV-CONSOLE-DRAWER-COMPLETE | OPEN | -- | Playwright E2E: open + real sections + a confirm-gated audited action + tier-gating; all `TRD-CONSOLE-12` Section 7 acceptance rows green. |
