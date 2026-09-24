# IP-CONSOLE-11-SETTINGS -- landing ledger

Plan: `IP-CONSOLE-11-settings.md` (TRD-CONSOLE-11 Settings, amended Section 9). Created WITH the plan
(2026-09-24) per the ledger discipline: every step's row is updated (status + commit hash) in the same
session its PR merges, and the Resume-here section is rewritten at every merge. A stale ledger is a
defect. The paired engine ledger is crdb `IP-CONSOLE-SETTINGS-WIRE-LEDGER.md`.

## Resume here (rewrite at every merge)

- **State (2026-09-24, ~22:45 UTC):** crdb SET.1 + SET.2 merged and deployed; SET.2b on branch. **Corrections recorded:** the admin assignments and the SSO map are boot-bound (RBAC / Federation show them read-only); the detection watermark bounds are pending (Policy shows them read-only). ST.3 / ST.4b now wait only on SET.1 (deployed). Prior: **ST.0 LANDED with the plan** (the TRD amendment). The SOC tab is LIVE from
  IP-CONSOLE-03 S3.18. **ST.1 LANDED + INSTALLED; was ON BRANCH `feat/console-11-st1-settings-shell` (2217dc9), AWAITING REVIEW; NEXT = ST.2** (editing on the Configuration tab: knob edits + the typed section forms over SET.2 / SET.2b). ST.4a (the Federation tab's connector panel
  mount) needs no engine work and may land any time.

## Roster (ForgeCentral)

| Step | Acceptance | Status | Commit | Notes |
|------|-----------|--------|--------|-------|
| ST.0 | TRD 9 | LANDED (2026-09-24, with the plan) | -- | TRD-CONSOLE-11 Section 9: the engine's real admin surface, the corrected tab set (SOC + Configuration added; FIPS toggle removed; HA / DR / rotation PENDING with owning work), Step 1 scope, added acceptance + failure semantics. |
| ST.1 | 9.1, 9.4 | LANDED (merged `78e3aaf`, 2026-09-24; installed, validate 7/7) | `2217dc9` | Schema re-vendored from crdb `2cf0a451`; `SettingsRead` wired in `@forge/wire` dispatch + payload. **Contracts** `settings.ts`: `SettingRow` / `SettingsView` / `SectionValues` + `toSettingsView` (fail-closed on a refusal or an origin outside knob / section / env / const; section values null unless every field is present), `settingSourceLabel` (committed at version N / fail-closed default / node environment at boot / compile-time constant), `settingApplyClass` (from the registry's own `live_apply` text: live / boot-bound / pending / fixed). **BFF** `engine/settings.ts` `resolveSettings` + `GET /api/settings[?surface=]` (surface must match `[a-z_]{1,64}`; tier refusal 403; nothing cached); `settingsRead` on client / operator engine (delegated) / wire client. **SPA** the Settings `TabStrip` shows only tabs with LIVE bindings (SOC, Configuration); Configuration is READ-ONLY here: a surface picker over the engine's surfaces and a `DataTable` of each surface's settings (setting, value as the engine rendered it or `not in the committed document`, source, applies, definition + bound), the version line and the dual-control note; tier below Admin / SecurityAudit = an honest empty state. Tests: contracts 4, BFF 2, SPA 3 (tabs from live bindings; rows with source + apply class across surfaces; tier-below). |
| ST.2a | 9.2 Configuration | LANDED (merged `4417a45`, 2026-09-24; installed, validate 7/7) | `fd2aad6` | Knob edits over crdb SET.2. `SettingsCommit` wired in `@forge/wire` dispatch with a FULL encoder (edits + every `WireSectionPatch` field, so ST.2b is UI only). **Contracts:** `SettingsCommitRequest` + `toSettingsCommitRequest` (non-empty, <= 64 edits, keys `[a-z_][a-z0-9_.]{0,127}`, values <= 256 chars), `toWireSettingsCommitFields`, `SettingsReceipt` + `toSettingsReceipt` (never null; an unknown cause kept as `other` with its tag), `refusalCauseLabel` (each SET.2 cause in words), `isKeyEditable` (engine `editable` AND a knob AND not `CapabilitySet`). **BFF:** `settingsCommit` on client / operator engine (delegated) / wire client; `resolveSettingsCommit`; `POST /api/settings` (400 malformed; receipt 200). **SPA:** a Change column: Edit on key-editable rows only, `read-only` elsewhere and everywhere under dual control; staged batch (`N staged changes; the engine applies them together or not at all`), Commit behind a `ConfirmDialog` listing `key: old -> new`, the receipt verbatim (`Committed at version N. Applied live.` or the restart list; refused: every cause in words + detail and every violation), a refused batch stays staged, a commit re-reads the settings. Tests: contracts 3, BFF 1, wire dispatch case, SPA 3 (stage -> confirm old/new -> post -> receipt; refused causes + boot-bound read-only; dual control offers no edit). |
| ST.2b | 9.2 Configuration | ON BRANCH `feat/console-11-st2b-section-forms`, full gate green (`--skip-e2e`), AWAITING REVIEW | `99a8d96` | **Contracts:** `SectionPatch`, `ADMIN_CAPABILITIES` (the 12 engine capability names; a stale list fails closed at the engine), `toSectionPatch` (lists <= 256, ceilings from `CLASSIFICATION_TAGS`, non-empty ids / sources / formats, LUG integers >= 0 within u32 / u16), `toSettingsCommitRequest` now takes edits and / or sections (at least one), `toWireSettingsCommitFields` maps sections. **SPA** `SettingsSectionForms.tsx`: one form per LIVE section whose registry row the engine marks `editable` (dual-control checkboxes; egress rows with id + ceiling, add / remove, commit disabled on a blank id; LUG two toggles + six bounds; decoder families one per line; source-format `source=format` per line, commit disabled on a malformed line; narrative model ref, empty = unbind); each form starts from the engine's typed `sectionValues`, re-mounts on a new committed version, commits ONLY its section behind a `ConfirmDialog` naming it, and shows the shared `GovernedReceipt` (moved here from the surface); no forms under dual control or when the read carries no section values. Tests: contracts 2 (narrow + compile; malformed refused), SPA 4 (forms only for editable sections; dual control posts only its section after a named confirm + receipt; egress add with blank-id guard + model unbind; none under dual control). |
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
