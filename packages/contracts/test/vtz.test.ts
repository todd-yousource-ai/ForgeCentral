// packages/contracts/test/vtz.test.ts -- IP-CONSOLE-02 V2.1 tier-1 tests for the VTZ contract.
//
// Proves the V2.1 slice of INV-CONSOLE-VTZ-REAL: every VTZ view model is a projection of the live crdb
// wire DTOs (the cross-module guard -- a drifted engine field is a compile error in these fixtures), the
// enum narrowings are CLOSED (an unknown engine tag collapses the projection rather than rendering a
// guessed posture on a governance surface), the read-only catastrophic floor is carried from the engine
// rather than decided Console-side, and an empty tenant projects honestly with no fabricated zone.

import { describe, expect, it } from 'vitest';

import {
  VTZ_OBJECT_DOMAINS,
  toVtzSpecInput,
  toWireVtzSpec,
  toDomainPosture,
  toVtzArchetype,
  toVtzDetail,
  toVtzLifecycle,
  toVtzMutation,
  toVtzObjectDomain,
  toVtzPosture,
  toVtzTelemetry,
  toVtzTree,
  toVtzZone,
} from '../src/index.js';
import type {
  WireDomainPosture,
  WireVtzDetail,
  WireVtzTree,
  WireVtzTreeNode,
} from '../src/index.js';

/** The engine's full eleven-domain matrix, floors flagged, in the engine's own (unsorted) order. */
const wirePostures = (network = 'permit-deny-risky'): WireDomainPosture[] => [
  { domain: 'ordinary-network', posture: network, floor: false },
  { domain: 'execution', posture: 'deny', floor: true },
  { domain: 'file-and-config', posture: 'permit-deny-risky', floor: false },
  { domain: 'governed-egress', posture: 'deny', floor: true },
  { domain: 'ipc', posture: 'permit-deny-risky', floor: false },
  { domain: 'device', posture: 'permit-deny-risky', floor: false },
  { domain: 'memory', posture: 'permit-deny-risky', floor: false },
  { domain: 'privilege-escalation', posture: 'deny', floor: false },
  { domain: 'kernel-module', posture: 'deny', floor: false },
  { domain: 'credential-store', posture: 'deny', floor: false },
  { domain: 'persistence', posture: 'permit-deny-risky', floor: false },
];

const wireZone = (overrides: Partial<WireVtzTreeNode> = {}): WireVtzTreeNode => ({
  id: 'YouSource.Corp.Finance',
  name: 'YouSource.Corp.Finance',
  parent: 'YouSource.Corp',
  zone_type: 'standard',
  lifecycle: 'published',
  micro_segmentation: true,
  telemetry: 'full',
  reauth_interval_hours: 8,
  own_postures: wirePostures(),
  // The parent tightened ordinary-network; the child's effective posture inherits that deny.
  effective_postures: wirePostures('deny'),
  sub_zone_count: 2,
  ...overrides,
});

describe('VTZ enum narrowing is closed (fail-closed on an unknown engine tag)', () => {
  it('narrows every tag the engine emits and refuses the ones it does not', () => {
    expect(toVtzPosture('deny')).toBe('deny');
    expect(toVtzPosture('permit-deny-risky')).toBe('permit-deny-risky');
    expect(toVtzPosture('permit')).toBeNull();
    expect(toVtzPosture('')).toBeNull();

    expect(toVtzLifecycle('draft')).toBe('draft');
    expect(toVtzLifecycle('published')).toBe('published');
    expect(toVtzLifecycle('archived')).toBeNull();

    expect(toVtzArchetype('standard')).toBe('standard');
    expect(toVtzArchetype('quarantine')).toBe('quarantine');
    expect(toVtzArchetype('isolation')).toBe('isolation');
    expect(toVtzArchetype('public')).toBe('public');
    expect(toVtzArchetype('observability')).toBe('observability');
    // The retired archetype must not narrow: a stored `trusted` zone is a tag we no longer know.
    expect(toVtzArchetype('trusted')).toBeNull();
    expect(toVtzArchetype('restricted')).toBeNull();

    expect(toVtzTelemetry('full')).toBe('full');
    expect(toVtzTelemetry('sampled')).toBe('sampled');
    expect(toVtzTelemetry('off')).toBe('off');
    expect(toVtzTelemetry('verbose')).toBeNull();
  });

  it('knows exactly the eleven TRD-32 v2 object domains', () => {
    expect(VTZ_OBJECT_DOMAINS).toHaveLength(11);
    for (const domain of VTZ_OBJECT_DOMAINS) {
      expect(toVtzObjectDomain(domain)).toBe(domain);
    }
    expect(toVtzObjectDomain('quantum-flux')).toBeNull();
  });
});

