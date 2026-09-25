# Crucible (cdb) side of every Console operation -- configuration census (settings plane excluded)

Slice: every engine wire request ForgeCentral (FC) can send, traced from the FC encoder to the crdb
handler and its store. The settings plane (SETTINGS_* / SOC_SETTINGS_*) is listed but not analyzed.
Source of truth: code at crucible `d0ace55a` (main) and the forgecentral working tree, read 2026-09-25.
Paths are repo-relative to /home/todd/dev. "H" below abbreviates crucible/crates/cdb-server/src/handler.rs.
UNVERIFIED marks anything the code read could not establish.

Counts: 72 request variants are encodable by the Console (forgecentral/packages/wire/src/payload.ts:970-1147).
10 are settings-plane (excluded). Of the 62 in this slice: 30 mutate engine state (28 with a live BFF
consumer + 2 encodable with no consumer), 32 are reads (incl. 2 cursor-control verbs and 1 read with no
BFF consumer). Plus the PING heartbeat frame (not a WireRequest).

## 1. Index

| ID | Wire request | R/M | crdb handler (H = handler.rs) | FC BFF client method (apps/bff/src/engine/client.ts) |
|---|---|---|---|---|
| M01 | VtzCreate (VTZ_CREATE) | M | H:6769 vtz_create | vtzCreate :372 |
| M02 | VtzEdit (VTZ_EDIT) | M | H:6998 vtz_edit | vtzEdit :374 |
| M03 | VtzRescope (VTZ_RESCOPE) | M | H:7026 vtz_rescope | vtzRescope :376 |
| M04 | VtzDelete (VTZ_DELETE) | M | H:7061 vtz_delete | vtzDelete :378 |
| M05 | PolicyCreate (POLICY_CREATE) | M | H:6286 policy_create | policyCreate :305 |
| M06 | PolicyEdit (POLICY_EDIT) | M | H:6315 policy_edit | policyEdit :307 |
| M07 | PolicyPublish (POLICY_PUBLISH) | M | H:6349 policy_publish | policyPublish :309 |
| M08 | PolicyDelete (POLICY_DELETE) | M | H:6385 policy_delete | policyDelete :311 |
| M09 | BundleCommit (BUNDLE_COMMIT) | M | H:6800 bundle_commit | bundleCommit :366 |
| M10 | ObjectCreate (OBJECT_CREATE) | M | H:6035 object_create | objectCreate :313 |
| M11 | ObjectEdit (OBJECT_EDIT) | M | H:6058 object_edit | objectEdit :315 |
| M12 | ObjectDelete (OBJECT_DELETE) | M | H:6081 object_delete | objectDelete :317 |
| M13 | PrincipalCreate (PRINCIPAL_CREATE) | M | H:2758 principal_create | principalCreate :158 |
| M14 | PrincipalEdit (PRINCIPAL_EDIT) | M | H:2792 principal_edit | principalEdit :163 |
| M15 | PrincipalSetStatus (PRINCIPAL_SET_STATUS) | M | H:2817 principal_set_status | principalSetStatus :165 |
| M16 | GroupCreate (GROUP_CREATE) | M | H:2842 group_create | groupCreate :149 |
| M17 | GroupEdit (GROUP_EDIT) | M | H:2863 group_edit | groupEdit :151 |
| M18 | GroupSetMembers (GROUP_SET_MEMBERS) | M | H:2884 group_set_members | groupSetMembers :153 |
| M19 | IdamConnect (IDAM_CONNECT) | M | H:2725 idam_connect | idamConnect :179 |
| M20 | IdamConfigure (IDAM_CONFIGURE) | M | H:2667 idam_configure | idamConfigure :181 |
| M21 | IdamSync (IDAM_SYNC) | M | H:2632 idam_sync | idamSync :177 |
| M22 | Contain (CONTAIN) | M | H:2361 contain | contain :346 |
| M23 | LogExport (LOG_EXPORT) | M (audited read) | H:7387 log_export | logExport :354 |
| M24 | SocIncidentAct (SOC_INCIDENT_ACT) | M | H:3823 soc_incident_act | socIncidentAct :281 |
| M25 | SocDisposition (SOC_INCIDENT_DISPOSITION) | M | H:3478 soc_disposition | socDisposition :287 |
| M26 | SocPlanModify (SOC_PLAN_MODIFY) | M | H:3627 soc_plan_modify | socPlanModify :277 |
| M27 | SocPlanApprove (SOC_PLAN_APPROVE) | M | H:3580 soc_plan_approve | socPlanApprove :274 |
| M28 | SocCognitionRun (SOC_COGNITION_RUN, "Generate") | M | H:5575 soc_cognition_run | socCognitionRun :270 |
| M29 | TxnBegin | M (session state) | H:8946 begin_txn | NONE (encodable only) |
| M30 | SubmitMemoryWrite | M | H:9686 submit_memory_write | NONE (encodable only) |
| R01 | QuerySubmit | R | H:8813 query_submit | querySubmit :141 |
| R02 | CursorFetch | R | H:9910 cursor_fetch | cursorFetch :380 (no caller) |
| R03 | CursorClose | R (releases cursor) | H:9932 cursor_close | cursorClose :382 (no caller) |
| R04 | ListAgents (LIST_AGENTS) | R | H:2382 list_agents | listAgents :143 |
| R05 | ListPrincipals (LIST_PRINCIPALS) | R | H:2452 list_principals | listPrincipals :145 |
| R06 | ListGroups (LIST_GROUPS) | R | H:2502 list_groups | listGroups :147 |
| R07 | ObjectList (OBJECT_LIST) | R | H:2982 object_list | objectList :170 |
| R08 | ObjectDetail (OBJECT_DETAIL) | R | H:3007 object_detail | objectDetail :183 |
| R09 | IdamConnectors (IDAM_CONNECTORS) | R | H:2594 idam_connectors | idamConnectors :172 |
| R10 | EntityDecisions (ENTITY_DECISIONS) | R | H:7110 entity_decisions | entityDecisions :319 |
| R11 | EntityConnections (ENTITY_CONNECTIONS) | R | H:7621 entity_connections | entityConnections :324 |
| R12 | ConnectivityGraph (CONNECTIVITY_GRAPH) | R | H:7739 connectivity | connectivityGraph :331 |
| R13 | ConnectivityMembers (CONNECTIVITY_MEMBERS) | R | H:7684 connectivity_members | connectivityMembers :338 |
| R14 | LogQuery (LOG_QUERY) | R | H:7228 log_query | logQuery :349 |
| R15 | LogExplain (LOG_EXPLAIN) | R | H:7552 log_explain | logExplain :351 |
| R16 | VtzTree (VTZ_TREE) | R | H:6509 vtz_tree | vtzTree :358 |
| R17 | VtzDetail (VTZ_DETAIL) | R | H:6562 vtz_detail | vtzDetail :361 |
| R18 | BundleConvergence (BUNDLE_CONVERGENCE) | R | H:6938 bundle_convergence | bundleConvergence :368 |
| R19 | PolicyListByZone (POLICY_LIST_BY_ZONE) | R | H:3149 policy_list_by_zone | policyListByZone :293 |
| R20 | PolicyDetail (POLICY_DETAIL) | R | H:3189 policy_detail | policyDetail :296 |
| R21 | PolicyEffective (POLICY_EFFECTIVE) | R | H:5924 policy_effective | policyEffective :300 |
| R22 | DetectSummary (DETECT_SUMMARY) | R | H:5873 detect_summary | detectSummary :186 |
| R23 | SocIncidentList (SOC_INCIDENT_LIST) | R | H:3268 soc_incident_list | socIncidentList :192 |
| R24 | SocIncidentDetail (SOC_INCIDENT_DETAIL) | R | H:3308 soc_incident_detail | socIncidentDetail :199 |
| R25 | SocNarrative (SOC_NARRATIVE) | R | H:5758 soc_narrative | socNarrative :205 |
| R26 | SocTelemetry (SOC_INCIDENT_TELEMETRY) | R | H:3701 soc_telemetry | socTelemetry :208 |
| R27 | SocAudit (SOC_INCIDENT_AUDIT) | R | H:3768 soc_audit | socAudit :211 |
| R28 | SocNotes (SOC_INCIDENT_NOTES) | R | H:3922 soc_notes | socNotes :284 |
| R29 | SocImpact (SOC_INCIDENT_IMPACT) | R | H:5480 soc_impact | socImpact :215 |
| R30 | SocReport (SOC_INCIDENT_REPORT) | R | H:3974 soc_report | socReport :217 |
| R31 | SocUeba (SOC_INCIDENT_UEBA) | R | H:5315 soc_ueba | NONE (encodable only) |
| R32 | SocWeekly (SOC_WEEKLY_SUMMARY) | R | H:4057 soc_weekly | socWeekly :219 |
| X01 | SettingsRead | settings plane -- excluded | H:4231 | settingsRead :221 |
| X02 | SettingsReports | excluded | H:4329 | settingsReports :248 |
| X03 | SettingsCommit | excluded | H:4695 | settingsCommit :253 |
| X04 | SettingsPropose | excluded | H:4811 | settingsPropose :223 |
| X05 | SettingsApprovals | excluded | H:4891 | settingsApprovals :228 |
| X06 | SettingsApprove | excluded | H:4957 | settingsApprove :233 |
| X07 | SettingsHistory | excluded | H:5047 | settingsHistory :238 |
| X08 | SettingsRollback | excluded | H:5110 | settingsRollback :243 |
| X09 | SocSettingsRead | excluded | H:5190 | socSettingsRead :258 |
| X10 | SocSettingsCommit | excluded | H:5232 | socSettingsCommit :263 |

Contract variants the Console does NOT encode (crdb serves them to other peers): Prepare, ExecutePrepared,
TxnWrite, TxnCommit, TxnAbort, UsageOverview, BundleFetch, BundleReport, LugSnapshot, LugEvents
(forgecentral/packages/contracts/src/generated/wire-dto.ts:969-1044 vs payload.ts:970-1147).

## 2. Shared model (applies to every request below; blocks reference these by number)

### 2.1 Transport
- The BFF dials the loopback crypto sidecar; the sidecar originates mTLS to the engine's dedicated
  control-plane listener :7879 with the Console-CA software leaf (forgecentral/sidecar/src/engine.rs:1-9;
  forgecentral/sidecar/src/main.rs:128-139). crdb runs that listener as a second seam that admits pinned
  peers only (crucible/crates/cdb-server/src/transport.rs:303-334). Torch stays on :7878.
- Every request except TxnBegin / CursorFetch / CursorClose rides the QuerySubmit opcode; the CBOR enum
  tag discriminates (forgecentral/packages/wire/src/dispatch.ts:19-165). One in-flight request per
  connection; a PING heartbeat refreshes the session lease (dispatch.ts:192-205). Control-plane lease
  default 3600 s (crucible/crates/cdb-server/src/bin/cdb-mkconfig.rs:1076).
- The BFF retries ANY call once on a fresh connection after a transport failure (timeout, dropped socket,
  engine restart), including every mutating verb; its comment "every verb here is an idempotent read" is
  not true for the M-rows (forgecentral/apps/bff/src/engine/wire-client.ts:585-608). A BFF-side timeout
  counts as a transport failure, so a slow mutation (e.g. IDAM_CONNECT's re-spawn) can be re-sent while
  the first attempt is still executing in the engine (wire-client.ts:490-502, 597-606).
- Request payload ceiling 8 MiB (crucible/crates/cdb-server/src/transport.rs:50; reactor.rs:425); the
  Console decoder accepts replies up to 16 MiB (forgecentral/packages/wire/src/frame.ts:99-101). A frame
  that does not decode is refused Framing and the connection is closed (crucible/crates/cdb-server/src/reactor.rs:1644-1655).
  Under admission overload the engine replies Overloaded without touching the engine (reactor.rs:1883-1890).

### 2.2 Peer identity, tier and clearance
- The console peer is a statically pinned fingerprint mapped to a tenant and a plane grant
  (reactor.rs:633-660). By design (D4) that tenant is a random, permanently reserved service tenant that
  holds no user data (crucible/docs/implementation-plans/IP-CONSOLE-CONTROL-PLANE.md:196-199); the node
  installer pins it with clearance `secret` and grant data,agent,cognition,otlp,delegation
  (crucible/deploy/cdb-install/installer/phases/50-config.sh:225; parsed by cdb-mkconfig.rs:1049-1071).
- Every mTLS peer, including the console peer, gets ExplainTier::User (transport.rs:130-132). The pinned
  peer's `clearance` field (crucible/crates/cdb-server/src/config.rs:1386-1387; the installer writes
  `secret`, 50-config.sh:225) is DROPPED by `peer_map` (transport.rs:395-402).
