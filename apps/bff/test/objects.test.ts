// apps/bff/test/objects.test.ts -- IP-CONSOLE-10 O10.2 tier-2 tests for the Objects-surface resolvers.
//
// Proves the O10.2 slice of INV-CONSOLE-OBJECTS-NOUN-ONLY: `objects.list` projects the catalog and
// `objects.detail` the record + read-time members; an engine record the contract cannot narrow
// collapses the WHOLE read to `ObjectsUnavailableError` (never a silently-shorter catalog); the
// declarative honest-empty member contract holds.

import { describe, expect, it } from 'vitest';
import type { WireObjectCatalog, WireObjectDetail, WireObjectRecord } from '@forge/contracts';

import type { OperatorEngine } from '../src/engine/operator-engine.js';
import type { OperatorPrincipal } from '../src/engine/principal.js';
import {
  ObjectsUnavailableError,
  resolveObjectCatalog,
  resolveObjectDetail,
} from '../src/engine/objects.js';

const PRINCIPAL: OperatorPrincipal = {
  principalId: 'op-1',
  tenant: 'tenant-1',
  tier: 'Admin',
} as unknown as OperatorPrincipal;

const ipObject: WireObjectRecord = {
  name: 'corp-subnet',
  kind: 'network',
  selector_kind: 'cidr',
  selector_value: '10.8.0.0/16',
  attributes: [],
  description: 'the corp /16',
  tags: ['PHI'],
  lifecycle: 'published',
};

function engineWith(parts: {
  catalog?: WireObjectCatalog;
  detail?: WireObjectDetail;
}): OperatorEngine {
  const unused = () => Promise.reject(new Error('unused'));
  return {
    objectList: () => Promise.resolve(parts.catalog ?? { objects: [] }),
    objectDetail: () => Promise.resolve(parts.detail ?? { record: null, members: [] }),
    querySubmit: unused,
    cursorFetch: unused,
    cursorClose: unused,
    listAgents: unused,
    listPrincipals: unused,
    listGroups: unused,
    groupCreate: unused,
    groupEdit: unused,
    groupSetMembers: unused,
    principalCreate: unused,
    principalEdit: unused,
    principalSetStatus: unused,
    entityDecisions: unused,
    entityConnections: unused,
    connectivityGraph: unused,
    connectivityMembers: unused,
    contain: unused,
    logQuery: unused,
    logExplain: unused,
    logExport: unused,
    usageOverview: unused,
    vtzTree: unused,
    vtzDetail: unused,
    bundleConvergence: unused,
    distributeBundle: unused,
    vtzCreate: unused,
    vtzEdit: unused,
    vtzRescope: unused,
    vtzDelete: unused,
  } as unknown as OperatorEngine;
}

describe('resolveObjectCatalog', () => {
  it('projects the catalog', () => {
    const engine = engineWith({ catalog: { objects: [ipObject] } });
    return resolveObjectCatalog(engine, PRINCIPAL).then((cards) => {
      expect(cards).toHaveLength(1);
      expect(cards[0]?.kind).toBe('network');
      expect(cards[0]?.selectorKind).toBe('cidr');
    });
  });

  it('collapses the whole read when a record carries an unknown tag', () => {
    const engine = engineWith({
      catalog: { objects: [ipObject, { ...ipObject, name: 'x', kind: 'quantum' }] },
    });
    return expect(resolveObjectCatalog(engine, PRINCIPAL)).rejects.toBeInstanceOf(
      ObjectsUnavailableError,
    );
  });

  it('an empty tenant resolves an honest empty catalog', () => {
    return resolveObjectCatalog(engineWith({}), PRINCIPAL).then((cards) => {
      expect(cards).toEqual([]);
    });
  });
});

describe('resolveObjectDetail', () => {
  it('carries the object + its read-time members', () => {
    const engine = engineWith({ detail: { record: ipObject, members: ['10.8.0.9:443'] } });
    return resolveObjectDetail(engine, PRINCIPAL, 'corp-subnet').then((view) => {
      expect(view.object?.name).toBe('corp-subnet');
      expect(view.members).toEqual(['10.8.0.9:443']);
    });
  });

  it('an unknown name resolves object:null with empty members (declarative, not an error)', () => {
    return resolveObjectDetail(engineWith({}), PRINCIPAL, 'nope').then((view) => {
      expect(view.object).toBeNull();
      expect(view.members).toEqual([]);
    });
  });
});
