// apps/bff/test/vtz.test.ts -- the VTZ read resolvers (IP-CONSOLE-02 V2.2), tier 2.
//
// Proves INV-CONSOLE-VTZ-BROKERED at the resolver layer: the tree/detail reads are brokered through the
// OperatorEngine (so the operator delegation is injected and the read is tenant-narrowed engine-side),
// bounded before they reach the engine, projected through the ONE shared contract projection, and FAILED
// CLOSED when the engine emits an enum tag the Console does not know -- never a defaulted posture.

import type {
  VtzSpecInput,
  WireVtzCreate,
  WireVtzDelete,
  WireVtzDetail,
  WireVtzDetailQuery,
  WireVtzEdit,
  WireVtzMutation,
  WireVtzRescope,
  WireBundleConvergence,
  WireVtzTree,
  WireVtzTreeQuery,
} from '@forge/contracts';
import { describe, expect, it } from 'vitest';

import type { OperatorEngine } from '../src/engine/operator-engine.js';
import type { OperatorPrincipal } from '../src/engine/principal.js';
import { EngineRefusedError } from '../src/engine/wire-client.js';
import {
  MAX_VTZ_TREE_LIMIT,
  VtzMutationRefusedError,
  VtzUnavailableError,
  classifyVtzRefusal,
  resolveVtzCreate,
  resolveVtzDelete,
  resolveBundleConvergence,
  resolveVtzDetail,
  resolveVtzEdit,
  resolveVtzRescope,
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
function engineWith(replies: {
  tree?: WireVtzTree;
  detail?: WireVtzDetail;
  convergence?: WireBundleConvergence;
}): {
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
    listPrincipals: unused,
    groupCreate: unused,
    groupEdit: unused,
    groupSetMembers: unused,
    principalCreate: unused,
    principalEdit: unused,
    principalSetStatus: unused,
    listGroups: unused,
    objectList: unused,
    objectCreate: unused,
    objectEdit: unused,
    objectDelete: unused,
    objectDetail: unused,
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
    vtzCreate: unused,
    bundleCommit: unused,
    bundleConvergence: () =>
      replies.convergence ? Promise.resolve(replies.convergence) : unused(),
    vtzEdit: unused,
    vtzRescope: unused,
    vtzDelete: unused,
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
        commit_version: 42,
      },
    });
    const view = await resolveVtzDetail(engine, principal, 'YouSource.Corp.Finance');
    expect(view.zone?.name).toBe('YouSource.Corp.Finance');
    expect(view.ancestors.map((a) => a.name)).toEqual(['YouSource', 'YouSource.Corp']);
    expect(details[0]?.vtz_id).toBe('YouSource.Corp.Finance');
    expect(details[0]?.operator).toBeNull();
  });

  it('treats an unknown zone id as the honest not-found state, not an error', async () => {
    const { engine } = engineWith({ detail: { zone: null, ancestors: [], commit_version: 7 } });
    const view = await resolveVtzDetail(engine, principal, 'No.Such.Zone');
    expect(view).toEqual({ zone: null, ancestors: [], commitVersion: 7 });
  });

  it('fails CLOSED when a PRESENT zone carries an unknown enum tag', async () => {
    const { engine } = engineWith({
      detail: { zone: zone({ lifecycle: 'archived' }), ancestors: [], commit_version: 7 },
    });
    await expect(resolveVtzDetail(engine, principal, 'YouSource.Corp')).rejects.toBeInstanceOf(
      VtzUnavailableError,
    );
  });
});

// --- the audited write path (V2.3) ---------------------------------------------------------------------

const spec: VtzSpecInput = {
  name: 'YouSource.Corp.Finance',
  description: 'Finance systems',
  zoneType: 'standard',
  ownPostures: [
    { domain: 'governed-egress', posture: 'deny', floor: true },
    { domain: 'execution', posture: 'deny', floor: true },
    { domain: 'ordinary-network', posture: 'permit-deny-risky', floor: false },
  ],
  microSegmentation: true,
  telemetry: 'full',
  reauthIntervalHours: 8,
  lifecycle: 'draft',
};

