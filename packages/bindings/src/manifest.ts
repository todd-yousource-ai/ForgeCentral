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
// `entity.capabilities` is PENDING behind the Torch Construction Report read binding. Trust Score was
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
    // The wrapped agent's signed Construction Report (Torch torch-inspect). The report exists at onboard;
    // exposing it on a read surface needs a crdb/torch read binding that is not yet wired (INV-CROSS).
    id: bindingId('entity.capabilities'),
    kind: 'read',
    surface: 'torch',
    op: 'entity_capabilities_v1',
    viewModel: 'CapabilitiesView',
    status: {
      kind: 'pending',
      owningRepo: 'torch',
      gatingTask: 'IP-CONSOLE-12 DR.4: torch-inspect Construction Report read binding',
    },
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

function register(target: Record<string, Binding>, entries: readonly Binding[]): void {
  for (const entry of entries) {
    target[entry.id] = entry;
  }
}

const registry: Record<string, Binding> = {};
register(registry, entityReads);
register(registry, entityCommands);

/** The Console binding registry. Keyed by `BindingId`; populated by the surface IPs. */
export const bindings: BindingManifest = registry;