- User tier maps to clearance Internal (H:2151-2159). Therefore every non-settings Console operation reads
  at Internal clearance whatever the operator's Console role; records classified Confidential / Restricted
  / Secret are invisible, and for SOC commands indistinguishable from "unknown incident". Recorded as
  DEF-RBAC-PERMISSION-MAP (crucible/docs/DEFERRED_LEDGER.md:1206-1217).

### 2.3 Plane gate
- Every Console verb is WirePlane::Data (H:1391-1488). A request on a plane the peer was not granted is
  refused Denied, non-oracle (reactor.rs:1865-1873).

### 2.4 Operator delegation (who acts, in which tenant)
- The BFF injects `operator = {principal, tenant}` on every request from the authenticated session,
  overriding anything the caller sent (forgecentral/apps/bff/src/engine/operator-engine.ts:693-1042). The
  principal is the session's engine PrincipalId; the tenant is the session tenant, except that a
  `global-admin` may name a different tenant per request (tenant selector); tenant-scoped operators are
  pinned (forgecentral/apps/bff/src/engine/principal.ts:48-61). `settings_tier` is added only on the ten
  settings-plane verbs (operator-engine.ts:672-686, 799-848; payload.ts:103-116).
- Engine resolution, `effective_delegated_session` (H:2256-2312):
  1. no operator -> the peer acts as itself, i.e. in the reserved service tenant (H:2261-2263);
  2. operator present but the peer lacks the Delegation grant -> Refused Denied (H:2264-2268); the grant
     is read from the verified peer at HELLO (reactor.rs:1672-1674);
  3. principal or tenant not a hyphenated UUID -> Refused Denied (H:2270-2278);
  4. tenant equal to ANY control-plane peer tenant (the reserved service tenant) -> Refused Denied
     (H:2279-2297; IP-CONSOLE-CONTROL-PLANE-LEDGER.md:22 row C4);
  5. otherwise the operator becomes the acting principal in the operator's tenant, and the tier stays the
     PEER's tier (User) (H:2298-2311).
- The engine does not verify the operator identity or the operator->tenant mapping; it trusts the
  Delegation-granted broker (decision D3, IP-CONSOLE-CONTROL-PLANE.md:192-195). It also does not check
  that the asserted tenant exists: any well-formed UUID other than a reserved service tenant is accepted
  (no tenant lookup in H:2256-2312), so a global-admin's tenant selector can direct writes into any tenant id.

### 2.5 Authorization gates that do NOT exist on the non-settings commands
- No M-row handler checks a tier, role, or permission. The engine gates are only: plane grant (2.3),
  Delegation + UUID + reserved-tenant checks (2.4), the stores' system-tenant refusal, and per-verb input
  validation. `provision_admission` = delegation + single shard, nothing else (H:2561-2571).
- The BFF command routes check only that a session exists (e.g. /api/idam/configure,
  forgecentral/apps/bff/src/server.ts:1934-1938). UNVERIFIED (other slice): whether the SPA hides any
  control by role.
- Consequence: any authenticated operator, in any tenant their session resolves to, can issue every
  M-row. The node-global verbs (IDAM_*) are not tenant-scoped at all (see M19-M21).

### 2.6 Refusal shape
- `Reply::Refused { error: WireError { class, code, retry, correlation_id } }`; correlation_id is always 0
  today (H:1490-1497; crucible/crates/cdb-wire/src/error.rs:126-150). Classes seen in this slice
  (error.rs:48-93): Denied 0x0002 (unauthorized OR non-existent, non-oracle), Conflict 0x0004, Framing
  0x000B (malformed input), Internal 0x000C, LimitExceeded 0x000A, StorageUnavailable 0x0007.
- SOC case verbs (M24, M25, M28) and most SOC reads refuse IN-BAND (a normal reply with refused=true and
  an explanation) after delegation succeeds; unknown / foreign / over-clearance incidents all produce the
  same blank refusal.

### 2.7 Audit mechanisms (three different strengths)
- (A) TRD-04 hash chain. `Committer::commit` lands the data writes plus ONE fixed-size AuditEntry
  {previous_audit_hash, commit_version, transaction_id, batch_hash, principal_id, policy_version, hlc,
  entry_hash} atomically; an audit-append failure aborts the whole commit
  (crucible/crates/cdb-storage/src/commit.rs:1-15, 36-60, 128-181). Entries live in the system-tenant
  Audit keyspace 0x0B, keyed by inverted commit version (commit.rs:514-532; key.rs Audit = 0x0B). The entry
  names the principal and a hash of the batch, NOT the verb or the payload. policy_version is passed as 0
  by every Console path.
- (B) SOC incident audit index (keyspace SocIncidentAudit 0x31): rows {incident_id, act, principal,
  at_seconds, detail} keyed (tenant, incident, at_seconds, act tag, detail)
  (crucible/crates/cdb-cyber/src/soc_audit.rs:1-19, 149-157); read by SOC_INCIDENT_AUDIT.
- (C) None: in-memory only.
- Which verbs use which: (A) VTZ x4, POLICY x4, OBJECT x3, PRINCIPAL/GROUP x6, BUNDLE_COMMIT, CONTAIN,
  LOG_EXPORT, SOC_COGNITION_RUN records; (A)+(B) SOC_PLAN_MODIFY, SOC_PLAN_APPROVE; (B) ONLY
  SOC_INCIDENT_ACT and SOC_DISPOSITION -- they commit through a plain serializable Transaction, which
  appends no hash-chain entry (crucible/crates/cdb-storage/src/txn.rs:205-217; mvcc.rs:621-642;
  soc_act.rs:221; soc_disposition.rs:135). The plan acknowledges it: "this is the incident audit trail, not
  the TRD-04 hash chain -- chaining SOC acts is a Step 2 item" (crucible/docs/implementation-plans/IP-AISOC-STEP1.md:340).
  (C) IDAM_CONNECT, IDAM_CONFIGURE, IDAM_SYNC.
- Separately the BFF logs one structured "engine delegation" line per call before it runs
  (operator-engine.ts:207-235); that is a log, not a record.

### 2.8 Idempotency
- `request_id` is NOT an idempotency key for any Console verb. The IdempotencyLog is passed only to
  PrepareCommit / Remember / SubmitWrite / SubmitMemoryWrite / TxnCommit / WorkspacePromote (H:1271-1283),
  and it is per-connection, so it would not survive the BFF's reconnect-and-retry anyway
  (crucible/docs/DEFERRED_LEDGER.md:629-640).
- Per-verb replay behavior is stated in each block; the exceptions that use a caller key are
  POLICY_CREATE (policy id derived from request_id, H:6287), CONTAIN and LOG_EXPORT (command_id marker).
- The BFF request_id values: module-local counters starting at 2 and restarting on every BFF restart
  (forgecentral/apps/bff/src/engine/policies.ts:41-45; objects.ts:40-45; users.ts:44-51; soc.ts:108-112;
  idam.ts:38-42), or the literal 0 (vtz.ts:198-243; distribute.ts:115/128/158; logs.ts:88/126).

### 2.9 Classification of records the Console writes
- Console-originated records are stored at Classification::Internal (H:2346, 2782, 2807, 2832, 2853,
  2874, 2899, 3612, 3668, 6050, 6073, 6091, 6300, 6335, 6371, 6403, 6788, 6814, 7017, 7049, 7080, 7451).
  SOC acts / dispositions inherit the incident's own classification. Duplicate / existence guards in the
  management stores read at Secret so they see every record (e.g. crucible/crates/cdb-cyber/src/vtz_store.rs:285;
  object_store.rs:168; lug_provision.rs:228).

### 2.10 Single shard
- Every handler resolves `single_shard_engine`: a multi-shard node refuses Internal, a zero-shard node
  StorageUnavailable (H:9224-9241).

## 3. Mutating operations

### 3A. Virtual Trust Zones

### M01 VtzCreate (VTZ_CREATE)
- Console consumer: VTZ surface, create zone. SPA forgecentral/apps/console/src/surfaces/useVtzMutation.ts:111 ->
  `POST /api/vtz` (forgecentral/apps/bff/src/server.ts:909-912, handler handleVtzCommand :1023) ->
  resolveVtzCreate (apps/bff/src/engine/vtz.ts:191-201, request_id 0) -> OperatorEngine.vtzCreate
  (operator-engine.ts:1023-1027) -> wire-client.ts:1305-1313; CBOR packages/wire/src/payload.ts:438-453, 493-500.
- Configures: authors a new trust zone -- its dotted name (the name IS its position in the hierarchy),
  description, archetype, per-domain own postures, micro-segmentation flag, telemetry mode, re-auth
  interval, and draft/published lifecycle.
- Request fields (crucible/crates/cdb-wire/src/query.rs:1294-1331): request_id u128 (required, unused);
  spec (required): name string, description string, zone_type string, own_postures list of
  {domain string, posture string, floor bool}, micro_segmentation bool, telemetry string,
  reauth_interval_hours u32, lifecycle string -- every spec field required; operator (optional, injected).
- Engine validation (spec parse H:6703-6731 runs BEFORE delegation; any parse failure -> Framing, H:6769-6773):
  - name: non-empty, <= 255 bytes, <= 16 labels, each label 1..63 bytes matching
    `[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?`; folded to lowercase; never repaired
    (crucible/crates/cdb-types/src/forge_v2.rs:37-41, 100-118, 174-198). Zone id = lowercase dotted name (forge_v2.rs:132-136).
  - zone_type in {standard, quarantine, isolation, public, observability} (H:6642-6652).
  - telemetry in {full, sampled, off} (H:6655-6663); lifecycle in {draft, published} (H:6733-6740).
  - reauth_interval_hours must fit a u8 and lie in 1..=24 (H:6708; forge_v2.rs:1726-1729, 1865-1869).
  - description <= 1024 bytes (forge_v2.rs:1735, 1870-1874).
  - own_postures: domain in {governed-egress, execution, ordinary-network, file-and-config, ipc, device,
    memory, privilege-escalation, kernel-module, credential-store, persistence} (H:6666-6682); posture in
    {deny, permit-deny-risky} (H:6685-6691); a repeated domain keeps the last value (forge_v2.rs:1464-1467);
    the wire `floor` flag is ignored on input (H:6712-6717).
  - Read-only catastrophic floor: governed-egress and execution may never be authored permit-deny-risky
    (forge_v2.rs:1428-1434, 1875-1879). A violation surfaces as Framing (not Denied), because it fails in
    spec parsing (H:6716-6725).
  - Store (crucible/crates/cdb-cyber/src/vtz_store.rs:272-297; mapping H:6744-6759): system tenant ->
    SharedWriteForbidden -> Denied; name exists -> AlreadyExists -> Conflict; tighten-only inheritance: an
    own posture permit-deny-risky where the composed ANCESTOR posture is deny -> InheritanceContradiction
    {domain} -> Denied (vtz_store.rs:183-208); commit failure -> Internal.
  - The parent zone need not exist; a missing ancestor contributes nothing (vtz_store.rs:139-156).
- Authorization: 2.4 delegation (H:6774-6777); no tier or role check (2.5); written in the operator's tenant.
- Dual control: none.
- Audit: (A) hash chain; the zone put and its AuditEntry are one atomic batch attributed to the operator
  principal (vtz_store.rs:239-249, 291-296).
