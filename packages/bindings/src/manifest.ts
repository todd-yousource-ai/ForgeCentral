// packages/bindings/src/manifest.ts -- the Console binding registry (F0.4).
//
// The single manifest that maps every value the Console renders and every control it exposes to a REAL
// Crucible/Torch/Forge operation (INV-CONSOLE-NO-STUB). Surfaces (CONSOLE-01..12) register their read and
// command bindings here as they are built; each entry names a concrete engine op (or is PENDING with its
// gating engine task, INV-CROSS -- a PENDING binding is a tracked plan artifact that never ships).
//
// The foundation shipped the ENFORCEMENT (validate.ts + the contract test) over an EMPTY manifest; a
// surface adds its bindings in the same PR that builds it, and the contract test then proves each is real
// (or an honestly-tracked PENDING that names its gating engine task). The FIRST populated surface is the
// entity drawer (IP-CONSOLE-12, roadmap P1.1); its `entity.*` bindings are registered below.

import type { Binding, BindingManifest, CommandBinding, ReadBinding } from '@forge/contracts';
import { bindingId } from '@forge/contracts';

// -- IP-CONSOLE-12 (entity drawer, P1.1) the `entity.*` drawer contract bindings ---------------------
//
// One binding per drawer section read + one per quick action (TRD-CONSOLE-12 Section 3). Reclassified
// against grounded crdb reality (2026-07-11): `entity.header`/`entity.info` (identity + status) are LIVE
// over LIST_AGENTS (crdb ER.1) and `entity.recentDecisions` is LIVE over ENTITY_DECISIONS (crdb ER.2c);
// `entity.zones` + `entity.effectivePolicies` are PENDING (Forge-side, no queryable store in crdb);
// `entity.capabilities` is LIVE over the crdb `agent_capabilities` virtual relation (VR.3). Trust Score was
// removed (legacy). The Isolate command is real (enforcement OFF is a runtime posture, not a
// binding-liveness question); the other three quick actions are PENDING behind the command / surface
// that exposes them (DR.5).

