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

// -- IP-CONSOLE-12 (entity drawer, P1.1) DR.1: the `entity.*` drawer contract bindings ---------------
//
// One binding per drawer section read + one per quick action (TRD-CONSOLE-12 Section 3). The five section
// reads have real CrucibleQL backing today (INV-CONSOLE-CRUCIBLEQL-FIRST; the DR.3 resolver wires them);
// `entity.capabilities` is PENDING behind the Torch Construction Report read binding (DR.4); the Isolate
// command is real (enforcement OFF is a runtime posture, not a binding-liveness question), and the other
// three quick actions are PENDING behind the engine command / target surface that exposes them (DR.5).

const entityReads: readonly ReadBinding[] = [
  {
    id: bindingId('entity.header'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'entity_header_v1',
    viewModel: 'HeaderView',
    status: { kind: 'live' },
  },
  {
    id: bindingId('entity.info'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'entity_info_v1',
    viewModel: 'EntityInfoView',
    status: { kind: 'live' },
  },
  {
    id: bindingId('entity.zones'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'entity_zones_v1',
    viewModel: 'ZonesView',
    status: { kind: 'live' },
  },
  {
    id: bindingId('entity.effectivePolicies'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'entity_effective_policies_v1',
    viewModel: 'EffectivePoliciesView',
    status: { kind: 'live' },
  },
  {
    id: bindingId('entity.recentDecisions'),
    kind: 'read',
    surface: 'cruciblql',
    op: 'entity_recent_decisions_v1',
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
