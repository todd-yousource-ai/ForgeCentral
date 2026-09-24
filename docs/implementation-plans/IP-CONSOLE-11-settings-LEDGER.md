# IP-CONSOLE-11-SETTINGS -- landing ledger

Plan: `IP-CONSOLE-11-settings.md` (TRD-CONSOLE-11 Settings, amended Section 9). Created WITH the plan
(2026-09-24) per the ledger discipline: every step's row is updated (status + commit hash) in the same
session its PR merges, and the Resume-here section is rewritten at every merge. A stale ledger is a
defect. The paired engine ledger is crdb `IP-CONSOLE-SETTINGS-WIRE-LEDGER.md`.

## Resume here (rewrite at every merge)

- **State (2026-09-24, ~22:45 UTC):** crdb SET.1 + SET.2 merged and deployed; SET.2b on branch. **Corrections recorded:** the admin assignments and the SSO map are boot-bound (RBAC / Federation show them read-only); the detection watermark bounds are pending (Policy shows them read-only). ST.3 / ST.4b now wait only on SET.1 (deployed). Prior: **ST.0 LANDED with the plan** (the TRD amendment). The SOC tab is LIVE from
  IP-CONSOLE-03 S3.18. **ST.1 ON BRANCH `feat/console-11-st1-settings-shell` (2217dc9), AWAITING REVIEW; NEXT = ST.2** (editing on the Configuration tab: knob edits + the typed section forms over SET.2 / SET.2b). ST.4a (the Federation tab's connector panel
  mount) needs no engine work and may land any time.

## Roster (ForgeCentral)

| Step | Acceptance | Status | Commit | Notes |
|------|-----------|--------|--------|-------|
| ST.0 | TRD 9 | LANDED (2026-09-24, with the plan) | -- | TRD-CONSOLE-11 Section 9: the engine's real admin surface, the corrected tab set (SOC + Configuration added; FIPS toggle removed; HA / DR / rotation PENDING with owning work), Step 1 scope, added acceptance + failure semantics. |
| ST.1 | 9.1, 9.4 | ON BRANCH `feat/console-11-st1-settings-shell`, full gate green (`--skip-e2e`), AWAITING REVIEW | `2217dc9` | Schema re-vendored from crdb `2cf0a451`; `SettingsRead` wired in `@forge/wire` dispatch + payload. **Contracts** `settings.ts`: `SettingRow` / `SettingsView` / `SectionValues` + `toSettingsView` (fail-closed on a refusal or an origin outside knob / section / env / const; section values null unless every field is present), `settingSourceLabel` (committed at version N / fail-closed default / node environment at boot / compile-time constant), `settingApplyClass` (from the registry's own `live_apply` text: live / boot-bound / pending / fixed). **BFF** `engine/settings.ts` `resolveSettings` + `GET /api/settings[?surface=]` (surface must match `[a-z_]{1,64}`; tier refusal 403; nothing cached); `settingsRead` on client / operator engine (delegated) / wire client. **SPA** the Settings `TabStrip` shows only tabs with LIVE bindings (SOC, Configuration); Configuration is READ-ONLY here: a surface picker over the engine's surfaces and a `DataTable` of each surface's settings (setting, value as the engine rendered it or `not in the committed document`, source, applies, definition + bound), the version line and the dual-control note; tier below Admin / SecurityAudit = an honest empty state. Tests: contracts 4, BFF 2, SPA 3 (tabs from live bindings; rows with source + apply class across surfaces; tier-below). |
| ST.2 | 9.2 Configuration | PLANNED (waits crdb SET.2b deploy) | | |
| ST.3 | 9.2 RBAC | PLANNED (engine read deployed: SET.1) | | read-only: boot-bound |
| ST.4 | 9.2 Federation | PLANNED (a: no engine dependency; b: engine read deployed) | | the SSO map read-only |
| ST.5 | 9.2 Security | PLANNED (waits crdb SET.4 + the sidecar rider) | | |
| ST.6 | 9.2 KeyLock | PLANNED (waits crdb SET.4) | | |
| ST.7 | 9.2 Policy | PLANNED (waits crdb SET.2b) | | model ref editable; watermarks / retention / served models read-only |
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