- Idempotency: request_id unused (the BFF sends 0); a replay refuses AlreadyExists -> Conflict.
- Storage and versioning: keyspace TrustZone 0x25, key (tenant, zone id) (vtz_store.rs:56-61); one live
  record per zone, last-write-wins, MVCC history as the trail; stored at Internal (H:6788).
- Apply semantics: read-time. The effective posture is recomputed on every VTZ_TREE / VTZ_DETAIL read as
  the tighten-only composition (deny wins) of the zone's own and every existing ancestor's authored
  postures; a domain authored nowhere resolves to deny (vtz_store.rs:158-181; forge_v2.rs:1437-1443,
  1494-1515). Lifecycle draft vs published gates nothing in crdb (no consumer of VtzLifecycle outside
  projection: grep of crates/). micro_segmentation / telemetry / reauth_interval_hours are stored and
  projected only -- no crdb consumer found (grep). A zone reaches endpoints only through an operator
  Distribute (M09), and enforcement is OFF. Not the Overview graph's zone membership: CONNECTIVITY_GRAPH
  routes entities with a hard-coded demo assignment (H:7780; crucible/crates/cdb-cyber/src/connectivity.rs:659-685)
  and only unions authored zones in as nodes (H:7792-7797).
- Note: a tenant's default published `root` zone (no authored postures) is created only by the `cdb-seed`
  CLI, not by any Console verb or at tenant creation (vtz_store.rs:404-446; crucible/crates/cdb-seed/src/main.rs:100).
- Reply: VtzMutated {id, lifecycle} (H:6761-6767).
- Evidence: H:6642-6800; vtz_store.rs:56-61, 139-208, 233-297; forge_v2.rs:37-41, 100-198, 1428-1515, 1726-1735, 1856-1890.

### M02 VtzEdit (VTZ_EDIT)
- Console consumer: VTZ surface, edit zone (incl. publish). SPA useVtzMutation.ts:117 -> `PUT /api/vtz/<id>`
  (server.ts:873, 914-917) -> resolveVtzEdit (vtz.ts:203-217, request_id 0) -> operator-engine.ts:1028-1032.
- Configures: replaces a zone's whole definition (description, archetype, own postures, flags, telemetry,
  re-auth, lifecycle). Cannot rename: the zone is identified by spec.name (rename = M03).
- Request fields: identical to M01 (query.rs:1334-1346).
- Engine validation: identical parse rules and refusals to M01; store commit_edit_zone
  (vtz_store.rs:302-326): system tenant -> Denied; no zone of that name -> NotFound -> Conflict; inheritance
  re-checked against ANCESTORS only -> Denied on a loosening. Descendants are not re-checked: tightening a
  parent never refuses, and a child's own permit-deny-risky simply composes to deny at read time.
- Lifecycle: spec.lifecycle is authoritative, so an edit can move published -> draft as well as
  draft -> published (H:6725-6727; no transition guard in vtz_store.rs:302-326).
- Authorization / dual control: as M01.
- Audit: (A) hash chain (vtz_store.rs:319-325).
- Idempotency: none; a replay rewrites the identical record with a new commit and a new audit entry.
- Storage and versioning: same key as M01; MVCC keeps prior versions.
- Apply semantics: as M01 (read-time composition; bundles only on the next Distribute).
- Evidence: H:6998-7024; vtz_store.rs:191-208, 302-326.

### M03 VtzRescope (VTZ_RESCOPE)
- Console consumer: VTZ surface, move/rename zone. SPA useVtzMutation.ts:122 -> `POST /api/vtz/<id>/rescope`
  body {newName} (server.ts:876, 903-908) -> resolveVtzRescope (vtz.ts:219-234) -> operator-engine.ts:1033-1037.
- Configures: re-parents / renames a zone (renaming IS re-scoping, the hierarchy is lexical).
- Request fields (query.rs:1349-1361): request_id; vtz_id string (current id, required); new_name string
  (required); operator.
- Engine validation: vtz_id parsed as a VtzName and interned (case-folded), new_name parsed with the M01
  name rules; either malformed -> Framing (H:6695-6700, 7027-7035). Store commit_rescope_zone
  (vtz_store.rs:334-376): system tenant -> Denied; old zone absent -> NotFound -> Conflict; ANY lexical
  descendant exists -> HasChildren -> Conflict (move leaves first); new name exists -> AlreadyExists ->
  Conflict; inheritance re-checked under the new parent -> Denied.
- Authorization / dual control: as M01.
- Audit: (A) one batch: put at the new key + tombstone at the old key (vtz_store.rs:360-375).
- Idempotency: none; a replay refuses NotFound -> Conflict (the old id is gone).
- Storage and versioning: postures, archetype, settings and lifecycle move with the zone. Authored
  POLICIES and the stored BUNDLE are keyed by the zone id string and are NOT moved
  (crucible/crates/cdb-cyber/src/policy_store.rs:108-117; bundle_store.rs:72-77): they stay under the old id.
- Apply semantics: read-time; reply {id: new id, lifecycle: ""} (H:7049-7056).
- Evidence: H:6695-6700, 7026-7059; vtz_store.rs:251-262, 334-376.

### M04 VtzDelete (VTZ_DELETE)
- Console consumer: VTZ surface, delete zone. SPA useVtzMutation.ts:115 -> `DELETE /api/vtz/<id>`
  (server.ts:918-920) -> resolveVtzDelete (vtz.ts:236-245) -> operator-engine.ts:1038-1042.
- Configures: removes a zone.
- Request fields (query.rs:1364-1374): request_id; vtz_id string; operator.
- Engine validation: vtz_id not a valid name -> Framing (H:7062-7066). Store commit_delete_zone
  (vtz_store.rs:378-399): system tenant -> Denied; absent -> NotFound -> Conflict; any descendant zone ->
  HasChildren -> Conflict. No check for policies, bundles, or objects that reference the zone.
- Authorization / dual control: as M01.
- Audit: (A) tombstone (reason "trust-zone management delete", deleted_by = operator) + audit entry
  (vtz_store.rs:221-236, 394-398).
- Idempotency: none; replay -> Conflict.
- Storage and versioning: tombstone; MVCC history preserved. The zone's policies and stored bundle remain
  in their keyspaces under the deleted id (not cascaded).
- Apply semantics: immediate for reads (the zone disappears from VTZ_TREE); an already-distributed bundle
  for that zone is not withdrawn by this verb.
- Evidence: H:7061-7090; vtz_store.rs:378-399.

### 3B. Policies and distribution

### M05 PolicyCreate (POLICY_CREATE)
- Console consumer: Policies surface, Create Policy modal. SPA forgecentral/apps/console/src/surfaces/usePolicyMutation.ts:59
  -> `POST /api/policies` (server.ts:1839-1842, handlePoliciesCommand :1831) -> resolveCreatePolicy
  (apps/bff/src/engine/policies.ts:93-106) -> operator-engine.ts:897-901 -> wire-client.ts:1135-1144;
  CBOR payload.ts:862-931.
- Configures: authors a new policy against a zone as version 1.0.0, Draft.
- Request fields (query.rs:3292-3359): request_id u128 (required; becomes the policy id); spec: vtz
  (dotted zone name, required), name (required), description (required, may be empty), rules list
  (required, may be empty) of {source_kind, source_selector_kind, source_selector_value,
  destination_kind, destination_selector_kind, destination_selector_value, action} (all strings);
  optional: protocols [string], ports string, schedule_days [string], schedule_start_minute u32,
  schedule_end_minute u32, active_from u64 (HLC), active_until u64 (HLC), geo [string],
  restriction_tags [string], applied_to [{endpoint_cn, agent?}], default_postures [{domain, posture,
  floor}]; required: logging string, max_classification string; operator.
- Engine validation. Parsing runs BEFORE delegation; any failure -> Framing (H:6193-6255, 6288-6290):
  - vtz must be a valid zone name (M01 rules; H:6197).
  - rule kinds in {user, group, agent, service, server, application, uri, network, registry_key,
    certificate, script, data_store} (H:5954-5970); selector kinds in {exact, glob, group_ref, cidr}
    (H:5976-5986); actions in {permit, monitor, quarantine, deny} (H:6101-6110).
  - protocols in {tcp, udp, https, ssh} (forge_v2.rs:632-639); ports in the form "80, 443, 8080-8090",
    each 1..=65535, start <= end, no overlap (forge_v2.rs:687-730).
  - schedule: start and end minute both present or both absent, start < end <= 1440 (H:6153-6161;
    forge_v2.rs:962-972); days in {mon, tue, wed, thu, fri, sat, sun} (forge_v2.rs:928-939).
  - logging in {full, sampled, off} (H:6655-6663); max_classification in {unclassified, internal,
    confidential, restricted, secret} (H:6113-6124); default_postures use the M01 domain/posture tags
    (H:6207-6212).
  - Policy::validate at the store (policy_store.rs:436-449; forge_v2.rs:1661-1690) -> Invalid -> Framing:
    name non-empty and <= 128 bytes, description <= 1024 bytes (forge_v2.rs:1522-1527); rule source kind
    must be source-capable (user, group, agent, service, server, application, certificate, script) and
    destination kind destination-capable (service, server, application, certificate, script, uri,
    network, registry_key, data_store) (forge_v2.rs:352-387); selectors non-empty, a cidr must be
    `addr/prefix` with prefix <= 32 (IPv4) / <= 128 (IPv6) (forge_v2.rs:432-518); active_from <= active_until
    (forge_v2.rs:1070-1077).
  - Store (policy_store.rs:454-476; mapping H:6258-6275): system tenant -> Denied; this policy id
    already has versions in this zone -> AlreadyExists -> Conflict; another policy in the zone already
    carries the display name (newest versions compared) -> NameTaken -> Conflict (policy_store.rs:409-424).
  - NOT checked: that the zone exists in the VTZ store (only the Policy keyspace is read); the
    catastrophic floor on default_postures -- a policy may store permit-deny-risky for governed-egress or
    execution (the floor is enforced only on zones: forge_v2.rs:1876 is its sole enforcement site, grep);
    applied_to members (free text). resource_bound is not an input and is zeroed (H:6230-6238).
- Authorization: 2.4 (H:6291-6294); no tier or role check.
- Dual control: none.
- Audit: (A) hash chain (policy_store.rs:378-389, 471-476).
- Idempotency: the policy id is the UUID of request_id (H:6287; query.rs:3340-3344), so an exact replay is
  refused Conflict instead of duplicating. BUT the BFF's request_id is a per-process counter that starts
  at 2, is shared with the policy reads, and restarts on every BFF restart (policies.ts:41-45): after a
  restart a new create can reuse an id that already exists in the same zone and be refused Conflict, and
  policy ids are small predictable integers (e.g. 00000000-0000-0000-0000-000000000002).
- Storage and versioning: keyspace Policy 0x2D, one key per (tenant, zone id, policy id, major, minor,
  patch) (policy_store.rs:108-135); the store forces version 1.0.0 and Draft whatever the input
  (policy_store.rs:471-474); stored at Internal (H:6300).
- Apply semantics: a Draft never composes (POLICY_EFFECTIVE returns published versions only); no effect
  until M07 and then M09.
- Reply: PolicyMutated {id, version "1.0.0", lifecycle "draft"} (H:6302-6309).
- Evidence: H:6101-6313; policy_store.rs:108-135, 409-476; forge_v2.rs:352-518, 632-1086, 1522-1690.

### M06 PolicyEdit (POLICY_EDIT)
- Console consumer: Policies surface, edit modal. usePolicyMutation.ts:60 -> `POST /api/policies/edit`
  -> resolveEditPolicy (policies.ts:108-122) -> operator-engine.ts:902-906.
- Configures: changes a policy's authored content. A published version is never mutated.
- Request fields (query.rs:3362-3377): request_id; id (hyphenated UUID, required); spec (as M05); operator.
- Engine validation: id not a UUID -> Framing (H:6316-6322); spec as M05 (Framing). Store
  (policy_store.rs:495-547): system tenant -> Denied; no versions for (spec.vtz zone, id) -> NotFound ->
  Conflict (so a policy cannot be moved to another zone by editing); NameTaken -> Conflict; when a
  published version exists, max_classification above the newest published one -> ClassificationWidened
  -> Conflict (classification never widens, R-FRG-7).
