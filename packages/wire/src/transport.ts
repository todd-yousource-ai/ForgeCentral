// packages/wire/src/transport.ts -- the frame transport abstraction (F0.3b-3a).
//
// A `FrameTransport` carries whole wire frames (a header + payload) over some byte stream. The handshake
// and the operation dispatch are written against this interface, so their logic is unit-testable over an
// in-memory transport without a real socket; the concrete loopback-socket transport (to the AWS-LC crypto
// sidecar) implements it in `socket-transport.ts`.

import { Flags, type FrameHeader, type FrameType, PROTOCOL_V1_0 } from './frame.js';

/** A frame received from the peer. */
export interface WireFrame {
  readonly header: FrameHeader;
  readonly payload: Uint8Array;
}

/** A frame to send. `streamId`/`flags`/`protocolVersion` default to 0 / END_STREAM / v1.0. */
export interface OutboundFrame {
  readonly frameType: FrameType;
  readonly payload: Uint8Array;
  readonly streamId?: number;
  readonly flags?: number;
  readonly protocolVersion?: number;
}

/** A bidirectional carrier of wire frames. */
export interface FrameTransport {
  /** Send one frame. */
  send(frame: OutboundFrame): Promise<void>;
  /** Receive the next frame (resolves when a full frame has arrived). */
  recv(): Promise<WireFrame>;
  /** Close the underlying stream. */
  close(): Promise<void>;
}

/** Resolve an OutboundFrame's header defaults (stream_id 0, END_STREAM, protocol v1.0). */
export function outboundHeader(frame: OutboundFrame): FrameHeader {
  return {
    protocolVersion: frame.protocolVersion ?? PROTOCOL_V1_0,
    frameType: frame.frameType,
    streamId: frame.streamId ?? 0,
    flags: frame.flags ?? Flags.END_STREAM,
    payloadLen: frame.payload.length,
  };
}

/** A wire-protocol error (handshake or dispatch). */
export class WireProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WireProtocolError';
  }
}
