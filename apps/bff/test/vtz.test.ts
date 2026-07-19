// apps/bff/test/vtz.test.ts -- the VTZ read resolvers (IP-CONSOLE-02 V2.2), tier 2.
//
// Proves INV-CONSOLE-VTZ-BROKERED at the resolver layer: the tree/detail reads are brokered through the
// OperatorEngine (so the operator delegation is injected and the read is tenant-narrowed engine-side),
// bounded before they reach the engine, projected through the ONE shared contract projection, and FAILED
// CLOSED when the engine emits an enum tag the Console does not know -- never a defaulted posture.

import type {
  WireVtzDetail,
  WireVtzDetailQuery,
  WireVtzTree,
  WireVtzTreeQuery,
} from '@forge/contracts';
import { describe, expect, it } from 'vitest';

import type { OperatorEngine } from '../src/engine/operator-engine.js';
import type { OperatorPrincipal } from '../src/engine/principal.js';
import {
  MAX_VTZ_TREE_LIMIT,
  VtzUnavailableError,
  resolveVtzDetail,
  resolveVtzTree,
} from '../src/engine/vtz.js';

const principal: OperatorPrincipal = {
  subject: 'auth0|op',
  tier: 'Admin',
  principalId: 'principal-op',
  tenant: 'tenant-op',
};

/** The engine's eleven-domain matrix; `network` varies so own-vs-effective can differ. */
const postures = (network = 'permit-deny-risky') => [
  { domain: 'governed-egress', posture: 'deny', floor: true },
  { domain: 'execution', posture: 'deny', floor: true },
  { domain: 'privilege-escalation', posture: 'deny', floor: false },
  { domain: 'kernel-module', posture: 'deny', floor: false },
  { domain: 'credential-store', posture: 'deny', floor: false },
  { domain: 'persistence', posture: 'permit-deny-risky', floor: false },
  { domain: 'ordinary-network', posture: network, floor: false },
  { domain: 'file-and-config', posture: 'permit-deny-risky', floor: false },
  { domain: 'memory', posture: 'permit-deny-risky', floor: false },
  { domain: 'ipc', posture: 'permit-deny-risky', floor: false },
  { domain: 'device', posture: 'permit-deny-risky', floor: false },
];

const zone = (overrides: Record<string, unknown> = {}) => ({
  id: 'YouSource.Corp.Finance',
  name: 'YouSource.Corp.Finance',
  parent: 'YouSource.Corp',
  zone_type: 'standard',
  lifecycle: 'published',
  micro_segmentation: true,
  telemetry: 'full',
  reauth_interval_hours: 8,
  own_postures: postures(),
  effective_postures: postures('deny'),
  sub_zone_count: 2,
  ...overrides,
});

/** A mock OperatorEngine whose VTZ reads are scripted and which captures the wire requests it saw. */
function engineWith(replies: { tree?: WireVtzTree; detail?: WireVtzDetail }): {
  engine: OperatorEngine;
  trees: WireVtzTreeQuery[];
  details: WireVtzDetailQuery[];
} {
  const unused = () => Promise.reject(new Error('unused'));
  const trees: WireVtzTreeQuery[] = [];
  const details: WireVtzDetailQuery[] = [];
  const engine: OperatorEngine = {
    querySubmit: unused,
    cursorFetch: unused,
    cursorClose: unused,
    listAgents: unused,
    entityDecisions: unused,
    entityConnections: unused,
    connectivityGraph: unused,
    connectivityMembers: unused,
    contain: unused,
    logQuery: unused,
    logExplain: unused,
    logExport: unused,
    vtzTree: (_principal, request) => {
      trees.push(request);
      return replies.tree ? Promise.resolve(replies.tree) : unused();
    },
    vtzDetail: (_principal, request) => {
      details.push(request);
      return replies.detail ? Promise.resolve(replies.detail) : unused();
    },
  };
  return { engine, trees, details };
}

