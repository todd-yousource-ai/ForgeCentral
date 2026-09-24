# IP-CONSOLE-11-settings -- the Settings (administration) surface, full build-out

The ForgeCentral surface for `TRD-CONSOLE-11` as amended 2026-09-24 (Section 9): every tab bound to
the engine's REAL administration surface over `:7878`, engine-first. Authored 2026-09-24 after
IP-AISOC-STEP1 C.9c / S3.18 landed the first slice (the SOC tab). The paired engine plan is crdb
`IP-CONSOLE-SETTINGS-WIRE` (SET.1 .. SET.6); each Console row names the engine row it waits on.

**Named invariants:**
- `INV-SETTINGS-ONE-WRITE-PATH` -- every Console commit reaches the governed document through the
  same validation, store, dual-control policy and audit the engine's admin plane uses. The wire grows
  no second config store, no second approval store and no second validator.
- `INV-SETTINGS-SOURCE-LABELLED` -- every value states its source (committed document at version N,
  an engine report, or the installer's boot configuration) and the registry's definition sits beside
  it. A boot-bound value carries no edit control.
- `INV-SETTINGS-DUAL-CONTROL-HONOURED` -- under dual control the surface proposes and approves; it
  never commits directly, never fakes an approval, and shows a self-approval refusal as such.
- `INV-SETTINGS-NO-IMPOSSIBLE-CONTROL` -- a control whose engine verb does not exist is absent and the
  absence is stated with the named engine work (HA leadership, DR tests, key rotation, FIPS toggle).
- `INV-CONSOLE-NO-STUB`, `INV-CONSOLE-3-CLICKS`, `INV-CONSOLE-ADMIN-PLANE` (inherited).

## Read with

`TRD-CONSOLE-11` Section 9 (the corrected tab table IS this plan's scope), `TRD-CONSOLE-00` Sections
8.5 and 9, crdb `IP-CONSOLE-SETTINGS-WIRE` (the engine rows), crdb `IP-ADMIN-KNOB-COVERAGE` (the
registry and the Configuration Guide the definitions come from), `IP-CONSOLE-03-soc-ops` S3.18 (the
shape every tab copies: contract narrower -> BFF resolver + route -> surface -> confirm-gated commit
-> receipt), `IP-CONSOLE-04-idam-auth0` (the Federation tab reuses its connector panel).

## What already exists (do not rebuild)

- **The SOC tab** (S3.18): `SettingsSurface`, `useSettings.ts`, `SocSettings*` contracts, the
  `/api/settings/soc` routes, the confirm-gated commit + receipt pattern, the dual-control notice.
- **The admin plane**: the sidecar's node-IP `:8443` terminator (hybrid X25519MLKEM768 + P-384 floor,
  sub-floor refused), installer-validated. What is missing is the negotiated group surfaced to the
  BFF (ST.5).
- **The IdAM connector panel** (`UsersSurface` -> External IDAM): connectors, configure, connect,
  sync, all LIVE over the wire.
- **The engine registry**: `REGISTRY` (56 settings) with `console:settings/<surface>/...` bindings;
  the SOC read already projects the rows for its prefix (`WireConfigSettingRow`).
- **The engine's config document ops** on its admin plane (get / validate / dry-run / commit / diff /
  rollback / propose / approve / describe / get-key / set-key) -- the semantics every wire op mirrors.

## Engine dependencies (crdb `IP-CONSOLE-SETTINGS-WIRE`)

| Engine row | What it lands | Console rows it unblocks |
|------------|---------------|--------------------------|
| SET.1 | `SETTINGS_READ`: the committed document projected by section family with its version, plus the registry rows for a binding prefix; Admin / SecurityAudit tier | ST.2, ST.3, ST.4b, ST.7, ST.8b |
| SET.2 | `SETTINGS_COMMIT`: typed per-section patches (governance knobs, admins, sso_group_roles, key_issuing, egress_destinations, idam_connector, detection_posture, detection_retention, soc_narrative, served_models, observability knobs), validated + committed through the store; boot-bound knobs refused with `boot_bound` | ST.2, ST.3, ST.4b, ST.7, ST.8b |
| SET.3 | dual control on the wire: `SETTINGS_PROPOSE`, `SETTINGS_APPROVALS`, `SETTINGS_APPROVE`; the admin listener's `PendingApprovals` becomes node-shared so the admin plane and the wire see one proposal set; distinct-principal rule; audited | ST.9 |
| SET.4 | status reports on the wire: `NODE_STATUS`, `CONNECTIVITY_REPORT`, `SECURITY_REPORT`, `TELEMETRY_REPORT`, `KEY_ISSUING_REPORT`, `EGRESS_REPORT`; Admin / SecurityAudit tier | ST.5, ST.6, ST.8a, ST.10 |
| SET.5 | config history on the wire: `SETTINGS_HISTORY` (versions with principal and section changes) and `SETTINGS_ROLLBACK` (Admin, dual-control aware) | ST.9 |
| SET.6 | the `PENDING` engine verbs, each its own plan when scheduled: TRD-07 cluster status + leadership rotation, DR targets + failover test, TRD-04 signing-key rotation as an admin verb | ST.11 flips |

## Roster

One PR per row; branch-per-PR, full `scripts/ci.sh --skip-e2e` on the box (the networked audit is a
real gate), no-ff merge, docs separate, reviewed before the next. Engine-first: a Console row starts
after its engine row is merged, deployed, and the schema re-vendored.

