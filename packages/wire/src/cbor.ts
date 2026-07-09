// packages/wire/src/cbor.ts -- a focused CBOR codec, interoperable with Rust ciborium (F0.3b-2).
//
// The Crucible wire payloads are CBOR (RFC 8949), encoded on the node by ciborium. Rather than pull a
// third-party CBOR library into the critical wire path, this is a small, fully-controlled codec over the
// exact subset the wire uses (unsigned/negative ints, float64, text, byte strings, arrays, maps, bool,
// null, and minimal-form floats on decode). It is verified byte-for-byte against vectors generated from
// crdb's ciborium in the tests, so the two encodings cannot drift.
//
// Notes on interop (confirmed against crdb vectors):
//  - serde structs -> definite-length CBOR maps with text keys in field-declaration order.
//  - serde externally-tagged enums -> a single-key map ({Int: 30}); unit variants -> a bare text string.
//  - Rust `Vec<u8>` (no serde_bytes) -> a CBOR ARRAY of integers, not a byte string.
//  - ciborium emits minimal floats (f16/f32/f64); this encoder emits f64 (the node widens on decode),
//    and the decoder accepts all three widths.

import { TextDecoder, TextEncoder } from 'node:util';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** Wrap a number so it always encodes as a CBOR float (needed for integer-valued float fields). */
export class CborFloat {
  constructor(readonly value: number) {}
}

/** Force `value` to encode as a CBOR float rather than an integer. */
export function f64(value: number): CborFloat {
  return new CborFloat(value);
}

// ---- encode ---------------------------------------------------------------------------------------

class Writer {
  private readonly bytes: number[] = [];

  push(byte: number): void {
    this.bytes.push(byte & 0xff);
  }

  pushAll(arr: Uint8Array): void {
    for (const b of arr) this.bytes.push(b);
  }

  /** Write a major-type initial byte plus its argument in the shortest form. */
  head(major: number, value: bigint): void {
    const m = major << 5;
    if (value < 24n) {
      this.push(m | Number(value));
    } else if (value < 0x100n) {
      this.push(m | 24);
      this.push(Number(value));
    } else if (value < 0x1_0000n) {
      this.push(m | 25);
      this.push(Number(value >> 8n));
      this.push(Number(value & 0xffn));
    } else if (value < 0x1_0000_0000n) {
      this.push(m | 26);
      for (let shift = 24n; shift >= 0n; shift -= 8n) this.push(Number((value >> shift) & 0xffn));
    } else {
      this.push(m | 27);
      for (let shift = 56n; shift >= 0n; shift -= 8n) this.push(Number((value >> shift) & 0xffn));
    }
  }