describe('toDomainPosture (the per-domain posture matrix)', () => {
  it('carries the read-only catastrophic floor flag from the ENGINE, not a Console table', () => {
    // The Console must not decide which domains are floors: it renders locked what the engine locked.
    const floored = toDomainPosture({ domain: 'execution', posture: 'deny', floor: true });
    expect(floored).toEqual({ domain: 'execution', posture: 'deny', floor: true });
    // The same domain WITHOUT the engine's flag projects unlocked -- the flag is the engine's word.
    const unflagged = toDomainPosture({ domain: 'execution', posture: 'deny', floor: false });
    expect(unflagged?.floor).toBe(false);
  });

  it('fails closed on an unknown domain or posture rather than guessing', () => {
    expect(toDomainPosture({ domain: 'wormhole', posture: 'deny', floor: false })).toBeNull();
    expect(toDomainPosture({ domain: 'ipc', posture: 'allow-all', floor: false })).toBeNull();
  });
});

describe('toVtzZone (wire -> zone projection)', () => {
  it('projects the wire node to the camelCase view model (cross-module guard)', () => {
    const zone = toVtzZone(wireZone());
    expect(zone).not.toBeNull();
    expect(zone?.id).toBe('YouSource.Corp.Finance');
    expect(zone?.name).toBe('YouSource.Corp.Finance');
    expect(zone?.parent).toBe('YouSource.Corp');
    expect(zone?.zoneType).toBe('standard');
    expect(zone?.lifecycle).toBe('published');
    expect(zone?.microSegmentation).toBe(true);
    expect(zone?.telemetry).toBe('full');
    expect(zone?.reauthIntervalHours).toBe(8);
    expect(zone?.subZoneCount).toBe(2);
  });

  it('carries NO trust score -- the zone view model has no score field at all', () => {
    // INV-CONSOLE-VTZ-REAL: the substrate emits no score, so the Console cannot render one. Health is
    // posture + the decision-LOG risk band joined from the Overview.
    const zone = toVtzZone(wireZone());
    expect(zone).not.toBeNull();
    expect(Object.keys(zone ?? {})).not.toContain('trustScore');
    expect(Object.keys(zone ?? {})).not.toContain('score');
  });

  it('orders both posture lists by the fixed render order regardless of the engine order', () => {
    const zone = toVtzZone(wireZone());
    const domains = zone?.ownPostures.map((p) => p.domain);
    expect(domains).toEqual([...VTZ_OBJECT_DOMAINS]);
    expect(zone?.effectivePostures.map((p) => p.domain)).toEqual([...VTZ_OBJECT_DOMAINS]);
    // The floor pair leads, and both entries are flagged by the engine.
    expect(zone?.ownPostures.slice(0, 2).every((p) => p.floor)).toBe(true);
  });

  it('shows own vs effective posture separately (tighten-only inheritance is visible)', () => {
    const zone = toVtzZone(wireZone());
    const own = zone?.ownPostures.find((p) => p.domain === 'ordinary-network');
    const effective = zone?.effectivePostures.find((p) => p.domain === 'ordinary-network');
    // The zone authored the laxer posture; an ancestor tightened it, and the surface can show both.
    expect(own?.posture).toBe('permit-deny-risky');
    expect(effective?.posture).toBe('deny');
  });

  it('projects a root zone parent as null (hierarchy is the dotted name, not a pointer)', () => {
    const zone = toVtzZone(wireZone({ id: 'root', name: 'root', parent: null }));
    expect(zone?.parent).toBeNull();
  });

  it('fails closed if any enum tag on the zone is unknown', () => {
    expect(toVtzZone(wireZone({ zone_type: 'restricted' }))).toBeNull();
    expect(toVtzZone(wireZone({ lifecycle: 'archived' }))).toBeNull();
    expect(toVtzZone(wireZone({ telemetry: 'verbose' }))).toBeNull();
    expect(
      toVtzZone(wireZone({ own_postures: [{ domain: 'ipc', posture: 'permit', floor: false }] })),
    ).toBeNull();
    expect(
      toVtzZone(
        wireZone({ effective_postures: [{ domain: 'nope', posture: 'deny', floor: false }] }),
      ),
    ).toBeNull();
  });
});