/** An engine refusal of the given class (what crdb's `vtz_store_refusal` emits; no message, no oracle). */
function refusal(cls: 'Conflict' | 'Denied' | 'Internal'): EngineRefusedError {
  return new EngineRefusedError({ class: cls, code: 0, retry: 'Never', correlation_id: 0 });
}

/** A mock OperatorEngine whose four mutations are scripted and which captures the wire requests. */
function mutatingEngine(reply: WireVtzMutation | Error): {
  engine: OperatorEngine;
  creates: WireVtzCreate[];
  edits: WireVtzEdit[];
  rescopes: WireVtzRescope[];
  deletes: WireVtzDelete[];
} {
  const unused = () => Promise.reject(new Error('unused'));
  const creates: WireVtzCreate[] = [];
  const edits: WireVtzEdit[] = [];
  const rescopes: WireVtzRescope[] = [];
  const deletes: WireVtzDelete[] = [];
  const settle = () => (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply));
  const engine: OperatorEngine = {
    querySubmit: unused,
    cursorFetch: unused,
    cursorClose: unused,
    listAgents: unused,
    listPrincipals: unused,
    groupCreate: unused,
    groupEdit: unused,
    groupSetMembers: unused,
    principalCreate: unused,
    principalEdit: unused,
    principalSetStatus: unused,
    listGroups: unused,
    objectList: unused,
    objectCreate: unused,
    objectEdit: unused,
    objectDelete: unused,
    objectDetail: unused,
    entityDecisions: unused,
    entityConnections: unused,
    connectivityGraph: unused,
    connectivityMembers: unused,
    contain: unused,
    logQuery: unused,
    logExplain: unused,
    logExport: unused,
    vtzTree: unused,
    vtzDetail: unused,
    bundleCommit: unused,
    bundleConvergence: unused,
    vtzCreate: (_p, request) => {
      creates.push(request);
      return settle();
    },
    vtzEdit: (_p, request) => {
      edits.push(request);
      return settle();
    },
    vtzRescope: (_p, request) => {
      rescopes.push(request);
      return settle();
    },
    vtzDelete: (_p, request) => {
      deletes.push(request);
      return settle();
    },
  };
  return { engine, creates, edits, rescopes, deletes };
}

describe('resolveBundleConvergence (FD.7c)', () => {
  it('projects the convergence, carrying the rejected reason', async () => {
    const { engine } = engineWith({
      convergence: {
        has_bundle: true,
        version: 7,
        members: [
          { endpoint_cn: 'a.box', state: 'applied' },
          { endpoint_cn: 'b.box', state: 'rejected', reason: 'StaleLease' },
        ],
      },
    });
    const view = await resolveBundleConvergence(engine, principal, 'YouSource.Corp');
    expect(view.hasBundle).toBe(true);
    expect(view.members).toEqual([
      { endpointCn: 'a.box', state: 'applied', reason: null },
      { endpointCn: 'b.box', state: 'rejected', reason: 'StaleLease' },
    ]);
  });

  it('surfaces unavailable when the engine returns a state the Console cannot render', async () => {
    const { engine } = engineWith({
      convergence: {
        has_bundle: true,
        version: 1,
        members: [{ endpoint_cn: 'x', state: 'pending' }],
      },
    });
    await expect(resolveBundleConvergence(engine, principal, 'Z')).rejects.toBeInstanceOf(
      VtzUnavailableError,
    );
  });
});

describe('classifyVtzRefusal (the engine refusal taxonomy)', () => {
  it('maps the two classes crdb emits and nothing else', () => {
    // crdb's vtz_store_refusal: exists / not-found / has-children -> Conflict; floor, inheritance
    // contradiction, or a cross-tenant write -> Denied. Anything else is NOT a refusal we can explain.
    expect(classifyVtzRefusal(refusal('Conflict'))).toBe('conflict');
    expect(classifyVtzRefusal(refusal('Denied'))).toBe('denied');
    expect(classifyVtzRefusal(refusal('Internal'))).toBeNull();
    expect(classifyVtzRefusal(new Error('a transport failure'))).toBeNull();
  });
});

