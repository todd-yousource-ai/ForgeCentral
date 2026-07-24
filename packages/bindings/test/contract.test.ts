// packages/bindings/test/contract.test.ts -- F0.4 the no-stub contract (INV-CONSOLE-NO-STUB), tier 3.

import { type BindingManifest, type ReadBinding, bindingId } from '@forge/contracts';
import { describe, expect, it } from 'vitest';

import { assertReleaseReady, bindings, validateManifest } from '../src/index.js';

const liveRead: ReadBinding = {
  id: bindingId('overview.sankey.read'),
  kind: 'read',
  surface: 'cruciblql',
  op: 'connectivity_graph_v1',
  viewModel: 'OverviewSankey',
  status: { kind: 'live' },
};

describe('INV-CONSOLE-NO-STUB: the committed binding registry', () => {
  it('is structurally well-formed (every binding dev-valid)', () => {
    expect(validateManifest(bindings)).toEqual([]);
  });

  it('its only release blocker is the named PENDING deferrals (no structural fault, no mock op)', () => {
    // The registry now carries real surfaces whose engine work is honestly deferred (INV-CROSS), so a
    // release build is correctly gated. Prove the ONLY reason it is not release-ready is those tracked
    // PENDING bindings -- there is no structural violation and no mock op hiding behind the gate.
    expect(validateManifest(bindings)).toEqual([]);
    const pending = Object.values(bindings).filter((b) => b.status.kind === 'pending');
    expect(pending.length).toBeGreaterThan(0);
    expect(() => assertReleaseReady(bindings)).toThrow(/PENDING bindings must not ship/);
    for (const binding of pending) {
      if (binding.status.kind === 'pending') {
        expect(binding.status.owningRepo).not.toBe('');
        expect(binding.status.gatingTask).not.toBe('');
      }
    }
  });
});

describe('IP-CONSOLE-12 DR.1: the entity-drawer (entity.*) bindings', () => {
  const entityBindings = Object.values(bindings).filter((b) => b.id.startsWith('entity.'));

  it('registers every drawer section read + quick-action command', () => {
    const ids = entityBindings.map((b) => b.id).sort();
    expect(ids).toEqual(
      [
        'entity.header',
        'entity.info',
        'entity.zones',
        'entity.capabilities',
        'entity.effectivePolicies',
        'entity.recentDecisions',
        'entity.isolate',
        'entity.reassignZone',
        'entity.remediation',
        'entity.fullReport',
      ].sort(),
    );
  });

  it('binds the engine-backed section reads live (identity/status/info + decisions)', () => {
    // Backed by crdb ER.1 (LIST_AGENTS) + ER.2c (ENTITY_DECISIONS); these are genuinely live.
    for (const id of ['entity.header', 'entity.info', 'entity.recentDecisions']) {
      const binding = bindings[id];
      expect(binding?.kind).toBe('read');
      expect(binding?.surface).toBe('cruciblql');
      expect(binding?.status.kind).toBe('live');
    }
  });

  it('defers zones + effective policies to Forge (no queryable store in crdb)', () => {
    for (const id of ['entity.zones', 'entity.effectivePolicies']) {
      const binding = bindings[id];
      expect(binding?.status.kind).toBe('pending');
      if (binding?.status.kind === 'pending') {
        expect(binding.status.owningRepo).toBe('forge');
      }
    }
  });

  it('binds capabilities LIVE to the crdb agent_capabilities virtual relation (DR.4 / VR.3)', () => {
    const capabilities = bindings['entity.capabilities'];
    expect(capabilities?.status.kind).toBe('live');
    expect(capabilities?.surface).toBe('cruciblql');
    expect(capabilities?.op).toBe('agent_capabilities_v1');
  });

  it('exposes Isolate as a real audited command with enforcement off by posture, not fabrication', () => {
    const isolate = bindings['entity.isolate'];
    expect(isolate?.kind).toBe('command');
    expect(isolate?.status.kind).toBe('live');
    if (isolate?.kind === 'command') {
      expect(isolate.audited).toBe(true);
      expect(isolate.authz).toBe('operator:contain');
    }
  });

  it('every quick action is an audited command; deferred ones name their gating surface', () => {
    for (const id of [
      'entity.isolate',
      'entity.reassignZone',
      'entity.remediation',
      'entity.fullReport',
    ]) {
      const binding = bindings[id];
      expect(binding?.kind).toBe('command');
      if (binding?.kind === 'command') {
        expect(binding.audited).toBe(true);
      }
      if (binding?.status.kind === 'pending') {
        expect(binding.status.gatingTask).not.toBe('');
      }
    }
  });
});

