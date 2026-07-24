// apps/bff/test/policies.test.ts -- IP-CONSOLE-05 P5.2 tier-2 tests for the Policies-surface resolvers.
//
// Proves the P5.2 slice of INV-CONSOLE-POLICIES-REAL: `policies.byZone` projects the grouped list and
// `policies.detail` the record + version history; an engine record the contract cannot narrow collapses
// the WHOLE read to `PoliciesUnavailableError` (never a silently-shorter list); an empty tenant resolves
// honest empty zones; an unknown id resolves an honest absent policy.

import { describe, expect, it } from 'vitest';
import type { WirePolicyDetail, WirePolicyList, WirePolicyRecord } from '@forge/contracts';

import type { OperatorEngine } from '../src/engine/operator-engine.js';
import type { OperatorPrincipal } from '../src/engine/principal.js';
import {
  PoliciesUnavailableError,
  resolvePolicyDetail,
  resolvePolicyZones,
} from '../src/engine/policies.js';

const PRINCIPAL: OperatorPrincipal = {
  principalId: 'op-1',
  tenant: 'tenant-1',
  tier: 'Admin',
} as unknown as OperatorPrincipal;

const policyRecord = (overrides: Partial<WirePolicyRecord> = {}): WirePolicyRecord => ({
  id: '11111111-1111-1111-1111-111111111111',
  vtz: 'corp.prod',
  name: 'contain-egress',
  version: '1.0.0',
  lifecycle: 'published',
  description: 'quarantine agent egress',
  rules: [
    {
      source_kind: 'agent',
      source_selector_kind: 'exact',
      source_selector_value: 'demo-agent',
      destination_kind: 'network',
      destination_selector_kind: 'cidr',
      destination_selector_value: '10.8.0.0/16',
      action: 'quarantine',
    },
  ],
  protocols: ['https'],
  ports: '443',
  logging: 'full',
  max_classification: 'confidential',
  ...overrides,
});

function engineWith(parts: { list?: WirePolicyList; detail?: WirePolicyDetail }): OperatorEngine {
  const unused = () => Promise.reject(new Error('unused'));
  return {
    policyListByZone: () => Promise.resolve(parts.list ?? { zones: [] }),
    policyDetail: () => Promise.resolve(parts.detail ?? { record: null, versions: [] }),
    querySubmit: unused,
  } as unknown as OperatorEngine;
}

describe('resolvePolicyZones', () => {
  it('projects the grouped list', async () => {
    const engine = engineWith({
      list: { zones: [{ vtz: 'corp.prod', policies: [policyRecord()] }] },
    });
    const zones = await resolvePolicyZones(engine, PRINCIPAL);
    expect(zones).toHaveLength(1);
    expect(zones[0]?.vtz).toBe('corp.prod');
    expect(zones[0]?.policies[0]?.rules[0]?.action).toBe('quarantine');
  });

  it('collapses the whole read when a record carries an unknown tag', () => {
    const engine = engineWith({
      list: { zones: [{ vtz: 'corp.prod', policies: [policyRecord({ logging: 'verbose' })] }] },
    });
    return expect(resolvePolicyZones(engine, PRINCIPAL)).rejects.toBeInstanceOf(
      PoliciesUnavailableError,
    );
  });

  it('an empty tenant resolves an honest empty zone list', async () => {
    expect(await resolvePolicyZones(engineWith({}), PRINCIPAL)).toEqual([]);
  });
});

describe('resolvePolicyDetail', () => {
  it('carries the policy + its version history', async () => {
    const engine = engineWith({
      detail: {
        record: policyRecord(),
        versions: [{ version: '1.0.0', lifecycle: 'published' }],
      },
    });
    const view = await resolvePolicyDetail(engine, PRINCIPAL, 'corp.prod', 'p-1');
    expect(view.policy?.name).toBe('contain-egress');
    expect(view.versions.map((v) => v.version)).toEqual(['1.0.0']);
  });

  it('an unknown id resolves policy:null with empty versions (honest absence, not an error)', async () => {
    const view = await resolvePolicyDetail(engineWith({}), PRINCIPAL, 'corp.prod', 'nope');
    expect(view.policy).toBeNull();
    expect(view.versions).toEqual([]);
  });

  it('collapses to unavailable when the record carries an unknown tag', () => {
    const engine = engineWith({
      detail: { record: policyRecord({ max_classification: 'cosmic' }), versions: [] },
    });
    return expect(
      resolvePolicyDetail(engine, PRINCIPAL, 'corp.prod', 'p-1'),
    ).rejects.toBeInstanceOf(PoliciesUnavailableError);
  });
});
