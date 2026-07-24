// packages/contracts/test/policies.test.ts -- IP-CONSOLE-05 P5.1 tier-1 tests for the Policies contract.
//
// Proves the P5.1 slice of INV-CONSOLE-POLICIES-REAL: every Policies view model is a projection of the
// live crdb wire DTOs (a drifted engine field is a compile error in these fixtures), the enum narrowings
// are CLOSED (an unknown action/logging/protocol/selector/kind/lifecycle/day/classification tag collapses
// the projection -- a mis-rendered disposition is a governance lie), the grouped list fail-closes as a
// whole, an empty tenant projects honest empty zones, the draft round-trips to the wire spec omitting
// empty axes, and the producer-enforced active-window is carried.

import { describe, expect, it } from 'vitest';

import {
  POLICY_ACTIONS,
  POLICY_LOGGING,
  policyActionLabel,
  policyLoggingLabel,
  policyProtocolLabel,
  toPolicyDetail,
  toPolicyMutation,
  toPolicyRow,
  toPolicyZones,
  toWirePolicySpec,
} from '../src/index.js';
import type {
  PolicyDraft,
  WirePolicyDetail,
  WirePolicyRecord,
  WirePolicyRule,
} from '../src/index.js';

const httpsRule = (overrides: Partial<WirePolicyRule> = {}): WirePolicyRule => ({
  source_kind: 'agent',
  source_selector_kind: 'exact',
  source_selector_value: 'demo-agent',
  destination_kind: 'network',
  destination_selector_kind: 'cidr',
  destination_selector_value: '10.8.0.0/16',
  action: 'quarantine',
  ...overrides,
});

const policyRecord = (overrides: Partial<WirePolicyRecord> = {}): WirePolicyRecord => ({
  id: '11111111-1111-1111-1111-111111111111',
  vtz: 'corp.prod',
  name: 'contain-egress',
  version: '1.2.0',
  lifecycle: 'published',
  description: 'quarantine agent egress to the corp subnet on 443',
  rules: [httpsRule()],
  protocols: ['https'],
  ports: '443',
  schedule_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  schedule_start_minute: 540,
  schedule_end_minute: 1020,
  active_from: 100,
  active_until: 999,
  geo: ['us'],
  restriction_tags: ['PHI'],
  logging: 'full',
  applied_to: [{ endpoint_cn: 'host-01.corp', agent: 'demo-agent' }],
  max_classification: 'confidential',
  ...overrides,
});

