// packages/bindings/test/contract.test.ts -- F0.4 the no-stub contract (INV-CONSOLE-NO-STUB), tier 3.

import { type BindingManifest, type ReadBinding, bindingId } from '@forge/contracts';
import { describe, expect, it } from 'vitest';

import { assertReleaseReady, bindings, validateManifest } from '../src/index.js';

const liveRead: ReadBinding = {
  id: bindingId('overview.graph.read'),
  kind: 'read',
  surface: 'cruciblql',
  op: 'overview_graph_v1',
  viewModel: 'OverviewGraph',
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
