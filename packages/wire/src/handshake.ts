// packages/wire/src/handshake.ts -- the client handshake (F0.3b-3a).
//
// A faithful port of crdb `cdb_agent::client_handshake` (crates/cdb-agent/src/wire_handshake.rs). The
// client drives the connection to Ready before any operation frame is legal (R0):
//
//   -> Hello        (FrameType::Hello,        CBOR ClientHello, stream 0, END_STREAM)
//   <- Negotiate    (FrameType::Negotiate,    CBOR Negotiated)
//   -> Authenticate (FrameType::Authenticate, EMPTY payload -- the identity is the mTLS cert, not a field)
//   <- Ready        (FrameType::Ready,        empty)
//
// The CBOR shapes are verified byte-for-byte against crdb ciborium vectors in the tests.

import { encode, decode } from './cbor.js';
import { Flags, FrameType, packVersion } from './frame.js';
import { type FrameTransport, WireProtocolError } from './transport.js';

/** A protocol (major, minor) version. */
export interface ProtocolVersion {
  readonly major: number;
  readonly minor: number;
}

/** The client's HELLO offer: the major it speaks, the highest minor, and required/optional capabilities. */
export interface ClientHello {
  readonly major: number;
  readonly maxMinor: number;
  readonly required: readonly string[];
  readonly optional: readonly string[];
}

/** The negotiated profile the server returns at NEGOTIATE. */
export interface Negotiated {
  readonly version: ProtocolVersion;
  readonly enabled: readonly string[];
}

/** A minimal v1.0 hello with no capability requirements. */
export const DEFAULT_HELLO: ClientHello = { major: 1, maxMinor: 0, required: [], optional: [] };

/** Encode a ClientHello to its CBOR payload (field order + names match the Rust struct). */
export function encodeClientHello(hello: ClientHello): Uint8Array {
  return encode({
    major: hello.major,
    max_minor: hello.maxMinor,
    required: [...hello.required],
    optional: [...hello.optional],
  });
}

/** Decode a Negotiated from its CBOR payload. */
export function decodeNegotiated(payload: Uint8Array): Negotiated {
  const raw = decode(payload) as { version: { major: number; minor: number }; enabled: string[] };
  return {
    version: { major: raw.version.major, minor: raw.version.minor },
    enabled: raw.enabled,
  };
}

/**
 * Drive the client handshake over `transport`, returning the negotiated profile. Throws
 * `WireProtocolError` if the server sends an out-of-order frame.
 */
export async function clientHandshake(
  transport: FrameTransport,
  hello: ClientHello = DEFAULT_HELLO,
): Promise<Negotiated> {
  await transport.send({
    frameType: FrameType.Hello,
    protocolVersion: packVersion(hello.major, hello.maxMinor),
    flags: Flags.END_STREAM,
    payload: encodeClientHello(hello),
  });

  const negotiateFrame = await transport.recv();
  if (negotiateFrame.header.frameType !== FrameType.Negotiate) {
    throw new WireProtocolError(
      `handshake: expected Negotiate, got frame 0x${negotiateFrame.header.frameType.toString(16)}`,
    );
  }
  const negotiated = decodeNegotiated(negotiateFrame.payload);

  // The AUTHENTICATE frame is a trigger with an empty payload; the identity is the mTLS certificate.
  await transport.send({
    frameType: FrameType.Authenticate,
    protocolVersion: packVersion(negotiated.version.major, negotiated.version.minor),
    flags: Flags.END_STREAM,
    payload: new Uint8Array(0),
  });

  const readyFrame = await transport.recv();
  if (readyFrame.header.frameType !== FrameType.Ready) {
    throw new WireProtocolError(
      `handshake: expected Ready, got frame 0x${readyFrame.header.frameType.toString(16)}`,
    );
  }
  return negotiated;
}
