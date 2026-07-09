// packages/wire/test/frame.test.ts -- F0.3b-1 frame codec conformance.
//
// The byte-level vectors match crdb's own frame tests (crates/cdb-wire/src/frame_io.rs / frame.rs), so
// the TS client and the Rust node cannot drift on the wire format.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_PAYLOAD,
  Flags,
  FrameError,
  FrameType,
  HEADER_LEN,
  decodeHeader,
  encodeFrame,
  encodeHeader,
  packVersion,
  unpackVersion,
} from '../src/index.js';

describe('frame header byte layout (big-endian, matches crdb)', () => {
  it('encodes the canonical Ready header to its exact 16 bytes', () => {
    // crdb frame_io test `header(3)`: protocol 0x0100, Ready, stream 7, END_STREAM, len 3.
    const bytes = encodeHeader({
      protocolVersion: 0x0100,
      frameType: FrameType.Ready,
      streamId: 7,
      flags: Flags.END_STREAM,
      payloadLen: 3,
    });
    expect([...bytes]).toEqual([
      0x01, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x07, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x03,
    ]);
    expect(bytes.length).toBe(HEADER_LEN);
  });

  it('round-trips a header through encode/decode', () => {
    const header = {
      protocolVersion: 0x0100,
      frameType: FrameType.QuerySubmit,
      streamId: 0x0123_4567,
      flags: Flags.MORE,
      payloadLen: 42,
    };
    expect(decodeHeader(encodeHeader(header))).toEqual(header);
  });

  it('encodes a full frame as header followed by payload', () => {
    const payload = new Uint8Array([0xa1, 0x01, 0x02]);
    const frame = encodeFrame(
      { protocolVersion: 0x0100, frameType: FrameType.SecuritySearchSubmit, streamId: 9, flags: 0 },
      payload,
    );
    expect(frame.length).toBe(HEADER_LEN + payload.length);
    const header = decodeHeader(frame.subarray(0, HEADER_LEN));
    expect(header.payloadLen).toBe(3);
    expect([...frame.subarray(HEADER_LEN)]).toEqual([0xa1, 0x01, 0x02]);
  });
});

describe('frame opcodes match crdb FrameType', () => {
  it('pins the key opcodes', () => {
    expect(FrameType.Hello).toBe(0x0001);
    expect(FrameType.Ready).toBe(0x0004);
    expect(FrameType.QuerySubmit).toBe(0x0010);
    expect(FrameType.QueryResult).toBe(0x0011);
    expect(FrameType.StreamSubscribe).toBe(0x0030);
    expect(FrameType.StreamEvent).toBe(0x0031);
  });
});

describe('protocol version packing', () => {
  it('packs and unpacks (1, 0) as 0x0100', () => {
    expect(packVersion(1, 0)).toBe(0x0100);
    expect(unpackVersion(0x0100)).toEqual({ major: 1, minor: 0 });
  });
});

describe('decode validation (fails the way the node does)', () => {
  function header(mutate: (view: DataView) => void): Uint8Array {
    const bytes = encodeHeader({
      protocolVersion: 0x0100,
      frameType: FrameType.Ping,
      streamId: 1,
      flags: 0,
      payloadLen: 0,
    });
    mutate(new DataView(bytes.buffer));
    return bytes;
  }

  it('rejects a short header', () => {
    expect(() => decodeHeader(new Uint8Array(8))).toThrow(FrameError);
  });

  it('rejects a nonzero reserved field', () => {
    const bad = header((v) => {
      v.setUint16(10, 1);
    });
    expect(() => decodeHeader(bad)).toThrowError(/reserved_nonzero/);
  });

  it('rejects an unknown flag bit', () => {
    const bad = header((v) => {
      v.setUint16(8, 0x0100);
    });
    expect(() => decodeHeader(bad)).toThrowError(/unknown_flag/);
  });

  it('rejects a payload length over the max', () => {
    const bad = header((v) => {
      v.setUint32(12, DEFAULT_MAX_PAYLOAD + 1);
    });
    expect(() => decodeHeader(bad)).toThrowError(/payload_too_large/);
  });
});
