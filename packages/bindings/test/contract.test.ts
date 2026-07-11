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

  it('binds the five CrucibleQL section reads live', () => {
    for (const id of [
      'entity.header',
      'entity.info',
      'entity.zones',
      'entity.effectivePolicies',
      'entity.recentDecisions',
    ]) {
      const binding = bindings[id];
      expect(binding?.kind).toBe('read');
      expect(binding?.surface).toBe('cruciblql');
      expect(binding?.status.kind).toBe('live');
    }
  });

  it('defers capabilities to the Torch Construction Report read binding (DR.4)', () => {
    const capabilities = bindings['entity.capabilities'];
    expect(capabilities?.status.kind).toBe('pending');
    if (capabilities?.status.kind === 'pending') {
      expect(capabilities.status.owningRepo).toBe('torch');
      expect(capabilities.status.gatingTask).toMatch(/Construction Report/);
    }
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