- Authorization / dual control: as M05.
- Audit: (A); the new draft and any superseded-draft tombstone are one batch (policy_store.rs:521-546).
- Idempotency: none; a replay recomputes the same version and rewrites it (new commit, new audit entry).
- Storage and versioning (semver re-mint): with a published lineage the edit mints the next version as a
  Draft -- MAJOR+1.0.0 if the change revokes previously granted access relative to the newest published
  version, otherwise MAJOR.MINOR+1.0 (policy_store.rs:426-432, 511-520). "Revokes" = classification ceiling
  lowered; a domain's permit-deny-risky no longer authored; a rule's action raised for the same
  (source, destination); a non-deny rule removed; a new quarantine/deny rule for a pair the base did not
  restrict. Applied-To changes are deliberately never breaking (policy_store.rs:326-376). With no
  published lineage the single draft keeps its version. At most one draft exists: a superseded draft at a
  different version is tombstoned in the same batch (policy_store.rs:525-535).
- Apply semantics: draft only; nothing changes for endpoints until M07 + M09.
- Reply: PolicyMutated {id, minted version, "draft"} (H:6336-6342).
- Evidence: H:6315-6347; policy_store.rs:326-376, 426-547.

### M07 PolicyPublish (POLICY_PUBLISH)
- Console consumer: Policies surface, Publish. usePolicyMutation.ts:64 -> `POST /api/policies/publish` ->
  resolvePublishPolicy (policies.ts:124-139) -> operator-engine.ts:907-911.
- Configures: promotes one authored Draft version to Published.
- Request fields (query.rs:3381-3396): request_id; vtz (the INTERNED zone id; used raw, not parsed or
  case-folded -- H:6368, unlike create/edit which case-fold spec.vtz); id (UUID); version
  ("major.minor.patch"); operator.
- Engine validation: id not a UUID or version unparseable -> Framing (H:6350-6360). Store
  (policy_store.rs:554-603): system tenant -> Denied; (zone, id, version) absent -> VersionNotFound ->
  Conflict; already Published -> AlreadyPublished -> Conflict; record re-validated (Invalid -> Framing).
  Classification widening is not re-checked here (only at M06).
- Authorization / dual control: as M05. No second approver.
- Audit: (A) (policy_store.rs:594-602).
- Idempotency: replay -> AlreadyPublished -> Conflict.
- Storage and versioning: the version key is rewritten with lifecycle Published and is immutable from then
  on (edits mint). Older published versions stay Published; the newest published per policy is the one
  that composes (policy_store.rs:302-324). The reply's `breaking` flag is recomputed against the newest
  previously published version (policy_store.rs:579-584).
- Apply semantics: the version becomes eligible for POLICY_EFFECTIVE, which admits it only while its
  active window contains the SERVER clock (from inclusive, until exclusive: forge_v2.rs:1082-1086;
  policy_store.rs:320-323) -- producer-side expiry. Endpoints get it only after the next Distribute (M09)
  and their own fetch; enforcement is OFF. schedule / geo / restriction_tags / logging / applied_to are
  carried, not evaluated, in crdb (no crdb consumer of applied_to beyond projection: H:3132, 6222; grep).
- Reply: PolicyMutated {id, version, "published", breaking} (H:6376-6382).
- Evidence: H:6349-6384; policy_store.rs:302-324, 554-603.

### M08 PolicyDelete (POLICY_DELETE)
- Console consumer: Policies surface, delete. usePolicyMutation.ts:82 -> `POST /api/policies/delete` ->
  resolveDeletePolicy (policies.ts:141-150) -> operator-engine.ts:912-916.
- Configures: retires a policy (all versions).
- Request fields (query.rs:3399-3411): request_id; vtz (interned zone id, raw); id (UUID); operator.
- Engine validation: id not a UUID -> Framing (H:6386-6392). Store (policy_store.rs:605-629): system tenant
  -> Denied; no live versions -> NotFound -> Conflict.
- Authorization / dual control: as M05.
- Audit: (A); every live version tombstoned (reason "operator policy delete", deleted_by = operator) in one
  batch (policy_store.rs:617-645).
- Idempotency: replay -> NotFound -> Conflict (a tombstoned version reads as absent,
  crucible/crates/cdb-storage/src/mvcc.rs:14-15).
- Storage and versioning: tombstones; MVCC history preserved.
- Apply semantics: drops out of POLICY_EFFECTIVE at once. An already-committed bundle that carried its
  rules is NOT withdrawn (policy_delete never touches the bundle store, H:6385-6415); endpoints keep it
  until the zone is distributed again.
- Evidence: H:6385-6415; policy_store.rs:605-645.

### M09 BundleCommit (BUNDLE_COMMIT) -- Distribute
- Console consumer: Policies surface, per-zone DistributionPanel "Distribute". SPA useDistribution.ts:75 ->
  `POST /api/vtz/<id>/distribute` with the chosen endpoint CNs (server.ts:944-1020) -> resolveDistribute
  (apps/bff/src/engine/distribute.ts:106-169): VTZ_DETAIL read -> POLICY_EFFECTIVE read -> compose the
  flat EndpointPolicy + rules + contributors -> the sidecar signs (sign-client.ts) -> BUNDLE_COMMIT with
  the signed CBOR bytes. Bundle version = VTZ_DETAIL `commit_version`, which is the NODE-WIDE latest commit
  version (H:6584), not a per-zone counter; freshness lease 24 h (distribute.ts:34, 95). All three engine
  calls use request_id 0.
- Configures: puts the zone's signed policy bundle into carriage for the endpoints named in its scope.
- Request fields (query.rs:3813-3829): request_id; bundle bytes (the signed SignedPolicyBundle CBOR, sent as
  a CBOR array of integers, payload.ts:478-490); operator.
- Engine validation (bundle_store.rs:99-137; mapping H:6986-6995): system tenant -> Denied; bytes do not
  decode as a SignedPolicyBundle -> Malformed -> Framing; bundle.version <= the stored version for the
  bundle's own scope.vtz -> Stale -> Framing; storage failure -> Internal.
  NOT checked by crdb: the ML-DSA-87 signature (the carrier holds no key; the endpoint verifies,
  bundle_store.rs:1-22); that scope.vtz names an existing zone; that scope members are enrolled; any link
  between the request and the bundle's zone (the key is read from the signed bytes).
- Authorization: 2.4 (H:6801-6804); no tier or role check. Signing-key custody is the sidecar's (other slice).
- Dual control: none.
- Audit: (A) (bundle_store.rs:130-136).
- Idempotency: request_id unused; an exact replay is refused Stale -> Framing. Since the version is the
  node-wide commit counter, a later distribute almost always advances; Stale is essentially a concurrent
  race.
- Storage and versioning: keyspace PolicyBundle 0x26, key (tenant, scope.vtz); ONE live bundle per zone,
  last-write-wins, bytes stored verbatim (bundle_store.rs:72-77, 118-129); version strictly monotonic per
  zone (no rollback in carriage); Internal.
- Apply semantics: endpoints pull it over :7878 BUNDLE_FETCH, scope-gated by the verified peer's bound CN
  (bundle_store.rs:144-200; per-tenant fetch scan cap 4096 bundles, refuses above, bundle_store.rs:30-35),
  in the ENDPOINT PEER's own tenant (H:6829-6860). The bundle is committed in the OPERATOR's tenant, so the
  two must coincide (UNVERIFIED per deployment). Verify / apply / report are Torch's (other slice);
  enforcement OFF. The Console cannot observe convergence -- see R18 and finding F2.
- Reply: BundleCommitted {version, commit_version} (H:6819-6824).
- Evidence: H:6584, 6800-6827, 6986-6995; bundle_store.rs:1-137; distribute.ts:34-169.

### 3C. Named objects (policy nouns)

### M10 ObjectCreate (OBJECT_CREATE)
- Console consumer: Objects surface, create. SPA surfaces/useObjects.ts:77 -> `POST /api/objects`
  (server.ts:1318-1377) -> resolveCreateObject (apps/bff/src/engine/objects.ts:70-83) ->
  operator-engine.ts:917-921; CBOR payload.ts:281-304.
- Configures: registers a reusable named object (a source/destination noun policies can reference).
- Request fields (query.rs:400-437): request_id; spec {name (required), kind (required), selector_kind
  (required), selector_value (required), attributes [string] (optional), description (required, may be
  empty), tags [string] (optional), lifecycle (required)}; operator.
- Engine validation. Parse runs BEFORE delegation; failure -> Framing (H:5990-6015, 6036-6040):
  kind in {user, group, agent, service, server, application, uri, network, registry_key, certificate,
  script, data_store} (H:5954-5970); selector_kind in {exact, glob, group_ref, cidr} (H:5976-5986);
  attributes in {broker, in_zone} (H:5996-6002); lifecycle in {draft, published} (forge_v2.rs:1207-1213).
  Store validate (object_store.rs:145-151; forge_v2.rs:1266-1285) -> Invalid -> Framing: name non-blank;
  selector value non-empty; a cidr must parse (addr/prefix, prefix <= 32 or 128); a cidr only on kind
  network; group_ref only on kind group, and a group object MUST use group_ref; exact/glob on any other
  kind. System tenant -> Denied; name already exists -> AlreadyExists -> Conflict (object_store.rs:159-180;
  mapping H:6018-6031). No length bound on name, description or tags beyond the 8 MiB frame. No posture
  field exists (object_store.rs:1-14).
- Authorization: 2.4 (H:6041-6044); no tier or role check.
- Dual control: none.
- Audit: (A) (object_store.rs:132-143, 175-179).
- Idempotency: replay -> AlreadyExists -> Conflict.
- Storage and versioning: keyspace NamedObject 0x2C, key (tenant, name) (object_store.rs:53-58); one live
  record, MVCC history; Internal (H:6050).
- Apply semantics: read-time. Members are resolved on each OBJECT_DETAIL read from the selector; a group
  object's members are the LUG principals that carry that group (leading `@` stripped)
  (crucible/crates/cdb-cyber/src/object_resolve.rs:132-143). Policies do NOT reference objects by name:
  each rule embeds its own (kind, selector) copy (H:6128-6145), so creating, editing or deleting a catalog
  object changes no existing policy (object_store.rs:206-213). Object lifecycle gates nothing in crdb.
- Evidence: H:5954-6056; object_store.rs:1-180; forge_v2.rs:432-518, 1207-1285.

### M11 ObjectEdit (OBJECT_EDIT)
- Console consumer: Objects surface, edit. useObjects.ts:77 -> `POST /api/objects/edit` -> resolveEditObject
  (objects.ts:85-98) -> operator-engine.ts:922-926.
- Configures: replaces a named object's whole definition; the object is identified by spec.name (no rename).
- Request fields: as M10 (query.rs:441-453).
- Engine validation: as M10, except absent name -> NotFound -> Conflict (object_store.rs:186-207).
- Authorization / dual control / audit: as M10.
- Idempotency: none; a replay rewrites the same record (new commit + audit entry).
- Storage and versioning / apply semantics: as M10 (lifecycle may move either way; no effect on policies).
- Evidence: H:6058-6079; object_store.rs:186-207.

### M12 ObjectDelete (OBJECT_DELETE)
- Console consumer: Objects surface, delete. useObjects.ts:86 -> `POST /api/objects/delete` ->
  resolveDeleteObject (objects.ts:100-109) -> operator-engine.ts:927-931.
- Configures: removes a named object.
- Request fields (query.rs:456-466): request_id; name; operator.
- Engine validation: system tenant -> Denied; absent -> NotFound -> Conflict (object_store.rs:214-243). No
  check for policies that were authored from it (they hold their own copies).