describe('policy rows project the ruleset, network match, restrictions, and Applied-To', () => {
  it('projects a Quarantine+HTTPS+CIDR policy with all authored dimensions', () => {
    const row = toPolicyRow(policyRecord());
    expect(row).not.toBeNull();
    expect(row?.name).toBe('contain-egress');
    expect(row?.version).toBe('1.2.0');
    expect(row?.lifecycle).toBe('published');
    expect(row?.rules[0]?.action).toBe('quarantine');
    expect(row?.rules[0]?.source.kind).toBe('agent');
    expect(row?.rules[0]?.destination.selectorKind).toBe('cidr');
    expect(row?.network.protocols).toEqual(['https']);
    expect(row?.network.ports).toBe('443');
    expect(row?.restrictions.scheduleDays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(row?.restrictions.activeUntil).toBe(999);
    expect(row?.logging).toBe('full');
    expect(row?.appliedTo).toEqual([{ endpointCn: 'host-01.corp', agent: 'demo-agent' }]);
    expect(row?.maxClassification).toBe('confidential');
  });

  it('carries the producer-enforced active window verbatim (the expiry the composer reads)', () => {
    const row = toPolicyRow(policyRecord({ active_from: 0, active_until: 42 }));
    expect(row?.restrictions.activeFrom).toBe(0);
    expect(row?.restrictions.activeUntil).toBe(42);
  });

  it('defaults absent optional axes to honest empties, never a fabricated qualifier', () => {
    // A record carrying ONLY the required fields -- every network/restriction/scope axis is absent
    // (the engine omits an unrestricted axis). exactOptionalPropertyTypes forbids present-undefined,
    // so the absent case is a record that omits the keys entirely.
    const minimal: WirePolicyRecord = {
      id: '22222222-2222-2222-2222-222222222222',
      vtz: 'corp.prod',
      name: 'allow-all',
      version: '1.0.0',
      lifecycle: 'draft',
      description: 'no qualifiers',
      rules: [httpsRule({ action: 'permit' })],
      logging: 'off',
      max_classification: 'unclassified',
    };
    const row = toPolicyRow(minimal);
    expect(row?.network.protocols).toEqual([]);
    expect(row?.network.ports).toBe('');
    expect(row?.restrictions.scheduleDays).toEqual([]);
    expect(row?.restrictions.scheduleStartMinute).toBeNull();
    expect(row?.restrictions.activeUntil).toBeNull();
    expect(row?.restrictions.geo).toEqual([]);
    expect(row?.appliedTo).toEqual([]);
  });
});

describe('the four-action lattice and three logging levels are closed', () => {
  it('offers exactly the four lattice actions, least -> most restrictive', () => {
    expect(POLICY_ACTIONS).toEqual(['permit', 'monitor', 'quarantine', 'deny']);
  });

  it('offers exactly the three logging levels', () => {
    expect(POLICY_LOGGING).toEqual(['full', 'sampled', 'off']);
  });

  it('renders each action and logging level with its display label', () => {
    expect(policyActionLabel('quarantine')).toBe('Quarantine');
    expect(policyActionLabel('deny')).toBe('Deny');
    expect(policyLoggingLabel('sampled')).toBe('Sampled');
    expect(policyProtocolLabel('https')).toBe('HTTPS');
  });
});

describe('enum narrowing is closed (fail-closed on an unknown engine tag)', () => {
  it('refuses an unknown action rather than guessing a disposition', () => {
    expect(toPolicyRow(policyRecord({ rules: [httpsRule({ action: 'observe' })] }))).toBeNull();
  });

  it('refuses an unknown logging level, protocol, schedule day, or classification', () => {
    expect(toPolicyRow(policyRecord({ logging: 'verbose' }))).toBeNull();
    expect(toPolicyRow(policyRecord({ protocols: ['https', 'quic'] }))).toBeNull();
    expect(toPolicyRow(policyRecord({ schedule_days: ['mon', 'funday'] }))).toBeNull();
    expect(toPolicyRow(policyRecord({ max_classification: 'cosmic' }))).toBeNull();
  });

  it('refuses an unknown rule endpoint kind or selector form', () => {
    expect(
      toPolicyRow(policyRecord({ rules: [httpsRule({ source_kind: 'wormhole' })] })),
    ).toBeNull();
    expect(
      toPolicyRow(policyRecord({ rules: [httpsRule({ destination_selector_kind: 'regexp' })] })),
    ).toBeNull();
  });

  it('refuses an unknown lifecycle', () => {
    expect(toPolicyRow(policyRecord({ lifecycle: 'archived' }))).toBeNull();
  });
});

describe('the grouped list fail-closes as a whole and is honest-empty', () => {
  it('groups policies by their zone', () => {
    const zones = toPolicyZones({
      zones: [
        { vtz: 'corp.prod', policies: [policyRecord()] },
        { vtz: 'corp.lab', policies: [] },
      ],
    });
    expect(zones).not.toBeNull();
    expect(zones?.map((z) => z.vtz)).toEqual(['corp.prod', 'corp.lab']);
    expect(zones?.[0]?.policies[0]?.name).toBe('contain-egress');
    expect(zones?.[1]?.policies).toEqual([]);
  });

  it('one malformed record collapses the whole list, not just its row', () => {
    const zones = toPolicyZones({
      zones: [
        { vtz: 'corp.prod', policies: [policyRecord(), policyRecord({ logging: 'verbose' })] },
      ],
    });
    expect(zones).toBeNull();
  });

  it('an empty tenant projects honest empty zones', () => {
    expect(toPolicyZones({ zones: [] })).toEqual([]);
  });
});

describe('detail resolution carries version history and is honest-absent', () => {
  it('an existing policy carries its newest record + ascending version history', () => {
    const detail: WirePolicyDetail = {
      record: policyRecord(),
      versions: [
        { version: '1.1.0', lifecycle: 'published' },
        { version: '1.2.0', lifecycle: 'published' },
      ],
    };
    const view = toPolicyDetail(detail);
    expect(view?.policy?.name).toBe('contain-egress');
    expect(view?.versions.map((v) => v.version)).toEqual(['1.1.0', '1.2.0']);
  });

  it('an absent policy is policy:null (unknown id), not a fabricated record', () => {
    const view = toPolicyDetail({ record: null, versions: [] });
    expect(view?.policy).toBeNull();
    expect(view?.versions).toEqual([]);
  });

  it('a malformed version row collapses the whole detail', () => {
    const view = toPolicyDetail({
      record: policyRecord(),
      versions: [{ version: '1.0.0', lifecycle: 'x' }],
    });
    expect(view).toBeNull();
  });
});

describe('the draft round-trips to the wire spec, omitting empty axes', () => {
  const fullDraft = (): PolicyDraft => ({
    vtz: 'corp.prod',
    name: 'contain-egress',
    description: 'quarantine agent egress',
    rules: [
      {
        source: { kind: 'agent', selectorKind: 'exact', selectorValue: 'demo-agent' },
        destination: { kind: 'network', selectorKind: 'cidr', selectorValue: '10.8.0.0/16' },
        action: 'quarantine',
      },
    ],
    network: { protocols: ['https'], ports: '443' },
    restrictions: {
      scheduleDays: ['mon'],
      scheduleStartMinute: 540,
      scheduleEndMinute: 1020,
      activeFrom: null,
      activeUntil: 999,
      geo: ['us'],
      tags: ['PHI'],
    },
    logging: 'full',
    appliedTo: [{ endpointCn: 'host-01.corp', agent: 'demo-agent' }],
    maxClassification: 'confidential',
  });

  it('carries every authored axis into the wire spec (no id/version/lifecycle)', () => {
    const spec = toWirePolicySpec(fullDraft());
    expect(spec.name).toBe('contain-egress');
    expect(spec.vtz).toBe('corp.prod');
    expect(spec.logging).toBe('full');
    expect(spec.max_classification).toBe('confidential');
    expect(spec.rules[0]?.action).toBe('quarantine');
    expect(spec.rules[0]?.destination_selector_value).toBe('10.8.0.0/16');
    expect(spec.protocols).toEqual(['https']);
    expect(spec.ports).toBe('443');
    expect(spec.active_until).toBe(999);
    expect(spec.applied_to).toEqual([{ endpoint_cn: 'host-01.corp', agent: 'demo-agent' }]);
    // The store owns these; the draft never sends them.
    expect('id' in spec).toBe(false);
    expect('version' in spec).toBe(false);
    expect('lifecycle' in spec).toBe(false);
  });

  it('omits empty axes entirely (unrestricted is absence, not an empty qualifier)', () => {
    const spec = toWirePolicySpec({
      ...fullDraft(),
      network: { protocols: [], ports: '' },
      restrictions: {
        scheduleDays: [],
        scheduleStartMinute: null,
        scheduleEndMinute: null,
        activeFrom: null,
        activeUntil: null,
        geo: [],
        tags: [],
      },
      appliedTo: [],
    });
    expect('protocols' in spec).toBe(false);
    expect('ports' in spec).toBe(false);
    expect('schedule_days' in spec).toBe(false);
    expect('active_until' in spec).toBe(false);
    expect('geo' in spec).toBe(false);
    expect('applied_to' in spec).toBe(false);
  });

  it('omits the agent field for an endpoint-scoped Applied-To member', () => {
    const spec = toWirePolicySpec({
      ...fullDraft(),
      appliedTo: [{ endpointCn: 'host-02.corp', agent: null }],
    });
    expect(spec.applied_to).toEqual([{ endpoint_cn: 'host-02.corp' }]);
  });
});

describe('command acknowledgment', () => {
  it('projects the mutated id, version, lifecycle, and breaking flag', () => {
    expect(
      toPolicyMutation({ id: 'p-1', version: '2.0.0', lifecycle: 'published', breaking: true }),
    ).toEqual({ id: 'p-1', version: '2.0.0', lifecycle: 'published', breaking: true });
  });

  it('defaults a null breaking flag to false', () => {
    expect(
      toPolicyMutation({ id: 'p-1', version: '1.0.0', lifecycle: 'draft', breaking: null }),
    ).toEqual({ id: 'p-1', version: '1.0.0', lifecycle: 'draft', breaking: false });
  });

  it('fail-closes on an unknown lifecycle in the ack', () => {
    expect(toPolicyMutation({ id: 'p-1', version: '1.0.0', lifecycle: 'zombie' })).toBeNull();
  });
});
