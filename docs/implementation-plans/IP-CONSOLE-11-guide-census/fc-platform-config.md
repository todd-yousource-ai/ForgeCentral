# ForgeCentral platform configuration census -- FC's own config + the complete binding index

Slice owner: this file. Sibling slices (SPA surfaces, engine, torch) are covered elsewhere.
Repo state read: forgecentral `d3ea588` (main); crucible HEAD `d0ace55a` (read-only, only where the
FC installer touches the engine); sidecar pins crucible rev `b5e301ff` for `cdb-mtls`.
Method: read-only code reading + grep. Nothing built, run, or tested. No live `/etc` file was read.
All paths are repo-relative. `forgecentral/` is implied unless a path starts with `crucible:`.

## Index

0. Conventions and counts
1. The binding index (all 72 bindings)
   - 1.1 How bindings are (and are not) wired at runtime
   - 1.2 The binding table
   - 1.3 Bindings no component uses
   - 1.4 Routes / controls that use no binding
   - 1.5 Manifest inconsistencies
2. The BFF's runtime configuration
   - 2.1 Environment keys (26) -- table
   - 2.2 Operator auth: OIDC device flow
   - 2.3 Session + cookie
   - 2.4 The RBAC role map (`FC_RBAC_CONFIG`)
   - 2.5 EXPLAIN tier derivation + the Settings tier
   - 2.6 Active-tenant override (`x-active-tenant`)
   - 2.7 Ephemeral cache (`cache.ts`)
   - 2.8 TUNE-tagged constants
   - 2.9 Other constants, timeouts, limits, budgets
   - 2.10 HTTP route table (74 method/path pairs + SPA fallback)
   - 2.11 Startup and failure behavior
3. The crypto sidecar
   - 3.1 Config fields (16) -- table
   - 3.2 Process, subcommands, startup order
   - 3.3 Admin TLS terminator (browser leg)
   - 3.4 Engine mTLS originator (engine leg)
   - 3.5 Policy-bundle signing plane
   - 3.6 IdAM secret-set service
   - 3.7 Admin-session lookup service
   - 3.8 systemd unit + provisioning script
   - 3.9 Loopback trust (what any local process can reach)
4. The installer (`deploy/`)
   - 4.1 `install.sh` knobs -- table
   - 4.2 `provision-sidecar.sh` knobs (inherited through install.sh) -- table
   - 4.3 Phases
   - 4.4 Users, files, units written
   - 4.5 `config.env`: which lines the installer owns vs keeps
   - 4.6 The engine peer pin (`cdb-mkconfig --add-wire-peer`)
   - 4.7 `validate.sh` checks
   - 4.8 `uninstall.sh`
   - 4.9 Cross-component port / path coupling
   - 4.10 Documentation drift inside `deploy/` and `sidecar/`
5. UI visibility and how an operator changes each item (matrix)
6. Findings (ranked)
7. Open questions and UNVERIFIED items

---

## 0. Conventions and counts

- "LIVE"/"PENDING" = the binding's `status.kind` in `packages/bindings/src/manifest.ts`.
- "session" gate = the BFF resolves the `fc_session` cookie to a live in-memory session or answers 401.
- Engine authorization (tier, Delegation grant, clearance, tenant) is enforced ENGINE-side on every
  brokered call; the BFF injects the operator delegation (`apps/bff/src/engine/operator-engine.ts:8-13`).
- Counts: 72 bindings (38 read / 34 command; 60 LIVE / 12 PENDING). 26 BFF env keys. 16 sidecar config
  fields. 74 BFF method/path pairs + the SPA static fallback. 20 `CONSOLE_*` installer knobs + 19
  `provision-sidecar.sh` knobs + 3 extra `validate.sh` knobs. 8 validate checks.

---

## 1. The binding index

### 1.1 How bindings are (and are not) wired at runtime

- The registry is `packages/bindings/src/manifest.ts:947-964` (14 groups registered in order,
  `register(...)` at :948-961). Type shape: `packages/contracts/src/binding.ts:28-57` (read = id, kind,
  surface, op, viewModel, status; command adds `authz` and `audited: true`). Surfaces:
  `'cruciblql' | 'admin' | 'torch' | 'forge'` (`binding.ts:16`).
- Enforcement is structural only: `validateManifest` (key/id match, non-empty op, no `mock:|fixture:|stub:`
  op, commands audited, PENDING names owningRepo + gatingTask) and `assertReleaseReady` (throws on any
  PENDING) in `packages/bindings/src/validate.ts:21-67`. The contract test EXPECTS the release gate to
  throw today (`packages/bindings/test/contract.test.ts:22-36`); `scripts/ci.sh:76` runs `test:contract`.
- NOT wired at runtime: neither the BFF nor the SPA imports `@forge/bindings`. The BFF's package.json
  has no such dependency (`apps/bff/package.json:15-21`); the SPA declares it
  (`apps/console/package.json:18`) but only a test imports it
  (`apps/console/src/test/contract/no-stub.test.tsx:3`). Binding ids appear in the SPA/BFF only inside
  comments (e.g. `apps/bff/src/engine/vtz.ts:63`, `apps/console/src/surfaces/useUsers.ts:87`).
- The command `authz` strings (e.g. `operator:contain`, `operator:vtz.author`) are never read by any
  code: the only non-manifest occurrence is the type field (`packages/contracts/src/binding.ts:48`).
- `binding.ts:4-7` says the contract test "asserts every route/control references a registered binding";
  it does not -- the test checks the manifest's own shape only, and the SPA test only checks id prefixes
  (`no-stub.test.tsx:18-43`). So route-to-binding mapping below is DERIVED by matching each binding's op
  to the BFF resolver that calls it and then to the SPA hook that calls that route.

### 1.2 The binding table

Columns: id | kind | op (surface; `cruciblql` unless shown) | authz | status (PENDING: owning repo -- gating task) | BFF route -> engine
call | SPA hook -> component (call site) | manifest line. All commands are `audited: true`.