- Authorization / dual control: as M10.
- Audit: (A); tombstone reason "operator object delete", deleted_by = operator (object_store.rs:225-242).
- Idempotency: replay -> Conflict.
- Storage and versioning: tombstone, history preserved.
- Apply semantics: disappears from OBJECT_LIST at once; no enforcement change.
- Evidence: H:6081-6099; object_store.rs:214-243.

### 3D. Users -- Local User Graph provisioning

### M13 PrincipalCreate (PRINCIPAL_CREATE)
- Console consumer: Users surface, Add User. SPA surfaces/useUsers.ts:91 -> `POST /api/users`
  (server.ts:1132-1216; the BFF trims username and accepts kind human|service, email, org :1115-1130) ->
  resolveCreatePrincipal (apps/bff/src/engine/users.ts:121-134) -> operator-engine.ts:942-946.
- Configures: provisions a local enterprise identity (Human or Service) directly, with no IdP, in the
  tenant's Enterprise identity namespace.
- Request fields (query.rs:478-491, 628-642): request_id; spec {username (required), subject_type
  (required), email (optional), org (optional)}; operator.
- Engine validation: subject_type in {human, service}, else Framing -- parsed BEFORE delegation
  (H:2573-2591, 2763-2767). Store (lug_provision.rs:212-258; mapping H:2537-2556): system tenant ->
  SharedWriteForbidden -> Denied; blank username -> BadInput -> Framing (lug_provision.rs:105-117); the key
  "enterprise:<username>" must pass the secret-material guard -- not `$...$` crypt-shaped, no
  "-----BEGIN", no "PRIVATE KEY", no leading "ssh-", <= 512 bytes including the 11-byte prefix
  (crucible/crates/cdb-cyber/src/lug.rs:607-630) -> BadInput -> Framing; username already exists (any
  origin, read at Secret) -> AlreadyExists -> Conflict. email / org are not format- or length-checked. No
  trust field exists anywhere (R-LUG-24, lug_provision.rs:15-24).
- Authorization: 2.4 (H:2768-2771); no tier or role check.
- Dual control: none.
- Audit: (A); the Enterprise namespace node + the subject node in one batch (lug_provision.rs:163-172, 241-257).
- Idempotency: replay -> Conflict.
- Storage and versioning: keyspace LugNode 0x28; the key derives from the username only
  (INV-LUG-KEY-NATURAL, lug_provision.rs:21-24); status "active", origin "local_record"
  (lug_provision.rs:175-205); first_seen = server clock (H:2775-2776); Internal (H:2782).
- Apply semantics: visible at once in LIST_PRINCIPALS; joinable to groups; bindable to an IdAM account
  later. (Username is the immutable key: there is no rename verb.)
- Evidence: H:2573-2790; lug_provision.rs:1-258; lug.rs:607-630.

### M14 PrincipalEdit (PRINCIPAL_EDIT)
- Console consumer: Users surface, edit user. useUsers.ts:100 -> `POST /api/users/edit` -> resolveEditPrincipal
  (users.ts:136-152) -> operator-engine.ts:947-951.
- Configures: replaces a local principal's subject type, email and org.
- Request fields (query.rs:645-658): request_id; spec (username identifies the record); operator.
- Engine validation: subject_type as M13 (Framing). Store (lug_provision.rs:260-316): absent -> NotFound ->
  Conflict; not a local record (origin != local_record, e.g. an observed or IdAM account) -> BadInput ->
  Framing (lug_provision.rs:506-522); once the record is bound to an IdAM connector, email and org are
  owned by the directory and any change to them -> IdamOwnedField -> Conflict (lug_provision.rs:286-316;
  crucible/crates/cdb-cyber/src/lug_idam_bind.rs:67).
- Authorization / dual control: as M13.
- Audit: (A).
- Idempotency: none; replay rewrites the same record.
- Storage and versioning: status, first_seen and valid_from are preserved (lug_provision.rs:272-282).
- Apply semantics: immediate in directory reads.
- Evidence: H:2792-2815; lug_provision.rs:260-316, 506-522.

### M15 PrincipalSetStatus (PRINCIPAL_SET_STATUS)
- Console consumer: Users surface, status control. useUsers.ts:113 -> `POST /api/users/status` (BFF pre-checks
  active|suspended|revoked, server.ts:1173-1183) -> resolveSetPrincipalStatus (users.ts:154-168) ->
  operator-engine.ts:952-956.
- Configures: a local principal's lifecycle status.
- Request fields (query.rs:661-676): request_id; username; status; operator.
- Engine validation (lug_provision.rs:318-345): status not in {active, suspended, revoked} -> BadInput ->
  Framing (lug_provision.rs:99); absent -> Conflict; not a local record -> Framing. Any transition is allowed
  (including revoked -> active); never a delete.
- Authorization / dual control: as M13.
- Audit: (A).
- Idempotency: natural (sets the same value).
- Storage and versioning: the `status` field of the subject node.
- Apply semantics: directory field only -- no crdb consumer of these status values beyond the directory
  projection was found (grep for the tags across crates/). UNVERIFIED whether Torch or the Console's
  policy composition reads it.
- Evidence: H:2817-2840; lug_provision.rs:99, 318-345.

### M16 GroupCreate (GROUP_CREATE)
- Console consumer: Users surface, Groups tab create. useUsers.ts:131 -> `POST /api/users/groups` ->
  resolveCreateGroup (users.ts:101-119) -> operator-engine.ts:719-723.
- Configures: creates an enterprise group (a LocalGroup in the Enterprise namespace).
- Request fields (query.rs:680-696): request_id; name; description (may be empty); operator.
- Engine validation (lug_provision.rs:347-376): system tenant -> Denied; blank name or secret-shaped /
  over-long key -> Framing (lug_provision.rs:120-132); exists -> AlreadyExists -> Conflict.
- Authorization / dual control: as M13.
- Audit: (A); namespace node + group node in one batch.
- Idempotency: replay -> Conflict.
- Storage and versioning: LugNode 0x28, key from the name only; built_in false, origin local_record
  (lug_provision.rs:484-504).
- Apply semantics: immediate in LIST_GROUPS; a group object (M10, kind group + group_ref) resolves its
  members from principals carrying this group at read time.
- Evidence: H:2842-2861; lug_provision.rs:120-132, 347-376, 488-504.

### M17 GroupEdit (GROUP_EDIT)
- Console consumer: BFF route `POST /api/users/groups/edit` (server.ts:1107-1112, 1196-1203) ->
  resolveEditGroup (users.ts:170-188) -> operator-engine.ts:932-936. No SPA caller found (grep of
  apps/console/src for "groups/edit").
- Configures: replaces a group's description (the name is the key; no rename).
- Request fields: as M16.
- Engine validation (lug_provision.rs:378-412): blank/invalid name -> Framing; absent -> NotFound -> Conflict.
- Authorization / dual control / audit: as M16.
- Idempotency: none; replay rewrites.
- Storage and versioning: first_seen / valid_from preserved.
- Apply semantics: immediate.
- Evidence: H:2863-2882; lug_provision.rs:378-412.

### M18 GroupSetMembers (GROUP_SET_MEMBERS)
- Console consumer: BFF route `POST /api/users/groups/members` (server.ts:1184-1195) -> resolveSetGroupMembers
  (users.ts:190-204) -> operator-engine.ts:937-941. No SPA caller found (grep for "groups/members").
- Configures: sets a group's DIRECT subject membership to exactly the given usernames.
- Request fields (query.rs:699-711): request_id; name; members [username]; operator.
- Engine validation (lug_provision.rs:414-480): group absent -> NotFound -> Conflict; each member must be an
  existing LOCAL enterprise principal: absent -> NotFound -> Conflict, not local -> BadInput -> Framing;
  blank / invalid names -> Framing.
- Authorization / dual control: as M13.
- Audit: (A) for the set-diff batch -- BUT when the desired set equals the current set nothing is committed,
  no audit entry is written, and commit_version 0 is returned (lug_provision.rs:477-479).
- Idempotency: natural (an identical replay is a no-op returning 0).
- Storage and versioning: additions are DIRECT MEMBER_OF edges; removals are tombstoned ("operator
  set_members removal"); only IdentitySubject members of this group are diffed, so memberships observed
  on devices are never touched (lug_provision.rs:432-476).
- Apply semantics: immediate in directory reads and in group-object member resolution.
- Evidence: H:2884-2919; lug_provision.rs:414-480.

### 3E. External IdAM connector (Auth0) -- node-global runtime state

### M19 IdamConnect (IDAM_CONNECT)
- Console consumer: Users surface, IdAM connector card, onboarding. SPA surfaces/useIdam.ts:103-140 runs
  three calls in order: `POST /api/idam/secret` (the sidecar writes the secret to a file; server.ts:2392-2444),
  `POST /api/idam/connect` (server.ts:2446-2509) -> resolveIdamConnect (apps/bff/src/engine/idam.ts:80-100)
  with client_secret_ref FIXED to `/etc/cdb/secrets/auth0-management.secret` (server.ts:1926, 2493), then
  `POST /api/idam/configure` (M20).
- Configures: which Auth0 tenant the node's single IdAM connector authenticates to (domain, M2M client id,
  Management API audience) plus a PATH to the client secret; re-spawns the connector live.
- Request fields (query.rs:604-625): request_id; provider; domain; client_id; audience (empty = derived);
  client_secret_ref (a path, never a secret); operator.
- Engine validation (H:2705-2757): delegation first; provider must be "auth0"
  (crucible/crates/cdb-cyber/src/lug_idam_auth0.rs:47-50) else Framing; every field must pass the
  secret-material guard (lug.rs:618-630: a secret VALUE is refused) else Framing; domain, client_id and
  client_secret_ref non-empty else Framing. The domain is not validated as a hostname. Then
  apply_pending_auth0_connectivity (crucible/crates/cdb-server/src/bootstrap.rs:5996-6041): secret file
  unreadable -> Conflict; no store -> Conflict; spawn failure -> Internal. Order is fail-closed: read the
  secret, spawn the replacement, only then stop the old task. The engine does not check the secret
  file's mode or owner -- it reads and trims it (crucible/crates/cdb-ingest/src/idam_auth0_engine.rs:159-165).
- Authorization: 2.4 delegation only; no tier or role check (the IA plan's "tier-gated Admin/SecurityAudit",
  crucible/docs/implementation-plans/IP-LUG-IDAM-AUTH0.md:203, is not implemented). NOT tenant-scoped: the
  connector is node-global (one per node, bootstrap.rs:5953-5962), so an operator of any tenant can
  re-point it. Synced identities land in the tenant named by the node config (`connectors.auth0.tenant`),
  never the operator's tenant (bootstrap.rs:5967-5985 keeps base.tenant; crucible/crates/cdb-server/src/connector.rs:147, 152).
- Dual control: none.
- Audit: NONE (2.7 C). Nothing is written to any store; the reply's commit_version is always 0 (H:2748-2753).
  The plan (IP-LUG-IDAM-CONNECT.md:64) and the BFF comment (idam.ts:73-79) both say "audited"; the code
  is not.
- Idempotency: none; each replay re-spawns the connector.
- Storage and versioning: in-memory only (Auth0ConnectorState; crucible/crates/cdb-ingest/src/connector.rs:239-331;
  bootstrap.rs:6030-6040). NOT persisted: on the next node restart the connector reverts to the node-config
  boot stanza (bootstrap.rs:1125-1162). On a node installed without CDB_AUTH0_DOMAIN that stanza is empty
  and its tenant is the nil UUID (crucible/crates/cdb-server/src/bin/cdb-mkconfig.rs:918-921;
  config.rs:1760-1762) -- UNVERIFIED what a Console-onboarded sync does with that nil (system) tenant.
- Apply semantics: live on success (re-spawn); the new domain becomes the card's provider tenant.
- Evidence: H:2561-2571, 2705-2757; bootstrap.rs:1125-1162, 5953-6041; connector.rs (cdb-ingest) 239-331.

### M20 IdamConfigure (IDAM_CONFIGURE)
- Console consumer: the same card (enable switch + cadence form; also step 3 of onboarding). `POST
  /api/idam/configure` (server.ts:1928-1998; the BFF requires provider string, enabled boolean, integer
  cadences) -> resolveIdamConfigure (idam.ts:102-114).
