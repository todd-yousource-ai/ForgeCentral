# Census: the Crucible settings plane (engine side of Console Settings) + boot/installer configuration

Repo: `crucible` at HEAD `d0ace55a` (2026-09-25). All paths below are relative to the `crucible/` repo
root unless prefixed `forgecentral/`. Every claim cites `path:line`. "UNVERIFIED:" marks anything the
code did not establish. Read-only census: nothing was built, run, or edited.

## Index

- 0. Headline counts and how the pieces fit
- 1. `config_registry.rs`: the REGISTRY (all 56 entries, full table) + registry-vs-code discrepancies
- 2. `config_model.rs`: Knob (31), KnobKind, Tier per knob, Profile, `default_for` per profile, parse/render; settings with no tier
- 3. `config_document.rs`: ConfigDocument (44 fields), the 20 ConfigSections (fields, types, defaults, validation), all 40 ConfigViolation variants, `from_profile`, fail-closed default, diff semantics
- 4. The wire Settings verbs (10) and their handlers: admission, tiers, editable rule, patches + per-field validation, refusal causes, live-apply + needs_restart, dual control, history/rollback, SOC settings, reports
- 5. Boot configuration: NodeConfig stanzas, runtime env of the `cdb` process, every `cdb-mkconfig` env var, `cdb-config-edit`, seed-at-first-boot, the node installer knobs; Console EDIT / DISPLAY / NONE per knob
- 6. The Configuration Guide HTML + `config_guide_drift.rs`: coverage, how checked, drift found, suitability as a manual source
- 7. Findings (ranked) and open questions

---

## 0. Headline counts and how the pieces fit

| Item | Count | Evidence |
|---|---|---|
| REGISTRY entries (the whole governed "config surface") | **56** (gate-asserted) | `crates/cdb-admin/tests/config_surface_drift.rs:30` (`REGISTRY_SIZE = 56`), `crates/cdb-admin/src/config_registry.rs:318-1024` |
| ... by origin | 31 Knob, 20 Section, 5 Env, 0 Const | parsed from `config_registry.rs:318-1024`; bijection tests `config_surface_drift.rs:103-143` |
| ... by live_apply | 29 Live, 15 PendingSubsystem, 7 BootBound, 5 EnvBootstrap, 0 CompileConst | same; `config_surface_drift.rs:314-328` forbids CompileConst |
| ... registry surfaces used | 24 of the 25 `Surface` variants (`enrollment` unused) | `config_registry.rs:30-120` |
| Governed knobs `Knob::ALL` | 31 | `crates/cdb-admin/src/config_model.rs:164` |
| Knob tiers | 13 Essential, 3 Standard, 15 Advanced | `config_model.rs:200-235` |
| Profiles | 4 (Evaluation default, Enterprise, AirGapped, Federal) | `config_model.rs:17-41` |
| ConfigDocument fields | 44 (incl. `profile`, which has no registry row) | `crates/cdb-admin/src/config_document.rs:361-511` |
| Committed sections `ConfigSection::ALL` | 20 | `config_document.rs:2209` |
| ConfigViolation variants | 40 (38 from `validate`, 2 embedder-posture only) | `config_document.rs:1860-2090` |
| Wire Settings verbs | 10 (`SETTINGS_READ/_REPORTS/_COMMIT/_PROPOSE/_APPROVALS/_APPROVE/_HISTORY/_ROLLBACK`, `SOC_SETTINGS_READ/_COMMIT`) | `crates/cdb-wire/src/query.rs:3725-3756`, dispatch `crates/cdb-server/src/handler.rs:1170-1179` |
| Registry rows the Console can edit | **27 of 56**: 25 through `SETTINGS_COMMIT` (19 scalar knobs + `governance.dual_control` via a typed patch + 5 patchable sections) and 2 through `SOC_SETTINGS_COMMIT` (`soc.tiers`, `siem_writeback`) | `handler.rs:4182-4186`, `handler.rs:4448-4454`, `handler.rs:5271-5293` |
| `CDB_*` env names authored by `cdb-mkconfig` | 145 literal names + 4 via `config_env.rs` = 149 | `crates/cdb-server/src/bin/cdb-mkconfig.rs`, `crates/cdb-server/src/config_env.rs:126-143` |
| `CDB_*` env read by the running `cdb` process | 4: `CDB_OBSERVE`, `CDB_EMBED_TEI`, `CDB_EMBED_PIPELINE` (fallbacks), `CDB_MAX_WORKERS` (refused if set) | `crates/cdb-server/src/main.rs:34,55`, `crates/cdb-server/src/bootstrap.rs:463,474`, `crates/cdb-server/src/env_policy.rs:22-25` |
| Node installer knobs | 86: 72 in `installer/lib/common.sh` (73 `: "${VAR:=...}"` default lines = 70 distinct names, plus `CDB_CREDIBILITY_WEIGHTS_FILE`, `CDB_REQUIRE_GPU`) and 14 more in phases 50-config, 65-seed, 70-validate | section 5.6 |

**How the pieces fit.**
- The committed `ConfigDocument` is the state of record. It lives at one reserved key in the versioned
  Data keyspace under the nil system tenant (`crates/cdb-server/src/config_store.rs:22-36`), is written
  only through `ConfigStore::commit_config` with a `ValidatedConfig` token
  (`config_store.rs:124-165`), and old versions are subject to the store's time-travel retention like
  any data (`config_store.rs:10-12`).
- On first boot the node seeds the document from the boot `NodeConfig` admin stanza
  (`crates/cdb-server/src/config_bringup.rs:32-75`, `:124-148`), but only if the admin endpoint or the
  cognition plane is enabled (`bootstrap.rs:917-927`, `:4226-4251`).
- The REGISTRY is a static catalog describing every configurable aspect (key, surface, type, default
  text, bound text, live-apply status, verb, Console binding, origin, summary)
  (`config_registry.rs:258-289`). The wire `SETTINGS_READ` projects every registry row with the
  engine's own rendering of the committed value (`handler.rs:4164-4205`).
- The Console never touches the admin plane (`:7440`, `cdb-actl`); it uses the 10 wire verbs on the
  data plane of the wire seam / control plane, as a delegating peer
  (`docs/implementation-plans/IP-CONSOLE-SETTINGS-WIRE.md:9-16`, `handler.rs:1391-1460` `plane_of`
  puts every Settings request on `WirePlane::Data`). The BFF calls all 10 verbs
  (`forgecentral/apps/bff/src/engine/wire-client.ts`, grep of `Settings*`).

---

## 1. `config_registry.rs`: the REGISTRY

### 1.1 Entry shape and enumerations

