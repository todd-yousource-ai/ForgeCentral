// packages/wire/test/payload.test.ts -- F0.3b-2 typed WireRequest/WireReply payloads.

import type { WireReply, WireRequest } from '@forge/contracts';

import { describe, expect, it } from 'vitest';

import { decode } from '../src/cbor.js';
import { decodeWireReply, encodeWireRequest } from '../src/index.js';

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

const bytesOf = (h: string): Uint8Array =>
  Uint8Array.from(h.match(/.{2}/g)?.map((p) => Number.parseInt(p, 16)) ?? []);

describe('encodeWireRequest', () => {
  it('encodes QuerySubmit byte-identically to ciborium', () => {
    const request: WireRequest = {
      QuerySubmit: { request_id: 42, text: 'FIND person', params: [['min', { Int: 30 }]] },
    };
    // crdb golden `req_submit`.
    expect(hex(encodeWireRequest(request))).toBe(
      'a16b51756572795375626d6974a36a726571756573745f6964182a64746578746b46494e4420706572736f6e66706172616d738182636d696ea163496e74181e',
    );
  });

  it('encodes a delegated QuerySubmit (operator) byte-identically to ciborium (F0.5c)', () => {
    const request: WireRequest = {
      QuerySubmit: {
        request_id: 42,
        text: 'FIND person',
        params: [['min', { Int: 30 }]],
        operator: {
          principal: '00000000-0000-0000-0000-000000000007',
          tenant: '00000000-0000-0000-0000-000000000002',
        },
      },
    };
    // crdb golden `req_submit_delegated` (the operator key is appended after params, matching the Rust
    // struct field order; ids are hyphenated UUID strings).
    expect(hex(encodeWireRequest(request))).toBe(
      'a16b51756572795375626d6974a46a726571756573745f6964182a64746578746b46494e4420706572736f6e66706172616d738182636d696ea163496e74181e686f70657261746f72a2697072696e636970616c782430303030303030302d303030302d303030302d303030302d3030303030303030303030376674656e616e74782430303030303030302d303030302d303030302d303030302d303030303030303030303032',
    );
  });

  it('omits the operator key when absent (byte-identical to a pre-delegation client)', () => {
    const withUndefined: WireRequest = {
      QuerySubmit: { request_id: 42, text: 'FIND person', params: [['min', { Int: 30 }]] },
    };
    // No operator -> the same bytes as the base golden above (the a3 three-key map).
    expect(hex(encodeWireRequest(withUndefined))).toBe(
      'a16b51756572795375626d6974a36a726571756573745f6964182a64746578746b46494e4420706572736f6e66706172616d738182636d696ea163496e74181e',
    );
  });

  it('encodes ListAgents byte-identically to ciborium (crdb ER.1)', () => {
    const request: WireRequest = { ListAgents: { request_id: 7 } };
    expect(hex(encodeWireRequest(request))).toBe(
      'a16a4c6973744167656e7473a16a726571756573745f696407',
    );
  });

  it('encodes EntityDecisions byte-identically to ciborium (crdb ER.2c)', () => {
    const request: WireRequest = {
      EntityDecisions: { request_id: 7, entity_type: 'host', entity_value: 'host-7', limit: 10 },
    };
    expect(hex(encodeWireRequest(request))).toBe(
      'a16f456e746974794465636973696f6e73a46a726571756573745f6964076b656e746974795f7479706564686f73746c656e746974795f76616c756566686f73742d37656c696d69740a',
    );
  });

  it('encodes EntityConnections byte-identically to ciborium (crdb ER.5)', () => {
    const request: WireRequest = {
      EntityConnections: {
        request_id: 7,
        subject_kind: 'process',
        subject_id: 'host-7:pid:1234',
        limit: 10,
      },
    };
    expect(hex(encodeWireRequest(request))).toBe(
      'a171456e74697479436f6e6e656374696f6e73a46a726571756573745f6964076c7375626a6563745f6b696e646770726f636573736a7375626a6563745f69646f686f73742d373a7069643a31323334656c696d69740a',
    );
  });

  it('encodes ConnectivityGraph byte-identically to ciborium, omitting null bounds (crdb CN.2)', () => {
    // Matches the crdb `WireRequest::ConnectivityGraph byte shape` golden: with since/until/operator None,
    // the CBOR map is exactly { request_id, limit } in the Rust struct order.
    const request: WireRequest = {
      ConnectivityGraph: { request_id: 7, operator: null, since: null, until: null, limit: 100 },
    };
    expect(hex(encodeWireRequest(request))).toBe(
      'a171436f6e6e65637469766974794772617068a26a726571756573745f696407656c696d69741864',
    );
  });

  it('includes the time bounds + operator on ConnectivityGraph when present (Rust struct order)', () => {
    const request: WireRequest = {
      ConnectivityGraph: {
        request_id: 7,
        since: 1_700_000_000,
        until: 1_700_000_060,
        limit: 100,
        operator: { principal: 'principal-op', tenant: 'tenant-op' },
      },
    };
    // Fields emit in struct order (request_id, since, until, limit, operator) -> a 5-key inner map (0xa5).
    const encoded = hex(encodeWireRequest(request));
    expect(encoded).toContain('a56a726571756573745f696407'); // 5-key map opening on request_id = 7
    expect(encoded).toContain('6573696e6365'); // the "since" key is present
    expect(encoded).toContain('65756e74696c'); // the "until" key is present
    expect(encoded).toContain('6f70657261746f72'); // the "operator" key is present
  });

  it('encodes ConnectivityMembers byte-identically to ciborium, omitting an absent operator (crdb O1.6b)', () => {
    // Matches the crdb `WireRequest::ConnectivityMembers byte shape` golden: class "devices", limit 100,
    // operator None -> the CBOR map is exactly { request_id, class, limit } in the Rust struct order.
    const request: WireRequest = {
      ConnectivityMembers: { request_id: 42, operator: null, class: 'devices', limit: 100 },
    };
    expect(hex(encodeWireRequest(request))).toBe(
      'a173436f6e6e65637469766974794d656d62657273a36a726571756573745f6964182a65636c6173736764657669636573656c696d69741864',
    );
  });

  it('includes the operator on ConnectivityMembers when present (appended after limit, Rust order)', () => {
    const request: WireRequest = {
      ConnectivityMembers: {
        request_id: 42,
        class: 'devices',
        limit: 100,
        operator: { principal: 'principal-op', tenant: 'tenant-op' },
      },
    };
    // Fields emit in struct order (request_id, class, limit, operator) -> a 4-key inner map (0xa4).
    const encoded = hex(encodeWireRequest(request));
    expect(encoded).toContain('a46a726571756573745f6964182a'); // 4-key map opening on request_id = 42
    expect(encoded).toContain('6f70657261746f72'); // the "operator" key is present
  });

  it('encodes LogQuery byte-identically to ciborium, omitting unset filters (crdb LQ.2)', () => {
    // Matches the crdb `WireRequest::LogQuery byte shape` golden: since=100, technique="T1059", limit=50,
    // every other filter + operator None -> the CBOR map is { request_id, since, technique, limit } in the
    // Rust struct order.
    const request: WireRequest = {
      LogQuery: { request_id: 7, since: 100, technique: 'T1059', limit: 50 },
    };
    expect([...encodeWireRequest(request)]).toEqual([
      0xa1, 0x68, 0x4c, 0x6f, 0x67, 0x51, 0x75, 0x65, 0x72, 0x79, 0xa4, 0x6a, 0x72, 0x65, 0x71,
      0x75, 0x65, 0x73, 0x74, 0x5f, 0x69, 0x64, 0x07, 0x65, 0x73, 0x69, 0x6e, 0x63, 0x65, 0x18,
      0x64, 0x69, 0x74, 0x65, 0x63, 0x68, 0x6e, 0x69, 0x71, 0x75, 0x65, 0x65, 0x54, 0x31, 0x30,
      0x35, 0x39, 0x65, 0x6c, 0x69, 0x6d, 0x69, 0x74, 0x18, 0x32,
    ]);
  });

  it('encodes LogExplain byte-identically to ciborium (crdb LQ.3)', () => {
    const request: WireRequest = { LogExplain: { request_id: 7, decision_id: 'sha512:d1' } };
    expect([...encodeWireRequest(request)]).toEqual([
      0xa1, 0x6a, 0x4c, 0x6f, 0x67, 0x45, 0x78, 0x70, 0x6c, 0x61, 0x69, 0x6e, 0xa2, 0x6a, 0x72,
      0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x5f, 0x69, 0x64, 0x07, 0x6b, 0x64, 0x65, 0x63, 0x69,
      0x73, 0x69, 0x6f, 0x6e, 0x5f, 0x69, 0x64, 0x69, 0x73, 0x68, 0x61, 0x35, 0x31, 0x32, 0x3a,
      0x64, 0x31,
    ]);
  });

  it('encodes LogExport byte-identically to ciborium, nesting the query map (crdb LQ.4)', () => {
    // Matches the crdb `WireRequest::LogExport byte shape` golden: operator None (omitted, first field), a
    // nested query { request_id, technique, limit }, command_id "cmd-1", issued_at 200.
    const request: WireRequest = {
      LogExport: {
        query: { request_id: 7, technique: 'T1059', limit: 50 },
        command_id: 'cmd-1',
        issued_at: 200,
      },
    };
    expect([...encodeWireRequest(request)]).toEqual([
      0xa1, 0x69, 0x4c, 0x6f, 0x67, 0x45, 0x78, 0x70, 0x6f, 0x72, 0x74, 0xa3, 0x65, 0x71, 0x75,
      0x65, 0x72, 0x79, 0xa3, 0x6a, 0x72, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x5f, 0x69, 0x64,
      0x07, 0x69, 0x74, 0x65, 0x63, 0x68, 0x6e, 0x69, 0x71, 0x75, 0x65, 0x65, 0x54, 0x31, 0x30,
      0x35, 0x39, 0x65, 0x6c, 0x69, 0x6d, 0x69, 0x74, 0x18, 0x32, 0x6a, 0x63, 0x6f, 0x6d, 0x6d,
      0x61, 0x6e, 0x64, 0x5f, 0x69, 0x64, 0x65, 0x63, 0x6d, 0x64, 0x2d, 0x31, 0x69, 0x69, 0x73,
      0x73, 0x75, 0x65, 0x64, 0x5f, 0x61, 0x74, 0x18, 0xc8,
    ]);
  });

  it('throws on an unsupported (write-path) variant rather than emitting a wrong shape', () => {
    const request = { TxnCommit: { txn: [], request_id: 1 } } as unknown as WireRequest;
    expect(() => encodeWireRequest(request)).toThrow(/not yet supported/);
  });
});