- Configures: the connector's enabled flag, delta poll interval, and full directory-sync cadence.
- Request fields (query.rs:577-601): request_id; provider; enabled bool; poll_interval_secs u64;
  full_sync_cadence_hours u64; operator.
- Engine validation (H:2667-2703): delegation; provider != "auth0" -> Framing; no connector state ->
  Conflict (cannot happen since the state always exists, bootstrap.rs:1125-1133); poll_interval_secs must be
  60..=86400 and full_sync_cadence_hours 1..=168 (crucible/crates/cdb-types/src/idam.rs:14-31) else
  Framing, and then NEITHER cadence changes (connector.rs:356-377); enabled is applied only after the
  cadences pass.
- Authorization: as M19 (node-global, no tier).
- Dual control: none.
- Audit: NONE (2.7 C); reply commit_version 0 (H:2690). The plan calls it "audited, tier-gated"
  (IP-LUG-IDAM-AUTH0.md:155, 203) -- not implemented.
- Idempotency: natural.
- Storage and versioning: in-memory atomics only; lost on restart (the boot stanza wins). A committed
  config-document section `idam_connector` exists (crucible/crates/cdb-admin/src/config_document.rs:201-230,
  444-445) but no cdb-server code reads it (grep `idam_connector` in crates/cdb-server finds only the
  IDAM_CONNECTORS handler). Settings-plane interplay is outside this slice.
- Apply semantics: cadences are re-read by the loop every tick; enable/disable is live
  (connector.rs:234-237). Enabling a connector that was never connected on this boot starts nothing until
  an IDAM_CONNECT spawns a task (bootstrap.rs:1125-1133).
- Evidence: H:2667-2703; connector.rs (cdb-ingest) 356-390; idam.rs (cdb-types) 14-31.

### M21 IdamSync (IDAM_SYNC)
- Console consumer: card "Sync now". SPA useIdam.ts:61 -> `POST /api/idam/sync` (server.ts:2511-2557) ->
  resolveIdamSync (idam.ts:62-71).
- Configures: requests one out-of-cadence full directory sync.
- Request fields (query.rs:552-561): request_id; provider; operator.
- Engine validation (H:2632-2665): delegation; no connector state -> Conflict; provider != "auth0" ->
  Framing; connector disabled -> Conflict. There is no "already running" refusal (the plan row says there
  should be, IP-LUG-IDAM-AUTH0.md:203).
- Authorization: as M19.
- Dual control: none.
- Audit: NONE (2.7 C).
- Idempotency: natural (re-clears the same marker).
- Storage and versioning: clears the in-memory last-full-sync marker (connector.rs:404-414).
- Apply semantics: the running loop performs a full sync on its next tick; the reply is an ACK
  (IdamSyncStarted), not a result -- progress shows in IDAM_CONNECTORS (R09). Results are committed into
  the configured connector tenant.
- Evidence: H:2632-2665; connector.rs (cdb-ingest) 404-414.

### 3F. Containment

### M22 Contain (CONTAIN) -- entity drawer "Isolate"
- Console consumer: entity drawer quick action "Isolate from network". SPA
  forgecentral/apps/console/src/entity/useIsolate.ts:20 (mounted by shell/DrawerHost.tsx) ->
  `POST /api/entity/<principal|vtz|object>/<id>/isolate` with {posture quarantine|deny, commandId}
  (server.ts:229-316) -> resolveIsolate (apps/bff/src/engine/isolate.ts:34-63): subject = the entity id,
  action Quarantine or Deny, reason fixed to "Operator isolate from the Console (<posture>)", issued_at =
  BFF clock (ms), no decision provenance, no AI assist -> operator-engine.ts:977-984.
- Configures: records an operator containment disposition (Quarantine or Deny) on a subject.
- Request fields (query.rs:79-89; crucible/crates/cdb-types/src/containment.rs:161-181): operator
  (Option, not serde-default on the wire; the BFF always sends one); request {subject string, action
  Permit|Monitor|Quarantine|Deny, reason string, command_id string, issued_at u64 (unix ms),
  derived_from_decision_id optional string, ai_assist optional {verdict, confidence_pct u8,
  proposed_policy_digest}}.
- Engine validation (containment.rs:126-156 via containment_store.rs:241-289): action must be Quarantine
  or Deny (Permit / Monitor -> NotARestriction); enforcement_active is forced false by the server
  (H:2335); subject, operator and command_id must be non-blank; ai_assist confidence 0..=100; system
  tenant refused. EVERY failure -- validation, system tenant, commit -- collapses to Refused Denied
  (H:2349-2351), so a malformed action is indistinguishable from an authorization refusal. The subject
  is not checked for existence or kind (a principal id, zone id or object name are all accepted).
- Authorization: 2.4 (delegation first, H:2325); no tier or role check. Attribution: the stored
  disposition's `operator` is the delegated principal UUID, never client-asserted (H:2327-2338).
- Dual control: none.
- Audit: (A) one batch: the content-addressed disposition, the (tenant, subject) current pointer, the
  (tenant, command_id) marker, and the audit entry (containment_store.rs:217-289). Not recorded on any SOC
  incident trail: IncidentAct::Contained exists but is never written (grep for IncidentAct::Contained).
- Idempotency: by command_id per tenant, read-then-commit (containment_store.rs:252-259): a retry with the
  same command_id returns the ORIGINAL disposition as AlreadyCommitted and the reply looks exactly like a
  fresh success -- even if the retry carries a different subject or action (the marker does not compare
  payloads). Not safe against a concurrent duplicate (containment_store.rs:227-230).
- Storage and versioning: keyspace Containment 0x1A; an immutable content-addressed record (SHA-512 of the
  canonical CBOR, which includes issued_at) plus a mutable per-subject "current" pointer
  (containment_store.rs:1-17, 96-114). A later disposition on the same subject replaces the pointer. There
  is NO verb to lift or clear a containment (no such Request variant; Permit / Monitor are refused).
- Apply semantics: enforcement OFF: the reply is Contained {action, enforcement_active false, summary
  "<Action> recorded for <subject>; enforcement off (observe/quarantine posture)"} (H:2361-2375). The
  current disposition is readable through the CrucibleQL virtual relation `agent_containment`
  (H:8455-8600). UNVERIFIED (torch slice): whether and when Torch consumes it.
- Evidence: H:2319-2375; containment_store.rs:1-289; containment.rs:65-181.

### 3G. Audited LOG export

### M23 LogExport (LOG_EXPORT)
- Console consumer: Logs surface, Export. SPA surfaces/useExportLogs.ts:13 (LogsSurface) ->
  `POST /api/logs/export` (server.ts:369-470) -> resolveLogExport (apps/bff/src/engine/logs.ts:135-158):
  command_id from the client, issued_at = BFF clock (seconds), query = the current Logs filter.
- Configures: nothing. Returns the filtered decisions and records a durable, audited receipt of the export.
- Request fields (query.rs:909-926): operator (top-level, authoritative; query.operator is ignored);
  query (a full LOG_QUERY, see R14); command_id string; issued_at i64 (unix s).
- Engine validation: delegation; query-exposure gate: committed `db_query_enabled` false or the config
  unreadable -> Denied (H:7395-7410); an unknown confidence / action tag exports ZERO rows but still
  records a receipt (H:7414-7436); manifest validation: command_id and digests non-empty
  (crucible/crates/cdb-cyber/src/export_store.rs:93-101); system tenant or commit failure -> Denied (H:7458-7462).
- Bounds: rows = min(query.limit, committed per-tenant result limit; shipped default 10,000,
  crucible/crates/cdb-admin/src/config_model.rs:412) (H:7412); query.offset is ignored; LOG_QUERY's 256 KiB
  page budget is NOT applied (H:7387-7478). UNVERIFIED whether a full export always fits the Console's
  16 MiB reply cap (frame.ts:101).
- Authorization: 2.4; no tier or role check. The read is clearance-bounded at Internal (2.2).
- Dual control: none.
- Audit: (A): manifest {command_id, filter_digest (SHA-512 over the eight filter fields, H:7367-7385),
  row_count, rows_digest (SHA-512 over the exported ids), exported_at = client-stamped issued_at, segment
  none} + the command marker + the audit entry, one batch (export_store.rs:207-254). The rows themselves
  are never stored.
- Idempotency: by command_id per tenant: a retry returns the ORIGINAL export_id with commit_version 0 but
  re-reads the rows live, so a retry's rows can differ from what the receipt's digest covers (H:7452-7477).
- Storage and versioning: keyspace DecisionExport 0x1B (content-addressed manifest + command marker)
  (export_store.rs:141-156).
- Apply semantics: n/a (a read with a receipt).
- Evidence: H:7344-7478; export_store.rs:1-254.

### 3H. SOC incident operations

### M24 SocIncidentAct (SOC_INCIDENT_ACT) -- assign / ack / note / close
- Console consumer: SOC investigation dock case controls (surfaces/SocCaseControls.tsx via
  useCaseCommand.ts:111) -> `POST /api/soc/act` (server.ts:1439-1583) -> resolveCaseAct
  (apps/bff/src/engine/soc.ts:472-490) -> operator-engine.ts:864-868.
- Configures: one case act on an incident.
- Request fields (query.rs:2053-2071): request_id; incident (episode id); act in {assigned, acked, noted,
  closed}; assignee (UUID string; required for assigned); note (required for noted); operator.
- Engine validation: delegation failure -> Refused Denied. Everything else refuses IN-BAND (SocActed
  {refused true, explanation}): unknown act, missing assignee, assignee not a UUID, missing note
  (H:3891-3920); blank note or note > 4,000 characters (crucible/crates/cdb-cyber/src/soc_act.rs:42, 274-294);
  unknown / foreign / above-clearance incident -> blank refusal (clearance before existence, H:3846-3854);
  assign / ack / close on a closed incident -> "the incident is already closed" (soc_act.rs:176-180); notes
  ARE accepted on closed incidents. The assignee is only shape-checked -- not validated against any user,
  directory, or RBAC group (rider C.1r pending: crucible/docs/implementation-plans/IP-AISOC-STEP1-LEDGER.md:597).
- Authorization: 2.4; no tier or role check.
- Dual control: none.
- Audit: (B) incident-trail row ONLY -- no TRD-04 hash-chain entry (2.7). Detail: assigned -> assignee UUID;
  noted -> content-free "note:<16 hex of SHA-512(body)>" (soc_act.rs:296-301); acked / closed -> empty.
  The effect and the row commit in one serializable transaction (soc_act.rs:181-221).
- Idempotency: none by request_id. The row key includes (at_seconds, act tag, detail): identical acts in
  the same second collapse to one row, in different seconds they are separate rows; a note retried in a
  later second is stored twice. Within one second the trail orders by tag, not submission
  (IP-AISOC-STEP1-LEDGER.md:526 finding).
- Storage and versioning: SocIncidentAudit 0x31 rows; note bodies in the SocIncidentNote keyspace keyed
  (tenant, incident, at_seconds, note_ref) (soc_act.rs:303-311); close rewrites the episode (state Closed,
  posture observe-only, reason CLOSED_BY_OPERATOR) (soc_act.rs:200-209). Records inherit the incident's
  classification.
- Apply semantics: immediate. Close takes the incident out of the open queue with NO training signal;
  a later firing of the same series opens a NEW episode (soc_act.rs:16-18; soc_disposition.rs:11-14).
  Close enqueues a SIEM write-back job (H:3864-3872; section 4.1).
- Evidence: H:3823-3920; soc_act.rs:1-311; soc_audit.rs:149-182.

### M25 SocDisposition (SOC_INCIDENT_DISPOSITION)
- Console consumer: SOC verdict panel / case controls (useCaseCommand.ts:123) -> `POST /api/soc/disposition`
  -> resolveDisposition (soc.ts:509-528) -> operator-engine.ts:874-878.
