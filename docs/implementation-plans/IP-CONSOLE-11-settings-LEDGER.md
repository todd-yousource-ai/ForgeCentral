# IP-CONSOLE-11-SETTINGS -- landing ledger

Plan: `IP-CONSOLE-11-settings.md` (TRD-CONSOLE-11 Settings, amended Section 9). Created WITH the plan
(2026-09-24) per the ledger discipline: every step's row is updated (status + commit hash) in the same
session its PR merges, and the Resume-here section is rewritten at every merge. A stale ledger is a
defect. The paired engine ledger is crdb `IP-CONSOLE-SETTINGS-WIRE-LEDGER.md`.

## Resume here (rewrite at every merge)

- **State (2026-09-24): ST.0 LANDED with the plan** (the TRD amendment). The SOC tab is LIVE from
  IP-CONSOLE-03 S3.18. **NEXT = crdb SET.1 + SET.2** (the generalized read + commit), then ST.1.
  ST.4a (the Federation tab's connector panel mount) needs no engine work and may land any time.

## Roster (ForgeCentral)

| Step | Acceptance | Status | Commit | Notes |
|------|-----------|--------|--------|-------|
| ST.0 | TRD 9 | LANDED (2026-09-24, with the plan) | -- | TRD-CONSOLE-11 Section 9: the engine's real admin surface, the corrected tab set (SOC + Configuration added; FIPS toggle removed; HA / DR / rotation PENDING with owning work), Step 1 scope, added acceptance + failure semantics. |
| ST.1 | 9.1, 9.4 | PLANNED (waits crdb SET.1) | | |
| ST.2 | 9.2 Configuration | PLANNED (waits crdb SET.2) | | |
| ST.3 | 9.2 RBAC | PLANNED (waits crdb SET.2) | | |
| ST.4 | 9.2 Federation | PLANNED (a: no engine dependency; b: waits SET.2) | | |
| ST.5 | 9.2 Security | PLANNED (waits crdb SET.4 + the sidecar rider) | | |
| ST.6 | 9.2 KeyLock | PLANNED (waits crdb SET.4) | | |
| ST.7 | 9.2 Policy | PLANNED (waits crdb SET.2) | | |
| ST.8 | 9.2 Observability | PLANNED (a: waits SET.4; b: waits SET.2) | | |
| ST.9 | 9.4, 9.5 | PLANNED (waits crdb SET.3 + SET.5) | | |
| ST.10 | 9.2 HA / DR / FIPS | PLANNED (waits crdb SET.4) | | |
| ST.11 | 9.2 | BLOCKED (crdb SET.6: TRD-07 cluster + DR verbs, TRD-04 rotation verb; each its own plan) | | |
| ST.N | 7, 9.4 | PLANNED | | |

## Deferred / owed

- The admin-plane negotiated-group header (sidecar -> BFF) is the one Console-side engine-free
  prerequisite for ST.5; it rides with ST.5.
- The Console's own operator roles are installer configuration (`rbac.ts`); moving them into the
  engine's `admins` model is out of scope here and belongs to the identity plan.