const entityReads: readonly ReadBinding[] = [
  {
    // Identity + lifecycle status, from the engine agent directory (LIST_AGENTS, crdb ER.1). Trust
    // Score removed; the header projects the AigAgentRecord status.
    id: bindingId('entity.header'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'list_agents_v1',
    viewModel: 'HeaderView',
    status: { kind: 'live' },
  },
  {
    // The same agent-directory record projects the info section (status, role/clearance, enrolled).
    id: bindingId('entity.info'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'list_agents_v1',
    viewModel: 'EntityInfoView',
    status: { kind: 'live' },
  },
  {
    // VTZ membership is resolved Torch/Forge-side and realized at the endpoint; crdb has no queryable
    // VTZ-membership store (grounded review 2026-07-11), so this is a cross-repo deferral.
    id: bindingId('entity.zones'),
    kind: 'read',
    surface: 'forge',
    op: 'entity_zones_v1',
    viewModel: 'ZonesView',
    status: {
      kind: 'pending',
      owningRepo: 'forge',
      gatingTask: 'Forge VTZ membership store + a queryable read surface (not in crdb today)',
    },
  },
  {
    // Effective policies are composed Torch/Forge-side and shipped as a signed bundle; crdb has no
    // policy-in-force store and the direct-vs-inherited origin is flattened away.
    id: bindingId('entity.effectivePolicies'),
    kind: 'read',
    surface: 'forge',
    op: 'entity_effective_policies_v1',
    viewModel: 'EffectivePoliciesView',
    status: {
      kind: 'pending',
      owningRepo: 'forge',
      gatingTask:
        'Forge effective-policy resolution as a queryable read surface (not in crdb today)',
    },
  },
  {
    // Recent governed decisions for the entity, from the engine decision index (ENTITY_DECISIONS,
    // crdb ER.2c, backed by the ER.2a live entity-indexing of every persisted decision).
    id: bindingId('entity.recentDecisions'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'entity_decisions_v1',
    viewModel: 'RecentDecisionsView',
    status: { kind: 'live' },
  },
  {
    // The agent's capability edges from the crdb AIG graph, via the `agent_capabilities` virtual relation
    // (tools / authority / delegation; producer IP-CONSOLE-CAPABILITIES VR.3). LIVE. Upgrades to the full
    // signed Construction Report (the 10-surface decomposition) when Phase B / CR.4 lands -- same view
    // shape, richer source, no rebind.
    id: bindingId('entity.capabilities'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'agent_capabilities_v1',
    viewModel: 'CapabilitiesView',
    status: { kind: 'live' },
  },
];

const entityCommands: readonly CommandBinding[] = [
  {
    // Real + audited containment (TRD-32 v2 Quarantine/Deny; Torch containment for a wrapped agent). Live
    // kernel-level (BPF-LSM) enforcement is AG.7, deliberately OFF -- the command records intent + audits;
    // the returned IsolateEffect reports enforcementActive: false. Never fabricates enforcement.
    id: bindingId('entity.isolate'),
    kind: 'command',
    surface: 'forge',
    op: 'entity_isolate_v1',
    authz: 'operator:contain',
    audited: true,
    status: { kind: 'live' },
  },
  {
    id: bindingId('entity.reassignZone'),
    kind: 'command',
    surface: 'forge',
    op: 'entity_reassign_zone_v1',
    authz: 'operator:vtz.reassign',
    audited: true,
    status: {
      kind: 'pending',
      owningRepo: 'forge',
      gatingTask: 'IP-CONSOLE-12 DR.5 / IP-CONSOLE-02: Forge VTZ membership-change command',
    },
  },
  {
    id: bindingId('entity.remediation'),
    kind: 'command',
    surface: 'forge',
    op: 'entity_remediation_v1',
    authz: 'operator:remediation.view',
    audited: true,
    status: {
      kind: 'pending',
      owningRepo: 'forgecentral',
      gatingTask: 'IP-CONSOLE-07 AIOps Workflows surface',
    },
  },
  {
    id: bindingId('entity.fullReport'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'entity_full_report_v1',
    authz: 'operator:report.view',
    audited: true,
    status: {
      kind: 'pending',
      owningRepo: 'forgecentral',
      gatingTask: 'IP-CONSOLE-08 Reports surface',
    },
  },
];

// -- IP-CONSOLE-09 (Logs, P1.2) the `logs.*` decision-LOG bindings -----------------------------------
//
// The tenant-wide decision LOG. `logs.query` + `logs.explain` are LIVE against the crdb
// IP-CONSOLE-LOG-QUERY producer (LOG_QUERY / LOG_EXPLAIN over :7878, landed). `logs.tail` (the real push
// stream) and `logs.export` (the audited engine export) are honest PENDING deferrals naming their gating
// engine task -- v1 tailing polls `logs.query`, and export lands with crdb LQ.4.

const logReads: readonly ReadBinding[] = [
  {
    // The tenant-wide decision LOG read: time range + structured filters + free-text search, newest-first
    // and bounded, filtered engine-side (crdb LOG_QUERY, IP-CONSOLE-LOG-QUERY LQ.2).
    id: bindingId('logs.query'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'log_query_v1',
    viewModel: 'LogPage',
    status: { kind: 'live' },
  },
  {
    // The decision-by-id EXPLAIN read: the full decision detail (crdb LOG_EXPLAIN, LQ.3).
    id: bindingId('logs.explain'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'log_explain_v1',
    viewModel: 'LogDetailView',
    status: { kind: 'live' },
  },
  {
    // Live tailing. v1 polls `logs.query` over the recent window (F0.6 live-store); the dedicated bounded
    // decision SUBSCRIBE push op is crdb Part B and swaps in without changing the surface.
    id: bindingId('logs.tail'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'log_tail_v1',
    viewModel: 'LogPage',
    status: {
      kind: 'pending',
      owningRepo: 'crdb',
      gatingTask: 'IP-CONSOLE-READINESS Part B (bounded decision SUBSCRIBE push stream)',
    },
  },
  {
    // A real audited engine export of the current filtered set, recorded on the audit chain (crdb
    // LOG_EXPORT, IP-CONSOLE-LOG-QUERY LQ.4, landed). Never a client-assembled CSV of a plain read: the
    // rows come from the audited op, whose receipt lands on the chain.
    id: bindingId('logs.export'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'log_export_v1',
    viewModel: 'LogExportView',
    status: { kind: 'live' },
  },
];

// -- IP-CONSOLE-01 (Overview, P1.3) the `overview.*` connectivity-graph bindings --------------------
//
// The flagship home surface: the tenant-wide connectivity flow. `overview.graph` is LIVE against the crdb
// IP-CONSOLE-CONNECTIVITY producer (CONNECTIVITY_GRAPH over :7878, landed CN.1-CN.N); since RD.4b the
// consumer is the Sankey route (`GET /api/overview/sankey` -> `OverviewSankey`) -- the pre-redesign flat
// `OverviewGraph` view model and its `/api/overview/graph` route are retired (an unconsumed route is a
// stub in reverse). `overview.entityConnections` is LIVE over the crdb ENTITY_CONNECTIONS read (ER.5).
// `overview.live` (the real push stream) is an honest PENDING deferral naming its gating engine task --
// v1 liveness polls `/api/overview/sankey` on the F0.6 live-store. Trust score was removed; each VTZ is
// colored by its own detection-driven risk band (green/yellow/red).

const overviewReads: readonly ReadBinding[] = [
  {
    // The tenant-wide connectivity roll-up: source-class/destination-class nodes + weighted edges + the
    // risk band, bounded + time-windowed engine-side (crdb CONNECTIVITY_GRAPH, IP-CONSOLE-CONNECTIVITY
    // CN.2). The middle "Public" VTZ is a Console render concept colored by the graph's risk band.
    id: bindingId('overview.graph'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'connectivity_graph_v1',
    viewModel: 'OverviewSankey',
    status: { kind: 'live' },
  },
  {
    // One entity's outbound connections for the hover highlight + drawer prefetch (crdb ENTITY_CONNECTIONS,
    // IP-CONSOLE-ENTITY-READ ER.5). LIVE; feeds the < 3-click drill-in (O1.6).
    id: bindingId('overview.entityConnections'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'entity_connections_v1',
    viewModel: 'ConnectionList',
    status: { kind: 'live' },
  },
  {
    // Live deltas. v1 polls `/api/overview/sankey` over the recent window (F0.6 live-store); the
    // dedicated bounded push SUBSCRIBE op is crdb Part B and swaps in without changing the surface.
    id: bindingId('overview.live'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'overview_live_v1',
    viewModel: 'OverviewSankey',
    status: {
      kind: 'pending',
      owningRepo: 'crdb',
      gatingTask: 'IP-CONSOLE-READINESS Part B (bounded connectivity SUBSCRIBE push stream)',
    },
  },
];

// -- IP-CONSOLE-02 (Virtual Trust Zones, Phase 3) the `vtz.*` governance bindings ---------------------
//
// The first governance surface. The engine half is the crdb VTZ system of record
// (`IP-CONSOLE-VTZ-SUBSTRATE` VZ.1-VZ.N, live over :7878, deployed 2026-07-19), so both reads and all
// four audited mutations are LIVE-backed: `VtzTree` / `VtzDetail` reads and `VtzCreate` / `VtzEdit` /
// `VtzRescope` / `VtzDelete` writes, each re-validating the catastrophic floor + tighten-only inheritance
// engine-side and committing through the audit chain. `vtz.riskBand` is a JOIN over the already-live
// `overview.graph` per-VTZ risk band -- no new engine op, and the reason there is NO trust score on this
// surface (the wire carries none). The three PENDING entries are honest cross-repo deferrals: zone
// MEMBERSHIP has no substrate (crdb `VtzSetMembership` was deferred as it would have been a stub), and a
// per-zone policy count needs the Policies surface's store. Their cards render the honest absence.

const vtzReads: readonly ReadBinding[] = [
  {
    // The tenant's zone tree: every zone with its own + effective (tighten-only composed) per-domain
    // postures, archetype, lifecycle, and real direct-child count (crdb VtzTree, VZ.3a/VZ.3b).
    id: bindingId('vtz.tree'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'vtz_tree_v1',
    viewModel: 'VtzTree',
    status: { kind: 'live' },
  },
  {
    // One zone plus the ancestor chain contributing to its effective posture, so the editor can name
    // WHICH ancestor tightened a domain (crdb VtzDetail, VZ.3a/VZ.3b).
    id: bindingId('vtz.detail'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'vtz_detail_v1',
    viewModel: 'VtzDetailView',
    status: { kind: 'live' },
  },
  {
    // The zone card's health signal, replacing the removed trust score: a JOIN of the live
    // `overview.graph` per-VTZ WireRiskBand by zone id (crdb CONNECTIVITY_GRAPH). No new engine op.
    id: bindingId('vtz.riskBand'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'connectivity_graph_v1',
    viewModel: 'OverviewRiskBand',
    status: { kind: 'live' },
  },
  {
    // Users/objects assigned to a zone. crdb has no zone-membership store: VZ.4a deliberately DEFERRED
    // the VtzSetMembership verb rather than ship a stub, so the card omits the count entirely.
    id: bindingId('vtz.memberCounts'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'vtz_member_counts_v1',
    viewModel: 'VtzMemberCounts',
    status: {
      kind: 'pending',
      owningRepo: 'crdb',
      gatingTask:
        'IP-CONSOLE-VTZ-SUBSTRATE VtzSetMembership (zone-membership substrate, TRD-CONSOLE-12)',
    },
  },
  {
    // Policies scoped to a zone. Needs the crdb policy store the Policies surface produces.
    id: bindingId('vtz.policyCount'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'vtz_policy_count_v1',
    viewModel: 'VtzPolicyCount',
    status: {
      kind: 'pending',
      owningRepo: 'crdb',
      gatingTask: 'IP-CONSOLE-05 Policies surface (crdb policy store)',
    },
  },
];

const vtzCommands: readonly CommandBinding[] = [
  {
    // Author a new zone (crdb VtzCreate, VZ.4a/VZ.4b): audited through the Committer, with the
    // catastrophic floor + tighten-only inheritance re-validated engine-side. Confirm-gated in the SPA.
    id: bindingId('vtz.create'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'vtz_create_v1',
    authz: 'operator:vtz.author',
    audited: true,
    status: { kind: 'live' },
  },
  {
    // Edit a zone's own postures + settings, incl. the draft -> published transition (crdb VtzEdit).
    id: bindingId('vtz.edit'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'vtz_edit_v1',
    authz: 'operator:vtz.author',
    audited: true,
    status: { kind: 'live' },
  },
  {
    // Re-scope a zone: a RENAME (the dotted name is the hierarchy; parent is its lexical prefix, not a
    // stored pointer), audited (crdb VtzRescope).
    id: bindingId('vtz.rescope'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'vtz_rescope_v1',
    authz: 'operator:vtz.author',
    audited: true,
    status: { kind: 'live' },
  },
  {
    // Delete a zone, audited; the engine refuses a zone that still has children (a typed Conflict the
    // surface reports honestly rather than swallowing) (crdb VtzDelete).
    id: bindingId('vtz.delete'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'vtz_delete_v1',
    authz: 'operator:vtz.author',
    audited: true,
    status: { kind: 'live' },
  },
  {
    // "Modify VTZ assignment" -- move an entity into/out of a zone. Same deferral as `vtz.memberCounts`:
    // no membership substrate exists, so the control is a labelled non-live affordance, never a button
    // that silently does nothing.
    id: bindingId('vtz.setMembership'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'vtz_set_membership_v1',
    authz: 'operator:vtz.reassign',
    audited: true,
    status: {
      kind: 'pending',
      owningRepo: 'crdb',
      gatingTask:
        'IP-CONSOLE-VTZ-SUBSTRATE VtzSetMembership (zone-membership substrate, TRD-CONSOLE-12)',
    },
  },
];

// -- IP-CONSOLE-04 (Users and Identity, UY.1) the `users.*` / `groups.*` / `idam.*` bindings --------
//
// Engine phase E1-E3 landed 2026-07-21 (crdb `559b7aad`): the ER.6 directory reads
// (LIST_PRINCIPALS / LIST_GROUPS over the TRD-35 Local User Graph) and the LU.P provisioning
// commands (PRINCIPAL_CREATE/EDIT/SET_STATUS + GROUP_CREATE/EDIT/SET_MEMBERS, audited atomic
// batches attributed to the delegated operator) are all live engine ops, so every users/groups
// binding registers LIVE. The `idam.*` bindings are now LIVE too: the crdb TRD-35 Phase-2 IdAM
// adapters landed (IP-LUG-IDAM-AUTH0 IA.7/IA.8, live Auth0 capstone green 2026-07-23), so
// `IDAM_CONNECTORS` / `IDAM_SYNC` / `IDAM_CONFIGURE` are real engine ops. ID.1 flips the bindings; the
// BFF resolver + SPA wiring (and deleting the shell) follow in ID.2-ID.4. NO trust binding exists
// (operator ruling 2026-07-21).

const usersReads: readonly ReadBinding[] = [
  {
    // The All Users table: the LUG principal directory (observed accounts + provisioned local
    // records, one row shape), tenant-private, clearance-filtered, bounded (crdb ER.6).
    id: bindingId('users.list'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'list_principals_v1',
    viewModel: 'PrincipalRow',
    status: { kind: 'live' },
  },
  {
    // A principal's full record for the drawer: the same directory read, keyed client-side by
    // principal id (the bounded read carries the full row; no second engine op needed).
    id: bindingId('users.detail'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'list_principals_v1',
    viewModel: 'PrincipalRow',
    status: { kind: 'live' },
  },
  {
    // The Groups tab: enterprise groups + observed device groups with DIRECT member counts.
    id: bindingId('groups.list'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'list_groups_v1',
    viewModel: 'GroupCard',
    status: { kind: 'live' },
  },
  {
    // A group's card detail (same bounded read; members enumerate via the directory's chips).
    id: bindingId('groups.detail'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'list_groups_v1',
    viewModel: 'GroupCard',
    status: { kind: 'live' },
  },
  {
    // The External IDAM connector list: LIVE on crdb IDAM_CONNECTORS (IA.8). An unfederated node
    // returns an empty list (rendered "no connector configured"), never a fabricated card.
    id: bindingId('idam.connectors'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'idam_connectors_v1',
    viewModel: 'IdamConnector',
    status: { kind: 'live' },
  },
];

const usersCommands: readonly CommandBinding[] = [
  {
    // Add User: provisions a local enterprise record (TRD-35 6.3), audited, duplicate-refused.
    id: bindingId('users.create'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'principal_create_v1',
    authz: 'operator:users.manage',
    audited: true,
    status: { kind: 'live' },
  },
  {
    // Edit a local record's enterprise fields; an IdAM-owned field refusal arrives with Phase 2.
    id: bindingId('users.edit'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'principal_edit_v1',
    authz: 'operator:users.manage',
    audited: true,
    status: { kind: 'live' },
  },
  {
    // Activate / suspend / revoke (never a delete; history preserved).
    id: bindingId('users.setStatus'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'principal_set_status_v1',
    authz: 'operator:users.manage',
    audited: true,
    status: { kind: 'live' },
  },
  {
    id: bindingId('groups.create'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'group_create_v1',
    authz: 'operator:users.manage',
    audited: true,
    status: { kind: 'live' },
  },
  {
    id: bindingId('groups.edit'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'group_edit_v1',
    authz: 'operator:users.manage',
    audited: true,
    status: { kind: 'live' },
  },
  {
    // Membership set-diff: additions written, removals tombstoned engine-side.
    id: bindingId('groups.setMembers'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'group_set_members_v1',
    authz: 'operator:users.manage',
    audited: true,
    status: { kind: 'live' },
  },
  {
    // Configure a federation connector (enabled + the two cadences; NO secret): LIVE on crdb
    // IDAM_CONFIGURE (IA.8), audited, applied without restart.
    id: bindingId('idam.configure'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'idam_configure_v1',
    authz: 'operator:users.manage',
    audited: true,
    status: { kind: 'live' },
  },
  {
    // Trigger a real federation sync: LIVE on crdb IDAM_SYNC (IA.8), audited. An ACK, not a result --
    // the sync loop picks up the queued walk and the connector card reports progress.
    id: bindingId('idam.sync'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'idam_sync_v1',
    authz: 'operator:users.manage',
    audited: true,
    status: { kind: 'live' },
  },
];

// -- IP-CONSOLE-10 (Objects, O10.1) the `objects.*` bindings -----------------------------------------
//
// The crdb named-object registry (IP-CONSOLE-OBJECT-SUBSTRATE OB.1-OB.N, landed): OBJECT_LIST /
// OBJECT_DETAIL reads + OBJECT_CREATE/EDIT/DELETE audited commands, all live engine ops, so every
// binding registers LIVE. An object never applies policy (operator ruling: the Policy surface is the
// only binder), so NO apply/enforce binding exists; the drawer's governing-policies panel is a
// separate PENDING binding naming the Policy epic (CONSOLE-05).

const objectReads: readonly ReadBinding[] = [
  {
    // The catalog: the tenant's named objects grouped by kind, tenant-private, bounded (crdb OB.3).
    id: bindingId('objects.list'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'object_list_v1',
    viewModel: 'ObjectCard',
    status: { kind: 'live' },
  },
  {
    // One object + its read-time resolved members (the drawer detail; crdb OB.3).
    id: bindingId('objects.detail'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'object_detail_v1',
    viewModel: 'ObjectDetailView',
    status: { kind: 'live' },
  },
  {
    // The governing policies for an object: resolved Policy-side (TRD-04 scope), no queryable
    // crdb surface yet -- PENDING behind the Policy epic (CONSOLE-05).
    id: bindingId('objects.governingPolicies'),
    kind: 'read',
    surface: 'forge',
    op: 'object_governing_policies_v1',
    viewModel: 'GoverningPoliciesView',
    status: {
      kind: 'pending',
      owningRepo: 'crdb',
      gatingTask: 'TRD-CONSOLE-05 Policy surface (object -> governing-policy resolution)',
    },
  },
];

const objectCommands: readonly CommandBinding[] = [
  {
    // Register a named object (crdb OBJECT_CREATE), audited, duplicate-refused.
    id: bindingId('objects.create'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'object_create_v1',
    authz: 'operator:objects.manage',
    audited: true,
    status: { kind: 'live' },
  },
  {
    id: bindingId('objects.edit'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'object_edit_v1',
    authz: 'operator:objects.manage',
    audited: true,
    status: { kind: 'live' },
  },
  {
    // Delete (tombstone; history preserved) a named object.
    id: bindingId('objects.delete'),
    kind: 'command',
    surface: 'cruciblql',
    op: 'object_delete_v1',
    authz: 'operator:objects.manage',
    audited: true,
    status: { kind: 'live' },
  },
];

function register(target: Record<string, Binding>, entries: readonly Binding[]): void {
  for (const entry of entries) {
    target[entry.id] = entry;
  }
}

const registry: Record<string, Binding> = {};
register(registry, entityReads);
register(registry, entityCommands);
register(registry, logReads);
register(registry, overviewReads);
register(registry, vtzReads);
register(registry, vtzCommands);
register(registry, usersReads);
register(registry, usersCommands);
register(registry, objectReads);
register(registry, objectCommands);

/** The Console binding registry. Keyed by `BindingId`; populated by the surface IPs. */
export const bindings: BindingManifest = registry;
