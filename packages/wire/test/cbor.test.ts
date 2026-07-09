// packages/wire/test/cbor.test.ts -- F0.3b-2 CBOR codec conformance against crdb ciborium vectors.
//
// The hex vectors were generated from crdb's ciborium over the exact DTO instances (a throwaway
// cdb-wire test), so byte-equality here proves the TS codec and the Rust node agree on the wire.

import { describe, expect, it } from 'vitest';

import { CborFloat, decode, encode, f64 } from '../src/index.js';

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

const bytesOf = (h: string): Uint8Array =>
  Uint8Array.from(h.match(/.{2}/g)?.map((p) => Number.parseInt(p, 16)) ?? []);

describe('CBOR encode is byte-identical to ciborium (golden vectors from crdb)', () => {
  const cases: Array<[string, unknown, string]> = [
    ['Bool(true)', { Bool: true }, 'a164426f6f6cf5'],
    ['Bool(false)', { Bool: false }, 'a164426f6f6cf4'],
    ['Int(30)', { Int: 30 }, 'a163496e74181e'],
    ['Int(-5)', { Int: -5 }, 'a163496e7424'],
    ['Int(0)', { Int: 0 }, 'a163496e7400'],
    ['Int(300)', { Int: 300 }, 'a163496e7419012c'],
    ['Text("ada")', { Text: 'ada' }, 'a1645465787463616461'],
    ['Bytes([1,2,3])', { Bytes: [1, 2, 3] }, 'a165427974657383010203'],
    ['Timestamp(7)', { Timestamp: 7 }, 'a16954696d657374616d7007'],
    [
      'WireQuerySubmit',
      { request_id: 42, text: 'FIND person', params: [['min', { Int: 30 }]] },
      'a36a726571756573745f6964182a64746578746b46494e4420706572736f6e66706172616d738182636d696ea163496e74181e',
    ],
    [
      'WireQueryRows (no cursor)',
      {
        rows: [[['name', { Text: 'ada' }]]],
        redacted_fields: ['ssn'],
        cursor: null,
      },
      'a364726f7773818182646e616d65a16454657874636164616f72656461637465645f6669656c6473816373736e66637572736f72f6',
    ],
    [
      'WireQueryRows (32-byte cursor as int array)',
      { rows: [], redacted_fields: [], cursor: Array(32).fill(7) as number[] },
      'a364726f7773806f72656461637465645f6669656c64738066637572736f7298200707070707070707070707070707070707070707070707070707070707070707',
    ],
    [
      'WireReply::CursorClosed (unit variant, bare string)',
      'CursorClosed',
      '6c437572736f72436c6f736564',
    ],
  ];

  it.each(cases)('%s', (_name, value, expected) => {
    expect(hex(encode(value))).toBe(expected);
  });
});

describe('CBOR decode round-trips the golden vectors back to their values', () => {
  it('decodes a submit', () => {
    const bytes = bytesOf(
      'a36a726571756573745f6964182a64746578746b46494e4420706572736f6e66706172616d738182636d696ea163496e74181e',
    );
    expect(decode(bytes)).toEqual({
      request_id: 42,
      text: 'FIND person',
      params: [['min', { Int: 30 }]],
    });
  });

  it('decodes a 32-byte cursor as a number array', () => {
    const bytes = bytesOf(
      'a364726f7773806f72656461637465645f6669656c64738066637572736f7298200707070707070707070707070707070707070707070707070707070707070707',
    );
    const rows = decode(bytes) as { cursor: number[] };
    expect(rows.cursor).toEqual(Array(32).fill(7));
  });
});

describe('floats (ciborium emits minimal-form; we decode all widths, encode as f64)', () => {
  it('decodes ciborium float16 (1.5) to the JS value', () => {
    // crdb: WireValue::Float(1.5) -> a165466c6f6174 f93e00 (f9 = float16)
    expect(decode(bytesOf('a165466c6f6174f93e00'))).toEqual({ Float: 1.5 });
  });

  it('round-trips a forced float through encode/decode (even integer-valued)', () => {
    expect(decode(encode({ Float: f64(30) }))).toEqual({ Float: 30 });
    expect(decode(encode({ Vector: [f64(1.5), f64(-2)] }))).toEqual({ Vector: [1.5, -2] });
  });

  it('a CborFloat forces float encoding (0xfb double), not an integer', () => {
    expect(hex(encode(new CborFloat(1)))).toBe('fb3ff0000000000000');
  });
});