describe('IP-CONSOLE-09 LG.1: the Logs (logs.*) decision-LOG bindings', () => {
  const logBindings = Object.values(bindings).filter((b) => b.id.startsWith('logs.'));

  it('registers the four LOG bindings (query/explain/tail/export)', () => {
    const ids = logBindings.map((b) => b.id).sort();
    expect(ids).toEqual(['logs.explain', 'logs.export', 'logs.query', 'logs.tail']);
  });

  it('binds query + explain + export LIVE to the crdb LOG_QUERY / LOG_EXPLAIN / LOG_EXPORT producer', () => {
    // Backed by crdb IP-CONSOLE-LOG-QUERY LQ.2/LQ.3/LQ.4; genuinely live.
    const query = bindings['logs.query'];
    expect(query?.kind).toBe('read');
    expect(query?.surface).toBe('cruciblql');
    expect(query?.op).toBe('log_query_v1');
    expect(query?.status.kind).toBe('live');
    const explain = bindings['logs.explain'];
    expect(explain?.op).toBe('log_explain_v1');
    expect(explain?.status.kind).toBe('live');
    // logs.export is a REAL audited engine op (LQ.4), not a client-assembled CSV.
    const exportBinding = bindings['logs.export'];
    expect(exportBinding?.op).toBe('log_export_v1');
    expect(exportBinding?.status.kind).toBe('live');
  });

  it('defers only tail (the push stream) to its gating engine task, never a fabricated stream', () => {
    const tail = bindings['logs.tail'];
    expect(tail?.status.kind).toBe('pending');
    if (tail?.status.kind === 'pending') {
      expect(tail.status.owningRepo).toBe('crdb');
      expect(tail.status.gatingTask).not.toBe('');
    }
  });
});

describe('IP-CONSOLE-01 O1.1: the Overview (overview.*) connectivity bindings', () => {
  const overviewBindings = Object.values(bindings).filter((b) => b.id.startsWith('overview.'));

  it('registers the three Overview bindings (graph/entityConnections/live)', () => {
    const ids = overviewBindings.map((b) => b.id).sort();
    expect(ids).toEqual(['overview.entityConnections', 'overview.graph', 'overview.live']);
  });

  it('binds graph + entityConnections LIVE to the crdb CONNECTIVITY_GRAPH / ENTITY_CONNECTIONS producers', () => {
    // Backed by crdb IP-CONSOLE-CONNECTIVITY (CN.1-CN.N) + IP-CONSOLE-ENTITY-READ ER.5; genuinely live.
    const graph = bindings['overview.graph'];
    expect(graph?.kind).toBe('read');
    expect(graph?.surface).toBe('cruciblql');
    expect(graph?.op).toBe('connectivity_graph_v1');
    expect(graph?.status.kind).toBe('live');
    const connections = bindings['overview.entityConnections'];
    expect(connections?.op).toBe('entity_connections_v1');
    expect(connections?.status.kind).toBe('live');
  });

  it('defers only live (the push stream) to its gating engine task, never a fabricated stream', () => {
    const live = bindings['overview.live'];
    expect(live?.status.kind).toBe('pending');
    if (live?.status.kind === 'pending') {
      expect(live.status.owningRepo).toBe('crdb');
      expect(live.status.gatingTask).not.toBe('');
    }
  });
});

