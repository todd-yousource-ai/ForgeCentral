// packages/wire/test/payload.test.ts -- F0.3b-2 typed WireRequest/WireReply payloads.

import type { WireReply, WireRequest } from '@forge/contracts';

import { describe, expect, it } from 'vitest';

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

  it('throws on an unsupported (write-path) variant rather than emitting a wrong shape', () => {
    const request = { TxnCommit: { txn: [], request_id: 1 } } as unknown as WireRequest;
    expect(() => encodeWireRequest(request)).toThrow(/not yet supported/);
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