describe('toVtzTree (the tenant zone tree)', () => {
  it('projects every zone and the truncation flag', () => {
    const reply: WireVtzTree = {
      nodes: [wireZone({ id: 'root', name: 'root', parent: null }), wireZone()],
      truncated: true,
    };
    const tree = toVtzTree(reply);
    expect(tree?.zones).toHaveLength(2);
    expect(tree?.zones.map((z) => z.name)).toEqual(['root', 'YouSource.Corp.Finance']);
    expect(tree?.truncated).toBe(true);
  });

  it('renders a fixtureless empty tenant as an empty tree (no fabricated zone)', () => {
    const tree = toVtzTree({ nodes: [], truncated: false });
    expect(tree).toEqual({ zones: [], truncated: false });
  });

  it('fails the whole tree closed if any zone fails to narrow', () => {
    const reply: WireVtzTree = {
      nodes: [wireZone(), wireZone({ zone_type: 'restricted' })],
      truncated: false,
    };
    expect(toVtzTree(reply)).toBeNull();
  });
});

describe('toVtzDetail (zone + effective-posture contributors)', () => {
  it('projects the zone and its ancestor chain', () => {
    const reply: WireVtzDetail = {
      zone: wireZone(),
      ancestors: [
        { id: 'YouSource', name: 'YouSource' },
        { id: 'YouSource.Corp', name: 'YouSource.Corp' },
      ],
      commit_version: 42,
    };
    const detail = toVtzDetail(reply);
    expect(detail?.zone?.name).toBe('YouSource.Corp.Finance');
    expect(detail?.ancestors.map((a) => a.name)).toEqual(['YouSource', 'YouSource.Corp']);
  });

  it('treats an absent zone as the honest not-found state, not a failure or an empty zone', () => {
    const detail = toVtzDetail({ ancestors: [], commit_version: 7 });
    expect(detail).toEqual({ zone: null, ancestors: [], commitVersion: 7 });
  });

  it('fails closed when a PRESENT zone cannot narrow', () => {
    expect(
      toVtzDetail({ zone: wireZone({ lifecycle: 'archived' }), ancestors: [], commit_version: 7 }),
    ).toBeNull();
  });
});

describe('toVtzMutation (the audited create/edit/rescope/delete reply)', () => {
  it('projects the committed lifecycle for create/edit', () => {
    expect(toVtzMutation({ id: 'YouSource.Corp', lifecycle: 'draft' })).toEqual({
      id: 'YouSource.Corp',
      lifecycle: 'draft',
    });
    expect(toVtzMutation({ id: 'YouSource.Corp', lifecycle: 'published' })?.lifecycle).toBe(
      'published',
    );
  });

  it('projects the EMPTY lifecycle rescope/delete return as absent, never a guessed state', () => {
    // The engine deliberately returns no lifecycle on rescope/delete (the Console re-reads the zone).
    expect(toVtzMutation({ id: 'YouSource.Finance', lifecycle: '' })).toEqual({
      id: 'YouSource.Finance',
      lifecycle: null,
    });
  });

  it('fails closed on an unknown lifecycle tag', () => {
    expect(toVtzMutation({ id: 'YouSource.Corp', lifecycle: 'archived' })).toBeNull();
  });
});