| Step | Acceptance | Deliverable |
|------|-----------|-------------|
| **ST.0** | TRD 9 | **The TRD amendment** (this session): Section 9 corrects the tab set against the shipped engine, adds the SOC and Configuration tabs, removes the FIPS toggle, marks HA / DR / rotation `PENDING` with owning work, and adds the acceptance + failure semantics. |
| **ST.1** | 9.1, 9.4 | **The generalized settings contract + read path** (after SET.1). Re-vendor the schema; `packages/contracts/src/settings.ts`: `SettingsSection` (label, version, the values as the engine's typed DTO per section, the registry rows for its binding prefix, `liveApply`, `bootBound`), `toSettingsView` fail-closed; `@forge/wire` dispatch arms; BFF `settingsRead` + `GET /api/settings/:surface` (403 on the tier refusal; nothing cached). The Settings shell: the tab strip rendered from the tabs whose bindings are LIVE (absent otherwise), the tier-below state, the source label component (`committed at version N` / `engine report` / `boot configuration`). |
| **ST.2** | 9.2 Configuration | **The Configuration tab** (after SET.2): every committed section and knob grouped by surface, the registry definition beside each value, a per-section edit form generated from the section's typed DTO (no free-form JSON), boot-bound values shown without controls, confirm-gated commit showing the exact section change, the receipt with the engine's violations verbatim. `POST /api/settings/:surface`. |
| **ST.3** | 9.2 RBAC | **The RBAC tab** (after SET.2): the `admins` assignments (identity, roles from the engine's `AdminRole` set, clearance) and `sso_group_roles` as editable sections; the Console's own operator roles (`global-admin` / `tenant-admin` / `tenant-user`, from BFF `rbac.ts`) shown read-only and labelled as installer configuration; the tenant operators (Users surface) linked, not duplicated. |
| **ST.4** | 9.2 Federation | **The Federation tab**: (a) the IdAM connector panel mounted from the Users surface (one component, two mounts; no second fetch path), LIVE now; (b) the `sso_group_roles` map editor (after SET.2). |
| **ST.5** | 9.2 Security | **The Security tab** (after SET.4): the connectivity and security reports (mutual TLS, identities bound, post-quantum key exchange, classification, audit head + chain verified, spot checks, retention), `key_issuing` + `egress_destinations` + the admin endpoint knobs (Configuration ops), and the admin-plane crypto panel. **Sidecar rider:** the admin terminator forwards the negotiated key-exchange group to the BFF (a request header on the tunnelled leg, set by the sidecar, never trusted from the browser); the BFF exposes it on `GET /api/settings/security`; the panel shows `hybrid X25519MLKEM768` or `P-384 floor` for THIS session. |
| **ST.6** | 9.2 KeyLock | **The KeyLock tab** (after SET.4): the key-issuing report + section; the signing key ids the audit chain names (security report); rotation stated `PENDING` with the crdb work named (SET.6). No rotate control. |
| **ST.7** | 9.2 Policy | **The Policy tab** (after SET.2): detection posture, detection retention, served models and the narrative model ref as editable sections; credibility weights read-only with the version and the reason (replay-pinned); the response tiers linked to the SOC tab (one form, one home). |
| **ST.8** | 9.2 Observability | **The Observability tab**: (a) the telemetry report (after SET.4); (b) the two observability knobs (after SET.2). Exporter configuration is stated absent (boot stanza) with the boot values shown as boot configuration. |
| **ST.9** | 9.4, 9.5 | **Dual control + history** (after SET.3, SET.5): under dual control every commit control becomes Propose; a Pending approvals panel lists proposals (id, proposer, sections) with Approve for a distinct principal; self-approval refused and shown; the version history with per-version section changes and a confirm-gated Rollback (dual-control aware). |
| **ST.10** | 9.2 HA / DR / FIPS | **The read-only posture tabs** (after SET.4): HA & Topology (this node's shards / serving / durable / maintenance / version; the configured regions and shard placement as boot configuration), Failover & DR (regions and residency tags, boot), FIPS Mode (the build posture from the reports: FIPS module present, crypto provider; the enable procedure linked). Each states its `PENDING` controls with the owning engine work. |
| **ST.11** | 9.2 | **The PENDING flips** (after SET.6, each its own PR when the engine verb lands): cluster leader + lag and Rotate Leadership / Test Quorum Loss; DR targets + Test Failover; Rotate key. Confirm-gated with the effect stated; a test streams its real result. |
| **ST.N** | 7, 9.4 | **Capstone**: Playwright journeys over the `:8443` admin plane for every Section 5 task within budget (edit and commit a section, propose and approve under dual control, read every posture tab), the tier-below journey, the boot-bound-no-control assertion, the no-stub sweep, and the live drive on the box against the deployed BFF / SPA / engine. |

## Cross-repo sequencing

```
crdb SET.1 + SET.2 (read + commit)  -> ST.1, ST.2, ST.3, ST.4b, ST.7, ST.8b
crdb SET.4 (reports)                -> ST.5, ST.6, ST.8a, ST.10
crdb SET.3 + SET.5 (dual control + history) -> ST.9
crdb SET.6 (cluster / DR / rotation verbs, later plans) -> ST.11
```

Deploy order for every engine row: merge crdb, release `cdb`, explicit `systemctl restart cdb` then
`torchd`, re-vendor the schema in ForgeCentral, then the Console row.
