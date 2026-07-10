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
});