describe('encodeWireRequest: the policy verbs (IP-CONSOLE-05)', () => {
  // The Policies surface reads + commands ride the QuerySubmit opcode; each MUST have an encode arm,
  // or the request throws "not yet supported" before it ever reaches the wire. This block is the
  // seam guard the mocked BFF/e2e tests could not provide: it drives the REAL CBOR encode. A missing
  // arm here is exactly the live-leg defect that shipped the policy surface wired only to mocks.
  const asMap = (request: WireRequest): Record<string, unknown> =>
    decode(encodeWireRequest(request)) as Record<string, unknown>;

  it('the SOC Ops reads encode over the real CBOR path (S3.2 encode-arm seam)', () => {
    // THE check the Policies epic taught: a surface wired only to mocks can pass every BFF and e2e
    // test with no encode arm at all, then fail on the first real socket. These three verbs are the
    // whole SOC read path, so they are proven against the real encoder here, not against a mock.
    expect(asMap({ SocIncidentList: { request_id: 7, limit: 50 } })).toEqual({
      SocIncidentList: { request_id: 7, limit: 50 },
    });
    expect(asMap({ SocIncidentDetail: { request_id: 8, incident: 'ep-soc-1' } })).toEqual({
      SocIncidentDetail: { request_id: 8, incident: 'ep-soc-1' },
    });
    expect(asMap({ SocNarrative: { request_id: 9, incident: 'ep-soc-1' } })).toEqual({
      SocNarrative: { request_id: 9, incident: 'ep-soc-1' },
    });
  });

  it('the SOC reads carry the delegated operator, and omit it when absent', () => {
    // The BFF reads on the operator's behalf under the peer's Delegation grant. Omission must be
    // byte-identical to a non-delegating client (the engine's skip_serializing_if), or a plain read
    // stops matching what the engine expects.
    const delegated = asMap({
      SocIncidentList: {
        request_id: 1,
        limit: 50,
        operator: { principal: 'p', tenant: 't' },
      },
    });
    expect(delegated).toEqual({
      SocIncidentList: { request_id: 1, limit: 50, operator: { principal: 'p', tenant: 't' } },
    });
    expect(asMap({ SocIncidentList: { request_id: 1, limit: 50 } })).toEqual({
      SocIncidentList: { request_id: 1, limit: 50 },
    });
  });

  it('encodes request_id as the integer the engine decodes, never a string', () => {
    // crdb `RequestId` is a transparent u128. The committed schema declared these four DTOs
    // `string` until it was fixed; a client that sent one would fail at the CBOR seam with nothing
    // upstream reporting a mismatch, which is precisely what this seam test exists to catch.
    const map = asMap({ SocIncidentDetail: { request_id: 42, incident: 'ep-1' } });
    const inner = map['SocIncidentDetail'] as Record<string, unknown>;
    expect(typeof inner['request_id']).toBe('number');
  });

  it('the SOC plan COMMANDS encode over the real CBOR path (S3.8)', () => {
    // Same seam check as the reads: a command wired only to mocks passes every BFF and e2e test with
    // no encode arm at all, then fails on the first real socket.
    expect(
      asMap({ SocPlanApprove: { request_id: 1, incident: 'ep-soc-1', at_revision: 2 } }),
    ).toEqual({ SocPlanApprove: { request_id: 1, incident: 'ep-soc-1', at_revision: 2 } });

    expect(
      asMap({
        SocPlanModify: {
          request_id: 2,
          incident: 'ep-soc-1',
          steps: [
            { title: 'Quarantine codex-helper', action: 'quarantine' },
            { title: 'Inspect adjacent workspaces', action: '' },
          ],
        },
      }),
    ).toEqual({
      SocPlanModify: {
        request_id: 2,
        incident: 'ep-soc-1',
        steps: [
          { title: 'Quarantine codex-helper', action: 'quarantine' },
          { title: 'Inspect adjacent workspaces', action: '' },
        ],
      },
    });
  });

  it('a submitted step carries only what it DOES, never its state or authority', () => {
    // Accepting those from a client would let one hand the engine a step claiming to be executed.
    const map = asMap({
      SocPlanModify: {
        request_id: 3,
        incident: 'ep-soc-1',
        steps: [{ title: 'Quarantine codex-helper', action: 'quarantine' }],
      },
    });
    const steps = (map['SocPlanModify'] as { steps: Record<string, unknown>[] }).steps;
    expect(Object.keys(steps[0] ?? {}).sort()).toEqual(['action', 'title']);
  });

  it('POLICY_LIST_BY_ZONE encodes with request_id (+ delegated operator)', () => {
    const map = asMap({ PolicyListByZone: { request_id: 7 } });
    expect(map).toEqual({ PolicyListByZone: { request_id: 7 } });
    const delegated = asMap({
      PolicyListByZone: {
        request_id: 7,
        operator: { principal: 'p', tenant: 't' },
      },
    });
    expect(delegated).toEqual({
      PolicyListByZone: { request_id: 7, operator: { principal: 'p', tenant: 't' } },
    });
  });

  it('POLICY_DETAIL / POLICY_EFFECTIVE encode their vtz (+ id) in Rust field order', () => {
    expect(asMap({ PolicyDetail: { request_id: 1, vtz: 'YouSource.Corp', id: 'p-1' } })).toEqual({
      PolicyDetail: { request_id: 1, vtz: 'YouSource.Corp', id: 'p-1' },
    });
    expect(asMap({ PolicyEffective: { request_id: 2, vtz: 'YouSource.Corp' } })).toEqual({
      PolicyEffective: { request_id: 2, vtz: 'YouSource.Corp' },
    });
  });

  it('POLICY_CREATE emits the spec, omitting empty optionals like the engine serde', () => {
    const map = asMap({
      PolicyCreate: {
        request_id: 3,
        spec: {
          vtz: 'YouSource.Corp',
          name: 'contain-egress',
          description: '',
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
          logging: 'full',
          max_classification: 'confidential',
        },
      },
    });
    // The required fields survive; NONE of the skip-if-empty optionals (protocols, ports, schedule_*,
    // active_*, geo, restriction_tags, applied_to, default_postures) appear.
    expect(map).toEqual({
      PolicyCreate: {
        request_id: 3,
        spec: {
          vtz: 'YouSource.Corp',
          name: 'contain-egress',
          description: '',
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
          logging: 'full',
          max_classification: 'confidential',
        },
      },
    });
  });

  it('POLICY_CREATE carries the present optionals (network, schedule, applied_to, postures)', () => {
    const map = asMap({
      PolicyCreate: {
        request_id: 4,
        spec: {
          vtz: 'YouSource.Corp',
          name: 'p',
          description: 'd',
          rules: [],
          protocols: ['https'],
          ports: '443',
          schedule_days: ['mon'],
          schedule_start_minute: 540,
          schedule_end_minute: 1020,
          active_until: 999,
          geo: ['us'],
          restriction_tags: ['PHI'],
          logging: 'sampled',
          applied_to: [{ endpoint_cn: 'host-01.corp', agent: 'demo-agent' }],
          max_classification: 'restricted',
          default_postures: [{ domain: 'ordinary-network', posture: 'permit', floor: false }],
        },
        operator: { principal: 'p', tenant: 't' },
      },
    })['PolicyCreate'] as { spec: Record<string, unknown>; operator: unknown };
    expect(map.spec['protocols']).toEqual(['https']);
    expect(map.spec['ports']).toBe('443');
    expect(map.spec['schedule_start_minute']).toBe(540);
    expect(map.spec['active_until']).toBe(999);
    expect(map.spec['applied_to']).toEqual([{ endpoint_cn: 'host-01.corp', agent: 'demo-agent' }]);
    expect(map.spec['default_postures']).toEqual([
      { domain: 'ordinary-network', posture: 'permit', floor: false },
    ]);
    expect(map.operator).toEqual({ principal: 'p', tenant: 't' });
  });

  it('POLICY_EDIT / POLICY_PUBLISH / POLICY_DELETE encode their identity keys', () => {
    const spec = {
      vtz: 'YouSource.Corp',
      name: 'p',
      description: '',
      rules: [],
      logging: 'off',
      max_classification: 'internal',
    };
    expect(asMap({ PolicyEdit: { request_id: 5, id: 'p-1', spec } })).toEqual({
      PolicyEdit: { request_id: 5, id: 'p-1', spec },
    });
    expect(
      asMap({
        PolicyPublish: { request_id: 6, vtz: 'YouSource.Corp', id: 'p-1', version: '1.0.0' },
      }),
    ).toEqual({
      PolicyPublish: { request_id: 6, vtz: 'YouSource.Corp', id: 'p-1', version: '1.0.0' },
    });
    expect(asMap({ PolicyDelete: { request_id: 8, vtz: 'YouSource.Corp', id: 'p-1' } })).toEqual({
      PolicyDelete: { request_id: 8, vtz: 'YouSource.Corp', id: 'p-1' },
    });
  });
});

describe('decodeWireReply', () => {
  it('decodes a QueryRows reply (crdb golden)', () => {
    const reply = decodeWireReply(
      bytesOf(
        'a1695175657279526f7773a364726f7773806f72656461637465645f6669656c64738066637572736f72f6',
      ),
    );
    expect(reply).toEqual({ QueryRows: { rows: [], redacted_fields: [], cursor: null } });
  });

  it('decodes the CursorClosed unit variant', () => {
    const reply: WireReply = decodeWireReply(bytesOf('6c437572736f72436c6f736564'));
    expect(reply).toBe('CursorClosed');
  });

  it('decodes an AgentList reply byte-identically to ciborium (crdb ER.1)', () => {
    const reply = decodeWireReply(
      bytesOf(
        'a1694167656e744c697374a1666167656e747381a4686167656e745f69646b6169673a6167656e743a6166737461747573666163746976656b656e726f6c6c65645f6174016a61747472696275746573818264726f6c65686f70657261746f72',
      ),
    );
    expect(reply).toEqual({
      AgentList: {
        agents: [
          {
            agent_id: 'aig:agent:a',
            status: 'active',
            enrolled_at: 1,
            attributes: [['role', 'operator']],
          },
        ],
      },
    });
  });
});