describe('resolveVtzTree (V2.2)', () => {
  it('projects the engine tree into the shared view model (real zones, real counts)', async () => {
    const { engine } = engineWith({
      tree: { nodes: [zone(), zone({ id: 'root', name: 'root', parent: null })], truncated: false },
    });
    const view = await resolveVtzTree(engine, principal, 50);
    expect(view.zones).toHaveLength(2);
    expect(view.zones[0]?.name).toBe('YouSource.Corp.Finance');
    expect(view.zones[0]?.subZoneCount).toBe(2);
    expect(view.zones[1]?.parent).toBeNull();
    expect(view.truncated).toBe(false);
  });

  it('surfaces own vs effective posture so tighten-only inheritance is visible', async () => {
    const { engine } = engineWith({ tree: { nodes: [zone()], truncated: false } });
    const view = await resolveVtzTree(engine, principal, 50);
    const own = view.zones[0]?.ownPostures.find((p) => p.domain === 'ordinary-network');
    const effective = view.zones[0]?.effectivePostures.find((p) => p.domain === 'ordinary-network');
    expect(own?.posture).toBe('permit-deny-risky');
    expect(effective?.posture).toBe('deny');
    // The catastrophic floor arrives flagged by the ENGINE; the resolver never decides it.
    expect(view.zones[0]?.ownPostures.filter((p) => p.floor).map((p) => p.domain)).toEqual([
      'governed-egress',
      'execution',
    ]);
  });

  it('bounds the read before it reaches the engine and clamps an absurd limit', async () => {
    const { engine, trees } = engineWith({ tree: { nodes: [], truncated: false } });
    await resolveVtzTree(engine, principal, 10_000);
    await resolveVtzTree(engine, principal, 0);
    expect(trees[0]?.limit).toBe(MAX_VTZ_TREE_LIMIT);
    expect(trees[1]?.limit).toBe(1);
  });

  it('leaves the operator null on the wire request (the OperatorEngine injects it, not the resolver)', async () => {
    const { engine, trees } = engineWith({ tree: { nodes: [], truncated: false } });
    await resolveVtzTree(engine, principal, 50);
    expect(trees[0]?.operator).toBeNull();
  });

  it('renders a fixtureless empty tenant honestly (no fabricated zone)', async () => {
    const { engine } = engineWith({ tree: { nodes: [], truncated: false } });
    expect(await resolveVtzTree(engine, principal, 50)).toEqual({ zones: [], truncated: false });
  });

  it('propagates the engine truncation flag rather than presenting a prefix as the whole store', async () => {
    const { engine } = engineWith({ tree: { nodes: [zone()], truncated: true } });
    expect((await resolveVtzTree(engine, principal, 50)).truncated).toBe(true);
  });

  it('fails CLOSED on an unknown enum tag instead of defaulting a posture', async () => {
    for (const bad of [
      zone({ zone_type: 'restricted' }),
      zone({ lifecycle: 'archived' }),
      zone({ telemetry: 'verbose' }),
      zone({ own_postures: [{ domain: 'ipc', posture: 'permit', floor: false }] }),
    ]) {
      const { engine } = engineWith({ tree: { nodes: [bad], truncated: false } });
      await expect(resolveVtzTree(engine, principal, 50)).rejects.toBeInstanceOf(
        VtzUnavailableError,
      );
    }
  });
});

describe('resolveVtzDetail (V2.2)', () => {
  it('projects the zone and its effective-posture ancestor chain', async () => {
    const { engine, details } = engineWith({
      detail: {
        zone: zone(),
        ancestors: [
          { id: 'YouSource', name: 'YouSource' },
          { id: 'YouSource.Corp', name: 'YouSource.Corp' },
        ],
      },
    });
    const view = await resolveVtzDetail(engine, principal, 'YouSource.Corp.Finance');
    expect(view.zone?.name).toBe('YouSource.Corp.Finance');
    expect(view.ancestors.map((a) => a.name)).toEqual(['YouSource', 'YouSource.Corp']);
    expect(details[0]?.vtz_id).toBe('YouSource.Corp.Finance');
    expect(details[0]?.operator).toBeNull();
  });

  it('treats an unknown zone id as the honest not-found state, not an error', async () => {
    const { engine } = engineWith({ detail: { zone: null, ancestors: [] } });
    const view = await resolveVtzDetail(engine, principal, 'No.Such.Zone');
    expect(view).toEqual({ zone: null, ancestors: [] });
  });

  it('fails CLOSED when a PRESENT zone carries an unknown enum tag', async () => {
    const { engine } = engineWith({
      detail: { zone: zone({ lifecycle: 'archived' }), ancestors: [] },
    });
    await expect(resolveVtzDetail(engine, principal, 'YouSource.Corp')).rejects.toBeInstanceOf(
      VtzUnavailableError,
    );
  });
});