describe('the authoring spec (V2.3 write side)', () => {
  const body = {
    name: '  YouSource.Corp.Finance  ',
    description: 'Finance systems',
    zoneType: 'standard',
    ownPostures: [
      { domain: 'governed-egress', posture: 'deny', floor: true },
      { domain: 'ordinary-network', posture: 'permit-deny-risky', floor: false },
    ],
    microSegmentation: true,
    telemetry: 'full',
    reauthIntervalHours: 8,
    lifecycle: 'draft',
  };

  it('narrows a well-formed payload and trims the dotted name', () => {
    const spec = toVtzSpecInput(body);
    expect(spec?.name).toBe('YouSource.Corp.Finance');
    expect(spec?.zoneType).toBe('standard');
    expect(spec?.telemetry).toBe('full');
    expect(spec?.lifecycle).toBe('draft');
    expect(spec?.ownPostures).toHaveLength(2);
  });

  it('compiles the authored spec to the wire, carrying the floor rows back verbatim', () => {
    const spec = toVtzSpecInput(body);
    if (spec === null) throw new Error('the well-formed payload must narrow');
    const wire = toWireVtzSpec(spec);
    expect(wire.name).toBe('YouSource.Corp.Finance');
    expect(wire.zone_type).toBe('standard');
    expect(wire.micro_segmentation).toBe(true);
    expect(wire.reauth_interval_hours).toBe(8);
    // The Console never asserts what is a floor; it echoes the flag and the engine re-derives it.
    expect(wire.own_postures[0]).toEqual({
      domain: 'governed-egress',
      posture: 'deny',
      floor: true,
    });
  });

  it('refuses a payload with ANY unknown tag rather than half-understanding it', () => {
    expect(toVtzSpecInput({ ...body, zoneType: 'restricted' })).toBeNull();
    expect(toVtzSpecInput({ ...body, telemetry: 'verbose' })).toBeNull();
    expect(toVtzSpecInput({ ...body, lifecycle: 'archived' })).toBeNull();
    expect(
      toVtzSpecInput({
        ...body,
        ownPostures: [{ domain: 'wormhole', posture: 'deny', floor: false }],
      }),
    ).toBeNull();
    expect(
      toVtzSpecInput({
        ...body,
        ownPostures: [{ domain: 'ipc', posture: 'permit', floor: false }],
      }),
    ).toBeNull();
  });

  it('refuses a missing, mistyped, or out-of-range field (no defaulting, no partial accept)', () => {
    expect(toVtzSpecInput(null)).toBeNull();
    expect(toVtzSpecInput('a string')).toBeNull();
    expect(toVtzSpecInput({})).toBeNull();
    expect(toVtzSpecInput({ ...body, name: '   ' })).toBeNull();
    expect(toVtzSpecInput({ ...body, description: 42 })).toBeNull();
    expect(toVtzSpecInput({ ...body, microSegmentation: 'yes' })).toBeNull();
    // An EMPTY posture list is now the normal case: the zone is the policy edge, so this surface
    // authors none and the engine fail-closes every unauthored domain.
    expect(toVtzSpecInput({ ...body, ownPostures: [] })).not.toBeNull();
    expect(toVtzSpecInput({ ...body, ownPostures: 'all' })).toBeNull();
    // The re-auth interval is bounded 1-24 and must be a whole number of hours.
    expect(toVtzSpecInput({ ...body, reauthIntervalHours: 0 })).toBeNull();
    expect(toVtzSpecInput({ ...body, reauthIntervalHours: 25 })).toBeNull();
    expect(toVtzSpecInput({ ...body, reauthIntervalHours: 8.5 })).toBeNull();
    // A posture row missing the floor flag is not silently defaulted to false.
    expect(
      toVtzSpecInput({ ...body, ownPostures: [{ domain: 'ipc', posture: 'deny' }] }),
    ).toBeNull();
  });
});
