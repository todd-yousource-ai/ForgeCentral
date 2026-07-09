// packages/wire/src/frame.ts -- the Crucible wire frame codec (F0.3b-1).
//
// A faithful TypeScript port of the crdb `cdb-wire` frame format (crates/cdb-wire/src/frame.rs). Every
// wire message is a fixed 16-byte big-endian header followed by an opaque payload (CBOR, encoded by a
// higher layer). This module encodes/decodes the header and enumerates the frame opcodes; it is the
// foundation of the native TS engine client. The byte layout is verified against crdb's own frame
// vectors in the tests, so the two implementations cannot drift.
//
// Header layout (16 bytes, big-endian), from `Header::encode`:
//   [0..2)  protocol_version : u16   (0x0100 = v1.0)
//   [2..4)  frame_type       : u16   (FrameType)
//   [4..8)  stream_id        : u32   (request/reply correlation)
//   [8..10) flags            : u16   (END_STREAM | MORE | COMPRESSED)
//   [10..12) reserved        : u16   (must be 0)
//   [12..16) payload_len     : u32

/** The fixed wire header length in bytes. */
export const HEADER_LEN = 16;

/** Protocol version 1.0, packed as `(major << 8) | minor` (the value the node speaks today). */
export const PROTOCOL_V1_0 = 0x0100;

/** Frame flags (bitfield in the header `flags` field). */
export const Flags = {
  END_STREAM: 0x0001,
  MORE: 0x0002,
  COMPRESSED: 0x0004,
} as const;

/** The mask of flags this implementation understands; any other bit set is a framing error. */
export const KNOWN_FLAGS = Flags.END_STREAM | Flags.MORE | Flags.COMPRESSED;

/** Frame opcodes, matching `cdb-wire` `FrameType` (crates/cdb-wire/src/frame.rs) exactly. */
export enum FrameType {
  Hello = 0x0001,
  Negotiate = 0x0002,
  Authenticate = 0x0003,
  Ready = 0x0004,
  Ping = 0x0005,
  Pong = 0x0006,
  FlowCredit = 0x0007,
  ResetStream = 0x0008,
  GoAway = 0x0009,
  Error = 0x000a,
  QuerySubmit = 0x0010,
  QueryResult = 0x0011,
  CursorFetch = 0x0012,
  CursorClose = 0x0013,
  TxnBegin = 0x0014,
  TxnCommit = 0x0015,
  TxnAbort = 0x0016,
  CommitStatus = 0x0017,
  AgentRequest = 0x0020,
  AgentResponse = 0x0021,
  SecuritySearchSubmit = 0x0022,
  SecuritySearchResult = 0x0023,
  FindingFetch = 0x0024,
  FindingResult = 0x0025,
  CognitionRequest = 0x0026,
  CognitionResponse = 0x0027,
  OtlpExport = 0x0028,
  OtlpAck = 0x0029,
  EnrollSubmit = 0x002a,
  EnrollResult = 0x002b,
  EnrollIdentityOffer = 0x002c,
  EnrollIdentityResult = 0x002d,
  StreamSubscribe = 0x0030,
  StreamEvent = 0x0031,
}

/** The parsed wire header. `reserved` is always 0 on the wire; it is not part of the friendly API. */
export interface FrameHeader {
  readonly protocolVersion: number;
  readonly frameType: number;
  readonly streamId: number;
  readonly flags: number;
  readonly payloadLen: number;
}

/** Why a header failed to decode (mirrors the crdb `FrameError` reasons). */
export type FrameErrorReason =
  'short_header' | 'reserved_nonzero' | 'unknown_flag' | 'payload_too_large';

/** A frame decode error. */
export class FrameError extends Error {
  constructor(readonly reason: FrameErrorReason) {
    super(`frame decode: ${reason}`);
    this.name = 'FrameError';
  }
}

// TUNE: default maximum payload the decoder accepts (16 MiB). The node enforces its own configured bound;
// this is the client-side sanity cap against a hostile or corrupt length field. Override per connection.
export const DEFAULT_MAX_PAYLOAD = 16 * 1024 * 1024;

/** Pack a (major, minor) SemVer into the `protocol_version` field. */
export function packVersion(major: number, minor: number): number {
  return ((major & 0xff) << 8) | (minor & 0xff);
}

/** Unpack `protocol_version` into (major, minor). */
export function unpackVersion(version: number): { major: number; minor: number } {
  return { major: (version >> 8) & 0xff, minor: version & 0xff };
}

/** Encode a header to its 16 big-endian bytes. `reserved` is always written as 0. */
export function encodeHeader(header: FrameHeader): Uint8Array {
  const bytes = new Uint8Array(HEADER_LEN);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, header.protocolVersion); // big-endian (DataView default)
  view.setUint16(2, header.frameType);
  view.setUint32(4, header.streamId);
  view.setUint16(8, header.flags);
  view.setUint16(10, 0); // reserved
  view.setUint32(12, header.payloadLen);
  return bytes;
}

/**
 * Decode a 16-byte header, validating it the way the node does: reserved must be 0, no unknown flag bit
 * may be set, and the declared payload length must not exceed `maxPayload`.
 */
export function decodeHeader(bytes: Uint8Array, maxPayload = DEFAULT_MAX_PAYLOAD): FrameHeader {
  if (bytes.length < HEADER_LEN) {
    throw new FrameError('short_header');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, HEADER_LEN);
  const protocolVersion = view.getUint16(0);
  const frameType = view.getUint16(2);
  const streamId = view.getUint32(4);
  const flags = view.getUint16(8);
  const reserved = view.getUint16(10);
  const payloadLen = view.getUint32(12);

  if (reserved !== 0) throw new FrameError('reserved_nonzero');
  if ((flags & ~KNOWN_FLAGS) !== 0) throw new FrameError('unknown_flag');
  if (payloadLen > maxPayload) throw new FrameError('payload_too_large');

  return { protocolVersion, frameType, streamId, flags, payloadLen };
}

/** Encode a full frame (header + payload) to a single contiguous byte buffer. */
export function encodeFrame(
  header: Omit<FrameHeader, 'payloadLen'>,
  payload: Uint8Array,
): Uint8Array {
  const full: FrameHeader = { ...header, payloadLen: payload.length };
  const head = encodeHeader(full);
  const out = new Uint8Array(HEADER_LEN + payload.length);
  out.set(head, 0);
  out.set(payload, HEADER_LEN);
  return out;
}