describe('IP-CONSOLE-02 V2.1: the Virtual Trust Zones (vtz.*) governance bindings', () => {
  const vtzBindings = Object.values(bindings).filter((b) => b.id.startsWith('vtz.'));

  it('registers every VTZ read + audited mutation binding', () => {
    const ids = vtzBindings.map((b) => b.id).sort();
    expect(ids).toEqual([
      'vtz.create',
      'vtz.delete',
      'vtz.detail',
      'vtz.edit',
      'vtz.memberCounts',
      'vtz.policyCount',
      'vtz.rescope',
      'vtz.riskBand',
      'vtz.setMembership',
      'vtz.tree',
    ]);
  });

  it('binds the tree + detail reads LIVE to the crdb VTZ system of record', () => {
    // Backed by crdb IP-CONSOLE-VTZ-SUBSTRATE (VZ.1-VZ.N), live over :7878 and deployed 2026-07-19.
    const tree = bindings['vtz.tree'];
    expect(tree?.kind).toBe('read');
    expect(tree?.surface).toBe('cruciblql');
    expect(tree?.op).toBe('vtz_tree_v1');
    expect(tree?.status.kind).toBe('live');
    const detail = bindings['vtz.detail'];
    expect(detail?.op).toBe('vtz_detail_v1');
    expect(detail?.status.kind).toBe('live');
  });

  it('sources zone health from the live Overview risk band, never a trust score', () => {
    // The wire carries no score, so the card's focal signal is posture + this JOIN over the already-live
    // connectivity graph. It deliberately reuses that op rather than inventing a new engine read.
    const riskBand = bindings['vtz.riskBand'];
    expect(riskBand?.op).toBe('connectivity_graph_v1');
    expect(riskBand?.status.kind).toBe('live');
    expect(vtzBindings.map((b) => b.id)).not.toContain('vtz.trustScore');
  });

  it('exposes all four authoring mutations as real audited commands', () => {
    for (const id of ['vtz.create', 'vtz.edit', 'vtz.rescope', 'vtz.delete']) {
      const command = bindings[id];
      expect(command?.kind).toBe('command');
      expect(command?.status.kind).toBe('live');
      if (command?.kind === 'command') {
        expect(command.audited).toBe(true);
        expect(command.authz).toBe('operator:vtz.author');
      }
    }
  });

  it('defers only membership + policy counts, each naming its gating engine task', () => {
    const pending = vtzBindings.filter((b) => b.status.kind === 'pending').map((b) => b.id);
    expect(pending.sort()).toEqual(['vtz.memberCounts', 'vtz.policyCount', 'vtz.setMembership']);
    for (const id of pending) {
      const binding = bindings[id];
      if (binding?.status.kind === 'pending') {
        expect(binding.status.owningRepo).toBe('crdb');
        expect(binding.status.gatingTask).not.toBe('');
      }
    }
  });
});

describe('IP-CONSOLE-04 ID.1: the External IDAM (idam.*) bindings', () => {
  const idamBindings = Object.values(bindings).filter((b) => b.id.startsWith('idam.'));

  it('registers the four IdAM bindings (connectors/configure/connect/sync)', () => {
    const ids = idamBindings.map((b) => b.id).sort();
    expect(ids).toEqual(['idam.configure', 'idam.connect', 'idam.connectors', 'idam.sync']);
  });

  it('binds the connector list LIVE to the crdb IDAM_CONNECTORS producer (IA.8)', () => {
    // Backed by crdb IP-LUG-IDAM-AUTH0 IA.8 (live Auth0 capstone green 2026-07-23); genuinely live.
    const connectors = bindings['idam.connectors'];
    expect(connectors?.kind).toBe('read');
    expect(connectors?.surface).toBe('cruciblql');
    expect(connectors?.op).toBe('idam_connectors_v1');
    expect(connectors?.status.kind).toBe('live');
  });

  it('exposes configure + connect + sync as real audited LIVE commands (never a stub)', () => {
    for (const [id, op] of [
      ['idam.configure', 'idam_configure_v1'],
      ['idam.connect', 'idam_connect_v1'],
      ['idam.sync', 'idam_sync_v1'],
    ] as const) {
      const command = bindings[id];
      expect(command?.kind).toBe('command');
      expect(command?.op).toBe(op);
      expect(command?.status.kind).toBe('live');
      if (command?.kind === 'command') {
        expect(command.audited).toBe(true);
        expect(command.authz).toBe('operator:users.manage');
      }
    }
  });

  it('leaves NO idam.* binding PENDING (the engine half fully landed)', () => {
    expect(idamBindings.every((b) => b.status.kind === 'live')).toBe(true);
  });
});