describe('the audited zone mutations (V2.3)', () => {
  it('compiles the authored spec to the wire and returns the committed lifecycle', async () => {
    const { engine, creates } = mutatingEngine({
      id: 'YouSource.Corp.Finance',
      lifecycle: 'draft',
    });
    const result = await resolveVtzCreate(engine, principal, spec);
    expect(result).toEqual({ id: 'YouSource.Corp.Finance', lifecycle: 'draft' });
    expect(creates[0]?.spec.name).toBe('YouSource.Corp.Finance');
    expect(creates[0]?.spec.zone_type).toBe('standard');
    expect(creates[0]?.spec.reauth_interval_hours).toBe(8);
    // The floor rows go back verbatim; the engine re-derives and re-enforces them regardless.
    expect(creates[0]?.spec.own_postures.filter((p) => p.floor)).toHaveLength(2);
    // The OperatorEngine injects the delegation, so the resolver leaves it null.
    expect(creates[0]?.operator).toBeNull();
  });

  it('edits, re-scopes, and deletes through their own audited verbs', async () => {
    const edited = mutatingEngine({ id: 'YouSource.Corp.Finance', lifecycle: 'published' });
    expect((await resolveVtzEdit(edited.engine, principal, spec)).lifecycle).toBe('published');
    expect(edited.edits[0]?.spec.name).toBe('YouSource.Corp.Finance');

    const moved = mutatingEngine({ id: 'YouSource.Ops.Finance', lifecycle: '' });
    const rescoped = await resolveVtzRescope(
      moved.engine,
      principal,
      'YouSource.Corp.Finance',
      'YouSource.Ops.Finance',
    );
    expect(moved.rescopes[0]).toMatchObject({
      vtz_id: 'YouSource.Corp.Finance',
      new_name: 'YouSource.Ops.Finance',
    });
    // Rescope returns no lifecycle by design; the Console re-reads rather than guessing a state.
    expect(rescoped).toEqual({ id: 'YouSource.Ops.Finance', lifecycle: null });

    const removed = mutatingEngine({ id: 'YouSource.Corp.Finance', lifecycle: '' });
    await resolveVtzDelete(removed.engine, principal, 'YouSource.Corp.Finance');
    expect(removed.deletes[0]?.vtz_id).toBe('YouSource.Corp.Finance');
  });

  it('reports a floor or inheritance refusal as denied, never as a success', async () => {
    // The engine refuses to relax the read-only catastrophic floor. Nothing was committed, and the
    // resolver must surface that rather than swallowing it or reporting an optimistic result.
    const { engine } = mutatingEngine(refusal('Denied'));
    await expect(resolveVtzCreate(engine, principal, spec)).rejects.toMatchObject({
      name: 'VtzMutationRefusedError',
      kind: 'denied',
    });
  });

  it('reports a state clash (exists / not-found / has children) as a conflict', async () => {
    const { engine } = mutatingEngine(refusal('Conflict'));
    await expect(resolveVtzDelete(engine, principal, 'YouSource.Corp')).rejects.toBeInstanceOf(
      VtzMutationRefusedError,
    );
    await expect(resolveVtzDelete(engine, principal, 'YouSource.Corp')).rejects.toMatchObject({
      kind: 'conflict',
    });
  });

  it('passes a refusal it cannot classify through as an engine error, never as a known refusal', async () => {
    const { engine } = mutatingEngine(refusal('Internal'));
    await expect(resolveVtzCreate(engine, principal, spec)).rejects.not.toBeInstanceOf(
      VtzMutationRefusedError,
    );
  });

  it('fails closed when the commit lands but names a lifecycle the Console does not know', async () => {
    // The write DID land. Reporting a guessed state would be worse than reporting unavailability.
    const { engine } = mutatingEngine({ id: 'YouSource.Corp', lifecycle: 'archived' });
    await expect(resolveVtzEdit(engine, principal, spec)).rejects.toBeInstanceOf(
      VtzUnavailableError,
    );
  });
});