| id | kind | op (surface) | authz | status | BFF route -> engine | SPA hook -> component | line |
|---|---|---|---|---|---|---|---|
| entity.header | read | list_agents_v1 (cruciblql) | - | LIVE | GET /api/entity/{kind}/{id} -> resolveEntityDetail: listAgents (entity-detail.ts:290-291) | useEntityDetail (entity/useEntityDetail.ts:18) -> shell/DrawerHost.tsx:65 -> EntityDrawer (packages/design) | :31 |
| entity.info | read | list_agents_v1 | - | LIVE | same route/read | same | :40 |
| entity.zones | read | entity_zones_v1 (forge) | - | PENDING: forge -- "Forge VTZ membership store + a queryable read surface (not in crdb today)" | same route returns a `pending` section (entity-detail.ts:407) | EntityDrawer "Connected VTZs" pending note (packages/design/src/components/EntityDrawer.tsx:231) | :50 |
| entity.effectivePolicies | read | entity_effective_policies_v1 (forge) | - | PENDING: forge -- "Forge effective-policy resolution as a queryable read surface (not in crdb today)" | pending section (entity-detail.ts:409) | EntityDrawer "Effective policies" (EntityDrawer.tsx:270) | :64 |
| entity.recentDecisions | read | entity_decisions_v1 | - | LIVE | same route: entityDecisions, limit 50 (entity-detail.ts:298-302) | EntityDrawer | :79 |
| entity.capabilities | read | agent_capabilities_v1 | - | LIVE | same route: querySubmit `FIND agent_capabilities ...` + `FIND construction_report ...` (entity-detail.ts:306-327) | EntityDrawer | :91 |
| entity.isolate | command | entity_isolate_v1 (forge) | operator:contain | LIVE | POST /api/entity/{kind}/{id}/isolate -> resolveIsolate -> crdb CONTAIN (engine/isolate.ts:34-42) | useIsolate (entity/useIsolate.ts:20) -> DrawerHost.tsx:73,177 (confirm; always posture `quarantine`, :187) | :105 |
| entity.reassignZone | command | entity_reassign_zone_v1 (forge) | operator:vtz.reassign | PENDING: forge -- "IP-CONSOLE-12 DR.5 / IP-CONSOLE-02: Forge VTZ membership-change command" | none | no button (DrawerHost passes only onIsolate, DrawerHost.tsx:177; omitted handler = no button, EntityDrawer.tsx:28,348) | :114 |
| entity.remediation | command | entity_remediation_v1 (forge) | operator:remediation.view | PENDING: forgecentral -- "IP-CONSOLE-07 AIOps Workflows surface" | none | no button (EntityDrawer.tsx:353) | :127 |
| entity.fullReport | command | entity_full_report_v1 (cruciblql) | operator:report.view | PENDING: forgecentral -- "IP-CONSOLE-08 Reports surface" | none | no button (EntityDrawer.tsx:358) | :140 |
| logs.query | read | log_query_v1 | - | LIVE | GET /api/logs -> resolveLogQuery -> LOG_QUERY (engine/logs.ts:106-114) | useLogs (surfaces/useLogs.ts:34) -> LogsSurface.tsx:88 | :165 |
| logs.explain | read | log_explain_v1 | - | LIVE | GET /api/logs/explain/{decisionId} -> LOG_EXPLAIN | useLogExplain (useLogs.ts:140) -> LogsSurface.tsx:89 | :174 |
| logs.tail | read | log_tail_v1 | - | PENDING: crdb -- "IP-CONSOLE-READINESS Part B (bounded decision SUBSCRIBE push stream)" | v1 realized by polling GET /api/logs every 2000 ms (useLogs.ts:14,62) | LogsSurface | :184 |
| logs.export | read (audited op) | log_export_v1 | - | LIVE | POST /api/logs/export -> LOG_EXPORT (audited receipt) (server.ts:369-418) | useExportLogs (useExportLogs.ts:13) -> LogsSurface.tsx:72 | :199 |
| overview.graph | read | connectivity_graph_v1 | - | LIVE | GET /api/overview/sankey -> CONNECTIVITY_GRAPH (overview.ts:67-74) | useOverview (useOverview.ts:40) -> OverviewSurface.tsx:74 | :224 |
| overview.entityConnections | read | entity_connections_v1 | - | LIVE | GET /api/overview/entity-connections?id=&kind= -> ENTITY_CONNECTIONS, limit 500 (overview.ts:92-116) | useEntityConnections (useEntityConnections.ts:31) -> DrawerHost.tsx:66 | :234 |
| overview.live | read | overview_live_v1 | - | PENDING: crdb -- "IP-CONSOLE-READINESS Part B (bounded connectivity SUBSCRIBE push stream)" | v1 realized by polling /api/overview/sankey every 2000 ms (useOverview.ts:19,80) | OverviewSurface | :244 |
| vtz.tree | read | vtz_tree_v1 | - | LIVE | GET /api/vtz/tree[?limit] -> VTZ_TREE (default 200, max 500; vtz.ts:57-60,67-78) | useVtzTree (useVtzTree.ts:22) -> VtzSurface.tsx:199, PoliciesSurface.tsx:150, PolicyForm.tsx:115 | :273 |
| vtz.detail | read | vtz_detail_v1 | - | LIVE | GET /api/vtz/detail?id= -> VTZ_DETAIL | useVtzDetail (useVtzTree.ts:31) -> VtzSurface.tsx:113 | :283 |
| vtz.riskBand | read | connectivity_graph_v1 | - | LIVE | GET /api/overview/sankey (a JOIN, no new op) | useVtzRiskBands (useVtzTree.ts:82) -> VtzSurface.tsx:202 | :293 |
| vtz.memberCounts | read | vtz_member_counts_v1 | - | PENDING: crdb -- "IP-CONSOLE-VTZ-SUBSTRATE VtzSetMembership (zone-membership substrate, TRD-CONSOLE-12)" | none | VtzZoneCard "Members: Not available" (VtzSurface.tsx:58,306) | :303 |
| vtz.policyCount | read | vtz_policy_count_v1 | - | PENDING: crdb -- "IP-CONSOLE-05 Policies surface (crdb policy store)" | none | VtzZoneCard "Policies: Not available -- not stored by the engine yet" (VtzSurface.tsx:61,307) | :317 |
| vtz.create | command | vtz_create_v1 | operator:vtz.author | LIVE | POST /api/vtz -> VTZ_CREATE | useVtzMutation/runVtzCommand (useVtzMutation.ts:111) -> VtzEditor via VtzSurface.tsx:115,170 | :334 |
| vtz.edit | command | vtz_edit_v1 | operator:vtz.author | LIVE | PUT /api/vtz/{id} -> VTZ_EDIT | useVtzMutation.ts:117 | :344 |
| vtz.rescope | command | vtz_rescope_v1 | operator:vtz.author | LIVE | POST /api/vtz/{id}/rescope -> VTZ_RESCOPE | useVtzMutation.ts:122 | :355 |
| vtz.delete | command | vtz_delete_v1 | operator:vtz.author | LIVE | DELETE /api/vtz/{id} -> VTZ_DELETE | useVtzMutation.ts:115 | :366 |
| vtz.setMembership | command | vtz_set_membership_v1 | operator:vtz.reassign | PENDING: crdb -- same VtzSetMembership task as vtz.memberCounts | none | no control found (the manifest comment at :375-377 promises "a labelled non-live affordance"; grep of VtzSurface/VtzEditor/design finds none) | :378 |
| users.list | read | list_principals_v1 | - | LIVE | GET /api/users -> resolveUsersList: LIST_PRINCIPALS + LIST_AGENTS cross-bind (users.ts:56-66) | useUsers (useUsers.ts:26) -> UsersSurface.tsx:204 | :409 |
| users.detail | read | list_principals_v1 | - | LIVE | same list (keyed client-side); the principal drawer also reads GET /api/entity/principal/{id} | UsersSurface.tsx:453 -> DrawerHost | :419 |
| groups.list | read | list_groups_v1 | - | LIVE | GET /api/users/groups -> LIST_GROUPS | useGroups (useUsers.ts:35) -> UsersSurface.tsx:481 | :428 |
| groups.detail | read | list_groups_v1 | - | LIVE | same read | UsersSurface Groups tab | :437 |
| idam.connectors | read | idam_connectors_v1 | - | LIVE | GET /api/idam/connectors -> IDAM_CONNECTORS | useIdamConnectors (useIdam.ts:22) -> IdamConnectorsPanel.tsx:219 (mounted UsersSurface.tsx:636 and Settings Federation tab SettingsIdentityTabs.tsx:202) | :447 |
| users.create | command | principal_create_v1 | operator:users.manage | LIVE | POST /api/users -> PRINCIPAL_CREATE | useCreateUser (useUsers.ts:91) -> UsersSurface.tsx:119 | :459 |
| users.edit | command | principal_edit_v1 | operator:users.manage | LIVE | POST /api/users/edit -> PRINCIPAL_EDIT | useEditUser (useUsers.ts:100) -> UsersSurface.tsx:120 | :469 |
| users.setStatus | command | principal_set_status_v1 | operator:users.manage | LIVE | POST /api/users/status -> PRINCIPAL_SET_STATUS | useSetUserStatus (useUsers.ts:113) -> UsersSurface.tsx:206 | :479 |
| groups.create | command | group_create_v1 | operator:users.manage | LIVE | POST /api/users/groups -> GROUP_CREATE | useCreateGroup (useUsers.ts:131) -> UsersSurface.tsx:482 | :488 |
| groups.edit | command | group_edit_v1 | operator:users.manage | LIVE | POST /api/users/groups/edit -> GROUP_EDIT (server.ts:1193-1201) | NO SPA CALLER | :497 |
| groups.setMembers | command | group_set_members_v1 | operator:users.manage | LIVE | POST /api/users/groups/members -> GROUP_SET_MEMBERS (server.ts:1184-1192) | NO SPA CALLER | :507 |
| idam.configure | command | idam_configure_v1 | operator:users.manage | LIVE | POST /api/idam/configure -> IDAM_CONFIGURE | useIdamConnect step 3 (useIdam.ts:135) -> IdamConnectorsPanel.tsx:97 | :518 |
| idam.connect | command | idam_connect_v1 | operator:users.manage | LIVE | POST /api/idam/connect -> IDAM_CONNECT with client_secret_ref = hard-coded `/etc/cdb/secrets/auth0-management.secret` (server.ts:1926,2489-2495) | useIdamConnect step 2 (useIdam.ts:124) | :531 |
| idam.sync | command | idam_sync_v1 | operator:users.manage | LIVE | POST /api/idam/sync -> IDAM_SYNC | useIdamSync (useIdam.ts:61) -> IdamConnectorsPanel.tsx:220 | :542 |
| objects.list | read | object_list_v1 | - | LIVE | GET /api/objects -> OBJECT_LIST | useObjects (useObjects.ts:23) -> ObjectsSurface.tsx:199, PolicyForm.tsx:114 | :563 |
| objects.detail | read | object_detail_v1 | - | LIVE | GET /api/objects/detail?name= -> OBJECT_DETAIL has NO SPA caller (`fetchObjectDetail`, useObjects.ts:31, is unused); the op IS consumed via GET /api/entity/object/{name} (entity-detail.ts:223) | ObjectsSurface.tsx:331-338 -> DrawerHost | :572 |
| objects.governingPolicies | read | object_governing_policies_v1 (forge) | - | PENDING: crdb -- "TRD-CONSOLE-05 Policy surface (object -> governing-policy resolution)" | object drawer returns a pending policies section (entity-detail.ts:228-237) | EntityDrawer | :582 |
| objects.create | command | object_create_v1 | operator:objects.manage | LIVE | POST /api/objects -> OBJECT_CREATE | useObjectWrite('create') (useObjects.ts:77) -> ObjectsSurface.tsx:80 | :598 |
| objects.edit | command | object_edit_v1 | operator:objects.manage | LIVE | POST /api/objects/edit -> OBJECT_EDIT | useObjectWrite('edit') (useObjects.ts:77) | :607 |
| objects.delete | command | object_delete_v1 | operator:objects.manage | LIVE | POST /api/objects/delete -> OBJECT_DELETE | useDeleteObject (useObjects.ts:86) -> ObjectsSurface.tsx:200 | :617 |
| policies.byZone | read | policy_list_by_zone_v1 | - | LIVE | GET /api/policies -> POLICY_LIST_BY_ZONE | usePolicies (usePolicies.ts:19) -> PoliciesSurface.tsx:149 | :640 |
| policies.detail | read | policy_detail_v1 | - | LIVE | GET /api/policies/detail?vtz=&id= -> POLICY_DETAIL | NO SPA CALLER | :649 |
| policies.convergence | read | bundle_convergence_v1 | - | LIVE | GET /api/vtz/convergence?id= -> BUNDLE_CONVERGENCE (never cached, server.ts:809-829) | useBundleConvergence (useDistribution.ts:20) -> DistributionPanel.tsx:38 (mounted PoliciesSurface.tsx:311) | :660 |
| policies.enforcement | read | policy_enforcement_status_v1 (torch) | - | PENDING: torch -- "IP-TORCH-POLICY-ENFORCE (host realization of schedule/geo/port rules; AG.7-OFF)" | none | no UI element (only confirm-dialog copy, PolicyForm.tsx:459) | :671 |
| policies.create | command | policy_create_v1 | operator:policies.author | LIVE | POST /api/policies -> POLICY_CREATE | useSavePolicy (usePolicyMutation.ts:59) -> PolicyForm.tsx:113 | :687 |
| policies.edit | command | policy_edit_v1 | operator:policies.author | LIVE | POST /api/policies/edit -> POLICY_EDIT | useSavePolicy (usePolicyMutation.ts:60) | :697 |
| policies.publish | command | policy_publish_v1 | operator:policies.author | LIVE | POST /api/policies/publish -> POLICY_PUBLISH | useSavePolicy (usePolicyMutation.ts:64) | :707 |
| policies.delete | command | policy_delete_v1 | operator:policies.author | LIVE | POST /api/policies/delete -> POLICY_DELETE | useDeletePolicy (usePolicyMutation.ts:82) -> PoliciesSurface.tsx:151 | :717 |
| policies.distribute | command | bundle_commit_v1 (forge) | operator:policies.author | LIVE | POST /api/vtz/{id}/distribute -> resolveDistribute: VTZ_DETAIL + POLICY_EFFECTIVE + sidecar sign + BUNDLE_COMMIT (distribute.ts:106-169; server.ts:944-1021) | useDistribute (useDistribution.ts:75) -> DistributionPanel.tsx:39 | :731 |
| soc.incidents | read | soc_incident_list_v1 | - | LIVE | GET /api/soc/incidents -> SOC_INCIDENT_LIST, limit 200 (soc.ts:106,126) | useSocIncidents (useSoc.ts:39) -> SocDecisionQueue.tsx:273, ReportsSurface.tsx:171 | :758 |
| soc.incident.detail | read | soc_incident_detail_v1 | - | LIVE | GET /api/soc/incident?id= -> SOC_INCIDENT_DETAIL | useSocIncident (useSoc.ts:65) -> SocOpsSurface.tsx:204 | :767 |
| soc.narrative | read | soc_narrative_v1 | - | LIVE | GET /api/soc/narrative?id= -> SOC_NARRATIVE | useSocNarrative (useSoc.ts:101) -> SocInvestigationDock.tsx:479, SocVerdictPanel.tsx:302 | :777 |
| soc.plan.propose | read | soc_incident_detail_v1 | - | LIVE | rides GET /api/soc/incident | SocVerdictPanel.tsx:392-399 renders `detail.plan` | :788 |
| soc.telemetry.raw | read | soc_incident_telemetry_v1 | - | LIVE | GET /api/soc/telemetry?id= | useSocTelemetry (useSoc.ts:129) -> SocInvestigationDock.tsx:480 | :800 |
| soc.audit.trail | read | soc_incident_audit_v1 | - | LIVE | GET /api/soc/audit?id= | useSocAuditTrail (useSoc.ts:156) -> SocInvestigationDock.tsx:481 | :811 |
| soc.notes | read | soc_incident_notes_v1 | - | LIVE | GET /api/soc/notes?id= | useSocNotes (useSoc.ts:213) -> SocInvestigationDock.tsx:353 | :822 |
| soc.impact | read | soc_incident_impact_v1 | - | LIVE | GET /api/soc/impact?id= | useSocImpact (useSoc.ts:186) -> SocVerdictPanel.tsx:303 | :834 |
| soc.cognition.run | command | soc_cognition_run_v1 | operator:soc.respond | LIVE | POST /api/soc/generate -> SOC_COGNITION_RUN | useCognitionRun (useCognitionRun.ts:45) -> SocVerdictPanel.tsx:304 | :850 |
| soc.plan.approve | command | soc_plan_approve_v1 | operator:soc.respond | LIVE | POST /api/soc/plan/approve (atRevision required, server.ts:1528-1536) | useApprovePlan (usePlanCommand.ts:78) -> SocVerdictPanel.tsx:307 | :861 |
| soc.plan.modify | command | soc_plan_modify_v1 | operator:soc.respond | LIVE | POST /api/soc/plan/modify | useModifyPlan (usePlanCommand.ts:94) -> SocVerdictPanel.tsx:308 (SocPlanEditor, :447) | :872 |
| soc.case.assign | command | soc_incident_act_v1 | operator:soc.respond | LIVE | POST /api/soc/act {act: assigned} -> SOC_INCIDENT_ACT | useCaseAct (useCaseCommand.ts:111) -> SocCaseControls.tsx:208,272 (free-text assignee) | :886 |
| soc.case.ack | command | soc_incident_act_v1 | operator:soc.respond | LIVE | POST /api/soc/act {act: acked} | SocCaseControls.tsx:284 | :896 |
| soc.case.note | command | soc_incident_act_v1 | operator:soc.respond | LIVE | POST /api/soc/act {act: noted} | SocInvestigationDock.tsx:354 | :908 |
| soc.case.close | command | soc_incident_act_v1 | operator:soc.respond | LIVE | POST /api/soc/act {act: closed} | SocCaseControls.tsx:295 | :919 |
| soc.disposition | command | soc_incident_disposition_v1 | operator:soc.respond | LIVE | POST /api/soc/disposition -> SOC_INCIDENT_DISPOSITION | useDisposition (useCaseCommand.ts:123) -> SocCaseControls.tsx:209,314 | :931 |

(SPA paths above are under `apps/console/src/`; BFF paths under `apps/bff/src/`.)

### 1.3 Bindings no component uses

LIVE bindings whose BFF route exists but has no SPA caller (grep of `apps/console/src` for the path):
- `groups.edit` -> POST /api/users/groups/edit (server.ts:1106-1113 route set; no `groups/edit` string in the SPA).
- `groups.setMembers` -> POST /api/users/groups/members (same).
- `policies.detail` -> GET /api/policies/detail (server.ts:1773-1808; the SPA fetches only `/api/policies`, usePolicies.ts:19).
- `objects.detail`: its dedicated route GET /api/objects/detail is unused (fetchObjectDetail exported but never
  called); the op is still consumed through the entity drawer (see table).

PENDING bindings with no UI presence at all: `entity.reassignZone`, `entity.remediation`, `entity.fullReport`
(buttons absent by design), `vtz.setMembership` (no affordance, contrary to manifest.ts:375-377),
`policies.enforcement`.

