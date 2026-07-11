# IP-CONSOLE-12-ENTITY-DRAWER -- landing ledger

Per-PR landing record for `IP-CONSOLE-12-ENTITY-DRAWER.md` (the shared detail + quick-actions panel,
`TRD-CONSOLE-12`, roadmap **P1.1 -- the first Phase-1 surface**). One PR per roster row, a named slice of
`INV-CONSOLE-DRAWER-REAL`, the full `scripts/ci.sh` green, branch-per-PR off local `main`, no-ff merge,
push to `origin`, docs separate from code. Reviewed with the maintainer before each merge.

Status: **OPEN -- not started.** No surface prerequisite (built first; Logs P1.2 + Overview P1.3 reuse
it). Phase 0 foundation + the browsable `:8443` enabler are landed.

| Step | Invariant | Status | Commit | Proof |
|------|-----------|--------|--------|-------|
| DR.1 | INV-CONSOLE-DRAWER-CONTRACT | OPEN | -- | The section view models + quick-action shapes in `@forge/contracts`; `entity.*` binding-registry entries (capabilities/isolate/commands `PENDING`); `test:contract`. |
| DR.2 | INV-CONSOLE-DRAWER-SHELL | OPEN | -- | The drawer body in `@forge/design` (header/ScoreRing/sparkline, info, zones, capabilities, policies, recent decisions, actions), section skeletons, semantic color, fixtures only. |
| DR.3 | INV-CONSOLE-DRAWER-BROKERED | OPEN | -- | The BFF read routes (`entity.header/info/zones/effectivePolicies/recentDecisions`) over `OperatorEngine`, tier-redacted, cached, per-section degrade. `recentDecisions` shares the P1.2 LOG substrate. |
| DR.4 | INV-CONSOLE-DRAWER-CAPABILITIES (INV-CROSS) | OPEN | -- | `entity.capabilities` binds the Torch Construction Report (crdb/torch). `PENDING` until the read binding lands; honest empty state. |
| DR.5 | INV-CONSOLE-DRAWER-ACTIONS | OPEN | -- | The quick-action commands (Isolate/Modify VTZ/View Remediation/Open report), audited + confirm-gated (destructive), enforcement OFF for isolate; denial paths tested; `PENDING` where a command is not exposed. |
| DR.6 | INV-CONSOLE-DRAWER-PREFETCH | OPEN | -- | The hover/select prefetch (< 100 ms open) + the unauthorized (tier-absent) state + the stale streaming marker. |
| DR.N | INV-CONSOLE-DRAWER-COMPLETE | OPEN | -- | Playwright E2E: open + real sections + a confirm-gated audited action + tier-gating; all `TRD-CONSOLE-12` Section 7 acceptance rows green. |
