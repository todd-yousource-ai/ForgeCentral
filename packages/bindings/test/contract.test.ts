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
  it('is structurally well-formed', () => {
    expect(validateManifest(bindings)).toEqual([]);
  });

  it('is release-ready (no PENDING binding, no mock op)', () => {
    expect(() => assertReleaseReady(bindings)).not.toThrow();
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