- Configures: the operator's closure verdict on an incident -- a training signal.
- Request fields (query.rs:1992-2027): request_id; incident; disposition tag; per-tag field:
  false_positive -> justification; benign_authorized -> authorized_by; true_positive_remediated ->
  action_taken in {reimage, credential_rotation, patch, isolate, remove}; true_positive_blocked ->
  blocking_control; true_positive_risk_accepted -> accepting_party + expiry_seconds (absolute unix
  seconds); duplicate -> predecessor (episode id); undetermined -> none. Fields of other tags are ignored.
- Engine validation: delegation failure -> Denied. In-band refusals: unknown tag or missing required field
  (H:3543-3578); blank required text (crucible/crates/cdb-cyber/src/detect_feedback.rs:291-329); risk
  acceptance expiry must be in the future and at most 365 days ahead (detect_feedback.rs:236-239, 305-321);
  duplicate: the predecessor must exist in the tenant and differ from the incident
  (crucible/crates/cdb-cyber/src/soc_disposition.rs:83-100); unknown / foreign / above-clearance incident ->
  blank refusal (H:3500-3506). No length bound on the free-text fields.
- Authorization: 2.4; no tier or role check.
- Dual control: none.
- Audit: (B) only -- a "dispositioned" row whose detail is the tag, never evidence -- no hash-chain entry
  (soc_disposition.rs:112-136).
- Idempotency: the disposition record is keyed (tenant, technique, episode), so a second disposition
  OVERWRITES the first -- that is the correction path (soc_disposition.rs:52-60; detect_feedback.rs:63-69,
  369-386); every application adds a trail row (same-second duplicates collapse).
- Storage and versioning: DetectFeedback 0x10 record {episode, rule, technique, disposition, principal,
  recorded_at, credibility stamp}; an OPEN episode is rewritten Closed / observe-only / DISPOSITIONED
  (soc_disposition.rs:101-123).
- Apply semantics: closes the incident at once (if open) and enqueues a SIEM write-back (H:3519-3526).
  false_positive is the ONLY verdict that feeds the down-weight, counted per (tenant, ATT&CK technique) by
  later detection passes (detect_feedback.rs:103-117; crucible/crates/cdb-cyber/src/derivation_inputs.rs:178);
  the true-positive verdicts are calibration's positive labels (soc_disposition.rs:1-15). Re-dispositioning
  a closed incident re-records the signal without reopening it.
- Evidence: H:3478-3578; soc_disposition.rs:1-141; detect_feedback.rs:63-117, 236-386.

### M26 SocPlanModify (SOC_PLAN_MODIFY)
- Console consumer: SOC verdict panel, edit the coordinated response (usePlanCommand.ts:94) ->
  `POST /api/soc/plan/modify` -> resolveModifyPlan (soc.ts:254-274) -> operator-engine.ts:859-863; the
  encoder sends title + action only (payload.ts:595-606).
- Configures: replaces the steps of an incident's UNAPPROVED response plan.
- Request fields (query.rs:3123-3151): request_id; incident; steps [{title, action}] where action is ""
  (investigative) or quarantine / deny / permit / monitor (case-insensitive); operator.
- Engine validation: delegation failure -> Denied. The plan must be readable: unknown incident, another
  tenant's, above clearance, or NO plan proposed all refuse Conflict, indistinguishably (H:3436-3462);
  unknown action -> Framing (H:3680-3699); plan rules (crucible/crates/cdb-cyber/src/soc_plan.rs:45-51,
  260-315): <= 16 steps, non-blank title, title <= 200 characters, permit / monitor -> NotAContainment ->
  Framing; already approved -> AlreadyApproved -> Conflict (soc_plan.rs:436-455). An empty step list is
  accepted (no minimum in validate_plan).
- Engine-derived fields: authority (approval_required when the step has an effect, else review_required),
  state proposed, reversibility + rollback ("Lift the quarantine" / "Lift the deny") from the action
  (soc_plan.rs:330-360; crucible/crates/cdb-cyber/src/soc_playbook.rs:367-389). A client cannot submit
  authority or state.
- Authorization: 2.4; no tier or role check.
- Dual control: none.
- Audit: (A)+(B): the plan and a "plan_modified" row ("N step(s), revision R") in one audited batch
  (soc_plan.rs:731-775).
- Idempotency: none; every modify bumps the revision (a replay bumps it again, which invalidates an
  approval issued against the prior revision).
- Storage and versioning: SocResponsePlan 0x30, one plan per (tenant, incident) with a revision counter
  (soc_plan.rs:248-253); Internal (H:3668).
- Apply semantics: nothing executes; the plan waits for M27.
- Related (engine-only, not a Console verb): plans are PROPOSED only by the detection pass, under the nil
  principal, audited as "plan_proposed" / "plan_withheld"; a proposal never overwrites an existing plan and
  is gated by the SOC tier thresholds (settings plane) (soc_plan.rs:606-706;
  crucible/crates/cdb-cyber/src/detect_episode.rs:886).
- Evidence: H:3386-3462, 3627-3699; soc_plan.rs:45-51, 248-455, 606-775.

### M27 SocPlanApprove (SOC_PLAN_APPROVE)
- Console consumer: SOC verdict panel "Approve Full Response" (usePlanCommand.ts:78) ->
  `POST /api/soc/plan/approve` -> resolveApprovePlan (soc.ts:228-246) -> operator-engine.ts:854-858.
- Configures: records the operator's authorization of the incident's response plan.
- Request fields (query.rs:3105-3120): request_id; incident; at_revision u32 (must echo the plan_revision
  the operator was shown in SOC_INCIDENT_DETAIL); operator.
- Engine validation: delegation failure -> Denied; plan lookup as M26 (Conflict); already approved ->
  Conflict; at_revision differs from the stored revision -> StaleRevision -> Conflict (soc_plan.rs:376-434).
  The incident is not required to be open.
- Authorization: 2.4; no tier or role check.
- Dual control: none -- a single approver, who may be the same operator who modified the plan.
- Audit: (A)+(B) "plan_approved".
- Idempotency: replay -> AlreadyApproved -> Conflict.
- Storage and versioning: approved_by = operator principal, approved_at = server clock, revision + 1;
  every Proposed step that carries a containment action becomes REFUSED with "enforcement is off on this
  deployment; no containment was carried out"; investigative steps become Approved (soc_plan.rs:392-423).
  Enforcement is hard-coded Off in the handler (H:3601).
- Apply semantics: nothing executes; the reply carries enforcement_active false (H:3400-3412). Approval
  does not enqueue a SIEM write-back (only disposition, close, and detect-pass triggers do: H:3521, 3867;
  bootstrap.rs:3872).
- Evidence: H:3580-3625; soc_plan.rs:376-434, 731-775.

### M28 SocCognitionRun (SOC_COGNITION_RUN) -- "Generate"
- Console consumer: SOC verdict panel / investigation dock "Generate" (useCognitionRun.ts:45) ->
  `POST /api/soc/generate` -> resolveCognitionRun (soc.ts:451-470) -> operator-engine.ts:849-853.
- Configures: nothing; spends model time to produce and record the incident's verdict narrative and
  impact sentence.
- Request fields (query.rs:3073-3087): request_id; incident; operator.
- Engine validation: delegation failure -> Denied. In-band SocRunState: `refused` + detail when the brief
  cannot be built (unknown / above-clearance incident), no primary shard, no committed config, the
  committed soc_narrative model binding does not resolve against served_models or the incident's
  classification exceeds the model's ceiling, unknown incident (H:5584-5639, 5672-5711); `recorded` when
  both records already exist for exactly these inputs; `running` when a run for (tenant, incident) is in
  flight on this node (crucible/crates/cdb-server/src/soc_runner.rs:74-96); `started` otherwise.
- Depends on configuration owned elsewhere: the model binding + served models (committed config document,
  settings plane) and the node config `cognition` frontier host / port / timeout / max tokens (H:5646-5660).
- Authorization: 2.4; no tier or role check.
- Dual control: none.
- Audit: (A): the narrative and impact-sentence records commit in ONE batch with a hash-chain entry
  attributed to the REQUESTING operator (soc_runner.rs:129-201). No incident-trail row records the run.
- Idempotency: content-addressed reuse keys (brief hash + model ref + policy version 0; impact hash + model
  ref) make a repeat a `recorded` no-op; the in-flight guard is process-local (lost on restart).
- Storage and versioning: SocNarrative 0x2F and SocImpactSentence 0x32 records at the brief's
  classification.
- Apply semantics: asynchronous, on a detached thread; results readable through SOC_NARRATIVE /
  SOC_INCIDENT_IMPACT once committed; a failure is visible only as the observe event
  `soc.cognition_run` (soc_runner.rs:99-124); a partial run commits nothing.
- Evidence: H:5575-5711; soc_runner.rs:1-202.

### 3I. Encodable by the Console but never sent

### M29 TxnBegin
- Console consumer: NONE -- payload.ts:971 and dispatch.ts:20 encode it; no BFF client method exists and
  wire-client.ts has no reply mapping for TxnBegun.
- Engine: opens a leased, owner-scoped CrucibleQL transaction workspace for the SESSION principal/tenant
  (no delegation field; for the console peer that is the reserved service tenant) (H:8946-8970).

### M30 SubmitMemoryWrite
- Console consumer: NONE -- payload.ts:973-975 encodes it; no BFF client method.
- Engine: executes a CrucibleQL memory write (REMEMBER) as the session principal (the operator field is
  not consulted), idempotent by request_id through the per-connection IdempotencyLog; a divergent payload
  under the same id refuses IdempotencyConflict (H:9686-9788).

## 4. Engine side effects the Console triggers indirectly

### 4.1 SIEM enrichment write-back (crucible/crates/cdb-server/src/siem_writeback.rs)
- Triggers: SOC_DISPOSITION (H:3521), SOC_INCIDENT_ACT `closed` (H:3867), and the detect pass
  (opened / promoted / transitioned; bootstrap.rs:3872). Plan approval, notes, assign and ack do not trigger.
- Queue: process-global, in memory, bounded at 1024 jobs; past the bound the NEWEST job is dropped and
  counted with a `queue_full` observe event; lost on restart (siem_writeback.rs:41-139).
- Worker: spawned only when node config `connectors.siem` is configured and its secret file is readable
  (bootstrap.rs:857-866); otherwise jobs queue up to the bound and then drop. Per job it re-reads the
  COMMITTED `siem_writeback` section (enabled, vendor, host, stream, case_url_base, ceiling -- set through
  SOC_SETTINGS_COMMIT, excluded here), reads the incident at the committed ceiling (above it = skipped),
  shapes and encodes the row, and POSTs it with the boot-time credential; port / plaintext / timeout come
  from the boot stanza; plaintext is refused to any non-loopback host (siem_writeback.rs:1-24, 176-253,
  299-376, 410-450).
- Audit: a `siem_enriched` incident-trail row under the nil principal with detail
  "vendor=<tag> trigger=<tag> status=ok|timeout|failed|plaintext_refused" -- (B) only, in its own
  transaction (siem_writeback.rs:378-408). A skip (disabled, unknown incident, above ceiling,
  unencodable) writes NO trail row -- only an observe event (siem_writeback.rs:425-431).

### 4.2 Response-plan proposal
- Only the detect pass proposes plans (nil principal); see M26 "Related". The Console can only modify and
  approve.

## 5. Read requests (one line each: returns; bounds)

All reads below except R02, R03 and R18 go through delegation (2.4) and read at Internal clearance (2.2).
"Exposure-gated" = refused Denied when the committed query_exposure.db_query_enabled is false or the
config is unreadable (H:2188-2194); "per-tenant limit" = committed query_exposure.per_tenant_result_limit,
shipped default 10,000 (crucible/crates/cdb-admin/src/config_model.rs:404-412).

- R01 QuerySubmit -- CrucibleQL read as the operator; the BFF sends only `FIND agent_capabilities WHERE
  agent_id = $a RETURN relation, target` and `FIND construction_report WHERE agent_id = $a RETURN surface,
  entry` (entity-detail.ts:306-328). Exposure-gated; a result above the per-tenant limit -> LimitExceeded;
  paged by cursor (shipped 256 rows per chunk, 128 cursors per tenant, 256 MiB retained tail, committed
  values override) (H:2226-2249, 8813-8934; cursor.rs:31-49).
