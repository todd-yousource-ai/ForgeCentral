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
import type { PolicyDraft } from '@forge/contracts';

import {
  PoliciesUnavailableError,
  resolveCreatePolicy,
  resolveDeletePolicy,
  resolveEditPolicy,
  resolvePolicyDetail,
  resolvePolicyZones,
  resolvePublishPolicy,
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

function engineWith(parts: {
  list?: WirePolicyList;
  detail?: WirePolicyDetail;
  sent?: Array<{ op: string; req: Record<string, unknown> }>;
}): OperatorEngine {
  const unused = () => Promise.reject(new Error('unused'));
  const record = (op: string, ack: Record<string, unknown>) => (_p: unknown, req: unknown) => {
    parts.sent?.push({ op, req: req as Record<string, unknown> });
    return Promise.resolve(ack);
  };
  return {
    policyListByZone: () => Promise.resolve(parts.list ?? { zones: [] }),
    policyDetail: () => Promise.resolve(parts.detail ?? { record: null, versions: [] }),
    policyCreate: record('create', { id: 'p-new', version: '1.0.0', lifecycle: 'draft' }),
    policyEdit: record('edit', { id: 'p-1', version: '1.1.0', lifecycle: 'draft' }),
    policyPublish: record('publish', {
      id: 'p-1',
      version: '2.0.0',
      lifecycle: 'published',
      breaking: true,
    }),
    policyDelete: record('delete', { id: 'p-1', version: '1.0.0', lifecycle: 'published' }),
    querySubmit: unused,
  } as unknown as OperatorEngine;
}

const draft: PolicyDraft = {
  vtz: 'corp.prod',
  name: 'contain-egress',
  description: '',
  rules: [
    {
      source: { kind: 'agent', selectorKind: 'exact', selectorValue: 'demo-agent' },
      destination: { kind: 'network', selectorKind: 'cidr', selectorValue: '10.8.0.0/16' },
      action: 'quarantine',
    },
  ],
  network: { protocols: ['https'], ports: '443' },
  restrictions: {
    scheduleDays: [],
    scheduleStartMinute: null,
    scheduleEndMinute: null,
    activeFrom: null,
    activeUntil: null,
    geo: [],
    tags: [],
  },
  logging: 'full',
  appliedTo: [],
  maxClassification: 'confidential',
};

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

describe('the P5.4 command resolvers convert the draft + project the ack', () => {
  it('create sends the wire spec and returns the mutation', async () => {
    const sent: Array<{ op: string; req: Record<string, unknown> }> = [];
    const mutation = await resolveCreatePolicy(engineWith({ sent }), PRINCIPAL, draft);
    expect(mutation).toEqual({
      id: 'p-new',
      version: '1.0.0',
      lifecycle: 'draft',
      breaking: false,
    });
    // The draft was converted to a wire spec (snake_case, flattened network).
    const spec = sent[0]?.req['spec'] as Record<string, unknown>;
    expect(spec['name']).toBe('contain-egress');
    expect(spec['max_classification']).toBe('confidential');
    expect(spec['protocols']).toEqual(['https']);
  });

  it('edit names the id and returns the new draft version', async () => {
    const sent: Array<{ op: string; req: Record<string, unknown> }> = [];
    const mutation = await resolveEditPolicy(engineWith({ sent }), PRINCIPAL, 'p-1', draft);
    expect(mutation.version).toBe('1.1.0');
    expect(sent[0]?.req['id']).toBe('p-1');
  });

  it('publish returns the published mutation with the breaking flag', async () => {
    const sent: Array<{ op: string; req: Record<string, unknown> }> = [];
    const mutation = await resolvePublishPolicy(
      engineWith({ sent }),
      PRINCIPAL,
      'corp.prod',
      'p-1',
      '2.0.0',
    );
    expect(mutation).toEqual({
      id: 'p-1',
      version: '2.0.0',
      lifecycle: 'published',
      breaking: true,
    });
    expect(sent[0]?.req).toMatchObject({ vtz: 'corp.prod', id: 'p-1', version: '2.0.0' });
  });

  it('delete names vtz+id and returns the ack', async () => {
    const sent: Array<{ op: string; req: Record<string, unknown> }> = [];
    await resolveDeletePolicy(engineWith({ sent }), PRINCIPAL, 'corp.prod', 'p-1');
    expect(sent[0]?.req).toMatchObject({ vtz: 'corp.prod', id: 'p-1' });
  });
});