PENDING bindings rendered as honest absence: `entity.zones`, `entity.effectivePolicies`,
`objects.governingPolicies` (drawer pending sections); `vtz.memberCounts`, `vtz.policyCount` ("Not
available" rows); `logs.tail`, `overview.live` (realized by 2 s polling of the LIVE read).

### 1.4 Routes / controls that use no binding

BFF API routes with no manifest entry (17 method/path pairs) and the SPA control that uses them:

| Route | Engine / backend op | SPA consumer | Evidence |
|---|---|---|---|
| GET /api/overview/members?container= | CONNECTIVITY_MEMBERS (overview.ts:159-187, limit 500) | Overview container drill-in list: useClassMembers (useClassMembers.ts:19) -> DrawerHost.tsx:68; opened from OverviewSurface.tsx:166 | server.ts:644-647,715-766 |
| GET /api/soc/kpis | DETECT_SUMMARY + SOC_INCIDENT_LIST (soc.ts:201-218) | SOC Ops KPI strip: useSocKpis (useSoc.ts:30) -> SocOpsSurface.tsx:286. manifest.ts:747 claims the strip "rides DETECT_SUMMARY, already registered by the detection work" -- no `detect.*` binding exists | server.ts:1655-1660 |
| GET /api/soc/report?id= | SOC_INCIDENT_REPORT | Reports surface: useSocReport (useSoc.ts:242) -> ReportsSurface.tsx:173; "Export as text/JSON" is a client-side download of that plain read (ReportsSurface.tsx:22-30,55-60), not an audited export | server.ts:1720-1731 |
| GET /api/soc/weekly?weeks= | SOC_WEEKLY_SUMMARY | Reports surface: useSocWeekly (useSoc.ts:269) -> ReportsSurface.tsx:149 (WEEKS_SHOWN = 12, :97) | server.ts:1661-1672 |
| POST /api/idam/secret | sidecar secret-set leg (not an engine op) | IdAM onboarding step 1: useIdamConnect (useIdam.ts:114) | server.ts:2392-2444 |
| GET /api/settings[?surface=] | SETTINGS_READ | Settings Configuration/RBAC/Federation/Observability tabs: useGovernedSettings (useSettings.ts:82) | server.ts:2000-2053 |
| POST /api/settings | SETTINGS_COMMIT | Configuration tab direct commit: useGovernedChange(false) (useSettings.ts:241) -> SettingsSurface.tsx:311, SettingsSectionForms.tsx:424 | server.ts:2017-2024,2060-2095 |
| GET /api/settings/console-rbac | BFF-local (no engine op) | Settings RBAC tab "Console operator roles": useConsoleRbac (useSettings.ts:138) -> SettingsIdentityTabs.tsx:120 | server.ts:2102-2121 |
| GET /api/settings/reports?names= | SETTINGS_REPORTS | Security/KeyLock/Observability/HA/FIPS tabs: useSettingsReports (useSettings.ts:167) -> SettingsReportTabs.tsx:64 | server.ts:2128-2176 |
| GET /api/settings/security-session | sidecar session lookup (no engine op) | Security tab "This browser session": useSecuritySession (useSettings.ts:192) -> SettingsReportTabs.tsx:101 | server.ts:2183-2225 |
| POST /api/settings/propose | SETTINGS_PROPOSE | Configuration tab under dual control: useGovernedChange(true) (useSettings.ts:239) | server.ts:2275-2281 |
| GET /api/settings/approvals | SETTINGS_APPROVALS | Changes tab: useSettingsApprovals (useSettings.ts:250) -> SettingsChangesTab.tsx:71 | server.ts:2282-2288 |
| POST /api/settings/approvals/{id}/approve | SETTINGS_APPROVE | Changes tab: useApproveProposal (useSettings.ts:269) -> SettingsChangesTab.tsx:72 | server.ts:2289-2295 |
| GET /api/settings/history[?limit=] | SETTINGS_HISTORY | Changes tab: useSettingsHistory (useSettings.ts:278, asks limit=50) -> SettingsChangesTab.tsx:150 | server.ts:2296-2309 |
| POST /api/settings/rollback | SETTINGS_ROLLBACK | Changes tab: useRollback (useSettings.ts:296) -> SettingsChangesTab.tsx:151 | server.ts:2310-2321 |
| GET /api/settings/soc | SOC_SETTINGS_READ | SOC tab: useSocSettings (useSettings.ts:35) -> SettingsSurface.tsx:484 | server.ts:2336-2364 |
| POST /api/settings/soc | SOC_SETTINGS_COMMIT | SOC tab: useCommitSocSettings (useSettings.ts:51) -> SettingsSurface.tsx:79 | server.ts:2365-2378 |

Also binding-less (BFF-internal, not engine ops): `/auth/login`, `/auth/login/poll`, `/auth/logout`,
`/auth/me` (Login.tsx, TopBar.tsx via auth/api.ts:44-73), `/healthz`, `/readyz`, `/openapi.json`.
The SPA's own no-stub test treats `reports` and `settings` as REAL surfaces (no-stub.test.tsx:49-59) while
`REGISTERED_PREFIXES` has no `settings.` or `reports.` prefix (:18-29), and SettingsSurface.tsx:4-5 says
"A tab is present only when its engine binding is live" -- no Settings binding exists.

### 1.5 Manifest inconsistencies (evidence only; no judgement on intent)

- Header comment says `logs.export` is PENDING (manifest.ts:157-159); the entry is LIVE (:195-205).
- Header comment says `soc.plan.propose` is registered PENDING because crdb has no production proposer
  (:749-753); the entry is LIVE and describes an engine proposer (:784-794).
- `vtz.policyCount` stays PENDING gated on "IP-CONSOLE-05 Policies surface (crdb policy store)"
  (:315-327) while the manifest's own policy section says that store landed (PS.1-PS.N, :629-631) and all
  `policies.*` authoring bindings are LIVE; the VTZ card copy still says "Policies are not stored by the
  engine yet" (VtzSurface.tsx:61).
- `objects.governingPolicies` is surface `forge` but owningRepo `crdb` (:584-590).
- `entity.isolate` is surface `forge` / op `entity_isolate_v1`, but the BFF brokers the crdb CONTAIN op
  (engine/isolate.ts:42; client.ts:342-346).
- `logs.export` is kind `read` although it is an audited POST (LOG_EXPORT is "an audited data-plane
  write", client.ts:352-354); the `audited` rule in validate.ts:39-41 only covers `command` bindings.

---

## 2. The BFF's runtime configuration

Loaded once at start by `loadConfig(process.env)` (apps/bff/src/config.ts:200-275), zod-validated,
fail-closed. Every environment read in the BFF is in config.ts (grep of `process.env` / `env[`). A
validation error throws `ConfigError` naming the field paths only, never values (config.ts:228-232);
`main()` then writes `BFF failed to start: ...` to stderr and exits 1 (index.ts:80-87). Under systemd the
unit restarts every 2 s (`Restart=on-failure`, `RestartSec=2`, apps/bff/deploy/console-bff.service:23-24).
The unit reads the keys from `EnvironmentFile=/etc/console-bff/config.env` (console-bff.service:20).
Nothing is reloaded live: every key takes effect only on a `console-bff` restart.

### 2.1 Environment keys (26)

"Installer" = whether deploy/install.sh writes the line (see 4.5); "example.env" = apps/bff/deploy/config.example.env (copied to /etc/console-bff/config.env only when absent). Ports are `z.coerce.number().int().positive()` -- there is no upper bound check (a value over 65535 passes validation and fails at
listen/connect).

| Key | Type / validation | Default | Req? | Controls | When absent | Installer | Evidence |
|---|---|---|---|---|---|---|---|
| FC_ENGINE_HOST | string, min 1; MUST be loopback (`localhost`, `::1`, `127.0.0.1`, any `127.*`) else ConfigError | 127.0.0.1 | opt | host of the sidecar egress (wire), and also the host the secret-set and session-lookup clients dial | default | example.env:17 (first install only) | config.ts:35,202,237-241,278-280; server.ts:2207,2427 |
| FC_ENGINE_PORT | int > 0 | 8789 | opt | sidecar egress port; must equal sidecar `egress_addr` port | default | example.env:18 | config.ts:37; wire-client.ts:93-97 |
| FC_HTTP_HOST | string; MUST be loopback else ConfigError | 127.0.0.1 | opt | BFF listener bind host (explicitly passed to listen) | default | example.env:13 | config.ts:43,245-249; index.ts:58 |
| FC_HTTP_PORT | int > 0 | 8787 | opt | BFF listener port; sidecar `admin_upstream` must point here | default | example.env:14 | config.ts:45 |
| FC_LOG_LEVEL | enum fatal/error/warn/info/debug/trace | info | opt | pino level; redaction always on | default | example.env:19 | config.ts:47; log.ts:10-33 |
| FC_CACHE_TTL_MS | int > 0 | 2000 | opt | ephemeral cache entry lifetime | default | not written (example shows a commented `5000`) | config.ts:49; cache.ts:21-49 |
| FC_CACHE_MAX_ENTRIES | int > 0 | 1000 | opt | cache capacity (oldest evicted) | default | not written | config.ts:51; cache.ts:42-48 |
| FC_REQUEST_TIMEOUT_MS | int > 0 | 5000 | opt | bound on every engine call, the heartbeat PING, and the sign / secret / session sidecar calls | default | not written (example shows a commented `15000`) | config.ts:53; wire-client.ts:575,581-583; server.ts:986,2210,2431 |
| FC_SIGNER_PORT | int > 0, optional | none | opt | sidecar bundle-signing port (dialed at hard-coded 127.0.0.1, not FC_ENGINE_HOST) | POST /api/vtz/{id}/distribute -> 503 `signer_unavailable` | install.sh:216 (`CONSOLE_SIGNER_PORT`, default 8790) | config.ts:54-56; server.ts:962-965,983-987 |
| FC_IDAM_SECRET_PORT | int > 0, optional | none | opt | sidecar IdAM secret-set port (dialed at FC_ENGINE_HOST) | POST /api/idam/secret -> 503 `secret_plane_unprovisioned` (UI: "The secret store is not available on this node", IdamConnectorsPanel.tsx:76) | install.sh:217 (`CONSOLE_IDAM_SECRET_PORT`, 8791) | config.ts:57-59; server.ts:2405-2409 |
| FC_SIDECAR_SESSION_PORT | int > 0, optional | none | opt | sidecar admin-session lookup port | GET /api/settings/security-session -> 200 `{status:"unconfigured"}`; Security tab shows "Not available ... not provisioned (re-run the Console installer)" | install.sh:218 (`CONSOLE_SESSION_PORT`, 8792) | config.ts:60-62; server.ts:2196-2199; SettingsReportTabs.tsx:114-121 |
| FC_ENGINE_HEARTBEAT_MS | int > 0 | 20000 | opt | PING cadence on the engine wire connection | default | not written | config.ts:63-67; wire-client.ts:554-561 |
| FC_SPA_DIST | string, min 1, optional | none | opt | directory of the built SPA served for every unmatched GET | BFF is API-only: an unmatched GET -> 404 `{"error":"not_found"}` | install.sh:207-209 (`/usr/local/lib/console-bff/spa`, every run) | config.ts:68-70; server.ts:2704-2709; static.ts:73-92 |
| FC_SESSION_TTL_MS | int > 0 | 3600000 (1 h) | opt | operator session lifetime (absolute, fixed at login; no sliding renewal) and cookie Max-Age | default | not written | config.ts:74; session.ts:72; router.ts:192-198 |
| FC_SESSION_COOKIE | string, min 1 | fc_session | opt | session cookie name | default | not written | config.ts:76 |
| FC_SESSION_COOKIE_SECURE | exactly `true` or `false` (any other string -> ConfigError) | true | opt | adds `Secure` to the cookie | default | example.env:33 (`true`) | config.ts:77-82; cookie.ts:42,49 |
| FC_SESSION_MAX | int > 0 | 4096 | opt | max in-memory sessions; at the cap the OLDEST session is evicted (even if still valid) | default | not written | config.ts:84; session.ts:59-63 |
| FC_LOGIN_MAX | int > 0 | 256 | opt | max in-flight device logins; oldest evicted | default | not written | config.ts:86; login-store.ts:40-44 |
| FC_OIDC_ISSUER | URL, optional | none | opt (its presence enables auth) | exact `iss` to verify; base for the derived endpoints | auth router NOT mounted: `/auth/*` unserved, every `/api/*` answers 401 (no session can exist); log warns "operator auth DISABLED" | install.sh:193-202 (default dev Auth0 tenant URL; `CONSOLE_OIDC_ISSUER=none` leaves it unset) | config.ts:89,154-174; index.ts:29-43; server.ts (every handler's `resolveSession` -> 401) |
| FC_OIDC_CLIENT_ID | string, min 1 | none | REQUIRED when issuer set (ConfigError naming it) | device-flow `client_id`; the id_token `aud` | - | install.sh:196 | config.ts:90,157; oidc.ts:65,87,112 |
| FC_OIDC_ROLE_CLAIM | string, min 1 | none | REQUIRED when issuer set | the id_token claim holding the groups array (used for RBAC groups AND tier mapping) | - | install.sh:197 (`https://forgecentral.io/roles`) | config.ts:91,158; oidc.ts:124-127 |
| FC_OIDC_SCOPE | string, min 1 | `openid profile email` | opt | device-code scope | default | not written | config.ts:92; oidc.ts:65 |
| FC_OIDC_JWKS_URI | URL, optional | `{issuer minus one trailing slash}/.well-known/jwks.json` | opt | JWKS endpoint | derived | not written | config.ts:93,144-147,170 |
| FC_OIDC_DEVICE_ENDPOINT | URL, optional | `{base}/oauth/device/code` | opt | RFC 8628 device authorization endpoint | derived (Auth0 path shape) | not written | config.ts:94,171 |
| FC_OIDC_TOKEN_ENDPOINT | URL, optional | `{base}/oauth/token` | opt | token endpoint | derived | not written | config.ts:95,172 |
| FC_RBAC_CONFIG | JSON object: `{groupRoles: {group: grant}, localRbac: {subject: grant}, defaultTenant?: string(min 1)}`, grant = `{role: global-admin / tenant-admin / tenant-user, tenant?: string(min 1)}`; bad JSON or schema -> ConfigError | `{groupRoles:{}, localRbac:{}}` (empty = fail-closed) | opt | the Console role map (2.4) | every login refused 403 `no_authority` | install.sh:183-188 (rewritten every run) | config.ts:20-31,176-197,268 |

Note: `FC_RBAC_CONFIG` is read directly from the env map (config.ts:181-183), not through the zod schema's
field list, but it is still zod-validated (`RbacConfigSchema`, config.ts:190-194).

### 2.2 Operator auth: OIDC device flow (apps/bff/src/auth/oidc.ts, provider.ts, router.ts)

- Mounted only when `FC_OIDC_ISSUER` is set (index.ts:31-43). Flow = OAuth 2.0 Device Authorization Grant
  (RFC 8628) -- no redirect URI, no client secret (the BFF config has no secret key at all).
- Login: `POST /auth/login` -> device code request to the device endpoint with `client_id` + `scope`
  (oidc.ts:61-77); the browser gets an opaque `loginId`, user code, verification URI, expiry, interval
  (router.ts:116-137). The bearer-grade device code stays server-side (login-store.ts:1-8).
- Poll: `POST /auth/login/poll {loginId}` -> token endpoint poll (oidc.ts:80-98); `authorization_pending`
  / `slow_down` -> `{status: pending}`; a terminal IdP error -> 401 `login_failed`; an unknown/expired
  loginId -> 404 `login_expired` (router.ts:139-205). The SPA polls at the IdP interval (Login.tsx:42,55).
- Verification: the id_token is verified with jose `jwtVerify` against a cached remote JWKS (one per URI),
  checking signature, `iss` = FC_OIDC_ISSUER exactly, `aud` = FC_OIDC_CLIENT_ID, expiry
  (oidc.ts:100-115). The access token is received but not used.
- Identity: subject = `sub`; email if present; groups = the `FC_OIDC_ROLE_CLAIM` claim IF it is an array
  of strings, else none (oidc.ts:118-145). A verified token with no resolvable authority -> 403
  `no_authority` and no session (router.ts:184-191).
- Timeouts: the device-code and token `fetch` calls carry no timeout/AbortSignal (oidc.ts:62-66,81-89).
  jose's remote-JWKS fetch timeout is the library default (value not pinned in this repo -- UNVERIFIED).
- `GET /auth/me` returns only `{subject, email?, tier}` -- never role or tenant (router.ts:52-67,213-220).
- Auth body cap: 4096 bytes (router.ts:59,88-98).
- Endpoint derivation assumes Auth0 path shapes (`/oauth/device/code`, `/oauth/token`,
  `/.well-known/jwks.json`); another IdP needs the three override keys (config.ts:149-174). No OIDC
  discovery document is fetched.

### 2.3 Session + cookie (apps/bff/src/auth/session.ts, cookie.ts)

- Session id: 32 random bytes, hex (session.ts:64). In-memory Map, bounded by FC_SESSION_MAX, oldest
  evicted (session.ts:50-77). Expiry is absolute: `expiresAt = now + FC_SESSION_TTL_MS` at login, checked
  on every read (session.ts:72,80-88). No refresh / sliding renewal exists.
- Consequence: a `console-bff` restart (including every `install.sh` run, install.sh:226) drops every
  session -- all operators must log in again. Derived from the in-memory store; not live-tested.
- Cookie: `<name>=<id>; HttpOnly; SameSite=Strict; Path=/; Max-Age=<ttl/1000>[; Secure]`
  (cookie.ts:33-44). Logout clears with `Max-Age=0` and destroys the session (router.ts:207-211;
  cookie.ts:47-51).

### 2.4 The RBAC role map (`FC_RBAC_CONFIG`; apps/bff/src/auth/rbac.ts)

- Roles: `global-admin`, `tenant-admin`, `tenant-user`; privilege order user < admin < global
  (rbac.ts:13-17).
- Resolution (`resolveAuthority`, rbac.ts:68-82):
  1. If the token carries ANY group -> `groupRoles` only; the highest matched grant wins; unmatched groups
     ignored (rbac.ts:45-61,73-74). `localRbac` is NOT consulted, even if no group matched.
  2. If the token carries NO group -> `localRbac[subject]`.
  3. `global-admin` -> acts in `defaultTenant`; if `defaultTenant` is unset -> no authority.
  4. `tenant-admin` / `tenant-user` -> the grant's `tenant`; if missing -> no authority.
  5. No authority -> login refused (403 `no_authority`).
- Loaded once at start (config.ts:268); changing it needs a BFF restart.
- Projection for the UI: `rbacConfigView` sorts keys and hides any tenant on a global-admin grant
  (rbac.ts:98-119); served by `GET /api/settings/console-rbac`, global-admin only (server.ts:2102-2121).
- The installer writes exactly ONE grant: `localRbac[CONSOLE_OPERATOR_SUB] = global-admin` plus
  `defaultTenant = CONSOLE_OPERATOR_TENANT`, with `groupRoles` always `{}` (install.sh:183-188).

### 2.5 EXPLAIN tier derivation + the Settings tier (apps/bff/src/auth/tier.ts, engine/principal.ts)

- Tiers: `User < Developer < Admin < SecurityAudit` (tier.ts:12-15).
- Session tier = max( tier from token groups via `DEFAULT_ROLE_TIERS` {console-user: User,
  console-developer: Developer, console-admin: Admin, console-security-audit: SecurityAudit}
  (lower-cased match), tier of the resolved role {global-admin: Admin, tenant-admin: Admin, tenant-user:
  User} ) (tier.ts:17-24,33-37,50-62; oidc.ts:133-139). Unknown groups grant nothing; floor is User.
- The TUNE comment says "A deployment may override the role claim + mapping via config" (tier.ts:17); only
  the claim NAME is configurable (FC_OIDC_ROLE_CLAIM). `deriveTier` is always called with the default map
  (oidc.ts:139); no config key supplies a map.
- Settings tier: `principalFromSession` sets `settingsTier = session.tier` ONLY for `global-admin`
  (principal.ts:29-36,59); `settingsDelegation` sends it as `settings_tier` on the 10 Settings operations
  and nowhere else (operator-engine.ts:672-686,799-848). Per the code comment, every other role's
  Settings reads/writes are refused by the engine (engine-side behavior is the engine slice's to confirm).
- The tier is shown in the TopBar badge (TopBar.tsx:44); role and tenant are not shown anywhere.

### 2.6 Active-tenant override (`x-active-tenant` request header)

- Every operator-delegated route passes the trimmed `x-active-tenant` header to `principalFromSession`
  (server.ts:181-192); it is honored ONLY for `global-admin`, ignored for tenant roles (principal.ts:39-60).
- The SPA never sends this header (no occurrence in apps/console/src or packages). So in practice a global
  admin always acts in `defaultTenant`; there is no tenant selector in the UI.

### 2.7 Ephemeral cache (apps/bff/src/cache.ts)

- One process-wide cache: `new EphemeralCache(FC_CACHE_TTL_MS, FC_CACHE_MAX_ENTRIES)` (index.ts:22).
  In-memory Map; `get` misses when expired or when the stored version tag differs; `set` evicts the oldest
  key at capacity; `deletePrefix` for post-write invalidation (cache.ts:18-66).
- Version tags are constant strings per surface (no engine commit version), so staleness is bounded by the
  TTL only: `overview-v2` (server.ts:538), `vtz-v1` (:772), `soc-v1` (:1562), `policies-v1` (:1748).
- Cached reads (all keys tenant-scoped): Overview sankey `overview:sankey:{tenant}:{since}:{until}:{limit}`
  (:595-597), entity connections `overview:connections:{tenant}:{kind}:{id}` (:681), members
  `overview:members:{tenant}:{container}` (:737); VTZ tree/detail `vtz:{tenant}:tree:{limit}` /
  `vtz:{tenant}:detail:{id}` (:812-815); SOC kpis/incidents/weekly and per-incident detail, narrative,
  telemetry, audit, notes, impact, report `soc:{tenant}:...` (:1632-1646); Policies list/detail
  `policies:{tenant}:...` (:1793-1796).
- Never cached: VTZ convergence (:809-811), entity drawer detail, Logs, Users, Objects, IdAM, all Settings,
  security-session. SOC refusals (404) are not cached (:1682-1685).
- Invalidation: any VTZ mutation drops `vtz:{tenant}:` (:1072); any SOC command drops `soc:{tenant}:`
  (:1485,1515,1545); any Policies command drops `policies:{tenant}:` (:1901). Distribute invalidates nothing
  server-side (convergence is uncached).

### 2.8 TUNE-tagged constants (`grep -rn TUNE apps/bff/src`, non-test)

| Constant | Value | Meaning | Evidence |
|---|---|---|---|
| DEFAULT_ROLE_TIERS | console-user=User, console-developer=Developer, console-admin=Admin, console-security-audit=SecurityAudit | group -> tier map (not actually configurable, see 2.5) | auth/tier.ts:17-24 |
| ReverseDnsResolver DEFAULT_CONFIG | ttlMs 6 h (21,600,000), lookupTimeoutMs 2000, maxConcurrent 8 | PTR cache for Overview destination names (hits and misses cached); constructed with defaults only (index.ts:27) | engine/reverse-dns.ts:31-38 |
| MAX_WEEKLY_WEEKS | 12 | weeks a weekly-volume read asks for (engine clamps to 12) | engine/soc.ts:374-375 |
| DEFAULT_LOG_LIMIT / MAX_LOG_LIMIT | 100 / 500 | Logs page size request bounds (engine clamps further) | server.ts:423-426 |
| DEFAULT_OVERVIEW_LIMIT / MAX_OVERVIEW_LIMIT | 10,000 / 10,000 | Overview request bound (raised from 1000 by operator steer 2026-07-16) | server.ts:524-530 |
| DATA_STORE_PORTS | 1433 SQL Server, 1521 Oracle DB, 3306 MySQL, 5432 Postgres, 5984 CouchDB, 6379 Redis, 9042 Cassandra, 9200 Elasticsearch, 11211 Memcached, 27017 MongoDB | Overview destination -> data-stores ring | engine/destination-classifier.ts:24-36 |
| BRAND_RULES | 33 suffix rules (DNS resolvers, CDNs, S3, SaaS brands incl. github, slack, salesforce, office365, amazonaws, azure, google, anthropic, openai, wikipedia) | PTR suffix -> display name + ring, longest suffix wins | engine/destination-classifier.ts:46-90 |
| LEASE_WINDOW_MS | 24 h | freshness lease stamped on every distributed policy bundle (`not_after = now + 24h`) | engine/distribute.ts:27-34,95 |

Untagged sibling table: PRIVATE_APP_PORTS {22 SSH, 445 Microsoft SMB, 3389 RDP, 5900 VNC}
(destination-classifier.ts:38-44).

### 2.9 Other constants, timeouts, limits, budgets (BFF + @forge/wire)

| Item | Value | Evidence |
|---|---|---|
| Command body cap (all JSON command routes except distribute) | 8,192 bytes | server.ts:232-247 |
| Distribute body cap | 64 KiB (`members`: non-empty array of non-empty strings) | server.ts:966-981 |
| Auth route body cap | 4,096 bytes | auth/router.ts:59 |
| Engine call retry | one reconnect + retry on a transport failure; a domain refusal is not retried | engine/wire-client.ts:585-608 |
| Engine calls serialized | one in-flight frame per connection (stream 0) | wire-client.ts:509-526 |
| OS TCP keepalive on the loopback wire socket | 15,000 ms | packages/wire/src/socket-transport.ts:120-124 |
| Heartbeat | FC_ENGINE_HEARTBEAT_MS; a failed beat invalidates the transport; timer `unref`d | wire-client.ts:554-579 |
| Entity drawer decisions read | limit 50 | engine/entity-detail.ts:298-302 |
| Entity connections / container members | limit 500 each | engine/overview.ts:92,113,120,187 |
| VTZ tree | default 200, max 500 (bad/absent `limit` -> 200) | engine/vtz.ts:57-60,76; server.ts:863-870 |
| SOC queue | limit 200 (a request; the engine refuses rather than truncates) | engine/soc.ts:98-106,126 |
| SOC weekly | `weeks` default 4, must be 1..12 else 400 | server.ts:1616-1621 |
| Settings `surface` param | regex `^[a-z_]{1,64}$` else 400 | server.ts:2026-2031 |
| Settings approve id | path regex `[0-9]{1,15}`, positive safe integer | server.ts:2227-2228; contracts/src/settings.ts:953-956 |
| Settings history limit | absent -> 0 (engine default); else 1..100 (SETTINGS_HISTORY_MAX) else 400; the SPA asks 50 | contracts/src/settings.ts:949-964; useSettings.ts:278 |
| Settings report names | `server, connectivity, security, telemetry, key_issuing, egress`; unknown/empty -> 400 | contracts/src/settings.ts:698-775 |
| Isolate postures accepted | `quarantine` or `deny` (SPA always sends quarantine) | server.ts:249-257; DrawerHost.tsx:187 |
| Operator PrincipalId | UUID v5 of the OIDC `sub` under namespace `a7c9e1f0-3b2d-4c5e-8f6a-1d2b3c4d5e6f` | auth/operator-id.ts:12,28-37 |
| IdAM secret reference | hard-coded `/etc/cdb/secrets/auth0-management.secret` | server.ts:1921-1926 |
| Signer host | hard-coded `127.0.0.1` (not FC_ENGINE_HOST) | server.ts:983-987 |
| Log redaction paths | password, token, key, secret, authorization (and `*.` variants), req.headers.authorization, tls.key | log.ts:10-23 |
| HTTP server timeouts | none set in code (Node `http.createServer` defaults) | server.ts:2735-2738 |
| SPA static | path traversal -> 403; extension-less path -> index.html; unknown extension -> octet-stream | static.ts:43-92 |
| SPA polling (context for logs.tail / overview.live) | Overview 2000 ms; Logs 2000 ms; Logs backfill 100 rows x up to 50 pages, refresh 30 s; IdAM connector list 3 s while a sync runs; cognition run 5 s | useOverview.ts:19; useLogs.ts:14,69-71; useIdam.ts:39; useCognitionRun.ts:42 |

### 2.10 HTTP route table (apps/bff/src/server.ts + auth/router.ts)

Dispatch order (server.ts:2713-2733, 2591-2710): the auth router gets every request first; then the
command handlers in this order -- isolate, log export, distribute, VTZ commands, Users commands, Objects
commands, Policies commands, IdAM sync, IdAM connect, IdAM secret, governed settings (GET+POST),
console-rbac, settings reports, security-session, settings governance, SOC settings, IdAM configure, SOC
commands (2599-2653); then the read-only gate: any other non-GET -> 405 `method_not_allowed`
(2654-2657); then the GET handlers; then the SPA fallback; then 404.

Common responses (unless noted): no session -> 401 `unauthorized`; bad body/params -> 400
(`malformed_request` / `bad_request`); engine refusal -> 403 `{error: refused, class}`; unexpected engine
error -> 502 `engine_error`; an engine payload the Console cannot narrow -> 503 `unavailable`. The 503
`engine_unavailable` branch (operatorEngine absent) is unreachable in production because index.ts:25
always constructs it (the comment at server.ts:164 is stale). Gate "session" = cookie session only;
every engine op is then authorized engine-side under the injected delegation. Role gating in the BFF
itself exists on exactly one route (#65).

| # | Method + path | Gate | Handler | Engine op / backend | Cache | Notable responses | SPA consumer |
|---|---|---|---|---|---|---|---|
| 1 | POST /auth/login | none (auth mounted) | router.ts:116-137 | IdP device-code | - | 502 `idp_unavailable` | auth/api.ts:54 (Login.tsx) |
| 2 | POST /auth/login/poll | opaque loginId | router.ts:139-205 | IdP token + JWKS verify | - | 404 `login_expired`, 401 `login_failed`/`token_invalid`, 403 `no_authority`; Set-Cookie on complete | auth/api.ts:61 |
| 3 | POST /auth/logout | cookie (optional) | router.ts:207-211 | - | - | clears cookie | auth/api.ts:72 (TopBar) |
| 4 | GET /auth/me | cookie | router.ts:213-220 | - | - | 401 `unauthenticated` | auth/api.ts:45 (useSession) |
| 5 | GET /healthz | none | server.ts:2658-2661 | - | - | `{status: ok}` | validate.sh [3/4] via :8443 |
| 6 | GET /readyz | none | server.ts:2662-2672 | wire PING/PONG through the sidecar | - | 503 `{ready:false}` | validate.sh [2/4] |
| 7 | GET /openapi.json | none | server.ts:2673-2676 | - | - | documents only the 10 Settings paths + ops + auth (openapi.ts:38-120,143-198) | - |
| 8 | GET /api/entity/{principal,vtz,object}/{id} | session | 199-227 | LIST_AGENTS, LIST_PRINCIPALS, ENTITY_DECISIONS, 2 x QuerySubmit; object -> OBJECT_DETAIL | no | always 200; sections degrade independently | useEntityDetail -> DrawerHost |
| 9 | POST /api/entity/{kind}/{id}/isolate | session | 265-318 | CONTAIN | - | 405 non-POST | useIsolate -> DrawerHost |
| 10 | GET /api/logs | session | 472-522 | LOG_QUERY | no | the `offset` query param is NOT parsed (429-464) | useLogs, useLogsBackfill -> LogsSurface |
| 11 | GET /api/logs/explain/{id} | session | 472-522 | LOG_EXPLAIN | no | refusal -> 404 `not_found` (non-oracle) | useLogExplain |
| 12 | POST /api/logs/export | session | 369-418 | LOG_EXPORT (audited) | no | 405 non-POST | useExportLogs |
| 13 | GET /api/overview/sankey | session | 576-649 | CONNECTIVITY_GRAPH + reverse DNS | overview-v2 | 503 unknown risk band | useOverview, useVtzRiskBands |
| 14 | GET /api/overview/entity-connections?id=&kind= | session | 658-704 | ENTITY_CONNECTIONS | yes | 400 missing id/kind | useEntityConnections |
| 15 | GET /api/overview/members?container= | session | 715-766 | CONNECTIVITY_MEMBERS | yes | 400 unknown container | useClassMembers |
| 16 | GET /api/vtz/tree[?limit] | session | 782-852 | VTZ_TREE | vtz-v1 | | useVtzTree |
| 17 | GET /api/vtz/detail?id= | session | 782-852 | VTZ_DETAIL | vtz-v1 | 400 no id | useVtzDetail |
| 18 | GET /api/vtz/convergence?id= | session | 782-852 | BUNDLE_CONVERGENCE | never | 400 no id | useBundleConvergence |
| 19 | POST /api/vtz | session | 1023-1088 | VTZ_CREATE | drops vtz:{tenant}: | 403 `{reason: denied}` / 409 `{reason: conflict}` | useVtzMutation |
| 20 | PUT /api/vtz/{id} | session | 1023-1088 | VTZ_EDIT | drops | as #19 | useVtzMutation |
| 21 | POST /api/vtz/{id}/rescope | session | 1023-1088 | VTZ_RESCOPE (`newName`) | drops | as #19 | useVtzMutation |
| 22 | DELETE /api/vtz/{id} | session | 1023-1088 | VTZ_DELETE | drops | 409 zone has children | useVtzMutation |
| 23 | POST /api/vtz/{id}/distribute | session + FC_SIGNER_PORT | 944-1021 | VTZ_DETAIL, POLICY_EFFECTIVE, sidecar sign, BUNDLE_COMMIT | - | 503 `signer_unavailable`, 404 `unknown_zone`, 503 composition, 422 `signing_refused`, 409 (Framing: non-advancing version) | useDistribute |
| 24 | GET /api/users | session | 1218-1254 | LIST_PRINCIPALS + LIST_AGENTS | no | | useUsers |
| 25 | GET /api/users/groups | session | 1218-1254 | LIST_GROUPS | no | | useGroups |
| 26 | POST /api/users | session | 1132-1216 | PRINCIPAL_CREATE | - | 409 Conflict, 400 Framing | useCreateUser |
| 27 | POST /api/users/edit | session | 1132-1216 | PRINCIPAL_EDIT | - | | useEditUser |
| 28 | POST /api/users/status | session | 1132-1216 | PRINCIPAL_SET_STATUS (active/suspended/revoked) | - | | useSetUserStatus |
| 29 | POST /api/users/groups | session | 1132-1216 | GROUP_CREATE | - | | useCreateGroup |
| 30 | POST /api/users/groups/edit | session | 1132-1216 | GROUP_EDIT | - | | NONE |
| 31 | POST /api/users/groups/members | session | 1132-1216 | GROUP_SET_MEMBERS | - | | NONE |
| 32 | GET /api/objects | session | 1379-1420 | OBJECT_LIST | no | | useObjects |
| 33 | GET /api/objects/detail?name= | session | 1379-1420 | OBJECT_DETAIL | no | | NONE (fetchObjectDetail unused) |
| 34 | POST /api/objects | session | 1318-1377 | OBJECT_CREATE (12 kinds; selector exact/glob/group_ref/cidr; lifecycle draft/published, 1264-1311) | - | 409/400/403 | useObjectWrite |
| 35 | POST /api/objects/edit | session | 1318-1377 | OBJECT_EDIT | - | | useObjectWrite |
| 36 | POST /api/objects/delete | session | 1318-1377 | OBJECT_DELETE | - | | useDeleteObject |
| 37 | GET /api/policies | session | 1767-1822 | POLICY_LIST_BY_ZONE | policies-v1 | | usePolicies |
| 38 | GET /api/policies/detail?vtz=&id= | session | 1767-1822 | POLICY_DETAIL | policies-v1 | | NONE |
| 39 | POST /api/policies | session | 1831-1919 | POLICY_CREATE | drops policies:{tenant}: | 409/400/403 | useSavePolicy |
| 40 | POST /api/policies/edit | session | 1831-1919 | POLICY_EDIT (`id` required) | drops | | useSavePolicy |
| 41 | POST /api/policies/publish | session | 1831-1919 | POLICY_PUBLISH (`vtz`,`id`,`version`) | drops | | useSavePolicy |
| 42 | POST /api/policies/delete | session | 1831-1919 | POLICY_DELETE (`vtz`,`id`) | drops | | useDeletePolicy |
| 43 | GET /api/soc/kpis | session | 1585-1746 | DETECT_SUMMARY + SOC_INCIDENT_LIST | soc-v1 | 503 on a refused summary | useSocKpis |
| 44 | GET /api/soc/incidents | session | 1585-1746 | SOC_INCIDENT_LIST (limit 200) | soc-v1 | 503 over the engine ceiling (never an empty queue) | useSocIncidents |
| 45 | GET /api/soc/incident?id= | session | 1585-1746 | SOC_INCIDENT_DETAIL | soc-v1 | 404 (uncached) | useSocIncident |
| 46 | GET /api/soc/narrative?id= | session | 1585-1746 | SOC_NARRATIVE | soc-v1 | | useSocNarrative |
| 47 | GET /api/soc/telemetry?id= | session | 1585-1746 | SOC_INCIDENT_TELEMETRY | soc-v1 | 404 | useSocTelemetry |
| 48 | GET /api/soc/audit?id= | session | 1585-1746 | SOC_INCIDENT_AUDIT | soc-v1 | 404 | useSocAuditTrail |
| 49 | GET /api/soc/notes?id= | session | 1585-1746 | SOC_INCIDENT_NOTES | soc-v1 | 404 | useSocNotes |
| 50 | GET /api/soc/impact?id= | session | 1585-1746 | SOC_INCIDENT_IMPACT | soc-v1 | 404 | useSocImpact |
| 51 | GET /api/soc/report?id= | session | 1585-1746 | SOC_INCIDENT_REPORT | soc-v1 | 404 | useSocReport |
| 52 | GET /api/soc/weekly?weeks= | session | 1585-1746 | SOC_WEEKLY_SUMMARY | soc-v1 | 400 outside 1..12 | useSocWeekly |
| 53 | POST /api/soc/plan/approve | session | 1439-1560 | SOC_PLAN_APPROVE (`incident`, `atRevision` int >= 0) | drops soc:{tenant}: | 409/400/403 | useApprovePlan |
| 54 | POST /api/soc/plan/modify | session | 1439-1560 | SOC_PLAN_MODIFY (`steps`) | drops | | useModifyPlan |
| 55 | POST /api/soc/generate | session | 1439-1560 | SOC_COGNITION_RUN | drops | | useCognitionRun |
| 56 | POST /api/soc/act | session | 1439-1560 | SOC_INCIDENT_ACT (assigned/acked/noted/closed) | drops | in-band refusal: blank reason -> 404, else 409 + explanation | useCaseAct |
| 57 | POST /api/soc/disposition | session | 1439-1560 | SOC_INCIDENT_DISPOSITION | drops | as #56 | useDisposition |
| 58 | GET /api/idam/connectors | session | 2559-2589 | IDAM_CONNECTORS | no | | useIdamConnectors |
| 59 | POST /api/idam/sync | session | 2511-2557 | IDAM_SYNC | - | 409 disabled/unconfigured, 400 unknown provider | useIdamSync |
| 60 | POST /api/idam/connect | session | 2446-2509 | IDAM_CONNECT (provider, domain, clientId required; audience optional; fixed secret ref) | - | 409/400/403 | useIdamConnect |
| 61 | POST /api/idam/secret | session + FC_IDAM_SECRET_PORT; NO engine authorization | 2392-2444 | sidecar secret-set (loopback NDJSON) | - | 503 `secret_plane_unprovisioned` / `secret_plane_unavailable`, 409 refused | useIdamConnect step 1 |
| 62 | POST /api/idam/configure | session | 1928-1986 | IDAM_CONFIGURE (enabled, pollIntervalSecs, fullSyncCadenceHours) | - | 400 Framing (out-of-range cadence), 409 | useIdamConnect step 3 |
| 63 | GET /api/settings[?surface=] | session (+ engine tier via settings_tier) | 2000-2053 | SETTINGS_READ | never | 403 `{class: Tier}` | useGovernedSettings |
| 64 | POST /api/settings | as #63 | 2060-2095 | SETTINGS_COMMIT | never | 200 receipt even when refused | useGovernedChange(false) |
| 65 | GET /api/settings/console-rbac | session + BFF role `global-admin` | 2102-2121 | none (BFF start config) | never | 403 `{class: Role}` | useConsoleRbac |
| 66 | GET /api/settings/reports?names= | as #63 | 2128-2176 | SETTINGS_REPORTS | never | 400 unknown name | useSettingsReports |
| 67 | GET /api/settings/security-session | session only | 2183-2225 | sidecar session lookup keyed by `req.socket.remotePort` | never | 200 `{status: unconfigured / not-tunnelled / negotiated, group}`; 503 lookup failure | useSecuritySession |
| 68 | POST /api/settings/propose | as #63 | 2240-2334 | SETTINGS_PROPOSE | never | 200 receipt | useGovernedChange(true) |
| 69 | GET /api/settings/approvals | as #63 | 2240-2334 | SETTINGS_APPROVALS | never | 403 Tier | useSettingsApprovals |
| 70 | POST /api/settings/approvals/{id}/approve | as #63 | 2240-2334 | SETTINGS_APPROVE | never | 200 receipt | useApproveProposal |
| 71 | GET /api/settings/history[?limit=] | as #63 | 2240-2334 | SETTINGS_HISTORY | never | 400 limit > 100 | useSettingsHistory |
| 72 | POST /api/settings/rollback | as #63 | 2240-2334 | SETTINGS_ROLLBACK (`to`) | never | 200 receipt | useRollback |
| 73 | GET /api/settings/soc | as #63 | 2336-2390 | SOC_SETTINGS_READ | never | 403 Tier | useSocSettings |
| 74 | POST /api/settings/soc | as #63 | 2336-2390 | SOC_SETTINGS_COMMIT (patch must carry tiers or siemWriteback) | never | 200 receipt | useCommitSocSettings |
| 75 | GET (anything else) | none | 2704-2709; static.ts:73-92 | static SPA from FC_SPA_DIST | - | 404 when unset or a missing asset | the SPA |

With OIDC unset: routes 1-4 are not mounted (a POST falls to the 405 gate; `GET /auth/me` falls to the SPA
fallback, which answers index.html for an extension-less path), and every `/api/*` route answers 401
because no session can exist. Derived from code; not run.

### 2.11 Startup, logging and failure behavior

- Boot (index.ts:19-62): load config -> pino logger -> cache -> engine client (lazy: connects on the
  first call, wire-client.ts:528-544) -> operator engine -> reverse-DNS resolver -> auth router (only with
  OIDC) -> listen on FC_HTTP_HOST:FC_HTTP_PORT.
- Shutdown: SIGTERM/SIGINT -> close server -> close engine transport -> exit 0 (index.ts:64-77).
- Every brokered engine call writes an info line `engine delegation` {operator subject, tier, action,
  requestId, tenant} (operator-engine.ts:207-235,657-669); logs are pino JSON on stdout (journald under
  systemd), `service: forge-bff` (log.ts:26-33).
- A last-resort handler answers 500 `{error: internal}` (server.ts:2725-2731).

---

## 3. The crypto sidecar (`sidecar/`, Rust, standalone Cargo project)

One process, `console-crypto-sidecar` (sidecar/Cargo.toml:8-19), toolchain pinned 1.96.0
(sidecar/rust-toolchain.toml; Cargo.toml:12). Engine-side crates pinned to crucible rev
`b5e301ff0f574138b8871d4823165b94afc16dbb` (`cdb-mtls`, `cdb-types`, `cdb-artifact`, Cargo.toml:32,54-55).
The BFF talks to it only over plaintext loopback; it owns every TLS handshake and the policy signing key.

### 3.1 Config fields (JSON file; sidecar/src/config.rs)

`#[serde(deny_unknown_fields)]`: an unknown or misspelled field refuses startup (config.rs:16-20). Missing
required fields refuse startup (serde). Path existence is checked where the file is read, not at parse.
"Provisioned value" = what `sidecar/deploy/provision-sidecar.sh` writes (config.json is fully rewritten on
every run, provision-sidecar.sh:160-175).

| Field | Req? | Validation | Provisioned value (knob, default) | Used for | Evidence |
|---|---|---|---|---|---|
| admin_bind_ip | yes | IP literal; hostname or unspecified (`0.0.0.0`, `::`) -> `WidenedBind`; loopback accepted | `$NODE_IP` (CONSOLE_NODE_IP, required) | admin terminator bind | config.rs:21-22,107; bind.rs:37-45; admin.rs:40; provision:162 |
| admin_port | yes | u16 (no further check) | `$ADMIN_PORT` (8443) | admin terminator port | config.rs:23-24; provision:22,163 |
| admin_upstream | yes | loopback `ip:port` (`is_loopback`) | `127.0.0.1:$BFF_HTTP_PORT` (8787) | where decrypted browser bytes go (the BFF listener) | config.rs:25-26,108; bind.rs:55-65; admin.rs:106 |
| engine_addr | yes | NOT validated at load (any `host:port`; resolved at connect) | `$ENGINE_ADDR` (`127.0.0.1:7879`, the crdb control plane) | engine mTLS target | config.rs:27-28; engine.rs:75,112; provision:37,165 |
| engine_servername | yes | must parse as a rustls `ServerName` (checked at bind) | `$ENGINE_SERVERNAME` (`control.localhost`) | server-cert name verified | config.rs:29-30; engine.rs:46-47; provision:38 |
| engine_ca | yes | PEM read at startup | `/etc/console-sidecar/engine-ca.pem` (install.sh:106) | trust root for the engine server cert | config.rs:31-32; main.rs:131 |
| engine_cert | yes | PEM read at startup | `/etc/console-sidecar/engine-client.pem` (install.sh:107) | client certificate presented to the engine | config.rs:33-34; main.rs:132 |
| engine_key | yes | PEM read at startup | `/etc/console-sidecar/engine-client.key` (install.sh:108) | client private key (software P-384 Console-CA leaf) | config.rs:35-40; main.rs:133 |
| egress_addr | yes | loopback `ip:port` | `127.0.0.1:$EGRESS_PORT` (8789) | listener for the BFF's plaintext wire bytes | config.rs:41-42,109; engine.rs:45; provision:25,170 |
| admin_cert | yes | PEM chain | `/etc/console-sidecar/admin-cert.pem` | admin TLS server certificate | config.rs:43-44; tls.rs:103-113 |
| admin_key | yes | PEM key | `/etc/console-sidecar/admin-key.pem` | admin TLS server key | config.rs:45-46 |
| sign_addr | no; pair with sign_seed | loopback; setting only one of the pair refuses startup | `127.0.0.1:$SIGN_PORT` (8790), written only when SIDECAR_BIN set (install.sh sets it unless CONSOLE_SKIP_SIGN=1) | bundle-signing service | config.rs:47-54,111-120; provision:136-141 |
| sign_seed | no; pair | load refuses: missing file, any group/other mode bit (`0o077`), length != 32 | `/etc/console-sidecar/sign.seed` | ML-DSA-87 seed | config.rs:55-57; signing.rs:40-49,123-151 |
| secret_addr | no; pair with secret_path | loopback; half a pair refuses startup | `127.0.0.1:$SECRET_PORT` (8791), always written | IdAM secret-set service | config.rs:58-64,122-130; provision:156-158 |
| secret_path | no; pair | path; its directory must be writable by the service (unit allows only /etc/cdb/secrets) | `$SECRET_PATH` (`/etc/cdb/secrets/auth0-management.secret`) | where the connector secret is written; MUST equal the BFF's hard-coded ref | config.rs:65-68; server.ts:1926; console-crypto-sidecar.service:29 |
| session_addr | no; single | loopback | `127.0.0.1:$SESSION_PORT` (8792), always written | admin-session lookup | config.rs:69-74,131-133; provision:173 |

`sidecar/deploy/config.example.json:1-17` shows the full shape with the provisioned defaults (except
`session_addr`, which the example omits).

### 3.2 Process, subcommands, startup order (sidecar/src/main.rs)

- Config path: first CLI argument, else env `SIDECAR_CONFIG`; neither -> error (main.rs:97-104). The unit
  passes `/etc/console-sidecar/config.json` (console-crypto-sidecar.service:20).
- Provisioning subcommands (no listener): `seed-init <path>` generates the seed once and refuses to
  overwrite; `seed-anchor <path>` loads an existing seed; both print the DistributionAnchor JSON
  `{"<key_id>":"<hex verifying key>"}` on stdout (main.rs:45-95).
- Startup order: load+validate config -> install the aws-lc-rs provider -> build admin TLS config + bind the
  admin listener -> (optional) session service -> read engine CA/cert/key + build the mTLS client config +
  bind egress -> (optional) load seed + bind signing service -> (optional) bind secret service -> run all
  legs until the first listener error or SIGINT/SIGTERM (main.rs:104-172). Any failure exits non-zero;
  systemd restarts it after 2 s (console-crypto-sidecar.service:21-22).
- No logging: the crate has no logging dependency (Cargo.toml:21-58); per-connection failures are
  discarded (`let _ = serve(...)`, admin.rs:86-90; `let _ = tunnel(...)`, engine.rs:98-100; the admin.rs:88
  comment says "CS.5 adds structured logging", not present). No connect/idle timeouts and no connection
  caps are configured on the tunnel legs (grep for timeout/Semaphore in src finds only a test sleep).

### 3.3 Admin TLS terminator -- browser leg (sidecar/src/tls.rs, admin.rs)

- Binds `admin_bind_ip:admin_port` after re-asserting the node-IP rule (admin.rs:34-51).
- Crypto provider: aws-lc-rs; key-exchange groups offered = `X25519MLKEM768` (hybrid PQC, preferred) and
  `SECP384R1` (the classical CNSA-1.0 floor); cipher suite = `TLS13_AES_256_GCM_SHA384` only; TLS 1.3 only;
  server-auth only (no client certificates) (tls.rs:20-32,68-81). A client offering only X25519 or P-256
  shares no group and is refused.
- Floor guard: startup fails unless the provider offers the hybrid group, the P-384 group, and only the
  CNSA suite (tls.rs:34-66).
- Certificate: PEM chain + key from `admin_cert`/`admin_key` (tls.rs:99-114). Provisioned as a SELF-SIGNED
  ECDSA P-384 leaf, CN `console-admin`, SAN `IP:$NODE_IP` + `DNS:$ADMIN_DNS` (default
  `console-admin.localhost`), EKU serverAuth, 365-day validity, key 0600 / cert 0644; kept on re-run unless
  `FORCE=1`; an org-CA cert may be pre-placed instead (provision-sidecar.sh:54-86). Nothing renews it.
- Tunnel: after the handshake it opens a TCP connection to `admin_upstream` and copies bytes both ways
  without inspecting them (admin.rs:95-130). With a session registry configured it registers the
  negotiated group under the upstream socket's LOCAL port before forwarding and removes it when the tunnel
  ends (admin.rs:109-125; session_service.rs:56-91).

### 3.4 Engine mTLS originator -- engine leg (sidecar/src/engine.rs)

- Listens on loopback `egress_addr`; for each BFF connection dials `engine_addr` and completes mTLS, then
  copies bytes both ways (engine.rs:39-57,84-123). The wire framing/handshake is the BFF's (byte tunnel).
- TLS profile = crdb `cdb_mtls::client_config` at the pinned rev: TLS 1.3 only, key exchange
  `X25519MLKEM768` offered EXCLUSIVELY (`pq_provider(true)`), server verified against `engine_ca`, client
  certificate `engine_cert`/`engine_key` presented (main.rs:128-142; crucible:crates/cdb-mtls/src/lib.rs at
  b5e301ff, `pq_provider` :52-66 and `client_config` :141-161). Cipher suites are not narrowed (the
  aws-lc-rs default provider's list).
- The pinned peer: the client identity is the software Console-CA leaf the crdb node installer mints under
  `/etc/cdb/control` (copied by install.sh [4]); the ENGINE admits it on the :7879 control plane only if its
  SHA-512 fingerprint is in `control_plane.peers` (crucible:crates/cdb-server/src/transport.rs:307-336),
  which the crdb installer pins from `CDB_CONTROL_ENROLL` with all five planes
  (crucible:deploy/cdb-install/installer/phases/50-config.sh:225). See 4.6 for the FC installer's own pin.
- Control-plane lease: crdb default 3600 s (`CDB_CONTROL_LEASE_TTL_SECS`,
  crucible:crates/cdb-server/src/bin/cdb-mkconfig.rs:1074-1076); the BFF heartbeat (20 s) keeps it alive.

### 3.5 Policy-bundle signing plane (sign_service.rs, signing.rs)

- Protocol: loopback TCP, newline-delimited JSON, one `BundleDraft` per line -> one response line
  `{"signed": {bundle, cbor}}` or `{"refused": {reason}}`; persistent connection allowed
  (sign_service.rs:1-30,45-66). Per-request cap 1 MiB (TUNE, sign_service.rs:37-43); an oversized request is
  refused and the connection closed.
- Key: ML-DSA-87 (FIPS 204) derived from a 32-byte seed (signing.rs:39-40); seed generated once with the
  aws-lc-rs RNG, created atomically `create_new` + mode 0600 (signing.rs:161-196); `load` refuses a missing
  seed (never re-mints), a group/other-accessible seed, or a wrong length (signing.rs:115-151).
- Key id: first 32 hex chars of SHA-512(verifying key) (signing.rs:45-49,263-276). The signer fills
  `signing_key_id` and `signature_algorithm = MlDsa87` itself; the caller cannot choose (signing.rs:84-89,
  240-260). Signature = ML-DSA-87 over `sha512(bundle_preimage_bytes(bundle))` from crdb `cdb-artifact`.
- The response carries canonical ciborium CBOR bytes that the BFF commits verbatim (sign-client.ts:16-26;
  Cargo.toml:35-40).
- Anchor: `/etc/console-sidecar/distribution-anchor.json` (0644), to be delivered to every Torch endpoint as
  `TORCH_POLICY_ANCHOR` (provision-sidecar.sh:88-126; sidecar/deploy/README.md:80-102). Rotation = a new seed
  = a new anchor for every endpoint (no rotation verb exists).
- The bundle's freshness lease is set by the BFF, not the sidecar: 24 h (distribute.ts:34,95).

### 3.6 IdAM secret-set service (secret_service.rs)

- Protocol: loopback NDJSON `{provider, secret}` -> `"ok"` or `{"refused":{"reason"}}` (secret_service.rs:
  1-30,52-69). Per-request cap 64 KiB (TUNE, :40-46).
- Accepts only provider `auth0` (:48-50,162-166); refuses an empty secret (:167-171).
- Writes `secret_path` atomically: temp file `.<name>.tmp` in the same directory, mode forced 0640, fsync,
  rename (:180-213). Never logs or returns the secret. It does not chown; the provisioner makes the
  directory `console-sidecar:cdb` mode 2750 (setgid) so the engine user `cdb` can read (secret_service.rs:
  16-22; provision-sidecar.sh:143-155).
- No caller authentication beyond loopback reachability (see 3.9); the BFF route in front of it checks only
  that a session exists (server.ts:2392-2409).

### 3.7 Admin-session lookup service (session_service.rs)

- Protocol: loopback NDJSON `{"port": N}` -> `{"group": "X25519MLKEM768" | "secp384r1" | "other" | null}`;
  malformed -> `{"error": ...}`; per-request cap 256 bytes; `deny_unknown_fields` (session_service.rs:14-18,
  30-42,93-99,168-205). `null` = no live admin tunnel from that port.
- The BFF asks with its own request's `socket.remotePort` (server.ts:2200-2216; engine/session-client.ts).
- The SPA shows the answer on Settings -> Security ("Key exchange negotiated", good badge for
  X25519MLKEM768, caution otherwise) (SettingsReportTabs.tsx:100-145).

### 3.8 systemd unit and provisioning script

`sidecar/deploy/console-crypto-sidecar.service`:
- `User=console-sidecar`, `Group=console-sidecar`, `ExecStart=/usr/local/bin/console-crypto-sidecar
  /etc/console-sidecar/config.json`, `Restart=on-failure`, `RestartSec=2` (:16-22).
- Hardening: NoNewPrivileges, ProtectSystem=strict with the single writable path `/etc/cdb/secrets`
  (`ReadWritePaths`), ProtectHome, PrivateTmp, PrivateDevices, ProtectKernelTunables/Modules,
  ProtectControlGroups, `RestrictAddressFamilies=AF_INET AF_INET6`, RestrictNamespaces, LockPersonality,
  MemoryDenyWriteExecute, empty capability sets, `ReadOnlyPaths=/etc/console-sidecar` (:24-44).
- Consequence: a `secret_path` outside `/etc/cdb/secrets` cannot be written at runtime (ProtectSystem=strict).

`sidecar/deploy/provision-sidecar.sh` (called by install.sh [3]): mints the admin leaf if missing,
runs `seed-init`/`seed-anchor` via SIDECAR_BIN as the service user (temporarily opening the dir to 0770),
prepares the secret dir, writes config.json (0644), chowns `/etc/console-sidecar` to the service user, and
prints the BFF port hand-offs (provision-sidecar.sh:47-193). Its knobs are tabled in 4.2.

### 3.9 Loopback trust (what any local process can reach)

None of the four loopback listeners authenticates its caller; they rely on being loopback-only
(bind.rs:47-65; sidecar/deploy/README.md:73-78 frames the posture as "local capture"). Derived from the code
(not tested): any process on the node that can open a TCP socket to 127.0.0.1 can
- use `egress_addr` (8789) to reach the engine through the Console's pinned control-plane identity (the
  wire frames, including the operator delegation, are the caller's own -- operator-engine.ts:693-700 shows
  the BFF injects it; nothing in the sidecar checks it);
- use `sign_addr` (8790) to obtain Forge-signed policy bundles for any well-formed draft;
- use `secret_addr` (8791) to overwrite the Auth0 connector secret file;
- use `session_addr` (8792) to learn which key exchange a tunnel negotiated.
The BFF's own plaintext listener (8787) is equally unauthenticated at the transport (sessions still apply).
The docs acknowledge a Unix-socket hardening as future work (sidecar/deploy/README.md:76-78); both units
currently restrict to AF_INET/AF_INET6.

---

## 4. The installer (`deploy/`)

Run as root: `sudo CONSOLE_NODE_IP=... CONSOLE_BIN_DIR=... CONSOLE_PEER_TENANT=... deploy/install.sh`
(install.sh:10-31,49). Fail-closed (`set -euo pipefail`, :32). The installer does NOT build the sidecar
(it installs `$CONSOLE_BIN_DIR/console-crypto-sidecar`, :58) and does NOT install Node (the BFF unit runs
`/usr/local/bin/node`, console-bff.service:22; repo pins Node `>=22 <23`, package.json:8-11).

### 4.1 `install.sh` knobs (environment)

| Knob | Default | Required? | Effect | Evidence |
|---|---|---|---|---|
| CONSOLE_NODE_IP | none | REQUIRED | sidecar `admin_bind_ip` + SAN; validate target | install.sh:11,39,114; validate.sh:11 |
| CONSOLE_BIN_DIR | none | REQUIRED | dir holding the prebuilt `console-crypto-sidecar` | :12,40,58 |
| CONSOLE_BFF_DIST | unset -> build from the repo AS THE REPO OWNER (`pnpm install --frozen-lockfile`, `pnpm -r build`, `pnpm --filter @forge/bff --prod deploy .bff-deploy`); fails if anything root-owned is left in the checkout | optional | source of `/usr/local/lib/console-bff` | :13,41-83 |
| CONSOLE_SPA_DIST | `$repo/apps/console/dist` | optional (must contain index.html) | copied to `/usr/local/lib/console-bff/spa` | :91-100 |
| CONSOLE_SKIP_SIGN | 0 | optional | `1` = no signing plane (SIDECAR_BIN empty -> no `sign_addr`/`sign_seed`) | :109-113 |
| CONSOLE_SESSION_PORT | 8792 | optional | passed to provision (SESSION_PORT) AND written as FC_SIDECAR_SESSION_PORT; also read by validate [2c] | :116,218; validate.sh:52 |
| CONSOLE_CONTROL_SRC | /etc/cdb/control | optional | where the crdb node installer's Console-CA leaf (ca.pem, client.pem, client.key) is copied from | :14-15,124,130-134 |
| CONSOLE_SKIP_ENROLL | 0 | optional | `1` skips the leaf copy [4] | :16,125-126 |
| CONSOLE_PEER_TENANT | none | REQUIRED whenever an engine cert is present (`:?` expansion) | tenant UUID of the [4b] wire-peer pin | :17-18,147 |
| CONSOLE_PEER_CLEARANCE | secret | optional | clearance of the [4b] pin | :19,148 |
| CONSOLE_PEER_PLANES | data,agent,cognition,otlp,delegation | optional | plane grant of the [4b] pin (crdb accepts data, agent, cognition, otlp, delegation) | :20-21,149; crucible:crates/cdb-server/src/bin/cdb-mkconfig.rs:948-959 |
| CONSOLE_NODE_CBOR | /etc/cdb/node.cbor | optional | node config the pin is merged into | :22,150,153 |
| CONSOLE_CDB_MKCONFIG | /usr/local/bin/cdb-mkconfig | optional (must be executable) | the pinning tool; its version is NOT checked | :23,151-152 |
| CONSOLE_OPERATOR_TENANT | df46dcb7-2e91-448c-a406-42e492b85e36 | optional | `FC_RBAC_CONFIG.defaultTenant` | :24-25,183 |
| CONSOLE_OPERATOR_SUB | auth0\|6a3abf93a1c6aeb8baddbc94 | optional | the single `localRbac` subject granted global-admin | :26-28,184 |
| CONSOLE_OIDC_ISSUER | https://dev-6rcwumbp1tsae8me.us.auth0.com/ | optional; `none` = auth unmounted | FC_OIDC_ISSUER | :29-31,193-206 |
| CONSOLE_OIDC_CLIENT_ID | G0ve3f1ooy2kZUFg8nK5VALvmOdqXGVV | optional | FC_OIDC_CLIENT_ID | :196 |
| CONSOLE_OIDC_ROLE_CLAIM | https://forgecentral.io/roles | optional | FC_OIDC_ROLE_CLAIM | :197 |
| CONSOLE_SIGNER_PORT | 8790 | optional | FC_SIGNER_PORT ONLY (the sidecar port comes from SIGN_PORT, see 4.9) | :216 |
| CONSOLE_IDAM_SECRET_PORT | 8791 | optional | FC_IDAM_SECRET_PORT ONLY (the sidecar port comes from SECRET_PORT) | :217 |

The header (:10-31) lists 15 of these; CONSOLE_SPA_DIST, CONSOLE_SKIP_SIGN, CONSOLE_SESSION_PORT,
CONSOLE_SIGNER_PORT and CONSOLE_IDAM_SECRET_PORT are only discoverable in the body.

### 4.2 `provision-sidecar.sh` knobs (sidecar/deploy/provision-sidecar.sh:19-43)

install.sh sets OUT_DIR, NODE_IP, SIDECAR_BIN, ENGINE_CA, ENGINE_CERT, ENGINE_KEY and SESSION_PORT on the
call (install.sh:114-117). Every other knob is inherited from the environment install.sh was started with
(standard shell environment inheritance; no code maps a CONSOLE_* name onto them).

| Knob | Default | Set by install.sh? | Effect |
|---|---|---|---|
| OUT_DIR | /etc/console-sidecar | yes (same) | where config, certs, seed, anchor live |
| NODE_IP | none (required) | yes (CONSOLE_NODE_IP) | admin bind + cert SAN |
| ADMIN_PORT | 8443 | no | `admin_port` |
| ADMIN_DNS | console-admin.localhost | no | admin cert DNS SAN |
| BFF_HTTP_PORT | 8787 | no | `admin_upstream` port (must equal FC_HTTP_PORT) |
| EGRESS_PORT | 8789 | no | `egress_addr` port (must equal FC_ENGINE_PORT) |
| SIGN_PORT | 8790 | no | `sign_addr` port (must equal FC_SIGNER_PORT) |
| SECRET_PORT | 8791 | no | `secret_addr` port (must equal FC_IDAM_SECRET_PORT) |
| SESSION_PORT | 8792 | yes (CONSOLE_SESSION_PORT) | `session_addr` port |
| SECRET_PATH | /etc/cdb/secrets/auth0-management.secret | no | `secret_path` (must equal the BFF constant and stay under /etc/cdb/secrets) |
| CDB_USER | cdb | no | group given read on the secret dir |
| SIDECAR_BIN | empty | yes (`/usr/local/bin/console-crypto-sidecar`, or empty with CONSOLE_SKIP_SIGN=1) | enables the signing plane |
| ENGINE_ADDR | 127.0.0.1:7879 | no | `engine_addr` |
| ENGINE_SERVERNAME | control.localhost | no | `engine_servername` |
| ENGINE_CA / ENGINE_CERT / ENGINE_KEY | $OUT_DIR/engine-ca.pem, engine-client.pem, engine-client.key | yes (same paths) | engine identity paths |
| SIDECAR_USER | console-sidecar | no | owner of OUT_DIR and the seed |
| FORCE | 0 | no | `1` re-mints the admin leaf |

### 4.3 Phases (install.sh)

1. `[1]` service users `console-sidecar`, `console-bff` (system, no home, nologin) (:51-54).
2. `[2]` install the sidecar binary 0755; build or take the BFF, copy to `/usr/local/lib/console-bff`,
   chown root:root; copy the SPA to `.../spa`, chown root:root (:56-100).
3. `[3]` `install -d -m 0750 /etc/console-sidecar`; run provision-sidecar.sh (admin leaf, seed/anchor,
   secret dir, config.json) (:102-117).
4. `[4]` copy the Console-CA leaf from CONSOLE_CONTROL_SRC unless skipped or already present (ca.pem ->
   engine-ca.pem 0644, client.pem -> engine-client.pem 0644, client.key -> engine-client.key 0640); chown
   `/etc/console-sidecar` to console-sidecar (:119-136).
5. `[4b]` pin the leaf's SHA-512 fingerprint into node.cbor with `cdb-mkconfig --add-wire-peer
   "<fp>=<tenant>=<clearance>=<planes>"`; restart `cdb` only if node.cbor changed (:138-169). See 4.6.
6. `[5]` `install -d -m 0750 /etc/console-bff`; copy config.example.env to config.env (0640) ONLY if absent;
   rewrite the installer-owned lines (4.5); chown to console-bff; install both units (0644);
   `systemctl daemon-reload`; `enable` + `restart` both units (restart, not `--now`, so a re-run applies the
   new env) (:171-226).
7. `[6]` run validate.sh with CONSOLE_NODE_IP (:228-230); any failure aborts the install.

### 4.4 Users, files and units written

| Path | Mode / owner | Written by | Notes |
|---|---|---|---|
| /usr/local/bin/console-crypto-sidecar | 0755 | install.sh:58 | |
| /usr/local/lib/console-bff/ (+ spa/) | root:root | install.sh:84-99 | validate [1b] checks root ownership |
| $repo/.bff-deploy/ | repo owner | install.sh:71-77 | build output inside the checkout |
| /etc/console-sidecar/ | dir 0750 (0770 briefly during seed mint) | install.sh:104; provision:104-124 | owned console-sidecar after [4] |
| /etc/console-sidecar/admin-key.pem, admin-cert.pem | 0600 / 0644 | provision:58-83 | kept unless FORCE=1 |
| /etc/console-sidecar/sign.seed | 0600 (by the sidecar) | provision:95-120; signing.rs:176-180 | one-time |
| /etc/console-sidecar/distribution-anchor.json | 0644 | provision:121-122 | deliver to endpoints |
| /etc/console-sidecar/config.json | 0644 | provision:160-176 | rewritten every run |
| /etc/console-sidecar/engine-ca.pem, engine-client.pem, engine-client.key | 0644 / 0644 / 0640 | install.sh:132-134 | copied once; never refreshed while present |
| /etc/cdb/secrets/ | console-sidecar:cdb 2750 (setgid) | provision:147-155 | written by the sidecar at runtime |
| /etc/cdb/node.cbor | (crdb's) | install.sh:158 via cdb-mkconfig | + `systemctl restart cdb` on change |
| /etc/console-bff/config.env | 0640, console-bff | install.sh:173-219 | dir 0750 |
| /etc/systemd/system/console-crypto-sidecar.service, console-bff.service | 0644 | install.sh:220-221 | |

### 4.5 `config.env`: which lines the installer owns vs keeps

- Installer-OWNED (deleted, commented or not, and re-appended on EVERY run): `FC_RBAC_CONFIG` (:185-187),
  `FC_OIDC_ISSUER`, `FC_OIDC_CLIENT_ID`, `FC_OIDC_ROLE_CLAIM` (:194-202; all three removed and not re-added
  when CONSOLE_OIDC_ISSUER=none), `FC_SPA_DIST` (:208-209), `FC_SIGNER_PORT`, `FC_IDAM_SECRET_PORT`,
  `FC_SIDECAR_SESSION_PORT` (:215-218). A hand edit of any of these is lost on the next install.
- Seeded once from `apps/bff/deploy/config.example.env` (only when config.env is absent, :174) and then
  KEPT: `FC_HTTP_HOST=127.0.0.1`, `FC_HTTP_PORT=8787`, `FC_ENGINE_HOST=127.0.0.1`, `FC_ENGINE_PORT=8789`,
  `FC_LOG_LEVEL=info`, `FC_SESSION_COOKIE_SECURE=true` (config.example.env:13-19,33), plus anything an
  operator adds (e.g. FC_SESSION_TTL_MS, FC_REQUEST_TIMEOUT_MS, FC_OIDC_SCOPE).
- The written RBAC line is exactly `FC_RBAC_CONFIG={"groupRoles":{},"localRbac":{"<SUB>":{"role":
  "global-admin"}},"defaultTenant":"<TENANT>"}` (:186-187): no IdP group grants, one subject.

### 4.6 The engine peer pin (`cdb-mkconfig --add-wire-peer`)

What FC does (install.sh:138-169): if `engine-client.pem` exists, compute its SHA-512 DER fingerprint with
openssl (:155), hash node.cbor, run `$CONSOLE_CDB_MKCONFIG --add-wire-peer
"<fp>=<CONSOLE_PEER_TENANT>=<clearance>=<planes>" $CONSOLE_NODE_CBOR` (:158-159), and if node.cbor's hash
changed, `systemctl restart cdb` (:160-166) because `wire.peers` is boot-bound.

What cdb-mkconfig does (crucible HEAD d0ace55a):
- `add_wire_peer` decodes node.cbor into THIS binary's `NodeConfig`, merges the peer into `wire.peers` by
  fingerprint (idempotent; a grant-less pin is refused), re-validates via `to_cbor`
  (crucible:crates/cdb-server/src/bin/cdb-mkconfig.rs:1295-1310,1354-1384).
- Since crdb `353adf2f` (2026-09-25, "a config pin never drops a field") it compares the re-encoded
  document with the file and REFUSES the write if any value outside `wire.peers` would be dropped or
  changed, naming the field; an unchanged document is not rewritten (cdb-mkconfig.rs:1312-1352,1361-1376).
  A binary older than that commit has no such guard: it silently drops every field it does not know
  (the 2026-09-25 incident stripped `detection.sigma_rules_dir`, per the 353adf2f commit message).
- install.sh checks only that the tool is executable (install.sh:152); it does not check its version, so
  the guard depends on the node having the matching cdb-mkconfig. A guard refusal makes install.sh die
  ("pinning the console peer failed", :158-159) before the BFF config and units are written.

Which pin actually admits the sidecar (derived from code; not live-tested):
- The sidecar's default `engine_addr` is `127.0.0.1:7879` (provision-sidecar.sh:37; install.sh does not
  override it) -- the crdb Console/Control plane.
- The :7879 listener admits ONLY `control_plane.peers` ("Pinned-only", empty enrolled grant, no role
  overrides) (crucible:crates/cdb-server/src/transport.rs:307-336); `wire.peers` feeds the :7878 wire seam
  (transport.rs:341).
- `control_plane.peers` is written by the crdb node installer from `CDB_CONTROL_ENROLL =
  "<CONSOLE_FP>=<SERVICE_TENANT>=secret=data,agent,cognition,otlp,delegation"`, where CONSOLE_FP is the
  fingerprint of `/etc/cdb/control/client.pem` (crucible:deploy/cdb-install/installer/phases/50-config.sh:
  75-85,225).
- So in the default topology the FC [4b] `wire.peers` pin is not what admits the Console; per the crdb
  comment the Console leaf chains to a dedicated Console-CA "kept separate from the ZTP wire CA"
  (crucible:crates/cdb-server/src/config.rs:1508-1512), so the :7878 seam would likely reject it at TLS
  before consulting `wire.peers` (UNVERIFIED -- depends on the wire CA bundle on a given node). The pin's
  live side effects are the possible `cdb` restart and, with a pre-353adf2f cdb-mkconfig, field loss.
- The two pins may name different tenants: `CONSOLE_PEER_TENANT` (FC) vs crdb's `SERVICE_TENANT` (random
  unless `CDB_CONSOLE_SERVICE_TENANT` or a saved `$CTRL_DIR/service-tenant` file; 50-config.sh:81-86). Operator reads use the
  delegation tenant (`FC_RBAC_CONFIG.defaultTenant`) regardless (principal.ts; operator-engine.ts:693-700).

### 4.7 `validate.sh` checks (8)

Knobs: CONSOLE_NODE_IP (required), CONSOLE_BFF_HTTP_PORT (8787), CONSOLE_ADMIN_PORT (8443),
CONSOLE_SESSION_PORT (8792) (validate.sh:11-13,52). Success line: `==> ALL VALIDATION CHECKS PASSED` (:83).

| # | Check | Pass condition | Evidence |
|---|---|---|---|
| 1/4 | both units active | `systemctl is-active` console-crypto-sidecar and console-bff | :17-20 |
| 1b | deployed tree root-owned | no non-root file under /usr/local/lib/console-bff or the sidecar binary | :22-25 |
| 2/4 | engine leg | `GET http://127.0.0.1:8787/readyz` returns `"ready":true` within 12 tries (15 s curl timeout, 5 s sleep) | :26-36 |
| 2a | BFF not exposed | `http://<NODE_IP>:8787/readyz` must FAIL | :38-45 |
| 2b | SPA served | `GET /` on the BFF contains `<!doctype html` | :46-49 |
| 2c | session lookup | `{"port":1}` on 127.0.0.1:8792 answers exactly `{"group":null}` (5 tries, 2 s) | :51-61 |
| 3/4 | P-384 floor admitted | `openssl s_client -groups secp384r1 -tls1_3` to NODE_IP:8443, `GET /healthz` -> 200 | :63-70 |
| 4/4 | sub-floor refused | `-groups X25519:prime256v1` handshake fails (alert / no shared group) | :72-81 |

Not checked: the signing leg (8790), the secret leg (8791), OIDC reachability, and the engine peer
grant beyond `/readyz` (a PING). The hybrid X25519MLKEM768 group is not probed (OpenSSL 3.0 lacks it,
:7-8). The [2/4] text still says "mTLS :7878" (:26,35).

### 4.8 `uninstall.sh`

- Dry run by default; `--yes` acts; `--with-secrets` also removes `/etc/cdb/secrets`; `-h/--help`
  (uninstall.sh:18-21 usage, 26-35).
- Removes: disable --now both units; unit files and their `.service.d` drop-in dirs; the sidecar binary;
  `/usr/local/lib/console-bff`; `/etc/console-bff`; `/etc/console-sidecar` (admin leaf, engine leaf copy,
  SIGNING SEED + ANCHOR, config); both service users (uninstall.sh:5,38-50,54-73).
- Keeps: `/etc/cdb/control` (crdb's), `/etc/cdb/secrets` (unless --with-secrets), the node.cbor peer pin
  (no unpin primitive), repo build outputs (uninstall.sh:9-16).
- Fail-closed post-check that every path and user is gone (:78-82).
- Consequence: uninstall + install mints a NEW signing seed (provision runs `seed-init` when the seed is
  absent, provision-sidecar.sh:110-116), i.e. a new key id and anchor; every endpoint's
  TORCH_POLICY_ANCHOR must be redelivered (signing.rs:20-24 explains why a re-minted key orphans anchors).

### 4.9 Cross-component port / path coupling

Each hop is configured independently in up to four places; nothing cross-checks them except validate
[2/4] (egress + upstream indirectly) and [2c] (session).

| Hop | BFF (config.env) | Sidecar field | provision knob | install.sh knob | validate knob | Default |
|---|---|---|---|---|---|---|
| browser -> sidecar | - | admin_port | ADMIN_PORT | none | CONSOLE_ADMIN_PORT | 8443 |
| sidecar -> BFF listener | FC_HTTP_PORT (seeded once) | admin_upstream | BFF_HTTP_PORT | none | CONSOLE_BFF_HTTP_PORT | 8787 |
| BFF -> sidecar egress | FC_ENGINE_PORT (seeded once) | egress_addr | EGRESS_PORT | none | - | 8789 |
| BFF -> signer | FC_SIGNER_PORT (rewritten) | sign_addr | SIGN_PORT | CONSOLE_SIGNER_PORT (BFF side only) | - | 8790 |
| BFF -> secret-set | FC_IDAM_SECRET_PORT (rewritten) | secret_addr | SECRET_PORT | CONSOLE_IDAM_SECRET_PORT (BFF side only) | - | 8791 |
| BFF -> session lookup | FC_SIDECAR_SESSION_PORT (rewritten) | session_addr | SESSION_PORT | CONSOLE_SESSION_PORT (both sides) | CONSOLE_SESSION_PORT | 8792 |
| secret file | IDAM_SECRET_REF constant (server.ts:1926) | secret_path | SECRET_PATH | none | - | /etc/cdb/secrets/auth0-management.secret (+ unit ReadWritePaths) |
| sidecar -> engine | - | engine_addr / engine_servername | ENGINE_ADDR / ENGINE_SERVERNAME | none | - | 127.0.0.1:7879 / control.localhost |

Changing CONSOLE_SIGNER_PORT or CONSOLE_IDAM_SECRET_PORT alone desynchronizes the BFF from the sidecar
(the sidecar keeps 8790/8791); the matching SIGN_PORT / SECRET_PORT must be passed too.

### 4.10 Documentation drift inside `deploy/`, `sidecar/`, `apps/bff/deploy/`

- deploy/README.md:52-67 documents `CONSOLE_ENROLL_ENV`, `deploy/console-enroll.env.example`, TPM TCTI and
  EK cert inputs; install.sh reads none of them and the example file does not exist (`ls deploy`). The
  README omits the REQUIRED CONSOLE_PEER_TENANT. deploy/README.md:47-48 says validate proves "the
  TPM-signed engine leg"; the engine key is a software leaf (install.sh:119-123).
- `:7878` is named as the engine target in sidecar/README.md:23-24, sidecar/deploy/README.md:11,26-27,
  apps/bff/deploy/README.md:11, apps/bff/deploy/config.example.env:15-16, validate.sh:4-5,26; the
  provisioned default is `127.0.0.1:7879` (provision-sidecar.sh:37; config.example.json:5-6).
- config.example.env:34-35 shows commented "sane defaults" `FC_CACHE_TTL_MS=5000` and
  `FC_REQUEST_TIMEOUT_MS=15000`; the compiled defaults are 2000 and 5000 (config.ts:49,53).
- config.example.env:27 shows `"defaultTenant":""`, which fails validation if uncommented (min length 1,
  config.ts:30).
- config.ts:63-67 says "the crdb default lease is 60s"; crdb's default wire and control lease is 3600 s
  (crucible:crates/cdb-server/src/config.rs:1463-1465; cdb-mkconfig.rs:1076).
- provision-sidecar.sh:192 prints `install -m0644 apps/bff/deploy/console-bff.service ...` (that file does
  exist; consistent). sidecar/deploy/README.md:24-27 still calls the engine identity "the Console's enrolled
  wire mTLS material".

---

## 5. UI visibility and how an operator changes each item

"Restart" = `systemctl restart <unit>`. Every BFF key is read once at start (config.ts:200); every
sidecar field is read once at start (main.rs:104). Restarting `console-bff` ends every operator session
(in-memory store). "Installer-owned" = rewritten by every install.sh run (4.5).

| Item | Visible in the Console UI? | How an operator changes it |
|---|---|---|
| FC_RBAC_CONFIG (role map, defaultTenant) | YES, read-only: Settings -> RBAC -> "Console operator roles" (IdP-group table, OIDC-subject table, default tenant); global admins only, others see "Global admin required" (SettingsIdentityTabs.tsx:118-160; server.ts:2102-2121). UI copy: "Installer configuration, read at BFF start. It changes with a Console re-install, never from here." (:142-144) | Installer-owned: re-run install.sh with CONSOLE_OPERATOR_SUB / CONSOLE_OPERATOR_TENANT (writes one global-admin subject, no group grants). Group grants or tenant roles are only possible by editing /etc/console-bff/config.env + restart console-bff, and the next install.sh run erases them. |
| Operator EXPLAIN tier | YES: TopBar badge (TopBar.tsx:44) | Change the operator's IdP groups (console-user/-developer/-admin/-security-audit) or their RBAC role; takes effect at next login |
| Operator role / active tenant | NO (not in /auth/me; no tenant selector) | via the role map; a global admin always acts in defaultTenant |
| Settings tier (global-admin only) | Indirect: Settings tabs show "Admin or SecurityAudit tier required" when the engine refuses | code (principal.ts:59) |
| FC_OIDC_ISSUER / CLIENT_ID / ROLE_CLAIM | NO as settings; the Login screen shows the IdP's device code + verification URL (Login.tsx:90-93) | Installer-owned: re-run install.sh with CONSOLE_OIDC_ISSUER / _CLIENT_ID / _ROLE_CLAIM (`none` = no auth) |
| FC_OIDC_SCOPE / JWKS_URI / DEVICE_ENDPOINT / TOKEN_ENDPOINT | NO | edit config.env + restart console-bff (kept across installs) |
| FC_SESSION_TTL_MS, FC_SESSION_COOKIE, FC_SESSION_COOKIE_SECURE, FC_SESSION_MAX, FC_LOGIN_MAX | NO | edit config.env + restart console-bff |
| FC_SIDECAR_SESSION_PORT | Indirect: Settings -> Security "This browser session -- Key exchange negotiated", or "Not available ... not provisioned (re-run the Console installer)" when unset (SettingsReportTabs.tsx:100-145) | Installer-owned: CONSOLE_SESSION_PORT (threads to both BFF and sidecar) + re-run |
| FC_SIGNER_PORT | Indirect only: Policies -> Distribution shows a generic "The re-distribution failed" on any error incl. 503 signer_unavailable (DistributionPanel.tsx:90-93) | Installer-owned: CONSOLE_SIGNER_PORT AND SIGN_PORT (sidecar) + re-run |
| FC_IDAM_SECRET_PORT | Indirect: IdAM onboarding error "The secret store is not available on this node" (IdamConnectorsPanel.tsx:76) | Installer-owned: CONSOLE_IDAM_SECRET_PORT AND SECRET_PORT + re-run |
| FC_SPA_DIST | Indirect: whether the UI loads at all | Installer-owned (always `/usr/local/lib/console-bff/spa`); source via CONSOLE_SPA_DIST + re-run |
| FC_ENGINE_HOST/PORT, FC_HTTP_HOST/PORT | NO | edit config.env (kept) AND the matching sidecar field (EGRESS_PORT / BFF_HTTP_PORT on the next provision run, which rewrites config.json) + restart both units; pass CONSOLE_BFF_HTTP_PORT to validate |
| FC_LOG_LEVEL, FC_CACHE_TTL_MS, FC_CACHE_MAX_ENTRIES, FC_REQUEST_TIMEOUT_MS, FC_ENGINE_HEARTBEAT_MS | NO | edit config.env + restart console-bff |
| BFF TUNE constants and limits (2.8, 2.9) | NO | code change + rebuild + install.sh |
| Ephemeral cache contents | NO | FC_CACHE_TTL_MS / restart |
| Sidecar admin_bind_ip / admin_port | Implicit: the URL the operator browses (`https://<node-IP>:8443`) | CONSOLE_NODE_IP / ADMIN_PORT + re-run install.sh (config.json rewritten), restart sidecar |
| Admin TLS certificate | NO in the Console (browser certificate viewer only) | pre-place admin-cert.pem / admin-key.pem, or `FORCE=1` re-run; restart sidecar |
| Admin TLS groups / suite / TLS 1.3 | Indirect: the negotiated group of THIS session on Settings -> Security | code only (tls.rs:20-32) |
| Engine leg (engine_addr, servername, CA, client leaf) | NO (Settings -> Security shows the ENGINE's admin-endpoint report, not the Console's leg) | ENGINE_ADDR / ENGINE_SERVERNAME + re-run; leaf refresh = delete /etc/console-sidecar/engine-client.pem (or .key) and re-run install.sh |
| Signing plane (seed, key id, anchor) | NO | CONSOLE_SKIP_SIGN=1 disables; rotation = remove sign.seed, re-run, redeliver distribution-anchor.json to every endpoint |
| Secret-set plane (addr, path) | NO | SECRET_PORT via re-run; the path is effectively fixed (BFF constant + unit ReadWritePaths) |
| Engine peer pin (CONSOLE_PEER_TENANT / CLEARANCE / PLANES) | NO in any FC-owned read. Whether the engine's governed-settings registry (Settings -> Configuration) renders `wire.peers` is the engine slice's to establish (UNVERIFIED here) | re-run install.sh with the knobs (cdb restarts if the pin changed) |
| Installer self-check results | NO (install stdout only) | `sudo CONSOLE_NODE_IP=... deploy/validate.sh` standalone (deploy/README.md:94) |

Not FC configuration but shown on FC's Settings tabs (engine-owned, engine slice): SOC tiers and SIEM
write-back (SOC tab), the governed knob registry (Configuration), approvals/history (Changes), engine admin
assignments and SSO group map (RBAC/Federation), connectivity/security/egress/key-issuing/telemetry/server
reports (Security, KeyLock, Observability, HA & Topology, FIPS). No BFF key or sidecar field is sent to
the engine by any code path, so none of them can appear in those engine reads.

---

## 6. Findings (ranked)

1. The binding registry is documentation-only at runtime. Neither the BFF nor the SPA imports
   `@forge/bindings` (apps/bff/package.json:15-21; only apps/console/src/test/contract/no-stub.test.tsx:3
   imports it); command `authz` strings are never enforced (only contracts/src/binding.ts:48); no test
   checks that routes/controls map to bindings although binding.ts:4-7 says one does. 17 API method/path
   pairs have no binding: all 12 Settings routes, SOC KPIs/report/weekly, Overview members, IdAM secret
   (1.4). SettingsSurface.tsx:4-5 claims each tab exists only "when its engine binding is live".
   Counts: 72 bindings, 60 LIVE / 12 PENDING; 3 LIVE bindings have routes but no SPA caller
   (`groups.edit`, `groups.setMembers`, `policies.detail`).
2. Probable bug: `GET /api/logs` ignores `offset`. The SPA backfill pages with `offset`
   (apps/console/src/surfaces/useLogs.ts:28,86-106), `filterToWire` would forward it
   (apps/bff/src/engine/logs.ts:98), but `parseLogFilter` never reads it (apps/bff/src/server.ts:429-464).
   Commit 7f9d61d ("offset threads end-to-end: /api/logs?offset=") added the parse to the EXPORT parser
   instead (server.ts:346-358). Effect (derived, not run): every backfill page returns page 0, so a store
   with >= 100 rows yields up to 50 duplicate pages flagged incomplete.
3. The FC installer's `[4b]` pin writes `wire.peers`, but the sidecar's default engine target is the :7879
   control plane, which admits only `control_plane.peers` pinned by the crdb node installer (4.6). The pin
   still restarts `cdb` when it changes, and with a cdb-mkconfig older than crdb 353adf2f it silently drops
   node.cbor fields (the 2026-09-25 Sigma incident); install.sh does not check the tool's version.
4. Re-running install.sh rewrites FC_RBAC_CONFIG (one global-admin subject, `groupRoles` always empty), the
   OIDC trio, FC_SPA_DIST and three port lines, and provision-sidecar.sh rewrites the whole sidecar
   config.json; hand edits to those are lost (4.5). The installer cannot express IdP group grants or
   tenant-scoped roles at all.
5. Port/path coupling is unguarded: CONSOLE_SIGNER_PORT / CONSOLE_IDAM_SECRET_PORT change only the BFF side
   (install.sh:216-217 vs provision-sidecar.sh:26-27); FC_HTTP_PORT / FC_ENGINE_PORT vs BFF_HTTP_PORT /
   EGRESS_PORT are set in different files; the Auth0 secret path is a BFF constant (server.ts:1926) that
   must equal the sidecar's `secret_path` and stay inside the unit's only writable path (4.9).
6. `POST /api/idam/secret` requires only a session: any logged-in operator of any role can overwrite the
   node's Auth0 connector secret file; no engine authorization and no audit record (server.ts:2392-2444;
   secret_service.rs has no caller check). More generally the four sidecar loopback services trust any
   local process (3.9).
7. Installer defaults bake in one dev identity: issuer `https://dev-6rcwumbp1tsae8me.us.auth0.com/`, client
   id `G0ve3f1ooy2kZUFg8nK5VALvmOdqXGVV`, global-admin subject `auth0|6a3abf93a1c6aeb8baddbc94`, tenant
   `df46dcb7-2e91-448c-a406-42e492b85e36` (install.sh:183-197). Any other deployment must override all five.
8. Tenant/role visibility: the BFF honors `x-active-tenant` for global admins but the SPA never sends it (no
   tenant selector); `/auth/me` returns no role or tenant; the only BFF role gate is the console-rbac route;
   Settings work for global admins only via `settings_tier` (principal.ts:59).
9. Sessions are in-memory with a fixed 1 h lifetime; every install.sh run restarts console-bff and logs
   everyone out; at FC_SESSION_MAX the oldest (possibly active) session is evicted.
10. The sidecar has no logging, no timeouts and no connection caps; tunnel failures are silently dropped
    (admin.rs:86-90; engine.rs:98-100). A failing engine leg is visible only as BFF /readyz 503 or 502s.
11. Lifecycle gaps: the admin cert is a self-signed 365-day leaf with no renewal; the engine leaf copy is
    never refreshed while present; uninstall.sh deletes the signing seed, so a reinstall mints a new key and
    every endpoint needs the new anchor.
12. Documentation drift: deploy/README.md documents a retired enrollment flow and omits the required
    CONSOLE_PEER_TENANT; several docs say :7878 where the default is :7879; config.example.env's commented
    defaults (5000 / 15000 ms) differ from the compiled ones (2000 / 5000); config.ts claims a 60 s crdb
    lease (crdb default 3600 s); tier.ts:17 claims a configurable role->tier map that does not exist;
    manifest header comments for `logs.export` and `soc.plan.propose` say PENDING while the entries are
    LIVE; `vtz.policyCount` stays PENDING behind a policy store that has landed; `/openapi.json` documents
    only the Settings, ops and auth paths (openapi.ts:38-198).

---

## 7. Open questions and UNVERIFIED items

Open questions (for the owner):
- Is the `[4b]` wire.peers pin intentionally retained (e.g. a :7878 fallback) or vestigial since the
  :7879 control plane? If kept, should install.sh refuse a cdb-mkconfig without the 353adf2f guard?
- Should the Settings, Reports, SOC KPI, Overview-members and IdAM-secret routes get manifest bindings
  (with `settings.` / `reports.` prefixes), and should a test enforce route-to-binding coverage?
- Should `POST /api/idam/secret` be engine-authorized and audited like `idam.connect`?
- Is the missing `offset` parse on `GET /api/logs` known?
- For the manual: is the supported way to grant Console roles the installer's single-subject map, or
  hand-edited group maps (which the installer currently erases)?
- Should the Reports "Export as text/JSON" (a client-side download of a plain read) follow the audited-export
  rule the manifest states for Logs (manifest.ts:196-199)?

UNVERIFIED (checked what could be checked; not established from code):
- Engine-side effect of `settings_tier` (that non-global-admins are refused on all Settings ops): only the
  FC code comment asserts it (principal.ts:29-36); engine slice to confirm.
- Whether the :7878 wire seam would reject the Console-CA leaf at TLS (depends on each node's wire CA
  bundle; inferred from crucible config.rs:1508-1512).
- Whether the engine's governed-settings registry exposes `wire.peers` / `control_plane.peers` in the
  Configuration tab.
- jose's remote-JWKS fetch timeout (library default; not pinned in this repo).
- The runtime behavior with OIDC unset (routes 1-4 unmounted, /api/* 401, /auth/me served index.html) and
  the logs backfill duplication are derived from reading, not observed.
- Exact aws-lc-rs default TLS 1.3 cipher-suite list on the engine leg (cdb-mtls does not narrow it).