- R02 CursorFetch -- next page of a session-bound cursor; foreign or expired handle -> non-oracle refusal
  (H:9910-9930). No BFF caller.
- R03 CursorClose -- releases a cursor's retained tail (H:9932-9955). No BFF caller.
- R04 ListAgents -- AIG agent directory {agent_id, status, enrolled_at, attributes}; exposure-gated; over
  the per-tenant limit REFUSES LimitExceeded (no truncation) (H:2382-2427).
- R05 ListPrincipals -- LUG principal directory (observed, local and IdAM accounts; status, origin, email,
  org, groups, binding, owned fields); same gates/limit (H:2430-2500).
- R06 ListGroups -- LUG groups {id, name, namespace, built_in, member_count, description}; same (H:2502-2535).
- R07 ObjectList -- named-object catalog; same (H:2982-3002).
- R08 ObjectDetail -- one object + its read-time resolved members; unknown name -> empty detail, not an
  error (H:3007-3058).
- R09 IdamConnectors -- at most one card (Auth0): provider tenant (domain), enabled, running, live cadences,
  last sync ms (absent if never), objects synced since boot, last completeness / error; never a secret or
  secret ref; not exposure-gated; node-global (H:2594-2622; query.rs:498-527).
- R10 EntityDecisions -- an entity's recent decisions by opaque (entity_type, entity_value); newest-first,
  cap = min(limit, per-tenant limit) with truncation; unknown type -> empty (H:7110-7180). The BFF asks 50
  (entity-detail.ts:298-302).
- R11 EntityConnections -- a subject's outbound LEG connections; cap = min(limit, per-tenant limit)
  (H:7621-7683).
- R12 ConnectivityGraph -- tenant-wide Sankey roll-up from the live overlay (hour window since / until,
  decision cap = min(limit, per-tenant limit), truncation flagged); entity-to-zone routing uses a HARD-CODED
  demo assignment (Demo.Users.Public / Demo.Private.Agent / Demo.Public.Agent) plus the authored zones as
  nodes; the users lane counts LUG session-present humans (H:7739-7822; connectivity.rs:659-685).
- R13 ConnectivityMembers -- distinct members of one class, top-N cap = min(limit, per-tenant limit)
  (H:7684-7738).
- R14 LogQuery -- decision / episode LOG, newest-first; filters since / until (unix s, inclusive),
  technique, tactic, rule_id, confidence (HIGH/MEDIUM/LOW/CONTESTED), action
  (observe-only/candidate/escalate), search (case-insensitive substring over finding / rule / evidence);
  limit clamped to the per-tenant limit; offset paging; in episode mode a 256 KiB page byte budget (a
  shorter page, never a refusal); an unknown tag -> empty (H:7228-7365; query.rs:796-838).
- R15 LogExplain -- one decision or episode by id; unknown -> Denied (non-oracle). The point read has no
  clearance filter (H:7552-7600).
- R16 VtzTree -- every zone with own + effective postures (floor flagged), archetype, lifecycle, settings,
  sub-zone count; `limit` truncates with `truncated`; more zones than the per-tenant limit -> LimitExceeded
  (H:6509-6560).
- R17 VtzDetail -- one zone + contributing ancestors + `commit_version` (the node-wide latest commit
  version; the Distribute producer uses it as the bundle version); malformed / unknown id -> zone absent
  (H:6562-6640).
- R18 BundleConvergence -- per-endpoint state {applied | rejected + ApplyError | silent} for a zone's stored
  bundle. NOT DELEGATED: the request has no operator field and the handler reads `session.tenant`, i.e. the
  console's reserved service tenant, so for any operator zone it answers has_bundle false
  (H:6938-6984; query.rs:3890-3896; operator-engine.ts:1018-1022; payload.ts:469-476). Recorded as a crdb
  gap only in FC docs (forgecentral/docs/implementation-plans/IP-CONSOLE-05-policies-LEDGER.md:41-48),
  not in crucible/docs/DEFERRED_LEDGER.md (grep "convergence": no hit).
- R19 PolicyListByZone -- every policy's NEWEST version grouped by zone (drafts included); more than the
  per-tenant limit -> LimitExceeded (H:3149-3187; policy_store.rs:240-264).
- R20 PolicyDetail -- newest version + version history {version, lifecycle}; unknown or unparseable id ->
  empty; zone id used raw (H:3189-3240).
- R21 PolicyEffective -- the zone's newest PUBLISHED version per policy, admitted only if its active window
  contains the server clock; drafts / expired / future excluded; unknown zone -> empty (H:5924-5952;
  policy_store.rs:302-324). The Distribute producer's input.
- R22 DetectSummary -- KPI totals + per-technique ATT&CK rows + observed components + coverage. NOT
  tenant-scoped: it aggregates every detect-pass tenant on the node (the delegated session is unused)
  (H:5873-5922; bootstrap.rs:6152-6177).
- R23 SocIncidentList -- open incidents in the engine's ranked order; cap = min(limit, 200); more than the cap
  REFUSES in-band (never truncates) (H:3268-3306; soc_incident.rs:40, 300-335).
- R24 SocIncidentDetail -- one incident: lineage nodes / edges, evidence, plan steps + plan_revision +
  approved, narrative ref; unknown / foreign / above clearance -> refused, indistinguishable (H:3308-3384).
- R25 SocNarrative -- the RECORDED verdict narrative for the incident's current brief under the committed
  model binding (never generates); three states: none / refused / published (H:5758-5822).
- R26 SocTelemetry -- the incident's cited evidence resolved to raw observations (resolved / aged_out /
  restricted kept distinct); more than 200 observations REFUSES in-band, never truncates (H:3701-3766;
  soc_telemetry.rs:32-38, 187-210).
- R27 SocAudit -- the incident trail (acts, principal, time, detail), oldest first; more than 100 rows
  REFUSES (H:3768-3821; soc_audit.rs:33).
- R28 SocNotes -- case notes oldest first; more than 100 REFUSES (H:3922-3972; soc_act.rs:49).
- R29 SocImpact -- assessed impact band + factors + the recorded sentence (never generates) (H:5480-5528).
- R30 SocReport -- the shaped report; model sections degrade to a declared template when no narrative is
  recorded (H:3974-4046).
- R31 SocUeba -- the incident subject's UEBA report (H:5315-5397). Encodable, but NO BFF client method.
- R32 SocWeekly -- per-ISO-week volume rows + coverage; weeks clamped 1..=12, until <= now, episode scan
  cap 5,000 with `episodes_truncated`; coverage is node-wide (H:4049-4117; soc_weekly.rs:27).

## 6. Excluded (settings plane) -- names only
SettingsRead, SettingsReports, SettingsCommit, SettingsPropose, SettingsApprovals, SettingsApprove,
SettingsHistory, SettingsRollback, SocSettingsRead, SocSettingsCommit (see X01-X10). Note for the other
slice: these are the ONLY verbs that honor OperatorDelegation.settings_tier (H:4205-4225; query.rs:61-68).

## 7. Findings an operator manual must state (and surprises)

- F1 Clearance and tier. Every non-settings Console action runs at the console peer's User tier ->
  Internal clearance, whatever the operator's Console role; the installer's configured peer clearance
  (`secret`) is silently dropped (transport.rs:130-132, 395-402; 50-config.sh:225). Records above
  Internal are invisible and SOC incidents above Internal refuse as "unknown". Acknowledged:
  DEFERRED_LEDGER.md:1206-1217.
- F2 No engine authorization beyond delegation. No non-settings command checks tier, role, or permission;
  any logged-in operator can author zones, policies, objects, identities, containment, distribute
  bundles, and reconfigure the node-wide IdAM connector (2.5). The engine trusts the BFF's
  operator->tenant mapping (D3); a global-admin can act in any tenant it names (existence is not
  checked); only the reserved service tenant is refused.
- F3 Distribution cannot be observed. BUNDLE_CONVERGENCE is not delegated and reads the reserved service
  tenant, so the Console always shows "no bundle" for a zone it just distributed (R18). Fix is recorded
  only in FC docs.
- F4 POLICY_CREATE mints the policy id from request_id, and the BFF's request_id counter restarts at 2 on
  every BFF restart: creates can be refused Conflict after a restart, and policy ids are small predictable
  integers (H:6287; policies.ts:41-45).
- F5 IdAM commands are unaudited, ungated, node-global and volatile: IDAM_CONNECT / CONFIGURE / SYNC write
  nothing durable (reply commit_version 0), check no tier, change the one node-wide connector from any
  tenant, and revert at node restart; synced users land in the node-config tenant, not the operator's
  (M19-M21). The plan and BFF comments claim "audited" / "tier-gated".
- F6 SOC case acts and dispositions are not on the TRD-04 hash chain -- only on the incident trail -- while
  plan modify / approve are on both; a "Generate" run is on the chain but not on the incident trail (2.7).
- F7 CONTAIN: every failure is Denied (bad action indistinguishable from unauthorized); a command_id replay
  with a different payload silently returns the original; there is no un-contain verb; containment is not
  linked to any incident; enforcement is OFF everywhere (reply enforcement_active false; plan containment
  steps land Refused).
- F8 Retries can double-apply: the BFF retries every call once after a transport failure, and the engine
  has no request_id dedupe for Console verbs (wire-client.ts:585-608; 2.8). Non-idempotent under retry:
  notes, acts, plan modify (revision bump), IdAM connect (re-spawn), repeated audit entries for edits.
- F9 The read-only catastrophic floor (governed-egress, execution never permit-deny-risky) is enforced for
  ZONES only; POLICY default_postures may carry permit-deny-risky on those domains (forge_v2.rs:1876 is the
  sole check). A zone floor violation refuses Framing, not Denied.
- F10 No cascades: deleting or renaming a zone leaves its policies and stored bundle under the old id;
  deleting a policy does not withdraw an already-distributed bundle; editing or deleting a catalog object
  never changes a policy (rules hold copies); zone and object draft/published lifecycles gate nothing in crdb.
- F11 Tenant scope leaks on two reads: DETECT_SUMMARY aggregates all tenants on the node; the Overview
  graph's zone membership is a hard-coded demo assignment, not operator configuration.
- F12 Zone ids: create/edit fold case; POLICY_PUBLISH / DELETE / DETAIL / EFFECTIVE use the zone id raw, so
  they must be sent the lowercase interned id.
- F13 Dead or orphaned surface: GROUP_EDIT and GROUP_SET_MEMBERS have BFF routes but no SPA caller;
  SocUeba, TxnBegin, SubmitMemoryWrite are encodable with no consumer; CursorFetch / CursorClose have no
  caller.

## 8. Open questions / UNVERIFIED
- Q1 A Console-onboarded Auth0 connector on a node installed without CDB_AUTH0_DOMAIN syncs into the nil
  tenant (cdb-mkconfig.rs:918-921; config.rs:1760-1762). Does the reduce path accept or refuse that?
- Q2 Bundles are committed in the operator's tenant but fetched in the endpoint peer's tenant (H:6829-6860):
  do they coincide in production?
- Q3 Does Torch consume `agent_containment` dispositions, a local principal's status, a zone's
  micro_segmentation / telemetry / reauth, or a policy's applied_to / schedule / geo? (No crdb consumer.)
- Q4 Can a LOG_EXPORT reply exceed the Console's 16 MiB frame cap (no byte budget applied)?
- Q5 The committed `idam_connector` config section is not read by cdb-server; is IDAM_CONFIGURE meant to
  commit there (settings slice)?
- Q6 Is the policy-level catastrophic-floor gap intended (floor applied at composition by the Console or
  Torch instead)?
- Q7 Is the BUNDLE_CONVERGENCE delegation fix scheduled in crdb (no crdb ledger entry found)?
- Q8 SPA-side role gating of these controls (Console slice).