  float64(value: number): void {
    this.push(0xfb);
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value); // big-endian (network order), matching ciborium
    this.pushAll(new Uint8Array(buf));
  }

  result(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

function encodeInto(writer: Writer, value: unknown): void {
  if (value === null || value === undefined) {
    writer.push(0xf6);
    return;
  }
  if (value instanceof CborFloat) {
    writer.float64(value.value);
    return;
  }
  if (typeof value === 'boolean') {
    writer.push(value ? 0xf5 : 0xf4);
    return;
  }
  if (typeof value === 'bigint') {
    encodeInt(writer, value);
    return;
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) encodeInt(writer, BigInt(value));
    else writer.float64(value);
    return;
  }
  if (typeof value === 'string') {
    const bytes = encoder.encode(value);
    writer.head(3, BigInt(bytes.length));
    writer.pushAll(bytes);
    return;
  }
  if (typeof value !== 'object') {
    throw new Error(`cbor: cannot encode a ${typeof value}`);
  }
  if (Array.isArray(value)) {
    writer.head(4, BigInt(value.length));
    for (const item of value) encodeInto(writer, item);
    return;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  writer.head(5, BigInt(keys.length));
  for (const key of keys) {
    const keyBytes = encoder.encode(key);
    writer.head(3, BigInt(keyBytes.length));
    writer.pushAll(keyBytes);
    encodeInto(writer, record[key]);
  }
}

function encodeInt(writer: Writer, value: bigint): void {
  if (value >= 0n) writer.head(0, value);
  else writer.head(1, -1n - value);
}

/** Encode a JS value to CBOR bytes (ciborium-compatible). */
export function encode(value: unknown): Uint8Array {
  const writer = new Writer();
  encodeInto(writer, value);
  return writer.result();
}

// ---- decode ---------------------------------------------------------------------------------------

/** The maximum safe integer as a bigint, above which decoded ints are returned as `bigint`. */
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

class Reader {
  private pos = 0;

  constructor(private readonly buf: Uint8Array) {}

  private byte(): number {
    if (this.pos >= this.buf.length) throw new Error('cbor: unexpected end of input');
    const b = this.buf[this.pos] ?? 0;
    this.pos += 1;
    return b;
  }

  private take(n: number): Uint8Array {
    if (this.pos + n > this.buf.length) throw new Error('cbor: unexpected end of input');
    const slice = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  /** Read the argument of an initial byte (additional-info) as a bigint. */
  private arg(ai: number): bigint {
    if (ai < 24) return BigInt(ai);
    if (ai === 24) return BigInt(this.byte());
    if (ai === 25) return (BigInt(this.byte()) << 8n) | BigInt(this.byte());
    if (ai === 26) {
      let v = 0n;
      for (let i = 0; i < 4; i += 1) v = (v << 8n) | BigInt(this.byte());
      return v;
    }
    if (ai === 27) {
      let v = 0n;
      for (let i = 0; i < 8; i += 1) v = (v << 8n) | BigInt(this.byte());
      return v;
    }
    throw new Error(`cbor: unsupported additional info ${ai}`);
  }

  private len(ai: number): number {
    return Number(this.arg(ai));
  }

  private numeric(v: bigint): number | bigint {
    return v <= MAX_SAFE && v >= -MAX_SAFE ? Number(v) : v;
  }

  private simple(ai: number): unknown {
    switch (ai) {
      case 20:
        return false;
      case 21:
        return true;
      case 22:
      case 23:
        return null;
      case 25:
        return decodeFloat16(this.take(2));
      case 26:
        return new DataView(this.take(4).slice().buffer).getFloat32(0);
      case 27:
        return new DataView(this.take(8).slice().buffer).getFloat64(0);
      default:
        throw new Error(`cbor: unsupported simple value ${ai}`);
    }
  }

  read(): unknown {
    const initial = this.byte();
    const major = initial >> 5;
    const ai = initial & 0x1f;
    switch (major) {
      case 0:
        return this.numeric(this.arg(ai));
      case 1:
        return this.numeric(-1n - this.arg(ai));
      case 2:
        return this.take(this.len(ai)).slice();
      case 3:
        return decoder.decode(this.take(this.len(ai)));
      case 4: {
        const n = this.len(ai);
        const arr: unknown[] = [];
        for (let i = 0; i < n; i += 1) arr.push(this.read());
        return arr;
      }
      case 5: {
        const n = this.len(ai);
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < n; i += 1) {
          const key = this.read();
          obj[String(key)] = this.read();
        }
        return obj;
      }
      case 7:
        return this.simple(ai);
      default:
        throw new Error(`cbor: unsupported major type ${major}`);
    }
  }

  atEnd(): boolean {
    return this.pos >= this.buf.length;
  }
}

function decodeFloat16(bytes: Uint8Array): number {
  const half = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  const sign = half & 0x8000 ? -1 : 1;
  const exp = (half >> 10) & 0x1f;
  const mant = half & 0x3ff;
  if (exp === 0) return sign * mant * 2 ** -24;
  if (exp === 31) return mant ? Number.NaN : sign * Infinity;
  return sign * (mant + 1024) * 2 ** (exp - 25);
}

/** Decode a single CBOR item from `bytes` (ciborium-compatible). Trailing bytes are an error. */
export function decode(bytes: Uint8Array): unknown {
  const reader = new Reader(bytes);
  const value = reader.read();
  if (!reader.atEnd()) throw new Error('cbor: trailing bytes after the top-level item');
  return value;
}