`ConfigSetting` fields (`config_registry.rs:258-289`): `key` (stable dotted path, unique), `surface`
(`Surface`), `value_type` (`SettingType`), `default` (human text; "the code holds the authoritative
value"), `bound` (text naming the ConfigViolation, or "none"), `live_apply` (`LiveApply`), `verb`
(`SettingVerb`), `ui_binding` (`console:settings/...`), `origin` (`SettingOrigin`), `summary`.

- `Surface` (25 variants, labels = CLI section + Console route slug): admin_endpoint, governance,
  sessions, maintenance, retention, leases, workspace_quota, query_surface, graph_budgets, identity,
  egress, api, aig, lug, key_issuing, normalization, build_search, served_models, detection_posture,
  soc_narrative, workers, embedder, observability, cognition, enrollment (`config_registry.rs:30-120`).
  `enrollment` has no registry entry (the only candidate, `enrollment.max_cert_validity_secs`, was
  deliberately not made a knob: `config_registry.rs:1009-1012`).
- `SettingType` (14): Bool, Count, Bytes, DurationSecs, Classification, CapabilitySet, StringMap,
  StringSet, RecordList, Struct, HostPort, WorkerCount, TriState, Text (`config_registry.rs:122-156`).
  Knob kinds project: Classification->Classification, Bytes->Bytes, DualControlSet->CapabilitySet,
  Ticks->DurationSecs, Bool->Bool, Count->Count (`config_registry.rs:158-173`), enforced by
  `config_surface_drift.rs:145-163`. HostPort and WorkerCount are unused by any entry.
- `LiveApply` (`config_registry.rs:175-216`): `Live { via }` (no restart; `via` names the mechanism),
  `BootBound` (committed and honored, binds at process start), `PendingSubsystem { deferral }`
  (committed intent, enforcement awaits an unbuilt subsystem), `EnvBootstrap` (read from env at
  start), `CompileConst` (none remain: `config_surface_drift.rs:314-328`).
- `SettingVerb` (`config_registry.rs:218-236`): `Verb("<admin verb>")` (must be in
  `ADMIN_VERBS`, `crates/cdb-admin/src/contract.rs:450-511`), `ConfigDocument` (whole-document
  `config-commit` / `config-apply`), `PendingMigration { in_step }`.
- `SettingOrigin` (`config_registry.rs:238-256`): `Knob(Knob)`, `Section(ConfigSection)`,
  `Env { var, source }`, `Const { ident, source }`.
- Wire/CLI rendering `ConfigSettingDto` (all strings) (`config_registry.rs:1058-1130`): live_apply
  renders as `live (<via>)`, `boot-bound (a change needs a restart)`, `pending (<deferral>)`,
  `env (deprecated fallback)`, `compile-time constant`; verb renders as the verb name,
  `config-commit / config-apply`, or `pending (<step>)`; origin as `knob:<Knob>`, `section:<Section>`,
  `env:<VAR>`, `const:<ident>`; value_type as the Debug name (`config_registry.rs:1100-1126`). There is
  **no tier field** on the DTO.

### 1.2 The 56 entries (exact, parsed from source; `L` = line of `key:`)

"Console edit" column = what the wire allows today (section 4.4 derives it): `yes` = `SETTINGS_COMMIT`
scalar edit; section rows marked `yes` = typed `SETTINGS_COMMIT.sections` patch.

| # | key (line) | surface | type | default (registry text) | bound (registry text) | live_apply | verb | ui_binding | origin | summary | Console edit |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `admin_endpoint.classification` (L321) | admin_endpoint | Classification | Unclassified | none | BootBound | config-commit / config-apply | console:settings/admin_endpoint/classification | Knob EndpointClassification | The admin endpoint's operating classification (INV-ADM-CLASSIFICATION-AUTHORITATIVE). | no |
| 2 | `admin_endpoint.max_payload_bytes` (L333) | admin_endpoint | Bytes | 65536 | >= 1024 else MaxPayloadTooSmall | BootBound | config-commit / config-apply | console:settings/admin_endpoint/max_payload_bytes | Knob MaxPayload | The maximum admin frame payload, in bytes (frame sizing, binds at boot). | no |
| 3 | `governance.dual_control` (L345) | governance | CapabilitySet | per-profile (Evaluation empty; Enterprise KeyIssue+SecurityPolicyChange; AirGapped/Federal +AuditExport) | none | Live (via: commit-path dual-control gate consults the committed set) | config-commit / config-apply | console:settings/governance/dual_control | Knob DualControl | The capabilities whose operations require two-person dual control. | yes (section patch `dual_control`, not a scalar edit) |
| 4 | `sessions.standard_lifetime_secs` (L357) | sessions | DurationSecs | 28800 (Evaluation); tighter per profile | != 0 else ZeroSessionLifetime | Live (via: session manager honors the committed lifetime) | config-commit / config-apply | console:settings/sessions/standard_lifetime_secs | Knob SessionStandardLifetime | The standard admin session lifetime, in seconds. | yes |
| 5 | `sessions.break_glass_lifetime_secs` (L369) | sessions | DurationSecs | 3600 (Evaluation); tighter per profile | != 0 else ZeroSessionLifetime; <= standard else BreakGlassExceedsStandard | Live (via: session manager honors the committed lifetime) | config-commit / config-apply | console:settings/sessions/break_glass_lifetime_secs | Knob SessionBreakGlassLifetime | The break-glass admin session lifetime, in seconds. | yes |
| 6 | `maintenance.cadence_secs` (L381) | maintenance | DurationSecs | 60 | != 0 else ZeroMaintenanceCadence | Live (via: apply_committed_cadence -> MaintenanceTrigger::set_cadence_secs) | config-commit / config-apply | console:settings/maintenance/cadence_secs | Knob MaintenanceCadence | The Day-2 background maintenance cadence, in seconds. | yes |
| 7 | `retention.time_travel_window_secs` (L393) | retention | DurationSecs | 604800 (7 days) | != 0 else ZeroRetentionWindow | Live (via: apply_committed_retention -> shard.set_retention (INV-ADM-RETENTION-HONORED)) | config-commit / config-apply | console:settings/retention/time_travel_window_secs | Knob RetentionWindow | How far back version history is kept before GC may reclaim it, in seconds. | yes |
| 8 | `retention.log_observation_window_secs` (L405) | retention | DurationSecs | 2592000 (30 days) | != 0 else ZeroLogRetentionWindow | Live (via: the LOG retention sweep reads the committed window each cycle) | config-commit / config-apply | console:settings/retention/log_observation_window_secs | Knob LogRetentionWindow | How long a reified LOG observation is kept before the LOG sweep reclaims it, in seconds. | yes |
| 9 | `retention.raw_days` (L417) | retention | Count | 5 (days; plan D12 operator ruling 2026-09-14) | != 0 else the ingest stanza is refused (unbounded raw retention) | EnvBootstrap | pending (AC.4b) | console:settings/retention/raw_days | Env CDB_INGEST_RAW_RETENTION_DAYS (crates/cdb-server/src/bin/cdb-mkconfig.rs) | How many days an ingested record's original raw bytes are kept before the raw age sweep reclaims them (IP-AISOC-STEP1 E.1b). | no |
| 10 | `leases.cursor_secs` (L429) | leases | DurationSecs | 60 | != 0 else ZeroCursorLease | Live (via: read live at the wire per op: committed_lease_ms (no cache)) | config-commit / config-apply | console:settings/leases/cursor_secs | Knob CursorLease | How long an open paged-read cursor is leased before it expires (INV-KC-LEASES-GOVERNED). | yes |
| 11 | `leases.session_secs` (L443) | leases | DurationSecs | 60 | != 0 else ZeroSessionLease | Live (via: read live at the wire per op: committed_lease_ms (no cache)) | config-commit / config-apply | console:settings/leases/session_secs | Knob SessionLease | How long an open TXN/WORKSPACE session is leased before its MVCC pins release. | yes |
| 12 | `leases.prepared_secs` (L457) | leases | DurationSecs | 300 | != 0 else ZeroPreparedLease | Live (via: read live at the wire per op: committed_lease_ms (no cache)) | config-commit / config-apply | console:settings/leases/prepared_secs | Knob PreparedLease | How long a prepared statement is retained for re-execution before it expires. | yes |
| 13 | `workspace_quota.per_principal` (L471) | workspace_quota | Count | 64 | != 0 else ZeroWorkspaceQuota; <= per_tenant else WorkspaceQuotaPrincipalExceedsTenant | Live (via: WorkspaceQuotaHandler pushes the committed quota to the live WorkspaceManager (AC.3)) | config-commit / config-apply | console:settings/workspace_quota/per_principal | Knob WorkspaceQuotaPerPrincipal | The maximum workspaces one principal may hold open at once. | yes |
| 14 | `workspace_quota.per_tenant` (L485) | workspace_quota | Count | 256 | != 0 else ZeroWorkspaceQuota | Live (via: WorkspaceQuotaHandler pushes the committed quota to the live WorkspaceManager (AC.3)) | config-commit / config-apply | console:settings/workspace_quota/per_tenant | Knob WorkspaceQuotaPerTenant | The maximum workspaces one tenant may hold open at once. | yes |
| 15 | `query_surface.enabled` (L499) | query_surface | Bool | true | if enabled, query & result limits must be > 0 else QuerySurfaceUnbounded | Live (via: the query exposure gate reads the committed toggle) | config-commit / config-apply | console:settings/query_surface/enabled | Knob QueryEnabled | Whether the CrucibleQL database-query surface is exposed. | yes |
| 16 | `query_surface.vector_search_enabled` (L511) | query_surface | Bool | false | none | PendingSubsystem (vector-search wire execution unbuilt (DEFERRED_LEDGER)) | config-commit / config-apply | console:settings/query_surface/vector_search_enabled | Knob VectorSearchEnabled | Whether vector search is exposed (govern-now, bind-when-wired). | no |
| 17 | `query_surface.bm25_search_enabled` (L523) | query_surface | Bool | false | none | PendingSubsystem (BM25-search wire execution unbuilt (DEFERRED_LEDGER)) | config-commit / config-apply | console:settings/query_surface/bm25_search_enabled | Knob Bm25SearchEnabled | Whether BM25 full-text search is exposed (govern-now, bind-when-wired). | no |
| 18 | `query_surface.graph_traversal_enabled` (L535) | query_surface | Bool | false | if enabled, all graph budgets must be > 0 else GraphTraversalUnbounded | PendingSubsystem (graph-traversal wire execution unbuilt (DEFERRED_LEDGER)) | config-commit / config-apply | console:settings/query_surface/graph_traversal_enabled | Knob GraphTraversalEnabled | Whether graph traversal is exposed (govern-now, bind-when-wired). | no |
| 19 | `query_surface.per_tenant_query_limit` (L547) | query_surface | Count | 100000 | if query enabled, > 0 else QuerySurfaceUnbounded | PendingSubsystem (per-tenant query-accounting subsystem unbuilt (DEFERRED_LEDGER)) | config-commit / config-apply | console:settings/query_surface/per_tenant_query_limit | Knob PerTenantQueryLimit | The maximum queries a tenant may run (committed intent, not a live limiter yet). | no |
| 20 | `query_surface.per_tenant_result_limit` (L559) | query_surface | Count | 10000 | if query enabled, > 0 else QuerySurfaceUnbounded | Live (via: enforced live at the wire: handler run_cql_read_bounded (KC.1)) | config-commit / config-apply | console:settings/query_surface/per_tenant_result_limit | Knob PerTenantResultLimit | The maximum rows a single query may materialize (INV-CQ-CURSORS-BOUNDED). | yes |
| 21 | `graph_budgets.expand` (L571) | graph_budgets | Count | 0 (closed until graph traversal is wired) | if graph enabled, > 0 else GraphTraversalUnbounded | PendingSubsystem (graph-traversal wire execution unbuilt (DEFERRED_LEDGER)) | config-commit / config-apply | console:settings/graph_budgets/expand | Knob GraphExpandBudget | The maximum hops a graph traversal may expand. | no |
| 22 | `graph_budgets.fanout` (L583) | graph_budgets | Count | 0 (closed until graph traversal is wired) | if graph enabled, > 0 else GraphTraversalUnbounded | PendingSubsystem (graph-traversal wire execution unbuilt (DEFERRED_LEDGER)) | config-commit / config-apply | console:settings/graph_budgets/fanout | Knob GraphFanoutBudget | The maximum neighbors per node a graph traversal may expand. | no |
| 23 | `graph_budgets.as_of` (L595) | graph_budgets | Count | 0 (closed until graph traversal is wired) | if graph enabled, > 0 else GraphTraversalUnbounded | PendingSubsystem (graph-traversal wire execution unbuilt (DEFERRED_LEDGER)) | config-commit / config-apply | console:settings/graph_budgets/as_of | Knob GraphAsOfBudget | The maximum historical versions a graph traversal may reconstruct. | no |
| 24 | `identity.sso_group_roles` (L608) | identity | StringMap | empty | each group maps to a non-empty role set else SsoGroupWithoutRole | BootBound | config-commit / config-apply | console:settings/identity/sso_group_roles | Section SsoGroupRoles | The SSO group-to-admin-role map. | no |
| 25 | `identity.admins` (L620) | identity | RecordList | empty | each admin has a non-empty role set else AdminWithoutRole | BootBound | config-commit / config-apply | console:settings/identity/admins | Section Admins | The admin assignments (identity, roles, clearance). | no |
| 26 | `egress.destinations` (L632) | egress | RecordList | empty | unique destination id else DuplicateEgressDestination | Live (via: the cognition egress gate enforces committed ceilings (INV-ACC-NO-OVERCLASSIFIED-EGRESS)) | verb `egress-register` | console:settings/egress/destinations | Section EgressDestinations | The registered egress destinations and their ceilings (also egress-revoke / egress-set-ceiling). | yes |
| 27 | `api.exposure` (L644) | api | Struct | closed (empty origin, rate 0) | non-empty origin requires rate > 0 else ApiExposureUnbounded | PendingSubsystem (the frontend-API plane is not node-wired yet) | config-commit / config-apply | console:settings/api/exposure | Section ApiExposure | The frontend-API exposure (allowed origin, CSP, rate limit). | no |
| 28 | `aig.exposure` (L656) | aig | Struct | disabled | if enabled, retention > 0 else AigRetentionUnbounded | PendingSubsystem (the AIG exposure plane binds when wired (Fork DD-D)) | config-commit / config-apply | console:settings/aig/exposure | Section AigExposure | The Agent Identity Graph exposure (enabled, retention, identity resolution). | no |
| 29 | `lug.exposure` (L668) | lug | Struct | disabled | if enabled, caps and bucket > 0 else LugExposureUnbounded; threshold <= 1000 permille | Live (via: the LUG_SNAPSHOT handler reads the committed document per request (fail-closed absent)) | config-commit / config-apply | console:settings/lug/exposure | Section LugExposure | The Local User Graph exposure: the fail-closed ingest gate, caps, bucket, threshold. | yes |
| 30 | `idam.connector` (L682) | lug | Struct | disabled; poll 300s, full sync 24h | if enabled, poll 60..=86400s and full sync 1..=168h else IdamCadenceOutOfRange | Live (via: the IdAM sync loop re-reads both cadences from the connector state each tick (no restart)) | config-commit / config-apply | console:settings/idam/connector | Section IdamConnector | The IdAM directory connector: whether it syncs, and both operator-adjustable cadences. | no |
| 31 | `key_issuing.exposure` (L696) | key_issuing | Struct | disabled | if enabled, dual control required else KeyIssuingNotDualControlled | PendingSubsystem (agent-key issuing binds when the Crypto/Identity TRD lands) | config-commit / config-apply | console:settings/key_issuing/exposure | Section KeyIssuing | The agent-key-issuing exposure (enabled, dual control, validity). | no |
| 32 | `normalization.disabled_decoder_families` (L708) | normalization | StringSet | empty (all families enabled) | each is a known SourceFormat family else UnknownDecoderFamily | Live (via: ingest routing reads the committed set live (ConfigRoutingSource::snapshot)) | verb `normalization-set-family-enabled` | console:settings/normalization/disabled_decoder_families | Section DisabledDecoderFamilies | The SIEM decoder families that are turned off. | yes |
| 33 | `normalization.source_format_map` (L722) | normalization | StringMap | {tetragon: tetragon} | each format is a known SourceFormat label else UnknownSourceFormat | Live (via: the ingest bridge consults the committed source-format map per batch) | verb `normalization-set-source-format` | console:settings/normalization/source_format_map | Section SourceFormatMap | The source-to-decoder format override map. | yes |
| 34 | `normalization.searchable_attributes` (L734) | normalization | StringSet | empty (core fields only) | each key is non-blank else BlankSearchableAttribute | PendingSubsystem (the searchable-attribute index projection is not wired to read the committed set (no live consumer)) | verb `normalization-set-searchable-attribute` | console:settings/normalization/searchable_attributes | Section SearchableAttributes | The additional attributes projected into the searchable index. | no |
| 35 | `build_search.posture` (L748) | build_search | Struct | model=local-deterministic, dim=1024, cadence=0 (on-demand), search/entity/finding off | non-blank pinned model; dim != 0; cadence >= maintenance cadence; enabled search needs an index; must match the live embedder | PendingSubsystem (the build/search plane is not node-wired (Fork NB-C)) | verb `build-pin-model` | console:settings/build_search/posture | Section BuildSearch | The embedder + index build/search posture (also build-set-rebuild-cadence / search-set-enablement). | no |
| 36 | `served_models.registry` (L760) | served_models | RecordList | empty | complete id/version/region else IncompleteServedModel; unique (id,version) else DuplicateServedModel | PendingSubsystem (served-model live binding deferred (BUILD-ADM)) | verb `model-register` | console:settings/served_models/registry | Section ServedModels | The committed served-model registry (also model-revoke). | no |
| 37 | `detection_posture.wake_specificity_floor_milli` (L772) | detection_posture | Count | 1000 (milli-nats; one nat) | != 0 else ZeroWakeSpecificityFloor | Live (via: the detect pass reads the committed bounds each cycle (no cache)) | config-commit / config-apply | console:settings/detection_posture/wake_specificity_floor_milli | Knob WakeSpecificityFloor | The summed component-specificity a subject's observed evidence must reach to wake a technique, in milli-nats (INV-WAKE-BOUNDS-GOVERNED). | yes |
| 38 | `detection_posture.watermarks` (L786) | detection_posture | Struct | max_skew=300, allowed_lateness=120, idle_timeout=600 (seconds) | each bound > 0 else NonPositiveDetectionBound | PendingSubsystem (detection live binding deferred (DM-ADM)) | config-commit / config-apply | console:settings/detection_posture/watermarks | Section DetectionPosture | The detection watermark posture (skew, lateness, idle timeout). | no |
| 39 | `soc_narrative.model_ref` (L798) | soc_narrative | Text | unbound (the narrative refuses) | must resolve against served_models as a TextGeneration model else SocNarrativeModelUnresolvable | Live (via: resolved per narrative request from the committed document) | config-commit / config-apply | console:settings/soc_narrative/model_ref | Section SocNarrative | Which registered model writes the SOC verdict narrative (a purpose binding, not a capability). | yes |
| 40 | `soc.tiers` (L812) | soc_narrative | Struct | p_low=0, p_high=1000 (milli): the fail-closed extreme, nothing is noise and nothing licenses containment | 0 <= p_low <= p_high <= 1000 else SocTiersInvalid | Live (via: the detect pass reads the committed pair each cycle (no cache) when it proposes a response) | config-commit / config-apply | console:settings/soc/tiers | Section SocTiers | The SOC response-tier thresholds (IP-AISOC-STEP1 C.3, D5): the calibrated probability bars below which a firing is noise and at or above which the engine proposes containment; set from the measured curve (C.7), never a priori. | no (SETTINGS_COMMIT); yes via SOC_SETTINGS_COMMIT |
| 41 | `siem_writeback` (L826) | egress | Struct | disabled; vendor=splunk, host/stream/case_url_base empty, ceiling=Unclassified (fail closed) | enabled requires a host, a stream in the vendor's shape (sentinel/chronicle: two-part `a/b`) and an https:// case_url_base, else SiemWritebackIncomplete | Live (via: the write-back worker re-reads the committed section per job (C.8b); the credential reference in the boot stanza is boot-bound) | config-commit / config-apply | console:settings/soc/siem | Section SiemWriteback | The SIEM enrichment write-back (IP-AISOC-STEP1 C.8, D9): whether the incident enrichment row (probability, technique ids, kill-chain steps, severity, case URL, recommended actions, report summary) is written, to which vendor and stream, the Console case-URL base it links back to, and the classification ceiling a written incident may not exceed. | no (SETTINGS_COMMIT); yes via SOC_SETTINGS_COMMIT |
| 42 | `detection_retention.horizons` (L840) | retention | Struct | disabled (keep forever) | if enabled, each horizon > 0 else DetectionRetentionUnbounded | PendingSubsystem (the Q3.c export-before-reclaim sweep binds when wired (IP-DETECT-GROWTH-LINEAR)) | config-commit / config-apply | console:settings/detection_retention/horizons | Section DetectionRetention | The detection-store retention horizons (decisions + attribution unit; legacy entity-index rows). | no |
| 43 | `credibility_weights.weight_set` (L852) | detection_posture | Struct | the shipped v1 seeds (version 1) | version >= 1; a modified set needs version >= 2; evidence rows >= 0; fp step <= 0; 0 < candidate <= urgent, else CredibilityWeightSetInvalid | Live (via: the detect passes read the committed set each cycle (no cache); evaluations pin its version) | config-commit / config-apply | console:settings/credibility_weights/weight_set | Section CredibilityWeights | The credibility weight-set + shadow-route thresholds (RI.10): one versioned object every scoring evaluation pins. | no |
| 44 | `workers.max` (L865) | workers | Count | 0 = auto (max(8 x cores, 64)); an operator commits an explicit ceiling | none | BootBound | config-commit / config-apply | console:settings/workers/max | Knob WorkerCount | The node worker-pool size; committed (AC.4), read at serve(), so a change needs a restart. CDB_MAX_WORKERS is refused. | no |
| 45 | `embedder.binding` (L877) | embedder | Struct | empty endpoint (in-process ReferenceEmbedder), pipeline width 0 (default) | none | BootBound | config-commit / config-apply | console:settings/embedder/binding | Section Embedder | The embedding-provider binding (TEI endpoint + pipeline width); committed (AC.4b), read at boot with the boot NodeConfig then the deprecated CDB_EMBED_TEI/PIPELINE env as fallbacks. | no |
| 46 | `observability.telemetry_enabled` (L889) | observability | TriState | on (unset or 1); off on 0 | none | EnvBootstrap | pending (AC.4b) | console:settings/observability/telemetry_enabled | Env CDB_OBSERVE (crates/cdb-server/src/main.rs) | Whether OTLP telemetry is emitted (deferral KC-OBSERVE-ENV). | no |
| 47 | `observability.otlp_ingest_bytes_per_window` (L901) | observability | Bytes | 67108864 (64 MiB) | none (0 sheds all OTLP-plane ingest) | Live (via: read at each per-connection quota-window roll) | config-commit / config-apply | console:settings/observability/otlp_ingest_bytes_per_window | Knob OtlpIngestBytesPerWindow | Per-connection OTLP-plane ingest byte budget per one-minute window (INV-OBS-INGEST-QUOTA); over-budget exports are shed LimitExceeded before any verify/storage work. | yes |
| 48 | `cognition.context_sources` (L913) | cognition | Text | profile-seeded | each is a known CognitionSourceKind (file_tree/agent_vectors/memory) | EnvBootstrap | pending (AC.4b) | console:settings/cognition/context_sources | Env CDB_COGNITION_CONTEXT_SOURCES (crates/cdb-server/src/config_env.rs) | The cognition context-source kinds (replaces the committed list). | no |
| 49 | `cognition.frontier_providers` (L925) | cognition | Text | profile-seeded | each is a well-formed dest:provider:cred_file triple | EnvBootstrap | pending (AC.4b) | console:settings/cognition/frontier_providers | Env CDB_COGNITION_FRONTIER_PROVIDERS (crates/cdb-server/src/config_env.rs) | The cognition frontier providers (replaces the committed list). | no |
| 50 | `cognition.admit_enrolled_devices` (L937) | cognition | Bool | false (fail closed); seeded from the boot NodeConfig | none | BootBound | config-commit / config-apply | console:settings/cognition/admit_enrolled_devices | Knob CognitionAdmitEnrolled | Whether AIG-enrolled devices are admitted to cognition; committed (AC.4c), read at cognition bring-up (a change needs a restart), seeded from NodeConfig. | no |
| 51 | `cognition.add_destinations` (L949) | egress | Text | profile-seeded | each is an id=ceiling pair; merged into egress.destinations | EnvBootstrap | pending (AC.4b) | console:settings/egress/cognition_add_destinations | Env CDB_COGNITION_ADD_DESTINATIONS (crates/cdb-server/src/config_env.rs) | A residual env path that merges destinations into egress.destinations. | no |
| 52 | `query_surface.result_chunk_rows` (L962) | query_surface | Count | 256 | none | Live (via: read committed at cursor open; CHUNK_ROWS is the read-failure fallback) | config-commit / config-apply | console:settings/query_surface/result_chunk_rows | Knob ResultChunkRows | Rows per result chunk / page size; committed (AC.5), read at the wire with the CHUNK_ROWS fallback. | yes |
| 53 | `query_surface.max_cursors_per_tenant` (L974) | query_surface | Count | 128 | none | Live (via: read committed at cursor open; MAX_CURSORS_PER_TENANT is the fallback) | config-commit / config-apply | console:settings/query_surface/max_cursors_per_tenant | Knob MaxCursorsPerTenant | Per-tenant open-cursor cap (CQ.4); committed (AC.5), read at cursor open with the const fallback. | yes |
| 54 | `query_surface.max_retained_tail_bytes` (L986) | query_surface | Bytes | 268435456 (256 MiB) | none | Live (via: read committed at cursor open; MAX_RETAINED_TAIL_BYTES is the fallback) | config-commit / config-apply | console:settings/query_surface/max_retained_tail_bytes | Knob MaxRetainedTailBytes | Node-global undelivered cursor-tail byte budget; committed (AC.5), read at cursor open with the const fallback. | yes |
| 55 | `cognition.max_connections` (L998) | cognition | Count | 64 | none | Live (via: read committed at cognition bring-up; MAX_COGNITION_CONNECTIONS is the fallback) | config-commit / config-apply | console:settings/cognition/max_connections | Knob CognitionMaxConnections | Max concurrent cognition connections (CQ.5); committed (AC.5), read at cognition bring-up with the const fallback. | yes |
| 56 | `maintenance.artifact_spot_check_limit` (L1014) | maintenance | Count | 32 | none | Live (via: read committed at report generation; ARTIFACT_SPOT_CHECK_LIMIT is the fallback) | config-commit / config-apply | console:settings/maintenance/artifact_spot_check_limit | Knob ArtifactSpotCheckLimit | Artifacts spot-checked per security report (CQ.3b); committed (AC.5), read at report generation with the const fallback. | yes |

### 1.3 Registry bookkeeping that is stale in the source

- The module doc and the group comments still say the registry is seeded from 22 knobs, 12 sections,
  8 env knobs and 6 constants (`config_registry.rs:18-19`, `:319`, `:606`, `:863`, `:960`). Actual
  groups: lines 321-595 hold 23 entries (22 knobs + `retention.raw_days`, an Env origin); 608-852 hold
  20 (19 sections + the `detection_posture.wake_specificity_floor_milli` knob); 865-949 hold 8 (3 knobs,
  1 section, 4 env); 962-1014 hold 5 knobs (the "Gap C" consts were all promoted). The gate counts 56
  (`config_surface_drift.rs:22-30`).
- `ConfigSection` doc says "The twelve structural configuration sections" (`config_document.rs:2155`);
  there are 20 (`config_document.rs:2209`).

### 1.4 Registry claims that the code contradicts (read before documenting "applies live")

| Key | Registry says | Code shows | Consequence for the Console |
|---|---|---|---|
| `sessions.standard_lifetime_secs`, `sessions.break_glass_lifetime_secs` | Live: "session manager honors the committed lifetime" (`config_registry.rs:362,374`) | The admin listener's `SessionPolicy` is built once from the effective stanza at endpoint start (`crates/cdb-server/src/admin.rs:2253-2258`, `:2578`; `crates/cdb-admin/src/listener.rs:139-142`, `:195-203`); `live_apply_registry` has only 3 handlers (maintenance cadence, retention window, workspace quota) (`admin.rs:50-66`). No production code opens a BreakGlass session (listener always opens `SessionKind::Standard`, `listener.rs:195-203`; BreakGlass appears only in a unit test, `crates/cdb-admin/src/session.rs:187-200`). | Editable in the Console and reported as applied (not in `needs_restart`, `crates/cdb-admin/src/reconfigure.rs:201-222`), but takes effect on the admin plane only after a restart; break-glass lifetime only matters to validation. |
| `governance.dual_control` | Live: "commit-path dual-control gate consults the committed set" (`config_registry.rs:350`) | True for the wire: every wire write reads the committed set per request (`handler.rs:4725-4736`, `:5147-5150`, `:5259-5262`). False for the admin plane: `DualControlPolicy` is captured at endpoint start (`admin.rs:2243-2251`, `:2574`; enforced from that capture in `crates/cdb-admin/src/lifecycle.rs:224-235`). | A Console change governs Console writes immediately, `cdb-actl` writes only after a restart. |
| `cognition.max_connections` | Live: "read committed at cognition bring-up" (`config_registry.rs:1003`) | Captured once at cognition start, "captured, not read per-accept" (`crates/cdb-server/src/cognition.rs:927-935`). | Offered as editable; effectively boot-bound; not listed in `needs_restart`. |
| `idam.connector` | Live: "the IdAM sync loop re-reads both cadences from the connector state each tick" (`config_registry.rs:687-689`) | Nothing outside cdb-admin reads the committed `idam_connector` section (repo-wide grep for `.idam_connector` finds no consumer). The live connector state is built at boot from `NodeConfig.connectors.auth0` (`crates/cdb-server/src/bootstrap.rs:1141-1161`) and mutated in memory by the separate wire verb `IDAM_CONFIGURE` (`handler.rs:2667-2692` -> `crates/cdb-ingest/src/connector.rs:363-386`). | The Settings row (not wire-editable) can disagree with the live connector; Console IdAM cadence/enable edits (IDAM_CONFIGURE) are in-memory only and revert to node.cbor on restart. |
| `detection_retention.horizons` | PendingSubsystem: "the Q3.c export-before-reclaim sweep binds when wired" (`config_registry.rs:845`) | A live consumer exists: the Q3.c pass is registered on the maintenance engine ("gated live on the committed DetectionRetention section", `bootstrap.rs:4670-4678`) and `NodeDetectRetentionSweep` reads the committed section every cycle (`bootstrap.rs:2181-2200`); episode maintenance reuses `decision_retention_secs` (`bootstrap.rs:2363-2385`). (By contrast the watermark rollup uses the compiled `DEFAULT_IDLE_TIMEOUT_SECONDS`, `bootstrap.rs:4679-4685`, consistent with `detection_posture.watermarks` being pending.) | Registry understates it; the wire refuses to patch it (`pending_subsystem`). The installer arms it at 30 days (section 5.6). |
| `served_models.registry` | PendingSubsystem: "served-model live binding deferred (BUILD-ADM)" (`config_registry.rs:765`) | The committed list is read per request by the SOC narrative/impact run (`handler.rs:5604-5617`) and checked at commit for the narrative binding (`config_document.rs:1563-1569`). What is deferred is the CrucibleQL model registry, built at boot from `NodeConfig.cognition.served_models` (`bootstrap.rs:428-442`). | Two model registries exist; the manual must say which one a setting affects. |
| `lug.exposure` | default "disabled" (`config_registry.rs:671`) | Default is `enabled: true` (`config_document.rs:310-322`; doc `:234-245`, "Default-ON (operator directive 2026-07-21)"). | The Console shows a wrong default string. |
| `embedder.binding` | BootBound; committed value governs, NodeConfig then env as fallbacks (`config_registry.rs:877-887`) | Correct resolution order (`bootstrap.rs:444-478`), but the node installer never authors the binding into node.cbor or the document: `50-config.sh` writes `CDB_EMBED_TEI` into `/etc/cdb/cdb.env` (`deploy/cdb-install/installer/phases/50-config.sh:93-114`) and does not pass it to `cdb-mkconfig` (`50-config.sh:211-265`). | On installer-built nodes the Settings row renders `tei_endpoint="" pipeline_width=0` while the node embeds via TEI through the deprecated env fallback. |
| `build_search.posture` | bound includes "must match the live embedder" (`config_registry.rs:752`) | Enforced on admin-plane commits and at boot (`admin.rs:768-771`, `:2014`, `:2095`; `bootstrap.rs:931-943`), not on the wire commit path (`bootstrap.rs:5784-5822` calls only `validate()`). | The wire cannot patch this section, but `SETTINGS_ROLLBACK`/`SETTINGS_APPROVE` commit whole documents without the embedder check; a mismatch then fails the NEXT boot closed (`bootstrap.rs:931-943`). UNVERIFIED as a reachable scenario (needs an embedder change between versions). |
| `workers.max` | default "0 = auto (max(8 x cores, 64))" (`config_registry.rs:868`) | Effective = committed if > 0, else `NodeConfig.max_workers` if > 0, else `max(8 x cores, 64)` (`crates/cdb-server/src/main.rs:73-127`). | Row value is usually `0`; the real pool size is not shown. |
| `aig.exposure` | PendingSubsystem (`config_registry.rs:661`) | Accurate: only the admin `aig-report` reads it (`admin.rs:1266-1276`). The installer nevertheless arms it "so torch-discovered agents resolve to NAMED AgentInstance nodes" (`65-seed.sh:94-118`). UNVERIFIED that any runtime path reads it (grep for `aig_exposure` finds only `admin.rs:1274` and tests). | Displayed only. |
| `observability.telemetry_enabled` | summary "Whether OTLP telemetry is emitted"; default "on (unset or 1); off on 0" (`config_registry.rs:889-899`) | `CDB_OBSERVE` installs a JSON-line event observer on stderr (the journal); unset or `1` = on, `0` or empty = off, any other value = off with a warning (`crates/cdb-server/src/main.rs:24-49`). No OTLP exporter is involved. | The row describes the wrong mechanism; it shows no value (env origin). |

---

## 2. `config_model.rs`: Knob, KnobKind, Tier, Profile, `default_for`

### 2.1 Types

- `Profile` (`config_model.rs:16-41`): `Evaluation` (the `#[default]`, "single node, simplest secure
  defaults, dual control off"), `Enterprise` ("dual control on for key issuing and policy change"),
  `AirGapped` ("no external egress; dual control on for the high-risk set"), `Federal` ("Air-Gapped plus
  the accreditation-specific defaults"). Serde names are the variant names (`Evaluation` ...).
- `Tier` (`config_model.rs:43-54`): `Essential` ("a decision an operator must make"), `Standard` ("a
  common adjustment"), `Advanced` ("a rarely-touched knob"). **No serde derive**: Tier never crosses the
  wire. Its only runtime consumer is `cdb-actl config-export`, which prints a "tiers (governed knobs)"
  list (`crates/cdb-server/src/bin/cdb-actl.rs:436-451`). Neither `ConfigSettingDto`
  (`config_registry.rs:1063-1085`) nor `WireSettingRow` (`crates/cdb-wire/src/query.rs:2353-2382`)
  carries a tier, and the Console has no tier table (grep of `forgecentral/apps`, `packages` for
  `Essential`/`Advanced` finds nothing).
- `KnobKind` (`config_model.rs:276-291`): Classification, Bytes, DualControlSet, Ticks, Bool, Count.
- `KnobValue` (`config_model.rs:293-310`): `Classification(Classification)`, `Bytes(u32)`,
  `DualControlSet(BTreeSet<AdminCapability>)`, `Ticks(u64)`, `Bool(bool)`, `Count(u64)`.
- `KnobValue::parse(kind, raw)` (`config_model.rs:345-383`) is what a wire scalar edit and
  `cdb-actl config-set-key` accept: Bool exactly `true`/`false`; Count and Ticks a decimal `u64`;
  Bytes a decimal `u32` (a value >= 2^32 is refused); Classification exactly one of
  `unclassified|internal|confidential|restricted|secret` (lowercase); DualControlSet is ALWAYS refused
  ("authored via a config document, not `config set`"). Error text: `cannot parse "<raw>" as <want>`
  (`config_model.rs:386-395`).
- `KnobValue::render` (`config_model.rs:329-337`): classification lowercased; numbers decimal; bool
  `true`/`false`; a DualControlSet renders as the Rust Debug of the set, e.g. `{KeyIssue,
  SecurityPolicyChange}` (this is the `value` the wire shows for `governance.dual_control`).
- `ConfigDocument::with_knob` (`config_document.rs:1214-1432`) sets one knob; errors
  `KnobSetError::KindMismatch` or `RangeExceeded` when a Count exceeds a `u32`-backed field
  (`config_document.rs:1229-1235`; variants at `:2100-2121`). u32-backed Count knobs:
  `per_tenant_query_limit`, `per_tenant_result_limit`, the 3 graph budgets, `result_chunk_rows`,
  `max_cursors_per_tenant`, `cognition_max_connections`, `artifact_spot_check_limit`.

### 2.2 Every knob: registry key, document field, kind, tier, profile defaults

Tier: `config_model.rs:200-235`. Kind: `config_model.rs:238-272`. Defaults: `Profile::default_for`
(`config_model.rs:419-497`) and the helper fns (`:499-606`). Only three knobs vary by profile.

| # | Knob (Rust) | Registry key | Document field | Kind | Tier | Evaluation | Enterprise | AirGapped | Federal |
|---|---|---|---|---|---|---|---|---|---|
| 1 | EndpointClassification | `admin_endpoint.classification` | `endpoint_classification` | Classification | Essential | unclassified | unclassified | unclassified | unclassified |
| 2 | MaxPayload | `admin_endpoint.max_payload_bytes` | `max_payload` | Bytes | Advanced | 65536 | 65536 | 65536 | 65536 |
| 3 | DualControl | `governance.dual_control` | `dual_control` | DualControlSet | Standard | {} (empty) | {KeyIssue, SecurityPolicyChange} | {KeyIssue, SecurityPolicyChange, AuditExport} | {KeyIssue, SecurityPolicyChange, AuditExport} |
| 4 | SessionStandardLifetime | `sessions.standard_lifetime_secs` | `session_standard_lifetime` | Ticks (s) | Standard | 28800 | 3600 | 1800 | 900 |
| 5 | SessionBreakGlassLifetime | `sessions.break_glass_lifetime_secs` | `session_break_glass_lifetime` | Ticks (s) | Standard | 3600 | 900 | 600 | 300 |
| 6 | MaintenanceCadence | `maintenance.cadence_secs` | `maintenance_cadence_secs` | Ticks (s) | Essential | 60 | 60 | 60 | 60 |
| 7 | RetentionWindow | `retention.time_travel_window_secs` | `retention_window_secs` | Ticks (s) | Essential | 604800 | 604800 | 604800 | 604800 |
| 8 | LogRetentionWindow | `retention.log_observation_window_secs` | `log_retention_window_secs` | Ticks (s) | Essential | 2592000 | 2592000 | 2592000 | 2592000 |
| 9 | CursorLease | `leases.cursor_secs` | `cursor_lease_secs` | Ticks (s) | Advanced | 60 | 60 | 60 | 60 |
| 10 | SessionLease | `leases.session_secs` | `session_lease_secs` | Ticks (s) | Advanced | 60 | 60 | 60 | 60 |
| 11 | PreparedLease | `leases.prepared_secs` | `prepared_lease_secs` | Ticks (s) | Advanced | 300 | 300 | 300 | 300 |
| 12 | WorkspaceQuotaPerPrincipal | `workspace_quota.per_principal` | `workspace_quota_per_principal` | Count | Advanced | 64 | 64 | 64 | 64 |
| 13 | WorkspaceQuotaPerTenant | `workspace_quota.per_tenant` | `workspace_quota_per_tenant` | Count | Advanced | 256 | 256 | 256 | 256 |
| 14 | QueryEnabled | `query_surface.enabled` | `query_exposure.db_query_enabled` | Bool | Essential | true | true | true | true |
| 15 | VectorSearchEnabled | `query_surface.vector_search_enabled` | `query_exposure.vector_search_enabled` | Bool | Essential | false | false | false | false |
| 16 | Bm25SearchEnabled | `query_surface.bm25_search_enabled` | `query_exposure.bm25_search_enabled` | Bool | Essential | false | false | false | false |
| 17 | GraphTraversalEnabled | `query_surface.graph_traversal_enabled` | `query_exposure.graph_traversal_enabled` | Bool | Essential | false | false | false | false |
| 18 | PerTenantQueryLimit | `query_surface.per_tenant_query_limit` | `query_exposure.per_tenant_query_limit` (u32) | Count | Essential | 100000 | 100000 | 100000 | 100000 |
| 19 | PerTenantResultLimit | `query_surface.per_tenant_result_limit` | `query_exposure.per_tenant_result_limit` (u32) | Count | Essential | 10000 | 10000 | 10000 | 10000 |
| 20 | GraphExpandBudget | `graph_budgets.expand` | `query_exposure.graph_expand_budget` (u32) | Count | Essential | 0 | 0 | 0 | 0 |
| 21 | GraphFanoutBudget | `graph_budgets.fanout` | `query_exposure.graph_fanout_budget` (u32) | Count | Essential | 0 | 0 | 0 | 0 |
| 22 | GraphAsOfBudget | `graph_budgets.as_of` | `query_exposure.graph_as_of_budget` (u32) | Count | Essential | 0 | 0 | 0 | 0 |
| 23 | WorkerCount | `workers.max` | `max_workers` | Count | Advanced | 0 (auto) | 0 | 0 | 0 |
| 24 | CognitionAdmitEnrolled | `cognition.admit_enrolled_devices` | `cognition_admit_enrolled` | Bool | Advanced | false | false | false | false |
| 25 | ResultChunkRows | `query_surface.result_chunk_rows` | `result_chunk_rows` (u32) | Count | Advanced | 256 | 256 | 256 | 256 |
| 26 | MaxCursorsPerTenant | `query_surface.max_cursors_per_tenant` | `max_cursors_per_tenant` (u32) | Count | Advanced | 128 | 128 | 128 | 128 |
| 27 | MaxRetainedTailBytes | `query_surface.max_retained_tail_bytes` | `max_retained_tail_bytes` (u32) | Bytes | Advanced | 268435456 | 268435456 | 268435456 | 268435456 |
| 28 | CognitionMaxConnections | `cognition.max_connections` | `cognition_max_connections` (u32) | Count | Advanced | 64 | 64 | 64 | 64 |
| 29 | ArtifactSpotCheckLimit | `maintenance.artifact_spot_check_limit` | `artifact_spot_check_limit` (u32) | Count | Advanced | 32 | 32 | 32 | 32 |
| 30 | OtlpIngestBytesPerWindow | `observability.otlp_ingest_bytes_per_window` | `otlp_ingest_bytes_per_window` | Bytes | Advanced | 67108864 | 67108864 | 67108864 | 67108864 |
| 31 | WakeSpecificityFloor | `detection_posture.wake_specificity_floor_milli` | `wake_specificity_floor_milli` | Count (milli-nats) | Advanced | 1000 | 1000 | 1000 | 1000 |

Profile evidence: dual-control sets `config_model.rs:569-584`; standard lifetimes `:587-595`; break-glass
lifetimes `:598-606`; query defaults `:404-412` + `:447-461`; everything else is profile-invariant
(`let _ = self;` helpers `:499-566`, and literal arms `:440-482`). Tests: profile completeness
`:660-674`, dual control tightens `:677-692`, lifetimes tighten `:695-706`.

Tier notes for the manual:
- Essential (13): the 4 query-surface toggles, 2 per-tenant limits, 3 graph budgets, endpoint
  classification, maintenance cadence, both retention windows. Seven of the 13 Essential knobs
  (vector/BM25/graph toggles, per-tenant query limit, 3 graph budgets) are `PendingSubsystem`: "a decision
  an operator must make" about surfaces that are not built (`config_registry.rs:516,528,540,552,576,588,600`).
- Standard (3): dual control and both session lifetimes.
- Advanced (15): payload, 3 leases, 2 workspace quotas, workers, cognition admit + max connections, the
  3 cursor caps, spot-check limit, OTLP budget, wake floor.

### 2.3 Settings with no tier today

Tier exists only on `Knob` (`config_model.rs:200`). These **25 registry rows have no tier**:
- the 20 section rows: `identity.sso_group_roles`, `identity.admins`, `egress.destinations`,
  `api.exposure`, `aig.exposure`, `lug.exposure`, `idam.connector`, `key_issuing.exposure`,
  `normalization.disabled_decoder_families`, `normalization.source_format_map`,
  `normalization.searchable_attributes`, `build_search.posture`, `embedder.binding`,
  `served_models.registry`, `detection_posture.watermarks`, `soc_narrative.model_ref`, `soc.tiers`,
  `siem_writeback`, `detection_retention.horizons`, `credibility_weights.weight_set`;
- the 5 env rows: `retention.raw_days`, `observability.telemetry_enabled`,
  `cognition.context_sources`, `cognition.frontier_providers`, `cognition.add_destinations`.
- Also untiered and unregistered: the document's `profile` field (`config_document.rs:363`), which no
  registry row, wire field or report exposes (grep of `handler.rs` settings code), and every boot
  `NodeConfig` field (section 5).

---

## 3. `config_document.rs`: the committed document, its sections, and validation

### 3.1 Document-level rules

- `ConfigDocument` has 44 fields (`config_document.rs:361-511`): the 31 knobs as typed fields (9 of
  them inside `query_exposure: QueryExposure`, `:104-131`), the 20 section fields, and `profile`.
- Validation is whole-document and non-short-circuiting: `validate()` returns a `ValidatedConfig`
  only if `violations()` is empty, else `ConfigInvalid { violations }` carrying every violation
  (`config_document.rs:1435-1442`, `:1447-1799`; test "the_whole_document_is_checked_not_short_circuited"
  at `:3905`). `ValidatedConfig` is constructible only by `validate` (`:1839-1855`), and
  `ConfigStore::commit_config` requires it (`crates/cdb-server/src/config_store.rs:124-128`).
- The embedder cross-check is separate because it needs the live embedder: `embedder_violations`
  (`config_document.rs:1811-1834`) runs on admin-plane `config-commit`/`config-apply`/domain edits
  (`admin.rs:768-771`, `:854`, `:2014`, `:2095`) and at boot (`bootstrap.rs:931-943`, which fails the
  boot closed), but NOT on the wire commit path (`bootstrap.rs:5784-5822`).
- Forward compatibility: the container-level serde default fills any field absent from a stored
  document with `fail_closed_default()` = `from_profile(Profile::Federal)` (`config_document.rs:343-360`,
  `:1063-1074`). The wire also uses the Federal document whenever NO document is committed: in
  `SETTINGS_READ` (shown at version 0, `handler.rs:4262-4267`), `SOC_SETTINGS_READ` (`:5218-5224`), as the
  base of a first `SETTINGS_COMMIT`/`PROPOSE` (`:4778-4782`), for `SOC_SETTINGS_COMMIT` (`:5255-5258`), and
  as the "before" of the oldest history entry (`:5081-5093`).
- Declarative form (`config-export`/`config-apply` on the admin plane): pretty JSON of the document
  (`crates/cdb-admin/src/config_file.rs:32-40`); enums serialize by Rust variant name (e.g.
  `"Secret"`, `"TenantConfig"`, `"Federal"`), `SiemVendor` by serde `snake_case`
  (`crates/cdb-types/src/siem.rs:13-15`), so `QRadar` would serialize as `q_radar` while the wire tag is
  `qradar` (`siem.rs:42-50`). UNVERIFIED by execution (serde rename rule applied by reading).

### 3.2 The 20 sections: fields, types, defaults, validation, rendering

`label` = diff/section key (`config_document.rs:2234-2257`); "summary" = the text `summarize()` produces,
which is also the wire `SETTINGS_READ` `value` for the row (`handler.rs:4168-4169`).

1. **`sso_group_roles`** -> registry `identity.sso_group_roles` (BootBound).
   Type `BTreeMap<String, BTreeSet<AdminRole>>` (`config_document.rs:430`); default empty.
   AdminRole: Operator, SecurityAdmin, TenantAdmin, Auditor, Root (`crates/cdb-admin/src/role.rs:17-28`);
   wire names `operator|securityadmin|tenantadmin|auditor|root` (`role.rs:44-52`).
   Validation: a group with no roles -> `SsoGroupWithoutRole { group }` (`config_document.rs:1516-1521`).
   Summary `group=[Role,Role];...` (`:2453-2467`). Consumer: merged into the admin enrollment edge once at
   endpoint start (`admin.rs:2513-2520`, `:2222-2238`).
2. **`admins`** -> `identity.admins` (BootBound).
   `Vec<AdminAssignment { identity: String, roles: BTreeSet<AdminRole>, clearance: Classification }>`
   (`config_document.rs:26-36`, `:432`); default empty; seeded from `CDB_ADMIN_ENROLL` at first boot
   (`config_bringup.rs:52`). Validation: `AdminWithoutRole { identity }` (`config_document.rs:1510-1515`).
   Summary `identity=[Role,...]@Clearance;...` sorted (`:2469-2486`); ambiguous for identities containing
   separators (`docs/implementation-plans/IP-CONSOLE-SETTINGS-WIRE-LEDGER.md`, SET.1b row), hence the typed
   `identity_values` on the wire. Consumer: the admin authority is built once at endpoint start
   (`admin.rs:2210-2220`).
3. **`egress_destinations`** -> `egress.destinations` (Live).
   `Vec<EgressCeiling { id: String, ceiling: Classification }>` (`config_document.rs:37-50`, `:434`);
   default empty; seeded at first boot from the cognition stanza when cognition is enabled
   (`bootstrap.rs:4198-4215`, `config_bringup.rs:70-74`). Validation: duplicate id ->
   `DuplicateEgressDestination { id }` (`config_document.rs:1522-1530`); no other check (an empty id is
   not refused by the document). Summary `id=Ceiling;...` sorted (`:2488-2498`). Consumer: the cognition
   egress gate reads the committed list per call; absent config = destination unconfigured, fail closed
   (`crates/cdb-server/src/cognition.rs:52-86`). Admin verbs `egress-register/-revoke/-set-ceiling`
   require `SecurityPolicyChange` (`crates/cdb-admin/src/capability.rs:249-264`).
4. **`api_exposure`** -> `api.exposure` (Pending: frontend-API plane not node-wired).
   `{ allowed_origin: String, content_security_policy: String, rate_limit_per_minute: u32 }`
   (`config_document.rs:150-167`); default empty/empty/0. Validation: non-empty origin with rate 0 ->
   `ApiExposureUnbounded` (`:1604-1610`). Summary `origin=".." csp=".." rate=N` (`:2269-2275`).
5. **`aig_exposure`** -> `aig.exposure` (Pending).
   `{ enabled: bool, retention_secs: u32, identity_resolution_enabled: bool }` (`:169-185`); default
   false/0/false. Validation: enabled with retention 0 -> `AigRetentionUnbounded` (`:1725-1728`).
   Summary `enabled=.. retention=.. resolution=..` (`:2276-2282`).
6. **`lug_exposure`** -> `lug.exposure` (Live).
   Fields and defaults (`:246-323`): `enabled` bool (**true**), `resolution_enabled` bool (false),
   `max_accounts_per_namespace` u32 (50000), `max_groups_per_namespace` u32 (10000),
   `max_sessions_per_device` u32 (5000), `last_seen_bucket_hours` u32 (24),
   `binding_confirm_threshold_permille` u16 (900), `snapshot_cadence_hours` u32 (24).
   Validation: enabled with any of the 3 caps or the bucket = 0 -> `LugExposureUnbounded` (`:1729-1736`);
   threshold > 1000 -> `LugThresholdOutOfRange`, checked even when disabled (`:1737-1739`);
   `snapshot_cadence_hours` and `resolution_enabled` unvalidated. Summary (`:2283-2296`). Consumer:
   `LUG_SNAPSHOT` refuses unless the committed section is present and enabled (`handler.rs:10055-10068`).
7. **`idam_connector`** -> `idam.connector` (registry: Live; code: no consumer, see 1.4).
   `{ enabled: bool (false), poll_interval_secs: u64 (300), full_sync_cadence_hours: u64 (24) }`
   (`config_document.rs:187-237`). Validation: when enabled, poll outside 60..=86400 s or full sync outside
   1..=168 h -> `IdamCadenceOutOfRange` (`:1740-1749`; bounds `crates/cdb-types/src/idam.rs:19-31`,
   validators `:56-79`). Summary `enabled=.. poll_s=.. full_sync_h=..` (`:2297-2303`).
8. **`key_issuing`** -> `key_issuing.exposure` (Pending: Crypto/Identity TRD).
   `{ enabled: bool, dual_control_required: bool, key_validity_secs: u32 }` (`:325-342`); default all
   false/0. Validation: enabled without dual control -> `KeyIssuingNotDualControlled` (`:1750-1752`);
   validity unvalidated. Summary (`:2304-2310`).
9. **`disabled_decoder_families`** -> `normalization.disabled_decoder_families` (Live).
   `BTreeSet<String>` (`:448-451`); default empty (all enabled). Validation: each must be a known family
   else `UnknownDecoderFamily { family }` (`:1753-1762`). The 26 families
   (`crates/cdb-normalize/src/decode/mod.rs:729-772`): syslog, cef, leef, ocsf, fortinet, elastic, splunk,
   exabeam, palo_alto, crowdstrike, okta, auth0, microsoft, cisco, aruba, juniper, arista, web, linux,
   zeek, github, atlassian, onelogin, yousource, crucible_process, tetragon. Summary comma list (`:2311`).
   Consumer: ingest routing reads the committed set live (`crates/cdb-server/src/ingest_routing.rs:42-55`).
10. **`source_format_map`** -> `normalization.source_format_map` (Live).
    `BTreeMap<String /*source key*/, String /*format label*/>` (`config_document.rs:452-457`); default
    `{tetragon: tetragon}` (`:1126-1132`). Validation: each format must be one of the 40 labels else
    `UnknownSourceFormat { source_key, format }` (`:1763-1773`); source keys are not validated. Labels
    (`decode/mod.rs:623-666` list, labels in `fn label`): syslog, cef, leef, ocsf, fortinet, elastic,
    splunk, exabeam, pan_os, crowdstrike, okta, auth0, ms_graph_security, azure_monitor, m365_activity,
    windows_event, web_access, auditd, zeek, github_audit, bitbucket_audit, onelogin, agent_event,
    cisco_ios, cisco_asa, cisco_ise, cisco_aireos, meraki_mr, cisco_ftd, cisco_cucm, cucm_cdr, cisco_ucs,
    arubaos_wireless, arubaos_cx, arubaos_switch, clearpass, junos, arista_eos, crucible_process,
    tetragon. Summary `k=v;...` (`config_document.rs:2444-2451`).
11. **`searchable_attributes`** -> `normalization.searchable_attributes` (Pending: no consumer).
    `BTreeSet<String>` (`:458-465`); default empty. Validation: a blank (after trim) key ->
    `BlankSearchableAttribute` (`:1774-1779`).
12. **`build_search`** -> `build_search.posture` (Pending, Fork NB-C).
    `{ pinned_model: String ("local-deterministic"), embedding_dimension: u32 (1024),
    rebuild_cadence_secs: u64 (0 = on demand), search_enabled, entity_index_enabled,
    finding_index_enabled: bool (all false) }` (`:513-559`). Validation: dim 0 ->
    `ZeroEmbeddingDimension` (`:1780-1782`); blank model -> `BlankPinnedModel` (`:1783-1785`); cadence
    != 0 and < `maintenance_cadence_secs` -> `RebuildCadenceBelowMaintenance` (`:1786-1791`, a cross-knob
    rule: raising the maintenance cadence can invalidate a document with a rebuild cadence); search on with
    neither index -> `SearchEnabledWithoutIndex` (`:1792-1797`); embedder checks
    `EmbedderDimensionMismatch` / `EmbedderModelMismatch` (`:1811-1834`, not on the wire path).
13. **`embedder`** -> `embedder.binding` (BootBound).
    `{ tei_endpoint: String ("" = in-process reference), pipeline_width: u32 (0 = compiled default) }`
    (`:561-575`); no validation. Summary `tei_endpoint=".." pipeline_width=N` (`:2326-2332`). Resolution at
    boot: committed -> `NodeConfig.embedder` -> `CDB_EMBED_TEI`/`CDB_EMBED_PIPELINE` env
    (`bootstrap.rs:444-478`); an endpoint without a parseable port uses 9090 (`bootstrap.rs:487-492`).
14. **`served_models`** -> `served_models.registry` (Pending for CrucibleQL; live for the SOC narrative).
    `Vec<ModelRegistration { id, version, capability: ModelCapability, ceiling: Classification, region }>`
    (`:73-97`, `:477-480`); ModelCapability: TextGeneration, Embedding, Reranker, Speech, Vision,
    Multimodal (`:52-72`); default empty. Validation: empty id/version/region -> `IncompleteServedModel`
    (`:1532-1540`); duplicate `(id, version)` -> `DuplicateServedModel` (`:1541-1547`). Summary
    `id@version=Capability/Ceiling/region;...` (`:2500-2514`).
15. **`detection_posture`** -> `detection_posture.watermarks` (Pending, DM-ADM).
    `{ max_skew_seconds: i64 (300), allowed_lateness_seconds: i64 (120), idle_timeout_seconds: i64 (600) }`
    (`:568-601`). Validation: any <= 0 -> `NonPositiveDetectionBound` (`:1548-1558`).
16. **`soc_narrative`** -> `soc_narrative.model_ref` (Live).
    `{ model_ref: Option<String> }` in `<id>@<version>` form (`:603-618`); default `None` (the narrative
    refuses rather than picking a model). Validation: when bound, it must resolve against the SAME
    document's `served_models` as a TextGeneration model, checked at `required = Unclassified`
    (`:1559-1569`) -> `SocNarrativeModelUnresolvable(<reason>)` where the reason is a
    `NarrativeModelError`: `Malformed` (not `<id>@<version>` with both parts non-empty), `NotRegistered`,
    `WrongCapability`, or `CeilingTooLow` (cannot fire at commit, since `required` is the lowest level)
    (`:724-808`). At run time the ceiling must be >= the incident's classification (`handler.rs:5612-5617`).
    Summary: the ref or `unbound` (`config_document.rs:2341-2345`).
17. **`detection_retention`** -> `detection_retention.horizons` (registry Pending; code live, 1.4).
    `{ enabled: bool (false), decision_retention_secs: u64 (0), entity_index_retention_secs: u64 (0) }`
    (`:810-838`). Validation (enabled only): `DetectionRetentionUnbounded { which: "decisions" }` /
    `{ which: "entity-index" }` (`:1611-1623`). Summary (`:2346-2352`).
18. **`credibility_weights`** -> `credibility_weights.weight_set` (Live, read each detect cycle,
    `bootstrap.rs:2440-2442`, `:3538-3543`). `CredibilityWeightSet` (`config_document.rs:862-975`), v1 defaults
    (`:977-1018`, all milli-nats unless noted): version 1; prior -2000; provenance_official 700;
    provenance_community 350; kev_listed 1500; false_positive_step -600; false_positive_cap 4;
    sustained_beacon 700; co_open_step 350; co_open_cap 3; recurrence_step 100; recurrence_cap 5;
    agent_scope_deviation 500; agent_capability_rarity 500; agent_target_asset_risk 400;
    agent_provenance_untrust 400; agent_rate_or_cost_breach 300; agent_unsanctioned_anomaly 300;
    agent_corroboration_step 350; agent_corroboration_cap 3; known_bad_contact 900; source_rule_match 500;
    overlay_resolved_step 400; overlay_resolved_cap 3; overlay_missing_step -400; overlay_missing_cap 3;
    route_candidate 500; route_urgent 2000; calibration `[]` (uncalibrated); and five optional terms
    defaulting to `None`: indicator_prior, co_open_same_technique_step, benign_cadence,
    known_bad_graded_budget, liveness_timeout_seconds (s). Validation, all
    `CredibilityWeightSetInvalid { which }` (`:1624-1724`): version 0; any change from the seeds while
    version < 2; any of the 16 positive-evidence rows negative (`:1020-1061`); false_positive_step > 0;
    overlay_missing_step > 0; co_open_same_technique_step outside [0, co_open_step]; benign_cadence > 0;
    known_bad_graded_budget < 0; liveness_timeout <= 0; route_candidate <= 0 or urgent < candidate;
    calibration not isotonic (each probability <= 1000, scores strictly increasing, probabilities
    non-decreasing). Caps and the prior are not bounded. Summary renders every field EXCEPT `calibration`
    (`:2381-2436`) -- see 3.5. The isotonic message contains a long run of spaces between "scores," and
    "non-decreasing" (source literal, `:1721`).
19. **`soc`** -> `soc.tiers` (Live, read each cycle when proposing a response).
    `{ p_low_milli: u16 (0), p_high_milli: u16 (1000) }` (`:620-656`). Meaning (`:622-633`): P >= p_high
    proposes the response including containment; p_low <= P < p_high investigate only; P < p_low noise.
    Default 0/1000 = investigate everything, license no containment. Validation: p_low > p_high or
    p_high > 1000 -> `SocTiersInvalid` (`:1570-1580`). Summary `p_low=.. p_high=..` (`:2356-2359`).
20. **`siem_writeback`** -> `siem_writeback` (Live per job).
    `{ enabled: bool (false), vendor: SiemVendor (splunk), host: String, stream: String,
    case_url_base: String, ceiling: Classification (Unclassified) }` (`:658-694`). Vendors and what
    `stream` means (`crates/cdb-types/src/siem.rs:15-69`): splunk = HEC sourcetype; sentinel =
    `<DCR immutable id>/<stream name>`; qradar = reference-data map name; elastic = index name; chronicle =
    `<customer id>/<log type>`. Validation only when enabled (`config_document.rs:696-722`, `:1581-1589`):
    blank host -> missing `host`; stream blank (after trim), or for sentinel/chronicle not `a/b` with both
    parts non-empty -> `stream`; `case_url_base` (trailing `/` trimmed) not starting `https://` or empty
    after it -> `case_url_base`; reported as `SiemWritebackIncomplete { vendor, missing }`. Ceiling
    default Unclassified means an enabled write-back writes nothing above Unclassified
    (`:676-680`). Summary (`:2367-2379`). The worker exists only when the boot stanza
    `connectors.siem.secret_ref` is set (`bootstrap.rs:851-880`; `crates/cdb-server/src/config.rs:1864-1933`),
    and `cdb-mkconfig` has no knob for it ("authored by hand", `cdb-mkconfig.rs:850-852`).

Knob-level rules (not sections) are in the violation table below.

### 3.3 All 40 `ConfigViolation` variants (exact Display text; trigger with line)

| Variant (decl line) | Message | Fires when (line) |
|---|---|---|
| LugExposureUnbounded (1864) | the LUG exposure is enabled with a zero cap or bucket | lug enabled and a cap/bucket is 0 (1729-1736) |
| LugThresholdOutOfRange (1867) | the LUG binding threshold exceeds 1000 permille | threshold > 1000 (1737-1739) |
| IdamCadenceOutOfRange (1871) | the IdAM connector is enabled with an out-of-range cadence | enabled and poll not 60..=86400 or full sync not 1..=168 (1740-1749) |
| MaxPayloadTooSmall (1874) | max payload {got} is below the minimum {min} | `max_payload < 1024` (`MIN_PAYLOAD`, :24; check 1449-1454) |
| ZeroSessionLifetime (1882) | the {which} session lifetime is zero | standard == 0 (`which`="standard") or break-glass == 0 ("break-glass") (1455-1464) |
| BreakGlassExceedsStandard (1888) | break-glass lifetime {break_glass} exceeds standard {standard} | break-glass > standard (1465-1470) |
| AdminWithoutRole (1896) | admin {identity} is assigned no roles | (1510-1515) |
| SsoGroupWithoutRole (1902) | SSO group {group} maps to no roles | (1516-1521) |
| ZeroMaintenanceCadence (1909) | the maintenance cadence is zero | (1471-1473) |
| ZeroRetentionWindow (1913) | the retention window is zero | time-travel window 0 (1474-1476) |
| ZeroLogRetentionWindow (1917) | the LOG retention window is zero | (1477-1479) |
| ZeroWakeSpecificityFloor (1922) | the wake specificity floor is zero | (1484-1486) |
| ZeroCursorLease (1926) | the cursor lease is zero | (1489-1491) |
| ZeroSessionLease (1929) | the session lease is zero | (1492-1494) |
| ZeroPreparedLease (1933) | the prepared-statement lease is zero | (1495-1497) |
| ZeroWorkspaceQuota (1937) | a workspace quota is zero | per-principal or per-tenant 0 (1501-1503) |
| WorkspaceQuotaPrincipalExceedsTenant (1941) | per-principal workspace quota {per_principal} exceeds per-tenant {per_tenant} | (1504-1509) |
| DuplicateEgressDestination (1950) | duplicate egress destination id {id:?} | (1522-1530) |
| DuplicateServedModel (1957) | duplicate served model {id:?}@{version:?} | (1541-1547) |
| IncompleteServedModel (1966) | served model {id:?}@{version:?} is missing its id, version, or region | (1532-1540) |
| NonPositiveDetectionBound (1975) | a detection watermark bound is not positive | (1548-1558) |
| SocNarrativeModelUnresolvable (1981) | the SOC-narrative model binding does not resolve: {0} | bound ref fails `resolve` (1559-1569) |
| SocTiersInvalid (1985) | the SOC tier thresholds p_low={p_low_milli} / p_high={p_high_milli} (milli) are not ordered within 0..=1000 | (1570-1580) |
| SiemWritebackIncomplete (1994) | the SIEM write-back ({vendor}) is enabled but `{missing}` is missing or malformed | (1581-1589) |
| DetectionRetentionUnbounded (2003) | detection retention is enabled with a zero {which} horizon | (1611-1623) |
| CredibilityWeightSetInvalid (2010) | the credibility weight-set is invalid: {which} | 11 distinct `which` texts (1624-1724) |
| QuerySurfaceUnbounded (2016) | the database query surface is enabled without a positive per-tenant bound | db query on and query limit or result limit 0 (1590-1597) |
| GraphTraversalUnbounded (2020) | graph traversal is enabled without positive expand, fanout, and AS-OF budgets | (1598-1604) |
| ApiExposureUnbounded (2024) | the frontend API is exposed without a positive per-client rate limit | (1604-1610) |
| AigRetentionUnbounded (2028) | the agent identity graph is enabled without a positive retention window | (1725-1728) |
| KeyIssuingNotDualControlled (2032) | the agent-key-issuing workflow is enabled without dual control | (1750-1752) |
| UnknownDecoderFamily (2035) | unknown decoder family {family} | (1753-1762) |
| UnknownSourceFormat (2042) | source {source_key} maps to unknown format {format} | (1763-1773) |
| BlankSearchableAttribute (2051) | a searchable-attribute key is blank | (1774-1779) |
| ZeroEmbeddingDimension (2055) | the embedding dimension is zero | (1780-1782) |
| BlankPinnedModel (2058) | the pinned model id is blank | (1783-1785) |
| RebuildCadenceBelowMaintenance (2063) | the rebuild cadence is finer than the maintenance cadence | (1786-1791) |
| SearchEnabledWithoutIndex (2067) | search is enabled with no index | (1792-1797) |
| EmbedderDimensionMismatch (2072) | pinned embedding dimension {pinned} does not match the bound embedder's {embedder} | `embedder_violations` only (1811-1822) |
| EmbedderModelMismatch (2083) | pinned model {pinned:?} does not match the bound embedder {embedder:?} | `embedder_violations` only; a pinned model equal to the default placeholder is exempt (1823-1832) |

The wire returns these as their Display strings, verbatim, in `violations: Vec<String>`
(`bootstrap.rs:5794-5800`, `handler.rs:4851-4858`). Knob rules with no violation: `max_workers`,
`cognition_admit_enrolled`, `result_chunk_rows`, `max_cursors_per_tenant`, `max_retained_tail_bytes`,
`cognition_max_connections`, `artifact_spot_check_limit`, `otlp_ingest_bytes_per_window` (0 sheds all
OTLP ingest, `config_model.rs:141-153`), `endpoint_classification`, `dual_control`. UNVERIFIED: the
runtime effect of 0 for `result_chunk_rows` / `max_cursors_per_tenant` (validation accepts it).

### 3.4 `from_profile(profile)`: what each profile's default document contains

`config_document.rs:1076-1143`. For EVERY profile: the knob fields take `default_for` values (table 2.2);
`sso_group_roles`, `admins`, `egress_destinations`, `served_models`, `disabled_decoder_families`,
`searchable_attributes` are empty; `query_exposure = QueryExposure::shipped_default()` (db query on,
100000 / 10000, vector/BM25/graph off, budgets 0; `:133-148`); `api_exposure`, `aig_exposure`,
`key_issuing` = closed defaults; `lug_exposure` = enabled with the TRD-35 caps; `idam_connector` =
disabled, 300 s / 24 h; `source_format_map = {tetragon: tetragon}`; `build_search` = local-deterministic /
1024 / 0 / all off; `embedder` = empty / 0; `detection_posture` = 300/120/600; `soc_narrative` = unbound;
`detection_retention` = disabled; `credibility_weights` = v1 seeds; `soc` = 0/1000; `siem_writeback` =
disabled splunk, Unclassified. **Only `profile`, `dual_control`, `session_standard_lifetime` and
`session_break_glass_lifetime` differ between the four profiles.** Every profile's document validates
(test `every_profile_default_document_validates`, `:3455`).

What a real node commits at first boot is NOT `from_profile` verbatim: `seed_document`
(`config_bringup.rs:32-75`) overrides `endpoint_classification`, `cognition_admit_enrolled`,
`dual_control` (**replaced by the stanza's list, empty unless `CDB_ADMIN_DUAL_CONTROL` is set**, so the
profile's dual-control default never reaches a real seed), `maintenance_cadence_secs` (from
`NodeConfig.maintenance.cadence_secs`), `admins`, `egress_destinations`, and `max_payload` / session
lifetimes only when the stanza carries a non-default value (the stanza's session default is `u64::MAX`,
`config.rs:780-801`, so the profile lifetimes apply). `cdb-mkconfig` cannot author a session policy or a
payload, so installer-built nodes get the profile lifetimes (Evaluation by default: 28800 / 3600).

### 3.5 Diff semantics and a gap

- `knob_changes(current, candidate)` lists every knob whose projected value differs, in `Knob::ALL`
  order (`config_document.rs:2134-2153`). `section_changes` lists every section whose `summarize()` text
  differs (`:2526-2546`). The claim: "Two documents render the same summary for a section iff that
  section is byte-for-byte unchanged" (`:2259-2263`).
- **Gap:** `render_weight_set` does not render `calibration` (`:2381-2436`). A calibration-map change
  that keeps the same `version` produces no section change, so it is invisible to the admin-plane
  dry-run/diff, to the wire `SETTINGS_HISTORY` / `SETTINGS_APPROVALS` `changed_keys` (both derive from
  the same rendering, `handler.rs:4877-4889`), and to the live-apply change detection
  (`reconfigure.rs:227-256`). Validation only forces `version >= 2` when a set differs from the v1
  seeds (`config_document.rs:1635-1644`), so a v5 -> v5 re-fit is valid. The existing test passes only
  because it also bumps the version (`config_document.rs:3350-3369`). The section-isolation test covers
  14 of the 20 sections (`:2958-3037`; not embedder, soc_narrative, detection_retention,
  credibility_weights, soc, siem_writeback).
- The Console also cannot display the calibration map at all: it is neither rendered nor typed on the
  wire (section 4).

---

## 4. The wire Settings verbs and their handlers

### 4.1 The ten verbs

| Wire request (query.rs) | Reply | Handler (handler.rs) | Tier required | Plan step |
|---|---|---|---|---|
| `SettingsRead(WireSettingsQuery)` (`SETTINGS_READ`) | `Settings(WireSettings)` | `settings_read` 4231-4292 | Admin or SecurityAudit (4244-4249) | SET.1/1b |
| `SettingsReports(WireSettingsReportsQuery)` (`SETTINGS_REPORTS`) | `SettingsReports` | `settings_reports` 4329-4366 | Admin or SecurityAudit (4346-4351) | SET.4 |
| `SettingsCommit(WireSettingsCommit)` (`SETTINGS_COMMIT`) | `SettingsCommitted` | `settings_commit` 4695-4772 | Admin (4712) | SET.2/2b |
| `SettingsPropose(WireSettingsCommit)` (`SETTINGS_PROPOSE`) | `SettingsProposed` | `settings_propose` 4811-4875 | Admin (4828) | SET.3 |
| `SettingsApprovals(WireSettingsApprovalsQuery)` (`SETTINGS_APPROVALS`) | `SettingsApprovals` | `settings_approvals` 4891-4955 | Admin or SecurityAudit (4908-4913) | SET.3 |
| `SettingsApprove(WireSettingsApprove)` (`SETTINGS_APPROVE`) | `SettingsCommitted` | `settings_approve` 4957-5037 | Admin (4975) | SET.3 |
| `SettingsHistory(WireSettingsHistoryQuery)` (`SETTINGS_HISTORY`) | `SettingsHistory` | `settings_history` 5047-5102 | Admin or SecurityAudit (5064-5069) | SET.5 |
| `SettingsRollback(WireSettingsRollback)` (`SETTINGS_ROLLBACK`) | `SettingsCommitted` | `settings_rollback` 5110-5188 | Admin (5127) | SET.5 |
| `SocSettingsRead(WireSocSettingsQuery)` (`SOC_SETTINGS_READ`) | `SocSettings` | `soc_settings_read` 5190-5227 | Admin or SecurityAudit (5206-5211) | C.9c |
| `SocSettingsCommit(WireSocSettingsCommit)` (`SOC_SETTINGS_COMMIT`) | `SocSettingsCommitted` | `soc_settings_commit` 5232-5315 | Admin (5249) | C.9c |

Enum variants: `crates/cdb-wire/src/query.rs:3725-3756` (requests), `:4365-4379` (replies); server
`Request` mirror `handler.rs:208-236`; dispatch `handler.rs:1170-1179`. There is **no diff verb** on the
wire (no `SettingsDiff`/`ConfigDiff` anywhere in `query.rs` or `handler.rs`); the admin plane has
`config-diff` (`admin.rs:2035-2059`).

### 4.2 Admission, delegation and the delegated Settings tier

- **Plane.** Every Settings request is on `WirePlane::Data` (`handler.rs:1391-1460`), so the peer must
  hold the Data grant. All ten are routed on the shared "read" path (`handler.rs:1083-1123`, `:1170-1179`);
  writes serialize in the store's commit sequencer (`crates/cdb-storage/src/commit.rs:121-133`).
- **Peer tier.** An mTLS peer (every network client, including the Console on the control plane) runs at
  `ExplainTier::User` (`crates/cdb-server/src/transport.rs:125-132`, used at `reactor.rs:1081`); only the
  loopback plaintext reference transport runs at Admin (`transport.rs:119-124`, `reactor.rs:1034`). So
  without a delegated tier every Settings op from an mTLS peer is refused.
- **Delegation.** `provision_admission` = `effective_delegated_session` + `single_shard_engine`
  (`handler.rs:2561-2569`). With an `operator` block the peer must hold the Delegation plane
  (`may_delegate`, `reactor.rs:1674`); principal and tenant must parse as UUIDs; the operator tenant must
  not be any control-plane peer's reserved service tenant. Each failure is a bare `Refused { Denied }`,
  not a Settings reply (`handler.rs:2256-2309`). A node with zero or several shards is refused
  (`StorageUnavailable` / `Internal`, `handler.rs:9224-9241`).
- **Delegated Settings tier (SET.4b).** `OperatorDelegation.settings_tier: Option<String>`
  (`query.rs:56-69`). `settings_tier()` (`handler.rs:4205-4229`): absent -> the session's tier; exactly
  `"SecurityAudit"` / `"Admin"` / `"Developer"` -> that tier; any other string (`"User"`, `"admin"`,
  typos) -> `User` (fail closed). It is honored only by these ten operations; every other operation keeps
  the peer's tier and clearance (`query.rs:62-66`; ledger SET.4b row). It is **not capped by the peer's
  own tier**: a Delegation-granted peer can assert Admin for Settings. This is an explicit stopgap
  ("Operator ruling 2026-09-25"), recorded as `DEF-RBAC-PERMISSION-MAP` (`docs/DEFERRED_LEDGER.md:1206-1217`:
  "today it trusts the delegating Console for principal, tenant and Settings tier alike"). The Console
  sets it only for `global-admin` sessions (`forgecentral/apps/bff/src/engine/principal.ts:59`,
  `forgecentral/apps/bff/src/engine/operator-engine.ts:674-685`).
- **Tier matrix.** Reads (READ, REPORTS, APPROVALS, HISTORY, SOC READ) need Admin or SecurityAudit;
  writes (COMMIT, PROPOSE, APPROVE, ROLLBACK, SOC COMMIT) need Admin. Developer and User are refused on
  all ten. A tier refusal is `refused: true` with an EMPTY explanation (e.g. `handler.rs:4237-4250`).
- **Committer attribution.** Wire commits are attributed to `console:<operator principal uuid>`
  (`handler.rs:4748`, `:5143`, `:5295`), proposals to the same string (`:4861`), approvals to
  `<proposer> approved-by <approver>` (`:5011-5015`), rollbacks to `console:<uuid> rollback-to <n>`
  (`:5165`).

### 4.3 `SETTINGS_READ`

Request `WireSettingsQuery { request_id, surface?: String, operator? }` (`query.rs:2337-2350`). Reply
`WireSettings` (`query.rs:2384-2413`):
- `version`: the store's latest commit version at read time (`handler.rs:4262-4263`), not the config's
  own commit version (those appear in history); `0` when nothing is committed, in which case the rows show
  the Federal fail-closed defaults (`handler.rs:4264-4267`).
- `rows`: every registry row in registry order, filtered to `surface` if given; an unknown surface is
  refused `"unknown settings surface"` (`handler.rs:4256-4260`, `:4270-4278`).
- `surfaces`: the 24 distinct registry surface labels, sorted (`handler.rs:4249-4255`).
- `dual_control_required`: the committed `dual_control` contains `tenant-config` (`handler.rs:4283-4285`).
- `section_values`: typed current values of `dual_control` (capability names), `egress_destinations`,
  `lug_exposure` (8 fields), `disabled_decoder_families`, `source_format_map`, `soc_narrative_model_ref`
  (always present, regardless of the surface filter) (`handler.rs:4457-4497`).
- `identity_values`: typed, read-only admins `{identity, roles (lowercase names, sorted), clearance tag}`
  sorted by identity, and SSO groups `{group, roles}` (`handler.rs:4295-4327`; `query.rs:2415-2444`).
- Row shape `WireSettingRow` (`query.rs:2351-2382`): key, surface, origin (`knob|section|env|const`),
  `value` (knob: `KnobValue::render`; section: `summarize`; env/const: absent) (`handler.rs:4164-4175`),
  value_type, default_value, bound, live_apply, change_via, ui_binding, summary, editable.
- **Editable rule** (`handler.rs:4176-4186`): `live_apply` is `Live` AND (origin is a knob OR the section
  is in `PATCHABLE_SECTIONS` = EgressDestinations, LugExposure, DisabledDecoderFamilies, SourceFormatMap,
  SocNarrative, `handler.rs:4445-4454`). The DTO doc still says editable means "a live knob with a scalar
  value ... capability-set knobs and sections are false" (`query.rs:2379-2381`); the code marks the
  capability-set knob and the 5 patchable sections editable. Result: **25 rows editable** (listed in 4.5).
  `soc.tiers` and `siem_writeback` are Live but read `editable: false` here; they are edited through
  `SOC_SETTINGS_COMMIT`.
- Value renderings to know: `governance.dual_control` shows a Rust Debug set such as `{KeyIssue,
  SecurityPolicyChange}` (`config_model.rs:329-337`) while `section_values.dual_control` uses the kebab
  names; `egress.destinations` shows `id=Secret` (Debug ceiling) while `section_values` uses lowercase
  tags; `credibility_weights.weight_set` omits the calibration map (3.5); `identity.admins` text is
  ambiguous (use `identity_values`).

### 4.4 `SETTINGS_COMMIT` (and the body shared with `SETTINGS_PROPOSE`)

Request `WireSettingsCommit { request_id, edits: [WireSettingEdit { key, value }], sections?:
WireSectionPatch, operator? }` (`query.rs:2446-2537`). Order of checks (`handler.rs:4695-4772`):

1. admission (4.2); 2. tier Admin; 3. `edits` empty AND `sections` absent, or more edits than registry
   rows (56) -> refused `"a commit must carry at least one edit or section patch, and at most every
   knob"` (`:4715-4721`); 4. read the committed document (`"the committed configuration could not be
   read"`); 5. **dual control**: if the committed `dual_control` contains `tenant-config` -> refused with
   `dual_control_required: true`, `"tenant-config is under dual control: propose and approve"`
   (`:4725-4736`; checked BEFORE any edit is examined); 6. build the candidate from the committed document
   (or the Federal default if none) (`:4774-4809`): each edit in order, then the section patch; any refusal
   refuses the whole batch with `refused_edits` and `"an edit was refused; nothing was committed"`
   (`:4737-4746`); 7. `RunningNode::commit_governed(candidate, "console:<uuid>")` (`bootstrap.rs:5784-5822`):
   `validate()` (violations -> `refused`, `violations`, `"the candidate did not validate"`), then
   `ConfigStore::commit_config`, then the live-apply fan-out; reply `version` (the config commit version)
   and `needs_restart`.

**Scalar edits** (`apply_setting_edit`, `handler.rs:4658-4693`): the key must be a registry key whose
origin is a knob whose live_apply is Live; the value is parsed by `KnobValue::parse` (2.1) and applied
with `with_knob`. The 19 scalar-editable keys and value formats:

| Key | Value on the wire | Document rule |
|---|---|---|
| `sessions.standard_lifetime_secs` | u64 seconds | != 0; >= break-glass |
| `sessions.break_glass_lifetime_secs` | u64 seconds | != 0; <= standard |
| `maintenance.cadence_secs` | u64 seconds | != 0; >= any non-zero `build_search.rebuild_cadence_secs` |
| `retention.time_travel_window_secs` | u64 seconds | != 0 |
| `retention.log_observation_window_secs` | u64 seconds | != 0 |
| `leases.cursor_secs` / `leases.session_secs` / `leases.prepared_secs` | u64 seconds | != 0 each |
| `workspace_quota.per_principal` / `workspace_quota.per_tenant` | u64 | != 0; per_principal <= per_tenant |
| `query_surface.enabled` | `true`/`false` | if true, query limit and result limit > 0 |
| `query_surface.per_tenant_result_limit` | u32 (u64 > 2^32-1 -> `kind_mismatch`) | > 0 while query surface enabled |
| `detection_posture.wake_specificity_floor_milli` | u64 milli-nats | != 0 |
| `observability.otlp_ingest_bytes_per_window` | u32 bytes | none (0 sheds all OTLP-plane ingest) |
| `query_surface.result_chunk_rows` | u32 | none |
| `query_surface.max_cursors_per_tenant` | u32 | none |
| `query_surface.max_retained_tail_bytes` | u32 bytes | none |
| `cognition.max_connections` | u32 | none (effectively boot-bound, 1.4) |
| `maintenance.artifact_spot_check_limit` | u32 | none |

`governance.dual_control` is a knob but its kind is not scalar: a scalar edit is refused `unparseable`;
it is edited only through `sections.dual_control`.

**Section patch** `WireSectionPatch` (`query.rs:2495-2520`; applied by `apply_section_patch`,
`handler.rs:4572-4648`). Each present field REPLACES the whole section; absent = unchanged; each patched
section is re-checked against the registry live status at commit time (`live_or_refused`,
`handler.rs:4500-4515`: Live ok; PendingSubsystem -> `pending_subsystem`; anything else -> `boot_bound`).

| Patch field | Wire shape | Parse refusals (cause, detail) | Document validation afterwards |
|---|---|---|---|
| `dual_control` | `[String]` capability names | unknown name -> `unparseable`, detail = the name (`handler.rs:4517-4544`). Valid names (exact, kebab): `read-status, server-lifecycle, storage-manage, maintenance-manage, security-policy-change, key-issue, identity-manage, artifact-approve, tenant-config, config-read, audit-read, audit-export` (`capability.rs:88-126`) | none |
| `egress_destinations` | `[{ id, ceiling }]` | ceiling not one of `unclassified,internal,confidential,restricted,secret` -> `unparseable`, detail = the tag (`handler.rs:4546-4570`, `:6113-6123`) | `DuplicateEgressDestination` |
| `lug_exposure` | all 8 fields (`query.rs:2465-2484`), whole struct required | none | `LugExposureUnbounded`, `LugThresholdOutOfRange` |
| `disabled_decoder_families` | `[String]` (duplicates collapse) | none | `UnknownDecoderFamily` (26 families, 3.2 item 9) |
| `source_format_map` | `[{ source, format }]` | the same `source` twice -> `duplicate`, detail = the source (`handler.rs:4624-4640`) | `UnknownSourceFormat` (40 labels, 3.2 item 10) |
| `soc_narrative_model_ref` | `String`; trimmed; empty unbinds (`handler.rs:4642-4648`) | none | `SocNarrativeModelUnresolvable` (must be a registered TextGeneration `<id>@<version>` in the committed `served_models`) |

No wire field exists for `identity.*`, `embedder`, `api_exposure`, `aig_exposure`, `key_issuing`,
`searchable_attributes`, `build_search`, `served_models`, `detection_posture`, `detection_retention`,
`idam_connector`, `credibility_weights`; `soc` and `siem_writeback` go through `SOC_SETTINGS_COMMIT`.
A field for `detection_posture.watermarks` was built and removed because the live check always refused
it (ledger SET.2b row).

**Every refusal cause** (`WireSettingRefusal.cause`, documented at `query.rs:2538-2549`):

| Cause | When |
|---|---|
| `unknown_key` | edit key is not a registry key (`handler.rs:4666-4670`) |
| `not_a_knob` | key exists but its origin is a section or env row (`:4671-4673`) |
| `pending_subsystem` | knob or patched section is `PendingSubsystem` (`:4676-4678`, `:4506`) |
| `boot_bound` | knob or patched section is BootBound (or Env/Const, or not found) (`:4679`, `:4507`) |
| `unparseable` | `KnobValue::parse` failed (incl. any scalar edit of `governance.dual_control`), an unknown capability name, or an unknown ceiling tag (`:4680-4682`, `:4533-4540`, `:4557-4563`) |
| `kind_mismatch` | `with_knob` failed; in practice `RangeExceeded` for a Count above `u32::MAX` on a u32-backed knob (`:4683-4686`, `config_document.rs:1229-1235`) |
| `duplicate` | the same key twice in `edits` (`:4784-4791`) or the same source twice in `source_format_map` (`:4624-4640`) |

Other refusals on the Settings replies: `dual_control_required` (above); `violations` (verbatim
ConfigViolation Display strings, 3.3); `approval_refused` = `self_approval` / `unknown_proposal` / `stale`
(4.6); `explanation` strings quoted in each subsection.

**Live-apply fan-out and `needs_restart`.** `commit_governed` commits, THEN runs
`admin::live_apply_registry(...).reconfigure(prev, candidate)` (`bootstrap.rs:5802-5813`), the same
registry the admin executor uses (`admin.rs:50-66`, `:731-760`). Three handlers push live values:
`maintenance.cadence_secs` -> `MaintenanceTrigger::set_cadence_secs` (`admin.rs:68-86`);
`retention.time_travel_window_secs` -> every shard's `set_retention` (seconds x 1000) (`admin.rs:88-113`);
`workspace_quota.*` -> `SessionRuntime::set_quota` (`admin.rs:115-142`). Every other Live key is read by
its consumer from the committed document ("committing is the apply", `reconfigure.rs:13-19`, `:201-222`).
`needs_restart` lists changed keys whose registry status is BootBound or PendingSubsystem, flattened to
key strings (the reason is dropped on the wire) (`reconfigure.rs:201-222`; `bootstrap.rs:5814-5821`).
It is normally empty for a Console commit (the wire refuses those keys) but is populated (a) by the first
commit on a node with no committed document, where every document-backed key counts as changed
(`reconfigure.rs:241-250`: 7 BootBound + 15 Pending = 22 keys), and (b) by rollbacks/approvals of whole
documents that differ in such sections. It is never populated for the four mislabeled keys in 1.4.

**Concurrency.** A config commit is a blind whole-document write ("a direct serial commit ... no read-set
validation runs", `crates/cdb-storage/src/commit.rs:121-133`) and `settings_commit` does not compare the
base it built from with the document at commit time, so two concurrent writers (two Console sessions, or
the Console and `cdb-actl`) that built from the same base are last-writer-wins and the earlier change is
silently reverted. UNVERIFIED by execution; only proposals carry a staleness check (4.6).

### 4.5 What the Console can edit (27 of 56 registry rows)

- Via `SETTINGS_COMMIT.edits` (19): the table in 4.4.
- Via `SETTINGS_COMMIT.sections` (6 rows): `governance.dual_control`, `egress.destinations`,
  `lug.exposure`, `normalization.disabled_decoder_families`, `normalization.source_format_map`,
  `soc_narrative.model_ref`.
- Via `SOC_SETTINGS_COMMIT` (2): `soc.tiers`, `siem_writeback`.
- Display-only (29): BootBound `admin_endpoint.classification`, `admin_endpoint.max_payload_bytes`,
  `identity.sso_group_roles`, `identity.admins`, `workers.max`, `embedder.binding`,
  `cognition.admit_enrolled_devices`; Pending `query_surface.vector_search_enabled`,
  `query_surface.bm25_search_enabled`, `query_surface.graph_traversal_enabled`,
  `query_surface.per_tenant_query_limit`, `graph_budgets.expand/.fanout/.as_of`, `api.exposure`,
  `aig.exposure`, `key_issuing.exposure`, `normalization.searchable_attributes`, `build_search.posture`,
  `served_models.registry`, `detection_posture.watermarks`, `detection_retention.horizons`; Live but not
  patchable `idam.connector`, `credibility_weights.weight_set`; Env rows (no value shown)
  `retention.raw_days`, `observability.telemetry_enabled`, `cognition.context_sources`,
  `cognition.frontier_providers`, `cognition.add_destinations`.

### 4.6 Dual control: `SETTINGS_PROPOSE`, `SETTINGS_APPROVALS`, `SETTINGS_APPROVE`

- **The only capability the wire consults is `tenant-config`** (`handler.rs:4725-4736`, `:5147-5150`,
  `:5259-5262`; `dual_control_required` fields `:4136-4138`, `:4283-4285`). No profile default contains it
  (`config_model.rs:569-584`), and the first-boot seed takes the stanza's list (`CDB_ADMIN_DUAL_CONTROL`,
  empty by default in both `cdb-mkconfig` and the installer: `cdb-mkconfig.rs:542-551`,
  `installer/lib/common.sh` `CDB_ADMIN_DUAL_CONTROL:=`). **So Console Settings writes are single-person by
  default on every profile.** Adding `tenant-config` through the Console is allowed as a direct commit
  (the check reads the base); removing it then needs propose + approve. The admin plane gates config ops on
  the same capability (`capability.rs:273-278`), but with the policy captured at endpoint start (1.4).
- **PROPOSE** (`handler.rs:4811-4875`): same body and candidate builder as COMMIT; no dual-control
  precondition; the candidate must validate (else `violations`, `"the candidate did not validate"`); stored
  as `AdminOp::ConfigCommit(candidate)` with `ProposalBase::Committed(<current doc>)` and proposer
  `console:<uuid>` in the node's single in-memory store. Reply `WireSettingsProposed { proposal,
  refused_edits, violations, refused, explanation }` (`query.rs:2649-2667`).
- **APPROVALS** (`handler.rs:4891-4955`): every pending config proposal from either plane:
  `{ proposal, proposer, proposed_at_ms, changed_keys (vs the proposal's base, same renderer as READ),
  stale (base != current committed doc) }` (`query.rs:2679-2693`).
- **APPROVE** (`handler.rs:4957-5037`; `crates/cdb-admin/src/dual_control.rs:236-275`): unknown or
  already-consumed id -> `approval_refused: "unknown_proposal"`; approver principal string equal to the
  proposer's -> `"self_approval"` (the proposal stays pending); base no longer the committed document ->
  `"stale"` and the proposal is DISCARDED; otherwise committed through `commit_governed` under
  `<proposer> approved-by <approver>`, reply `dual_control_required: true`. A released candidate that no
  longer validates -> `"the approved candidate did not validate"`.
- **Store properties.** One `Arc<PendingApprovals>` created at boot whether or not the admin endpoint runs
  (`bootstrap.rs:713`), shared with the admin listener (`admin.rs:2575-2577`). In memory: a restart drops
  every pending proposal; no expiry; no reject/withdraw verb (`dual_control.rs:150-154`; plan "Deferred,
  stated", `docs/implementation-plans/IP-CONSOLE-SETTINGS-WIRE.md:74-80`). The staleness check and the
  commit are not one atomic step, and a wire approval is not written to the admin audit chain (ledger
  SET.3 "Stated limits"). Distinctness is by principal string, not by person: a person holding both a
  Console login and a `cdb-actl` certificate is two principals. Admin-plane approvals commit under the
  proposer's identity only (`lifecycle.rs:806-810`).
- **Gaps under dual control.** `SETTINGS_ROLLBACK` becomes a proposal (4.7). `SOC_SETTINGS_COMMIT` is
  refused ("propose and approve on the admin plane") and `WireSectionPatch` has no `soc`/`siem_writeback`
  fields, so **with `tenant-config` under dual control the Console cannot change SOC tiers or the SIEM
  write-back at all**; only an admin-plane `config-propose` of a whole document can.

### 4.7 `SETTINGS_HISTORY` and `SETTINGS_ROLLBACK`

- **HISTORY** (`handler.rs:5040-5102`; store walk `config_store.rs:175-222`): `limit` 0 -> 20, capped at 100.
  Versions newest first: `version` (the config commit version), `principal` (recorded in the same commit
  since SET.5; absent for older commits), `at_ms` (0 if unrecorded), `changed_keys` (registry keys whose
  rendering differs from the previous version; for the oldest listed version, compared with the Federal
  default only if the walk reached the true beginning, else empty). `complete` is false when the limit or
  the retention floor stopped the walk. Principals seen: `bootstrap` (first-boot seed,
  `config_bringup.rs:22`), `console:<uuid>`, `console:<uuid> rollback-to <n>`, `<proposer> approved-by
  <approver>`, and admin-plane identities (e.g. the installer's `cdb-actl config-commit` calls, 5.6).
- **No old/new values.** History names changed keys only, `SETTINGS_READ` has no as-of parameter
  (`query.rs:2337-2350`), and there is no diff verb, so the Console cannot show a prior value.
- **Retention.** Config versions live in the Data keyspace and are reclaimed by the time-travel retention
  window like any data (`config_store.rs:10-12`; MVCC GC `crates/cdb-storage/src/mvcc.rs:1360-1376`),
  default 7 days (`retention.time_travel_window_secs`). History and rollback cannot reach past it.
- **ROLLBACK** (`handler.rs:5110-5188`): `to` is a store version; the document as of `to` is read with
  `config_as_of`. Refusals: `"the configuration could not be read"`, `"no configuration is retained at
  that version"`, `"that version is already the committed configuration"`. Under `tenant-config` dual
  control it records a proposal against the current document (reply `proposal`, `dual_control_required`).
  Otherwise it commits through `commit_governed` (validation and the live-apply fan-out; the admin
  plane's `config-rollback` skips both the fan-out and needs_restart, `admin.rs:2061-2075`,
  `lifecycle.rs:515-523`); a document that no longer validates -> `"that version no longer validates"`
  plus `violations`. Rolling back restores the WHOLE document, including sections the wire cannot patch.

### 4.8 `SOC_SETTINGS_READ` and `SOC_SETTINGS_COMMIT`

- **READ** (`handler.rs:5190-5227`, projection `:4116-4160`): `version` (store latest; 0 if nothing
  committed), `tiers { p_low_milli, p_high_milli }`, `siem_writeback { enabled, vendor tag, host, stream,
  case_url_base, ceiling tag }`, `narrative_model_ref` (empty = unbound), `dual_control_required`, and
  `registry`: the rows whose `ui_binding` starts with `console:settings/soc/` (only `soc.tiers` and
  `siem_writeback`; `soc_narrative.model_ref` is bound at `console:settings/soc_narrative/...`), shaped as
  `WireConfigSettingRow` (key, value_type, default_value, bound, live_apply, ui_binding, summary)
  (`query.rs:2720-2803`). A tier refusal or a store read error returns `refused: true` with no explanation.
- **COMMIT** (`handler.rs:5232-5315`): Admin; body `{ tiers?, siem_writeback? }` (each a whole section;
  every field required when present, `query.rs:2733-2757`, `:2805-2820`). Order: tier; read the committed
  document (Federal default if none); `tenant-config` dual control -> refused with
  `dual_control_required`; vendor must be exactly `splunk|sentinel|qradar|elastic|chronicle` else
  `"unknown SIEM vendor"`; ceiling tag else `"unknown classification ceiling"`; then `commit_governed`
  (validation includes `SocTiersInvalid`, `SiemWritebackIncomplete`, and any other violation already in
  the document). Reply `{ version, dual_control_required, violations, refused, explanation }`
  (`query.rs:2822-2838`); `needs_restart` is discarded (`handler.rs:5298-5302`). There is no registry
  live check here (both sections are Live). An empty body still writes a new config version (no no-op
  detection; code reading).
- The narrative binding is edited through `SETTINGS_COMMIT.sections.soc_narrative_model_ref`, not here.
- Enabling the write-back in the Console writes nothing unless the boot stanza
  `connectors.siem.secret_ref` names a credential file (worker started at boot only then,
  `bootstrap.rs:851-880`); a committed-enabled write-back with an unreadable credential fails the boot
  (`bootstrap.rs:869-884`).

### 4.9 `SETTINGS_REPORTS`: every field and what it means

Request `{ request_id, reports: [name], operator? }` with names from `SETTINGS_REPORT_NAMES` = `server,
connectivity, security, telemetry, key_issuing, egress` (`query.rs:2197-2220`). Empty list ->
`"name at least one report"`; unknown -> `"unknown report \"<name>\""` (`handler.rs:4352-4361`). A node
without an admin endpoint answers `admin_plane: false` with no reports and `refused: false`
(`handler.rs:4362-4364`). Only requested reports are computed (`handler.rs:4370-4441`); the security
report verifies the whole audit chain, so it is the expensive one (`query.rs:2207-2210`). All reports are
computed by the admin plane's own executor, cloned at endpoint start (`admin.rs:2570`).

| Report.field | Meaning and source |
|---|---|
| server.shards | number of shards the node hosts (`admin.rs:2530`, `:1013-1023`) |
| server.serving | `shards > 0` at endpoint start (`admin.rs:494-497`, `:2530`) |
| server.durable | `NodeConfig.durability` is Durable (`admin.rs:261-268`) |
| server.maintenance_enabled | `NodeConfig.maintenance.enabled` at boot (`admin.rs:264`) |
| server.maintenance_cadence_secs | **the boot `NodeConfig` value, captured once** (`admin.rs:265`, `:690-697`); it does NOT follow a committed/live cadence change (the live engine does, `admin.rs:68-86`; `bootstrap.rs:4253-4268`) |
| server.max_payload | the effective (committed) admin payload at endpoint start (`bootstrap.rs:945`, `admin.rs:266`) |
| server.version | `CARGO_PKG_VERSION` of cdb-server (`admin.rs:1021`) = the workspace version `0.0.0` (`Cargo.toml:47-48`, `crates/cdb-server/Cargo.toml:4`) |
| connectivity.listen_addr | the ADMIN endpoint's listen address (e.g. `127.0.0.1:7440`), not the wire seam or control plane (`admin.rs:2540-2543`) |
| connectivity.mutual_tls | hard-coded `true` (architectural invariant) (`admin.rs:1026-1034`) |
| connectivity.identities_bound | number of admin assignments at endpoint start (`admin.rs:2540-2543`) |
| connectivity.post_quantum_kx | hard-coded `true` (`admin.rs:1034`) |
| connectivity.crypto_provider | constant `"aws-lc-rs"` (`crates/cdb-mtls/src/lib.rs:27`) |
| connectivity.fips_module | `cfg!(feature = "fips")` build flag (`crates/cdb-artifact/src/lib.rs:31-35`) |
| security.classification | committed `endpoint_classification` (Unclassified if none) (`admin.rs:1057-1063`) |
| security.audit_head_version / audit_entries / audit_chain_verified | the store commit audit chain: head commit version, entry count, full verification result (`admin.rs:1064-1076`) |
| security.artifacts_spot_checked / artifact_spot_failures | a bounded artifact sample (size = committed `artifact_spot_check_limit`) and how many failed their integrity posture (`admin.rs:2427-2470`) |
| security.template_artifacts | full-scan count of the template-era defect fingerprint (0 when healthy); the id range is not on the wire (`admin.rs:2386-2400`; `handler.rs:4390-4401`) |
| telemetry.enabled / grpc_addr / http_addr / queue_capacity / tenants_bound | the OTLP ingest posture: live from the ingest reconfigure trigger when ingest was enabled at boot, else the boot snapshot (`admin.rs:1811-1834`, `:282-292`; `bootstrap.rs:5490-5499`). Seam-only ingest shows enabled with empty addresses and 0 tenants (`cdb-mkconfig.rs:430-442`) |
| key_issuing.enabled / dual_control_required / key_validity_secs | the committed `key_issuing` section (committed intent of an unbuilt subsystem) (`admin.rs:1307-1317`) |
| egress[] { id, ceiling } | the committed egress destinations (`admin.rs:1219-1230`) |

### 4.10 Side effects of Console-editable settings on the Console itself

- `query_surface.enabled = false` closes almost every delegated Console read: the committed query
  exposure gates LIST_AGENTS/PRINCIPALS/GROUPS, object and policy reads, every SOC incident read
  (list, detail, telemetry, audit, notes, report, weekly, UEBA, impact, narrative), DETECT_SUMMARY, VTZ
  tree/detail, entity decisions/connections, LOG query/export/explain, connectivity, usage overview and
  QUERY_SUBMIT (`handler.rs:2188-2194`, `:2430-2448`, callers at `:2392`, `:2458`, `:2504`, `:2984`,
  `:3013`, `:3155`, `:3195`, `:3274`, `:3314`, `:3707`, `:3770`, `:3924`, `:3976`, `:4059`, `:5317`,
  `:5482`, `:5764`, `:5879`, `:5930`, `:6519`, `:6572`, `:7124`, `:7238`, `:7401`, `:7562`, `:7635`,
  `:7698`, `:7753`, `:7834`, `:8831`). The Settings verbs are not gated by it, so it can be turned back on.
- `query_surface.per_tenant_result_limit` is a hard ceiling on those reads; over it the read refuses
  `LimitExceeded` rather than truncating (e.g. `handler.rs:2410-2414`).
- Leases are read per operation (`handler.rs:2196-2216`); cursor caps at cursor open (`:2225-2245`); the
  OTLP budget at each per-connection window roll (`reactor.rs:248-263`).
- `governance.dual_control` + `tenant-config` stops direct Console commits (4.6).

---

## 5. Boot configuration (NodeConfig, env, `cdb-mkconfig`, installer)

Console visibility legend used below: **EDIT** = the boot value seeds a committed setting on a fresh node
that the Console can then edit (the env value never re-applies after first boot); **DISPLAY** = visible
read-only through a Settings verb (a report field, a BootBound/Pending row value, or an env registry row
that shows no value); **NONE** = not visible through any of the ten Settings verbs (it may appear on
another Console surface; that is outside this slice and marked UNVERIFIED where relevant).

### 5.1 How a node reads its configuration

- Command line: `cdb --config <node.cbor> [--data-dir <dir>]`; no other flags (`crates/cdb-server/src/lib.rs:64-110`;
  `main.rs:56-66`).
- `NodeConfig::from_cbor` decodes and validates fail-closed; `validate` is private and is called only
  there (`crates/cdb-server/src/config.rs:2044-2057`, `:2068-2170`). `to_cbor` does NOT validate
  (`config.rs:2058-2066`).
- Placeholder tokens refused in security-relevant fields: empty, `CHANGE_ME`, `changeme`, `TODO`,
  `<set-me>`, `placeholder` (case-insensitive, trimmed) (`config.rs:19-28`, `:2348-2358`).

NodeConfig stanzas (`config.rs:1952-2031`) and their boot validation:

| Stanza | Key fields and defaults | Boot validation (fail closed) |
|---|---|---|
| top level | `data_dir`, `listen_addr`, `replicas`, `durability` (`Ephemeral` or `Durable { memtable_budget, fsync_window_ms: Option (None = GroupCommit 2 ms, 0 = per-commit) }`), `regions[] {slug, tags}`, `shards[] {region, group, shard, signing_key_ref}` (`config.rs:30-76`) | shards non-empty; replicas >= 1; each shard's `signing_key_ref` and `region` non-placeholder and region declared (`config.rs:2070-2103`); a non-loopback `listen_addr` requires wire mTLS (`:2141-2155`) |
| `object_store` | `subdir` "objects" (`:78-92`) | none |
| `maintenance` | `cadence_secs` 60, `enabled` true (`:94-127`) | cadence != 0 (`:2076-2080`) |
| `ingest` | `enabled` false, `seam_only` false, `grpc_addr`, `http_addr`, `accept_json` false, `tls {ca, server_cert, server_key}`, `tenants[] {identity, tenant}`, `queue_capacity` (0 in the derived Default), `classification` Unclassified, `retention {horizon_secs 604800, max_batch 4096, raw_days 5}`, `non_cyber_routing` false (`:129-250`) | when enabled: `raw_days` != 0; seam-only needs only `queue_capacity` != 0; otherwise both addresses parse, TLS triple present, queue != 0, tenant map non-empty, no nil tenant, no duplicate identity (`:2274-2346`) |
| `detection` | `enabled` false, `emit_baselines` false, `observation_window_secs` 0 (= 1 h), `rule_pack_path`, `indicator_pack_path`, `sigma_rules_dir` (absent = 18 bundled fixtures), `source_detect_enabled` false, `source_observation_cap` 0, `event_driven_enabled` **true**, `warninglist_dir`, `indicator_trigger_enabled` false, `indicator_confidence_floor` (absent = HIGH), `episode_mode` false, `content_pack_dir` (absent = data_dir/content-packs), `content_pack_allow_root_disk` false, `content_pack_entitlements` [] (`:367-488`) | when enabled: window >= 0; `sigma_rules_dir` requires `source_detect_enabled`; floor tag parses (`:2107-2130`); unreadable/empty corpus, pack or warninglist dirs fail at bootstrap (doc `:410-418`, `:449-453`) |
| `observability` | `detection_trace` false (`:351-366`) | none |
| `agent` | `enabled` false, `addr`, `tls`, `agents[] {identity, source, tenant, workspace}`, `governor_grants[]`, `classification` Unclassified, `lease_ttl_secs` 3600 (`:300-349`) | loopback-only address (`:2167`, `:2176-2192`); authorities allow-listed at bootstrap (`:278-289`) |
| `admin` | `enabled` false, `addr`, `tls`, `admins[] {identity, roles, clearance}`, `classification` Unclassified, `max_payload` 65536, `dual_control[]` [], `session {standard_lifetime, break_glass_lifetime}` both `u64::MAX`, `profile` Evaluation, `enrollment {trusted_proxies, pinned_issuers, acr_to_aal, required_aal, group_roles, clearance}` (`:519-622`, `:773-819`) | when enabled: parseable non-placeholder addr, TLS triple, >= 1 admin, unique non-placeholder identities, each with a role (`:821-887`); loopback-only (`:2169`) |
| `cognition` | `enabled` false, `addr`, `tls`, `agents[]`, `admit_enrolled_devices` false, `classification` Unclassified, `destinations[] {id, ceiling}`, `frontier_providers[] {destination, provider ollama/anthropic/openai, host, port, credential_file}`, `context_sources[]` (file_tree / agent_vectors / memory), `served_models[] {id, version, capability, ceiling, region}`, `frontier_host` 127.0.0.1, `frontier_port` 11434, `mcp_host` 127.0.0.1, `mcp_port` 8090, `mcp_path` /mcp, `max_payload` 1048576, `lease_ttl_secs` 3600, `frontier_timeout_secs` 120, `frontier_max_tokens` 65536, `mcp_timeout_secs` 30 (`:945-1193`) | when enabled: addr, TLS, agents or `admit_enrolled_devices`, unique agents, >= 1 unique destination, external providers need a `credential_file` (`:1195-1302`); loopback-only (`:2168`) |
| `flow` | `enabled`, `udp_addr`, `exporters[] {ip, tenant, classification}`, numeric tunables (0 = collector default), `suspicious_ports`, `dtls_enabled` (`:1304-1357`) | when enabled: addr parses, >= 1 exporter with a valid IP, DTLS refused (`:2239-2272`) |
| `wire` | `tls`, `peers[] {identity, tenant, clearance, grant[] (Data/Agent/Cognition/Otlp/Delegation)}`, `enrolled_device_grant` default [Data, Agent, Cognition, Otlp], `enrolled_role_grants {role: planes}` {}, `lease_ttl_secs` 3600 (`:1359-1509`) | when any TLS path or peer is set: TLS triple and >= 1 unique non-placeholder peer (`:2195-2237`, `:1581-1592`) |
| `control_plane` | `enabled` false, `addr` (may be network-facing), `tls`, `peers[]`, `lease_ttl_secs` 3600 (`:1511-1579`) | when enabled: addr parses, TLS triple, >= 1 unique peer (`:1538-1578`) |
| `enrollment_bootstrap` | `enabled` false, `addr`, `server_cert/key`, `idp_keys[] {kid, n_b64u, e_b64u}`, `audience`, `groups_claim`, `fed` (EnrollmentConfig), `ca {host, port, ca_root, provisioner_name, provisioner_kid, signing_key, timeout_secs 30}`, `ek_roots[]`, `attestation_nonce_b64u`, `policy {required_capability, validity_secs, require_cnsa_floor, require_attestation true, require_prior_admission false}`, `tenant`, `classification`, `issuer_label`, `role_bearing_cns[]` (`:622-771`) | when enabled: non-nil tenant; `validity_secs` 1..=604800 (`MAX_ENROLLMENT_CERT_VALIDITY_SECS`, `:890`); CNSA floor required; CA timeout != 0 (`:892-942`) |
| `connectors.ms_graph` | `enabled`, `endpoint` AlertsV2, `tenant_id`, `client_id`, `client_secret_ref`, `poll_interval_secs` 60, `initial_backfill_secs` 86400, `tenant`, `classification`, `reports {sign_ins, directory_audits, risk_detections}` (`:1594-1727`) | when enabled: ids and secret ref present, poll != 0 (`:1694-1726`) |
| `connectors.auth0` | `enabled`, `domain`, `client_id`, `client_secret_ref`, `audience` ("" derives `https://{domain}/api/v2/`), `poll_interval_secs` (serde default 300), `full_sync_cadence_hours` (serde default 24), `tenant`, `classification` (`:1723-1835`) | when enabled: domain/client/secret present, tenant non-nil, poll 60..=86400, full sync 1..=168 (`:1784-1812`) |
| `connectors.siem` | `secret_ref` "", `port` 443, `plaintext` false, `timeout_secs` 20 (`:1864-1933`) | when `secret_ref` set: port and timeout != 0 (`:1916-1933`) |
| `max_workers` | 0 = auto (`:2017-2024`) | none |
| `embedder` | `tei_endpoint` "", `pipeline_width` 0 (`:1935-1950`) | none |

### 5.2 Environment read by the running `cdb` process

| Var | Default | Validation | Effect | Console |
|---|---|---|---|---|
| `CDB_OBSERVE` | unset = on | unset or `1` = JSON-line observer to stderr; `0` or empty = off; anything else = off with a warning (`main.rs:24-49`) | structured telemetry | DISPLAY: `observability.telemetry_enabled` row, no value |
| `CDB_MAX_WORKERS` | must be unset | set at all -> the node refuses to start with guidance (`env_policy.rs:20-45`, `main.rs:55`) | none (retired) | n/a |
| `CDB_EMBED_TEI` | unset | none; used only if neither the committed `embedder.tei_endpoint` nor `NodeConfig.embedder.tei_endpoint` is set (`bootstrap.rs:449-465`) | TEI endpoint `host:port` (port default 9090) | NONE (the committed row shows the committed value only) |
| `CDB_EMBED_PIPELINE` | unset | must parse as usize >= 1 else ignored (`bootstrap.rs:466-478`) | batched-embed depth | NONE |

The installer's `/etc/cdb/cdb.env` also sets `CDB_DATA_DIR`, `CDB_LISTEN`, `CDB_REGION`,
`CDB_SIGNING_KEY_REF` and `TMPDIR` (`50-config.sh:106-114`); the node does not read those four `CDB_*`
names (they are `cdb-mkconfig` inputs), so they are inert at run time. Other `CDB_*` names in the repo
belong to dev/validation tools (`cdb-validate`, `cdb-seed`) and tests (e.g. `CDB_WT_STREAM`,
`CDB_ANTHROPIC_API_KEY`) and are not node configuration (`crates/cdb-validate/src/main.rs`,
`crates/cdb-seed/src/main.rs:61-146`, `crates/cdb-agent/src/frontier_https.rs:367,385`).

### 5.3 Every `cdb-mkconfig` env var (`crates/cdb-server/src/bin/cdb-mkconfig.rs`)

Helpers: `env_req` = required and non-empty; `env_or`/`env_opt` treat an empty value as unset;
`env_u64/u32/usize` fail on a set-but-unparsable value (`cdb-mkconfig.rs:133-168`). Booleans use Rust
`bool` parsing (exactly `true`/`false`). Classifications are case-insensitive words
(`:172-183`). Stanzas are enabled by the presence of one trigger var. The authored file is NOT validated
by `cdb-mkconfig` itself despite its comments (`cdb-mkconfig.rs:1`, `:16`, `:1358`, `:1401` claim
`to_cbor` validates; it does not, `config.rs:2058-2066`); only the explicit dependency checks at
`:1143-1160` run. Errors surface when the node boots.

**Base and topology** (`build`, `:1102-1219`)

| Var (line) | Default | Validation | Sets | Console |
|---|---|---|---|---|
| CDB_REGION (1103) | us-east-1 | none | `regions[0].slug`, `shards[0].region` | NONE |
| CDB_GROUP (1104) | 1 | u64 | `shards[0].group` | NONE |
| CDB_SHARD (1107) | 1 | u64 | `shards[0].shard` | NONE |
| CDB_SIGNING_KEY_REF (1112) | required | boot: not a placeholder | `shards[0].signing_key_ref` (recorded metadata; the node signs with the reference ML-DSA-87 signer, `installer/README.md` "Prerequisites") | NONE |
| CDB_REGION_TAGS (1113) | empty | comma list | `regions[0].tags` | NONE |
| CDB_MEMTABLE_BUDGET (1125) | 67108864 | usize | `durability.Durable.memtable_budget` | NONE |
| CDB_FSYNC_WINDOW_MS (1131) | unset (GroupCommit 2 ms) | u64; 0 = per-commit fsync | `durability.Durable.fsync_window_ms` | NONE |
| CDB_MAINTENANCE_ENABLED (1143) | true | bool | `maintenance.enabled` | DISPLAY `server.maintenance_enabled` |
| CDB_DATA_DIR (1163) | /var/lib/cdb | none | `data_dir` | NONE |
| CDB_LISTEN (1164) | required | boot: non-loopback needs wire mTLS | `listen_addr` (the wire seam) | NONE |
| CDB_REPLICAS (1165) | 1 | u32; boot >= 1 | `replicas` | NONE |
| CDB_OBJECT_SUBDIR (1183) | objects | none | `object_store.subdir` | NONE |
| CDB_MAINTENANCE_CADENCE_SECS (1186) | 60 | u64; boot != 0 | `maintenance.cadence_secs`; seeds committed `maintenance.cadence_secs` on a fresh node (`bootstrap.rs:4185-4192`) | EDIT (committed knob); report `server.maintenance_cadence_secs` keeps showing this boot value |
| CDB_OBSERVE_DETECTION_TRACE (1203) | false | bool | `observability.detection_trace` | NONE |
| CDB_MAX_WORKERS (1216) | 0 (auto) | usize | `max_workers` (boot fallback under the committed `workers.max`) | NONE (row shows the committed value) |

Dependency checks (`:1143-1160`, `:1088-1097`): `CDB_CONTENT_PACK_DIR` and
`CDB_CONTENT_PACK_ALLOW_ROOT_DISK` require detection enabled; `CDB_DETECTION_EMIT_BASELINES=true` requires
detection AND maintenance enabled.

**Detection** (`detection_config`, `:1228-1281`): all NONE in Settings.

| Var (line) | Default | Validation | Sets |
|---|---|---|---|
| CDB_CONTENT_PACK_ENTITLEMENTS (1229) | empty | comma list | `detection.content_pack_entitlements` |
| CDB_DETECTION_ENABLED (1233) | **true** (NodeConfig serde default is false) | bool | `detection.enabled` |
| CDB_DETECTION_EMIT_BASELINES (1236) | false | bool | `detection.emit_baselines` |
| CDB_DETECTION_OBSERVATION_WINDOW_SECS (1239) | 0 (= 1 h) | i64; boot >= 0 | `detection.observation_window_secs` |
| CDB_CONTENT_PACK_DIR (1242) | unset (= data_dir/content-packs) | path | `detection.content_pack_dir` |
| CDB_CONTENT_PACK_ALLOW_ROOT_DISK (1247) | false | bool | `detection.content_pack_allow_root_disk` |
| CDB_DETECTION_RULE_PACK_PATH (1250) | unset (bundled) | path | `detection.rule_pack_path` |
| CDB_DETECTION_INDICATOR_PACK_PATH (1251) | unset (bundled) | path | `detection.indicator_pack_path` |
| CDB_DETECTION_SIGMA_RULES_DIR (1256) | unset (18 fixtures) | path; boot requires source pass on | `detection.sigma_rules_dir` |
| CDB_DETECTION_SOURCE_DETECT_ENABLED (1258) | false | bool | `detection.source_detect_enabled` |
| CDB_DETECTION_EVENT_DRIVEN_ENABLED (1263) | true | bool | `detection.event_driven_enabled` |
| CDB_DETECTION_SOURCE_OBSERVATION_CAP (1266) | 0 (engine default) | u32 | `detection.source_observation_cap` |
| CDB_DETECTION_WARNINGLIST_DIR (1270) | unset | path | `detection.warninglist_dir` |
| CDB_DETECTION_INDICATOR_TRIGGER_ENABLED (1271) | false | bool | `detection.indicator_trigger_enabled` |
| CDB_DETECTION_INDICATOR_CONFIDENCE_FLOOR (1274) | unset (HIGH) | boot: must parse as a tier | `detection.indicator_confidence_floor` |
| CDB_DETECTION_EPISODE_MODE (1276) | false | bool | `detection.episode_mode` |

**Ingest** (`ingest_endpoint`, `:408-477`)

| Var (line) | Default | Validation | Sets | Console |
|---|---|---|---|---|
| CDB_INGEST_SEAM_ONLY (413) | true | bool | seam-only ingest when no GRPC receiver | DISPLAY via `telemetry.enabled` |
| CDB_INGEST_RETENTION_HORIZON_SECS (421) | 604800 | u64 | `ingest.retention.horizon_secs` | NONE |
| CDB_INGEST_RETENTION_MAX_BATCH (425) | 4096 | usize | `ingest.retention.max_batch` | NONE |
| CDB_INGEST_RAW_RETENTION_DAYS (429) | 5 | u32; boot != 0 | `ingest.retention.raw_days` | DISPLAY: `retention.raw_days` row, no value |
| CDB_INGEST_GRPC (431) | unset | presence enables the public receiver | `ingest.grpc_addr` | DISPLAY `telemetry.grpc_addr` |
| CDB_INGEST_QUEUE_CAPACITY (438) | 65536 | usize; boot != 0 | `ingest.queue_capacity` | DISPLAY `telemetry.queue_capacity` |
| CDB_INGEST_CLASSIFICATION (448) | Unclassified | classification | `ingest.classification` | NONE |
| CDB_INGEST_HTTP (455) | required with GRPC | boot: socket addr | `ingest.http_addr` | DISPLAY `telemetry.http_addr` |
| CDB_INGEST_ACCEPT_JSON (456) | false | bool | `ingest.accept_json` | NONE |
| CDB_INGEST_TLS_CA / _CERT / _KEY (460-462) | required with GRPC | paths | `ingest.tls` | NONE |
| CDB_INGEST_TENANTS (465) | required with GRPC | `;` list `fp=tenant-uuid`; boot: no nil tenant, unique | `ingest.tenants` | DISPLAY count `telemetry.tenants_bound` |
| CDB_INGEST_NON_CYBER_ROUTING (473) | false | bool | `ingest.non_cyber_routing` | NONE |

**Agent plane** (`agent_endpoint`, `:483-513`; enabled by `CDB_AGENT_LISTEN`): all NONE.
CDB_AGENT_LISTEN (484, loopback only at boot); CDB_AGENT_CLASSIFICATION (488, default Unclassified);
CDB_AGENT_TLS_CA/_CERT/_KEY (496-498, required); CDB_AGENT_ENROLL (501, required, `;` list
`fp=source=tenant-uuid=workspace`); CDB_AGENT_GOVERNOR_GRANTS (505, optional `;` list
`agent=tenant-uuid=authority[,authority]`); CDB_AGENT_LEASE_TTL_SECS (510, default 3600).

**Admin plane** (`admin_endpoint`, `:534-578`; enabled by `CDB_ADMIN_LISTEN`)

| Var (line) | Default | Validation | Sets | Console |
|---|---|---|---|---|
| CDB_ADMIN_LISTEN (535) | unset (plane off) | boot: parseable, loopback-only | `admin.addr` | DISPLAY `connectivity.listen_addr` |
| CDB_ADMIN_CLASSIFICATION (538) | Unclassified | classification | `admin.classification`; seeds `admin_endpoint.classification` | DISPLAY (BootBound row; `security.classification`) |
| CDB_ADMIN_DUAL_CONTROL (542) | empty | comma list of `readstatus, serverlifecycle, storagemanage, maintenancemanage, securitypolicychange, keyissue, identitymanage, artifactapprove, tenantconfig, configread, auditread, auditexport` (case-insensitive, no hyphens; `:210-226`) | `admin.dual_control`; seeds and REPLACES the profile default of `governance.dual_control` | EDIT (the wire uses the kebab names instead) |
| CDB_ADMIN_PROFILE (554) | evaluation | `evaluation|enterprise|airgapped|federal` | `admin.profile` = the seed profile (session lifetimes) | NONE (`profile` not exposed) |
| CDB_ADMIN_TLS_CA / _CERT / _KEY (562-564) | required | paths | `admin.tls` | NONE |
| CDB_ADMIN_ENROLL (567) | required | `;` list `fp=role[,role][=clearance]` (roles `operator|securityadmin|tenantadmin|auditor|root`, `:185-196`, `:229-261`) | `admin.admins`; seeds `identity.admins` | DISPLAY (`identity_values`; count in `connectivity.identities_bound`) |

`cdb-mkconfig` cannot author `admin.max_payload`, `admin.session`, `admin.enrollment` or SSO group roles;
the seed then takes the profile's payload and lifetimes (`config_bringup.rs:55-67`).

**Cognition plane** (`cognition_endpoint`, `:581-648`; enabled by `CDB_COGNITION_LISTEN`)

| Var (line) | Default | Validation | Sets | Console |
|---|---|---|---|---|
| CDB_COGNITION_LISTEN (582) | unset (off) | boot: loopback only | `cognition.addr` | NONE |
| CDB_COGNITION_CLASSIFICATION (586) | Unclassified | classification | `cognition.classification` | NONE |
| CDB_COGNITION_FRONTIER_PORT (590) | 11434 | u16 | `cognition.frontier_port` | NONE |
| CDB_COGNITION_MCP_PORT (596) | 8090 | u16 | `cognition.mcp_port` | NONE |
| CDB_COGNITION_TLS_CA / _CERT / _KEY (604-606) | required | paths | `cognition.tls` | NONE |
| CDB_COGNITION_ENROLL (611) | optional | `;` list `fp=source=tenant-uuid=workspace` | `cognition.agents` | NONE |
| CDB_COGNITION_DESTINATIONS (616) | required | `;` list `id=ceiling` (`id` may contain `:`; `config_env.rs:46-65`) | `cognition.destinations`; seeds committed `egress.destinations` on a fresh node | EDIT |
| CDB_COGNITION_FRONTIER_HOST (621) | 127.0.0.1 | none | `cognition.frontier_host` | NONE |
| CDB_COGNITION_MCP_HOST (623) | 127.0.0.1 | none | `cognition.mcp_host` | NONE |
| CDB_COGNITION_MCP_PATH (625) | /mcp | none | `cognition.mcp_path` | NONE |
| CDB_COGNITION_MAX_PAYLOAD (626) | 1048576 | u32 | `cognition.max_payload` | NONE |
| CDB_COGNITION_LEASE_TTL_SECS (627) | 3600 | u64 | `cognition.lease_ttl_secs` | NONE |
| CDB_COGNITION_FRONTIER_TIMEOUT_SECS (629) | 120 | u64 | `cognition.frontier_timeout_secs` | NONE |
| CDB_COGNITION_FRONTIER_MAX_TOKENS (633) | 65536 | u32 | `cognition.frontier_max_tokens` | NONE |
| CDB_COGNITION_MCP_TIMEOUT_SECS (636) | 30 | u64 | `cognition.mcp_timeout_secs` | NONE |
| CDB_COGNITION_CONTEXT_SOURCES (`config_env.rs:127`) | unchanged | `;` list of `file_tree|filetree|agent_vectors|agentvectors|memory` (`config_env.rs:67-80`) | REPLACES `cognition.context_sources` | DISPLAY: row, no value |
| CDB_COGNITION_FRONTIER_PROVIDERS (`config_env.rs:130`) | unchanged | `;` list `destination:provider:credential_file`, provider `ollama|anthropic|openai` (`config_env.rs:81-120`); boot: external providers need a key file | REPLACES `cognition.frontier_providers` | DISPLAY: row, no value |
| CDB_COGNITION_ADD_DESTINATIONS (`config_env.rs:133`) | unchanged | `;` list `id=ceiling` | MERGES into `cognition.destinations` (same id replaced) | DISPLAY: row, no value; effective only if it lands before first boot (the committed list then governs) |
| CDB_COGNITION_ADMIT_ENROLLED (`config_env.rs:139`) | mkconfig forces `true` when the plane is enabled (`cdb-mkconfig.rs:636-642`) | `1|true|yes` (case-insensitive) = true, anything else = false | `cognition.admit_enrolled_devices`; seeds committed `cognition.admit_enrolled_devices` | DISPLAY (BootBound row) |

The four `config_env` overlays are applied by `cdb-mkconfig` only inside `cognition_endpoint`, i.e. only
when `CDB_COGNITION_LISTEN` is set (`cdb-mkconfig.rs:644-647`).

**Wire seam** (`wire_endpoint`, `:1001-1048`; configured by `CDB_WIRE_TLS_CA`): all NONE.
CDB_WIRE_TLS_CA (1012), CDB_WIRE_TLS_CERT / _KEY (1035-1036, required); CDB_WIRE_ENROLLED_GRANT (1019,
comma planes `data|agent|cognition|otlp|delegation`, default `data,agent,cognition,otlp`; an empty value
means unset, so a deny-all `[]` cannot be expressed through the env); CDB_WIRE_ROLE_GRANTS (678, `;` list
`role=plane[,plane]`, default none); CDB_WIRE_ENROLL (1039, required, `;` list
`fp=tenant-uuid[=clearance[=planes]]`, clearance default unclassified, grant default empty = deny-all);
CDB_WIRE_LEASE_TTL_SECS (1045, default 3600).

**Control plane** (`control_plane_endpoint`, `:1050-1081`; enabled by `CDB_CONTROL_LISTEN`): all NONE.
CDB_CONTROL_LISTEN (1058, may be non-loopback), CDB_CONTROL_TLS_CA/_CERT/_KEY (1065-1067, required),
CDB_CONTROL_ENROLL (1070, required, same format as CDB_WIRE_ENROLL), CDB_CONTROL_LEASE_TTL_SECS (1076,
default 3600).

**Enrollment bootstrap** (`enrollment_endpoint`, `:722-829`; enabled by `CDB_ENROLL_LISTEN`): all NONE.
CDB_ENROLL_LISTEN (739); CDB_ENROLL_TENANT (742, required UUID, boot non-nil); CDB_ENROLL_CA_HOST (745,
req); CDB_ENROLL_CA_PORT (746, req u16); CDB_ENROLL_CA_ROOT (749, req); CDB_ENROLL_CA_PROVISIONER (750,
req); CDB_ENROLL_CA_KID (751, req); CDB_ENROLL_CA_SIGNING_KEY (752, req); CDB_ENROLL_CA_TIMEOUT_SECS (754,
default 30, boot != 0); CDB_ENROLL_PINNED_ISSUERS (763, req `;` list); CDB_ENROLL_GROUP_ROLES (701, req
`;` list `group=role[,role]`); CDB_ENROLL_CLEARANCE (768, default unclassified); CDB_ENROLL_TLS_CERT /
_KEY (777-778, req); CDB_ENROLL_IDP_KEYS (780, req `;` list `kid=n_b64u=e_b64u`); CDB_ENROLL_AUDIENCE
(784, req); CDB_ENROLL_GROUPS_CLAIM (785, req); CDB_ENROLL_EK_ROOTS (789, req `;` paths);
CDB_ENROLL_ATTEST_NONCE (797, optional raw string, stored base64url); CDB_ENROLL_VALIDITY_SECS (805,
optional u64, boot 1..=604800); CDB_ENROLL_ISSUER_LABEL (815, default `crucibledb-enroll`);
CDB_ENROLL_ROLE_BEARING_CNS (821, optional `;` list). `require_cnsa_floor` and `require_attestation`
are hard-coded true (`:800-806`).

**Microsoft Graph connector** (`ms_graph_endpoint`, `:875-909`; enabled by `CDB_MSGRAPH_TENANT_ID`):
all NONE in Settings. CDB_MSGRAPH_TENANT_ID (878); CDB_MSGRAPH_ENDPOINT (882, `alerts_v2|alertsv2|v2`
or `legacy|alerts`, default alerts_v2); CDB_MSGRAPH_TENANT (886, UUID, default nil); CDB_MSGRAPH_CLASSIFICATION
(890, default unclassified); CDB_MSGRAPH_CLIENT_ID (898, req); CDB_MSGRAPH_CLIENT_SECRET_REF (899, req);
CDB_MSGRAPH_POLL_INTERVAL_SECS (900, default 60, boot != 0); CDB_MSGRAPH_BACKFILL_SECS (901, default
86400); CDB_MSGRAPH_REPORTS (904, comma list `sign_ins|signins|directory_audits|directoryaudits|
risk_detections|riskdetections`, default none).

**Auth0 IdAM connector** (`auth0_endpoint`, `:911-944`; enabled by `CDB_AUTH0_DOMAIN`): NONE in Settings
(the separate wire verb IDAM_CONNECTORS returns domain, enabled, running and cadences,
`handler.rs:2594-2621`; outside this slice). CDB_AUTH0_DOMAIN (919); CDB_AUTH0_TENANT (923, UUID; default
nil, which the node refuses when enabled); CDB_AUTH0_CLASSIFICATION (927; falls back to the derived
Default = Unclassified, while the field doc says "Defaults to `Internal`", `config.rs:1767-1774`);
CDB_AUTH0_CLIENT_ID (934, req); CDB_AUTH0_CLIENT_SECRET_REF (935, req, a file path); CDB_AUTH0_AUDIENCE
(936, optional); CDB_AUTH0_POLL_INTERVAL_SECS (937) and CDB_AUTH0_FULL_SYNC_CADENCE_HOURS (939): the
fallbacks come from `Auth0ConnectorConfig::default()`, which is DERIVED (`config.rs:1730`), so they are 0,
not the serde defaults 300 / 24; with `CDB_AUTH0_DOMAIN` set and these unset, the authored stanza carries
0 / 0 and the node refuses to boot (60..=86400 s and 1..=168 h, `config.rs:1784-1812`). UNVERIFIED by
execution (no authoring test covers Auth0; compare the ms_graph fix at `config.rs:1673-1692`).

**Flow receiver** (`flow_endpoint`, `:352-405`; enabled by `CDB_FLOW_UDP`): all NONE. CDB_FLOW_UDP (353);
CDB_FLOW_CLASSIFICATION (356, default **internal**); CDB_FLOW_EXPORTERS (360, req `;` list
`ip=tenant-uuid`); CDB_FLOW_SUSPICIOUS_PORTS (381, comma u16, refused on a bad port); CDB_FLOW_WINDOW_SECS,
CDB_FLOW_MAX_KEYS, CDB_FLOW_OCTET_CEILING, CDB_FLOW_PACKET_CEILING, CDB_FLOW_FLUSH_SECS, CDB_FLOW_THREADS,
CDB_FLOW_TRAFFIC_WINDOWS, CDB_FLOW_SUMMARY_RETENTION_SECS, CDB_FLOW_MAX_KEYS_PER_WINDOW (394-402, default
0 = collector default). The numeric flow vars parse with `.unwrap_or(0)`, so a malformed value silently
becomes the default instead of failing (`:379`, `:396-397`) -- the only fail-open parsing in the tool.

**Embedder** (`embedder_config`, `:1284-1290`): CDB_EMBED_TEI (1286, default "") and CDB_EMBED_PIPELINE
(1287, default 0) author `NodeConfig.embedder`. Console: NONE (the committed row does not reflect it).

Also: `cdb-mkconfig --add-wire-peer '<fp>=<tenant>[=<clearance>[=<planes>]]' <node.cbor>` merges one
pinned peer into `wire.peers` (a grant-less pin is refused) and refuses to rewrite the file if this
binary would drop or change any other field (`:1295-1310`, `:1346-1392`; the 2026-09-25 incident note at
`:1348-1353`).

### 5.4 `cdb-config-edit`

Overlays only the four `config_env` cognition vars onto an existing node.cbor in place, backing up to
`<path>.bak-config-edit` and writing via temp + rename (`crates/cdb-server/src/bin/cdb-config-edit.rs:1-57`).
Its usage text shows `CDB_COGNITION_CONTEXT_SOURCES=agent_vectors,memory` (`:10`), but the parser splits
on `;` (`config_env.rs:22-30`), so that example would be refused as one unknown source name. Its claim
that re-encoding "re-validates" (`:33`) is false for the same reason as 5.3 (`to_cbor`). It is not
installed by the installer (`installer/phases/40-build.sh:9-24`). Changes to cognition destinations made
this way do not reach a node that already has a committed document (the committed list governs,
`cognition.rs:52-86`; seed only when none exists, `bootstrap.rs:4226-4251`).

### 5.5 What becomes a committed setting at first boot

`seed_document` (`config_bringup.rs:32-75`), committed as principal `bootstrap` only when no document
exists, and only when the admin endpoint is enabled (`bootstrap.rs:917-927`, `:4178-4196`) or, failing
that, the cognition plane is enabled (`bootstrap.rs:969`, `:4226-4251`): profile (`CDB_ADMIN_PROFILE`),
`endpoint_classification` (`CDB_ADMIN_CLASSIFICATION`), `cognition_admit_enrolled`
(`CDB_COGNITION_ADMIT_ENROLLED` / mkconfig default), `dual_control` (`CDB_ADMIN_DUAL_CONTROL`),
`maintenance_cadence_secs` (`CDB_MAINTENANCE_CADENCE_SECS`), `admins` (`CDB_ADMIN_ENROLL`),
`egress_destinations` (`CDB_COGNITION_DESTINATIONS` + ADD), and profile payload/lifetimes. After that
the committed document governs; re-running `cdb-mkconfig` changes node.cbor but not these committed
values. A node with neither plane enabled has no committed document until the first Console commit
(which starts from the Federal defaults, 3.1). The boot-time re-application of the committed maintenance
cadence and retention window also happens only inside the admin-enabled branch (`bootstrap.rs:926-927`,
`:4253-4281`).

### 5.6 The node installer (`deploy/cdb-install/installer`)

Phases, in order: 00-gpu, 10-prereqs, 15-ztp, 20-ollama, 30-tei, 40-build, 45-content-packs, 50-config,
60-start, 65-seed, 70-validate (`installer/install.sh:23`); flags `--from`, `--only`, `--skip`, `--list`
(`install.sh:27-49`). Knobs are env vars with defaults in `installer/lib/common.sh` (lines cited as
`common.sh:N`), plus a few in phases. `50-config.sh` turns them into `cdb-mkconfig` env
(`50-config.sh:211-265`) and `/etc/cdb/cdb.env`; `65-seed.sh` commits governed sections with
`cdb-actl config-export` + `jq` + `config-commit` on the admin plane (`65-seed.sh:54-201`).

| Knob | Default | What it sets | Console |
|---|---|---|---|
| CDB_REPO | repo root (`common.sh:17`) | source tree | NONE |
| CDB_PREFIX | /usr/local/bin (`common.sh:18`) | binary install dir (cdb, cdb-mkconfig, cdb-actl, cdb-packbuilder; `40-build.sh:19-24`) | NONE |
| CDB_ETC | /etc/cdb (`common.sh:19`) | config dir (node.cbor, cdb.env, TLS) | NONE |
| CDB_DATA_DIR | /var/lib/cdb (`common.sh:20`) | the node's data dir is `${CDB_DATA_DIR}/data` (`50-config.sh:212`) | NONE |
| CDB_MODELS_DIR | /var/lib/cdb-models (`common.sh:21`) | model stores | NONE |
| CDB_USER / OLLAMA_USER | cdb / ollama (`common.sh:22-23`) | service users | NONE |
| CDB_COGNITION_FRONTIER | ollama (`common.sh:31-39`) | `ollama` wires the cognition plane to Ollama; `none` leaves it disabled and skips 20-ollama; `none` + CDB_COGNITION_FRONTIER_PROVIDERS is refused | indirect (egress seed) |
| OLLAMA_MODEL | gemma4:26b-a4b-it-qat (`common.sh:40`) | pulled model; becomes the cognition destination `<model>=secret` (`50-config.sh:168`) and the SOC narrative model | EDIT (`egress.destinations`, `soc_narrative.model_ref`) |
| OLLAMA_NUM_PARALLEL / OLLAMA_FLASH_ATTENTION / OLLAMA_KEEP_ALIVE / OLLAMA_CONTEXT_LENGTH | 4 / 1 / -1 / 32768 (`common.sh:48-66`) | Ollama service tuning | NONE |
| ARCTIC_HF_REPO, ARCTIC_MODEL_DIR, OLLAMA_MODELS_DIR | Snowflake/snowflake-arctic-embed-l-v2.0, ... (`common.sh:41-43`) | model staging | NONE |
| CDB_CONTENT_PACK_DIR | ${CDB_DATA_DIR}/content-packs (`common.sh:70`) | staged packs; -> CDB_CONTENT_PACK_DIR | NONE |
| CDB_CONTENT_PACK_ALLOW_ROOT_DISK | false (`common.sh:73`) | -> mkconfig | NONE |
| CONTENT_PACKS_SRC | repo content-packs (`common.sh:74`) | pack source | NONE |
| CDB_DETECTION_ENABLED | true (`common.sh:75`) | -> mkconfig | NONE |
| CDB_DETECTION_EPISODE_MODE | **true** (`common.sh:87`; engine default false) | -> mkconfig | NONE |
| CDB_DETECTION_INDICATOR_TRIGGER_ENABLED | **true** (`common.sh:88`; engine default false) | -> mkconfig | NONE |
| CDB_SIGMA_PACKS | repo `deploy/cdb-install/sigma/sigmahq` (`common.sh:105`) | Sigma corpus to stage; `skip` = none; when set, defaults SOURCE_DETECT on and SIGMA_RULES_DIR to CDB_SIGMA_DIR (`common.sh:107-110`) | NONE |
| CDB_SIGMA_DIR | ${CDB_DATA_DIR}/sigma (`common.sh:106`) | staged corpus dir | NONE |
| CDB_DETECTION_SOURCE_DETECT_ENABLED | true when a corpus is staged, else false (`common.sh:107-111`) | -> mkconfig | NONE |
| CDB_DETECTION_SIGMA_RULES_DIR | CDB_SIGMA_DIR when staged (`common.sh:109`, `:113`) | -> mkconfig (50-config refuses a missing dir or the source pass off, `50-config.sh:204-209`) | NONE |
| CDB_DETECTION_INDICATOR_PACK_PATH / CDB_DETECTION_WARNINGLIST_DIR | empty, auto-wired to staged intel (`common.sh:112-114`; `50-config.sh:184-192`) | -> mkconfig | NONE |
| CDB_INTEL_DIR / CDB_INTEL_SRC | /var/lib/cdb/intel / repo intel; `skip` = none (`common.sh:115-116`) | intel staging | NONE |
| CDB_DETECTION_INDICATOR_CONFIDENCE_FLOOR | HIGH (`common.sh:117`) | -> mkconfig | NONE |
| CDB_DETECTION_EMIT_BASELINES | **true** (`common.sh:123`; engine default false) | -> mkconfig | NONE |
| CDB_CREDIBILITY_WEIGHTS_FILE | newest `deploy/cdb-install/weights/config-v*.json` (today v5, 7 calibration points) (`common.sh:125-138`; `weights/README.md`) | 65-seed commits `.credibility_weights` (must be version >= 2) (`65-seed.sh:179-201`) | DISPLAY (`credibility_weights.weight_set`, calibration not shown) |
| CDB_WIRE_ROLE_GRANTS | operator=data,delegation (`common.sh:144`) | -> mkconfig | NONE |
| CDB_CONTENT_PACK_ENTITLEMENTS | empty (`common.sh:145`) | -> mkconfig | NONE |
| CDB_OBSERVE | 1 (`common.sh:150`) | written to cdb.env (`50-config.sh:101-114`) | DISPLAY (row, no value) |
| CDB_OBSERVE_DETECTION_TRACE | false (`common.sh:156`) | -> mkconfig | NONE |
| CDB_EMBEDDER | tei (`common.sh:164-168`) | `tei` / `tei-cpu` write `CDB_EMBED_TEI=${TEI_ADDR}` into cdb.env; `reference` writes none (`50-config.sh:93-100`) | NONE (committed `embedder` row stays empty) |
| CDB_REQUIRE_GPU | 1 for tei, else 0 (`common.sh:169-171`) | GPU phase gating | NONE |
| TEI_CPU_IMAGE / TEI_IMAGE / TEI_ADDR / TEI_CONTAINER_PORT / TEI_REF / TEI_CUDA_COMPUTE_CAP / TEI_BUILD_DIR | see `common.sh:173-188` (TEI_ADDR 127.0.0.1:9090) | the TEI sidecar; TEI_MEM_LIMIT_BYTES is computed as MemTotal/5 (`30-tei.sh:86`) | NONE |
| OLLAMA_ADDR | 127.0.0.1:11434 (`common.sh:189`) | cognition frontier host/port (`50-config.sh:159-178`) | NONE |
| CDB_LISTEN | 0.0.0.0:7878 (`common.sh:190`) | wire seam (mTLS peers generated in 50-config) | NONE |
| CDB_REGION | us-central1 (`common.sh:191`) | region | NONE |
| CDB_ADMIN_LISTEN | 127.0.0.1:7440 (`common.sh:196`) | admin plane | DISPLAY (`connectivity.listen_addr`) |
| CDB_ADMIN_PROFILE | evaluation (`common.sh:197`) | seed profile | NONE |
| CDB_ADMIN_CLASSIFICATION | secret (`common.sh:198`) | admin classification, the operator's clearance (`50-config.sh:231`) and the SOC model ceiling (`65-seed.sh:150-152`) | DISPLAY |
| CDB_ADMIN_ROLES | operator,tenantadmin,securityadmin (`common.sh:199`) | the enrolled cdb-actl operator's roles | DISPLAY (`identity_values`) |
| CDB_ADMIN_DUAL_CONTROL | empty (`common.sh:200`) | seed dual-control set | EDIT |
| CDB_SIGNING_KEY_REF | reference://mldsa87/shard-1 (`common.sh:207`) | shard signing key ref (metadata) | NONE |
| CUDA_PROBE_IMAGE | nvidia/cuda:12.2.2-base-ubuntu22.04 (`common.sh:209`) | GPU probe | NONE |
| CDB_STEPCA_DIR / _IMAGE / _ADDR / _TOKEN | /var/lib/cdb-stepca, cdb-stepca:local, 127.0.0.1:8443, cdb-stepca (`common.sh:214-217`) | ZTP CA | NONE |
| CDB_ENROLL_LISTEN / _ISSUER / _AUDIENCE / _GROUPS_CLAIM / _GROUP_ROLES / _CLEARANCE | 0.0.0.0:7443, the Auth0 dev tenant URL, https://crucibledb/enroll, https://crucibledb/groups, dev.agents=operator, secret (`common.sh:222-227`) | enrollment bootstrap (IdP JWKS fetched from the issuer, `50-config.sh:121-126`) | NONE |
| CDB_ENROLL_ROLE_BEARING_CNS | console.node.test.crucibledb (`common.sh:233`) | role-bearing CNs | NONE |
| CDB_EK_PKI_DIR / CDB_ENROLL_EK_ROOTS_SRC / CDB_ENROLL_ATTEST_NONCE | ${CDB_MODELS_DIR}/ztp-ek-pki, empty, empty (generated once and persisted) (`common.sh:240-245`; `50-config.sh:133-145`) | attestation anchors and nonce | NONE |
| CDB_COGNITION_ADMIT_ENROLLED | true (`common.sh:250`) | -> mkconfig | DISPLAY (BootBound row) |
| CDB_COGNITION_FRONTIER_PROVIDERS | empty (`common.sh:253`) | forwarded when set | DISPLAY (row, no value) |
| CDB_TENANT_UUID | df46dcb7-2e91-448c-a406-42e492b85e36 (`50-config.sh:68`) | the wire/enrollment tenant | NONE |
| CDB_CONSOLE_SERVICE_TENANT | random, persisted in /etc/cdb/control/service-tenant (`50-config.sh:78-89`) | the control-plane peer's reserved tenant | NONE |
| CDB_DETECT_RETENTION_DAYS | 30; 0 opts out (`65-seed.sh:62-93`) | commits `detection_retention = {enabled, 30d, 30d}` | DISPLAY (Pending row) |
| CDB_AIG_EXPOSURE / CDB_AIG_RETENTION_DAYS | on / 7 (`65-seed.sh:94-118`) | commits `aig_exposure = {enabled, 7d, identity resolution on}` | DISPLAY (Pending row) |
| CDB_SOC_NARRATIVE / _MODEL / _VERSION | on (off when frontier none and no model) / OLLAMA_MODEL / tag qualifier (e.g. `qat`) (`65-seed.sh:120-167`) | `cdb-actl model-register` + commits `soc_narrative.model_ref` | EDIT (`soc_narrative.model_ref`); DISPLAY (`served_models.registry`) |
| CDB_GOVERN_TENANT / _ATTEST_SOURCE / _ATTEST_EK_CERT / _SUBJECT | unset (skip) (`65-seed.sh:11-31`, `:203-235`) | AIG govern-attest grants via `cdb-actl agent-grant-provision` | NONE |
| CDB_RUN_TESTS / TELEMETRY_WAIT_SECS | 1 / 15 (`70-validate.sh:79`, `:191`) | validation phase | NONE |

Hard-coded by `50-config.sh` (not knobs): `CDB_GROUP=1`, `CDB_SHARD=1`, control plane `0.0.0.0:7879` with
the Console leaf pinned at clearance secret with all five planes, cognition listener `127.0.0.1:7460`
at classification secret, the wire client peer granted `data,agent,cognition,otlp` at secret, the ZTP CA
chain folded into the wire CA bundle, and the `cdb.service` unit with `MemoryHigh=65%`, `MemoryMax=75%`
and a journald rate-limit drop-in (`50-config.sh:49-56`, `:159-178`, `:211-265`, `:279-316`).

Legacy/alternative installers: `deploy/cdb-install/install-systemd.sh` (superseded, per
`installer/README.md`) and the Docker quick start. The compose file sets `CDB_LISTEN=0.0.0.0:7878` with no
wire mTLS (`deploy/cdb-install/docker/docker-compose.yml`), which the node's validation refuses
(`config.rs:2141-2155`); UNVERIFIED by execution, but by code the quick start cannot boot.

---

## 6. The Configuration Guide and its drift gate

### 6.1 What exists

- `docs/reference/configuration/CrucibleDB_Configuration_Guide.html` (665,214 bytes; 21 commits, last
  `2cfba126` on 2026-09-24) and `CrucibleDB_Configuration_Guide.pdf` (686,148 bytes; last updated
  `4713b8d4` on 2026-07-09, with 14 HTML commits since, so the PDF is stale). The guide was brought into
  the repo by KC.14 (`docs/implementation-plans/IP-ADMIN-KNOB-COVERAGE-LEDGER.md:45`).
- Chapters (from the HTML headings): About this guide; How CrucibleDB is configured; node configuration
  (generate, boot, verify); listeners and the wire seam / plane grants; the security model
  (classification, clearance, enrollment and attestation); the control plane (admin roles and
  capabilities, dual control by capability, bootstrap profile, admin sessions and break-glass, the gated
  configuration lifecycle, dual control and rollback); telemetry ingest; normalization (decoder coverage);
  detection (content packs); model builds, the embedding seam, builds-and-search posture; the cognition
  plane and egress gating, served models; Day-2 maintenance; distribution (regions and shards); read
  surfaces; a report reference; and a "Configuration reference" appendix with three tables:
  Governed knobs (31 rows: knob, tier, kind, default, what it governs), Committed structural sections
  (20 rows), Fail-closed validations (14 rows).

### 6.2 How it is checked

`crates/cdb-admin/tests/config_guide_drift.rs:11-58` `include_str!`s the HTML and asserts only:
(1) every `ConfigSection::label()` appears somewhere in the text as a substring; (2) the first `<tbody>`
after the marker "Governed configuration knobs" has exactly `Knob::ALL.len()` (31) `<tr>` rows; (3) the
first `<tbody>` after "Committed structural sections" has exactly `ConfigSection::ALL.len()` (20) rows.
It does not check any default, tier, kind, bound, registry key, env var, the validations table, or any
prose. No generator exists in the repo (searches for the guide's file name and table captions find only
the HTML, the test and plan documents); the tables are maintained by hand in feature commits (git log).

### 6.3 Drift between the guide and the code (verified)

| Guide says | Code says |
|---|---|
| Table 12 names knobs as `endpoint_classification`, `maintenance_cadence`, `retention_window`, `query_enabled`, ... | Neither the registry keys the Console shows (`admin_endpoint.classification`, `maintenance.cadence_secs`, ...) nor consistently the document field names (`maintenance_cadence_secs`, `retention_window_secs`) |
| `dual_control` default "SecurityPolicyChange, KeyIssue"; session defaults 3600 / 900 | Those are the Enterprise profile values, unlabeled. Evaluation (the default profile of `cdb-mkconfig` and the installer) is empty / 28800 / 3600 (`config_model.rs:569-606`), and a real seed replaces the dual-control set with `CDB_ADMIN_DUAL_CONTROL` (`config_bringup.rs:51`) |
| Table 14 lists 14 fail-closed validations | 40 `ConfigViolation` variants exist (3.3); e.g. missing `ZeroMaintenanceCadence`, `ZeroWakeSpecificityFloor`, `GraphTraversalUnbounded`, `ApiExposureUnbounded`, `AigRetentionUnbounded`, `KeyIssuingNotDualControlled`, `UnknownDecoderFamily`, `UnknownSourceFormat`, `BlankSearchableAttribute`, `ZeroEmbeddingDimension`, `BlankPinnedModel`, `RebuildCadenceBelowMaintenance`, `SearchEnabledWithoutIndex`, `LugExposureUnbounded`, `LugThresholdOutOfRange`, `IdamCadenceOutOfRange`, `SocNarrativeModelUnresolvable`, `DetectionRetentionUnbounded`, `CredibilityWeightSetInvalid`, `ZeroSessionLifetime`; and one row ("Enrollment misconfigured at load") is a NodeConfig load check, not a document violation |
| "Configure the embedding provider": `export CDB_EMBED_SIDECAR=...`, `CDB_EMBED_TOKEN`, pin `CDB_EMBED_EXPECTED_DIGEST` | No Rust code reads any of the three (zero matches under `crates/`); the real inputs are the committed `embedder` section, `NodeConfig.embedder`, and `CDB_EMBED_TEI` / `CDB_EMBED_PIPELINE` (`bootstrap.rs:444-478`) |
| `CDB_MEMTABLE_BUDGET=4194304 ... The defaults shown are applied if you omit them` | Default 67108864 (`cdb-mkconfig.rs:1125`) |
| `cdb-mkconfig` "validates the configuration" | It does not; validation happens at node boot (5.3) |
| Control plane: "the ForgeCentral Console binds that same contract, so the command line and the UI are always in step"; "you change every governed setting ... at runtime, with no restart" | The Console uses the separate wire Settings verbs (section 4), edits 27 of 56 registry rows, and 7 settings are boot-bound (plus 4 mislabeled, 1.4) |
| Environment: 23 `CDB_*` names | ~150 node-config names exist (5.2-5.3); of the guide's 23, 3 do not exist (above) and 5 are `cdb-seed`/`cdb-validate` content vars (`CDB_CONTENT_*`) |
| (no mention) | The wire Settings verbs, `settings_tier`, SOC settings, reports on the wire, history/rollback on the wire |

### 6.4 Could it be a source for the Console manual?

Partly, and only with care. Usable: the conceptual prose (classification and clearance, admin roles and
capabilities, dual control and staleness, profiles, the lifecycle, listeners, content packs) after
correcting the drift above. Not usable as the per-setting reference: it is count-gated only, names
settings differently from the Console, has profile-ambiguous defaults, an incomplete validations table,
and documents nonexistent variables. The better machine source for per-setting reference text is the
REGISTRY as the engine already serves it (`config-describe` / `SETTINGS_READ` rows: default, bound,
live_apply, summary, change_via), combined with `Knob::tier` (not on the wire today), the exact
`ConfigViolation` messages (3.3), and the code corrections in 1.4 where the registry text is wrong.
A value-level drift gate (defaults, tiers, live-apply) would be needed to keep any manual honest.

---

## 7. Findings (ranked) and open questions

### 7.1 Findings

1. **Registry live-apply text is wrong for several Console-editable settings** (1.4). `sessions.*` and
   `cognition.max_connections` are labeled Live but bind at start, `governance.dual_control` is live for
   the wire but not the admin plane, `idam.connector` has no consumer at all, `detection_retention` is
   labeled Pending but is live, and `lug.exposure`'s default text says "disabled" while the code default
   is enabled. The Console renders these strings verbatim and `needs_restart` never flags the first four.
2. **All Settings authority rests on a Console-asserted tier.** mTLS peers run at User; the ten Settings
   ops honor `OperatorDelegation.settings_tier` uncapped by the peer tier (`handler.rs:4205-4229`), an
   explicit stopgap (`docs/DEFERRED_LEDGER.md:1206-1217`).
3. **Dual control on the wire keys only on `tenant-config`**, which no profile includes and the seed
   leaves out unless `CDB_ADMIN_DUAL_CONTROL` names it, so Console writes are single-person by default.
   Under dual control the Console cannot change SOC tiers or SIEM write-back at all; proposals are
   in-memory (lost on restart), with no reject verb (4.6).
4. **Concurrent whole-document commits are last-writer-wins** (no base check on `SETTINGS_COMMIT`), so
   two operators (or the Console and `cdb-actl`) can silently revert each other (4.4). Code reading.
5. **History has no values and a 7-day horizon**: no diff verb, no as-of read, `changed_keys` only;
   versions age out with the time-travel retention window; calibration-map changes are invisible in every
   diff and the map is never displayed (3.5, 4.7).
6. **Several displayed values are not what the node runs**: `server.maintenance_cadence_secs` is the
   boot value (4.9); `embedder.binding` shows an empty endpoint on installer-built nodes that embed via the
   `CDB_EMBED_TEI` env fallback (1.4); IdAM cadence edits are not persisted; SIEM write-back needs a
   hand-authored boot `connectors.siem.secret_ref` with no installer or mkconfig knob (4.8).
7. **`query_surface.enabled` is a Console self-lockout switch**: turning it off refuses almost every
   delegated Console read (4.10); `per_tenant_result_limit` refuses (not truncates) larger reads.
8. **Tiers exist only on the 31 knobs and never reach the wire or the Console**; 25 registry rows are
   untiered, `profile` is invisible, and 7 of the 13 Essential knobs govern unbuilt features (2.2-2.3).
9. **The Configuration Guide is count-gated only and has real drift** (6.3), including three nonexistent
   embedder env vars and a wrong memtable default; the PDF is two months stale.
10. **Boot tooling traps (code reading)**: `cdb-mkconfig` never validates what it writes (its comments
    say it does); an Auth0 stanza without explicit cadences is authored as 0/0 and refused at boot; the
    flow numeric vars fail open; `CDB_ADMIN_DUAL_CONTROL` uses different capability spellings from the
    wire; the Docker quick start's non-loopback listener without wire mTLS cannot pass boot validation.

### 7.2 Open questions for the owners

- Should the manual state the registry's live-apply claims or the code's behavior where they differ
  (1.4)? The registry is the in-product source, so a registry fix may be the real task.
- Is the committed `idam_connector` section meant to persist Console `IDAM_CONFIGURE` edits? Today it is
  dead and the edits are memory-only. (Also: `idam_configure` performs admission but no tier check,
  `handler.rs:2667-2692`; outside this slice, flagged for the Console-operations census.)
- Should `soc` / `siem_writeback` be proposable on the wire so dual control does not remove them from the
  Console?
- Should `Tier` (and the document `profile`) be exposed on the wire so the manual and UI can group
  Essential / Standard / Advanced?
- Is a break-glass admin session ever opened in production (`sessions.break_glass_lifetime_secs` has no
  production consumer)?
- UNVERIFIED: runtime effect of committing 0 for `query_surface.result_chunk_rows`,
  `query_surface.max_cursors_per_tenant`, `cognition.max_connections` (all accepted by validation).
- UNVERIFIED: whether anything besides the admin report consumes `aig_exposure` (the installer arms it
  for agent resolution).
- UNVERIFIED by execution: the Auth0 zero-cadence authoring trap, the Docker quick start refusal, the
  last-writer-wins race, and the `q_radar` declarative spelling -- all established by reading code only.