describe('IP-CONSOLE-05 P5.1: the Policies (policies.*) authoring bindings', () => {
  const policyBindings = Object.values(bindings).filter((b) => b.id.startsWith('policies.'));

  it('registers the reads, the authoring commands, the distribution pair, and the enforcement deferral', () => {
    const ids = policyBindings.map((b) => b.id).sort();
    expect(ids).toEqual([
      'policies.byZone',
      'policies.convergence',
      'policies.create',
      'policies.delete',
      'policies.detail',
      'policies.distribute',
      'policies.edit',
      'policies.enforcement',
      'policies.publish',
    ]);
  });

  it('binds the P5.5 distribution pair LIVE: convergence over BUNDLE_CONVERGENCE, distribute audited', () => {
    const convergence = bindings['policies.convergence'];
    expect(convergence?.kind).toBe('read');
    expect(convergence?.op).toBe('bundle_convergence_v1');
    expect(convergence?.status.kind).toBe('live');
    const distribute = bindings['policies.distribute'];
    expect(distribute?.kind).toBe('command');
    expect(distribute?.op).toBe('bundle_commit_v1');
    expect(distribute?.status.kind).toBe('live');
    if (distribute?.kind === 'command') {
      expect(distribute.audited).toBe(true);
    }
  });

  it('binds the grouped list + detail reads LIVE to the crdb policy store (PS.5)', () => {
    const byZone = bindings['policies.byZone'];
    expect(byZone?.kind).toBe('read');
    expect(byZone?.surface).toBe('cruciblql');
    expect(byZone?.op).toBe('policy_list_by_zone_v1');
    expect(byZone?.status.kind).toBe('live');
    const detail = bindings['policies.detail'];
    expect(detail?.op).toBe('policy_detail_v1');
    expect(detail?.status.kind).toBe('live');
  });

  it('exposes create/edit/publish/delete as real audited LIVE commands (PS.6)', () => {
    for (const [id, op] of [
      ['policies.create', 'policy_create_v1'],
      ['policies.edit', 'policy_edit_v1'],
      ['policies.publish', 'policy_publish_v1'],
      ['policies.delete', 'policy_delete_v1'],
    ] as const) {
      const command = bindings[id];
      expect(command?.kind).toBe('command');
      expect(command?.op).toBe(op);
      expect(command?.status.kind).toBe('live');
      if (command?.kind === 'command') {
        expect(command.audited).toBe(true);
        expect(command.authz).toBe('operator:policies.author');
      }
    }
  });

  it('defers only host enforcement to torch, naming its gating task (never a fabricated realization)', () => {
    const pending = policyBindings.filter((b) => b.status.kind === 'pending').map((b) => b.id);
    expect(pending).toEqual(['policies.enforcement']);
    const enforcement = bindings['policies.enforcement'];
    expect(enforcement?.surface).toBe('torch');
    if (enforcement?.status.kind === 'pending') {
      expect(enforcement.status.owningRepo).toBe('torch');
      expect(enforcement.status.gatingTask).toContain('IP-TORCH-POLICY-ENFORCE');
    }
  });
});

describe('INV-CONSOLE-NO-STUB: the enforcement rules', () => {
  it('accepts a well-formed live read binding', () => {
    const manifest: BindingManifest = { [liveRead.id]: liveRead };
    expect(validateManifest(manifest)).toEqual([]);
    expect(() => assertReleaseReady(manifest)).not.toThrow();
  });

  it('flags a manifest key / binding id mismatch', () => {
    const manifest: BindingManifest = { 'wrong.key': liveRead };
    expect(validateManifest(manifest)[0]?.problem).toMatch(/does not match binding id/);
  });

  it('rejects a mock/fixture op at all times', () => {
    const manifest: BindingManifest = {
      'm.read': { ...liveRead, id: bindingId('m.read'), op: 'mock:fake-rows' },
    };
    expect(validateManifest(manifest).some((v) => /mock/.test(v.problem))).toBe(true);
  });

  it('requires a command binding to be audited', () => {
    const manifest = {
      'vtz.isolate': {
        id: 'vtz.isolate',
        kind: 'command',
        surface: 'torch',
        op: 'vtz_isolate',
        authz: 'admin:contain',
        audited: false,
        status: { kind: 'live' },
      },
    } as unknown as BindingManifest;
    expect(validateManifest(manifest).some((v) => /audited/.test(v.problem))).toBe(true);
  });

  it('requires a PENDING binding to name its owning repo + gating task', () => {
    const manifest: BindingManifest = {
      'y.read': {
        ...liveRead,
        id: bindingId('y.read'),
        status: { kind: 'pending', owningRepo: '', gatingTask: '' },
      },
    };
    expect(validateManifest(manifest).some((v) => /owning repo/.test(v.problem))).toBe(true);
  });

  it('lets a well-named PENDING binding pass DEV validation but FAIL a release build', () => {
    const manifest: BindingManifest = {
      'z.read': {
        ...liveRead,
        id: bindingId('z.read'),
        status: { kind: 'pending', owningRepo: 'torch', gatingTask: 'CONSOLE-02 VTZ isolate' },
      },
    };
    expect(validateManifest(manifest)).toEqual([]); // dev: a tracked deferral is allowed
    expect(() => assertReleaseReady(manifest)).toThrow(/PENDING/); // release: never ships
  });
});
