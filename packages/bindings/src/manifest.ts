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
    // A real audited engine export of the current filtered set, recorded on the audit chain. Never a
    // client-assembled CSV of fetched rows.
    id: bindingId('logs.export'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'log_export_v1',
    viewModel: 'LogPage',
    status: {
      kind: 'pending',
      owningRepo: 'crdb',
      gatingTask: 'IP-CONSOLE-LOG-QUERY LQ.4 (audited LOG_EXPORT)',
    },
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

/** The Console binding registry. Keyed by `BindingId`; populated by the surface IPs. */
export const bindings: BindingManifest = registry;
