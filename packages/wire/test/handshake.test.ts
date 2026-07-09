// packages/wire/test/handshake.test.ts -- F0.3b-3a client handshake.

import { describe, expect, it } from 'vitest';

import {
  Flags,
  type FrameHeader,
  FrameType,
  type FrameTransport,
  type OutboundFrame,
  PROTOCOL_V1_0,
  type WireFrame,
  WireProtocolError,
  clientHandshake,
  decodeNegotiated,
  encodeClientHello,
} from '../src/index.js';

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

const bytesOf = (h: string): Uint8Array =>
  Uint8Array.from(h.match(/.{2}/g)?.map((p) => Number.parseInt(p, 16)) ?? []);

function frame(frameType: FrameType, payload: Uint8Array): WireFrame {
  const header: FrameHeader = {
    protocolVersion: PROTOCOL_V1_0,
    frameType,
    streamId: 0,
    flags: Flags.END_STREAM,
    payloadLen: payload.length,
  };
  return { header, payload };
}

/** An in-memory transport: records sent frames, replays a scripted inbox. */
class MockTransport implements FrameTransport {
  readonly sent: OutboundFrame[] = [];
  private readonly inbox: WireFrame[];

  constructor(inbox: WireFrame[]) {
    this.inbox = [...inbox];
  }

  send(frame_: OutboundFrame): Promise<void> {
    this.sent.push(frame_);
    return Promise.resolve();
  }

  recv(): Promise<WireFrame> {
    const next = this.inbox.shift();
    return next ? Promise.resolve(next) : Promise.reject(new Error('mock: inbox empty'));
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

describe('handshake CBOR is byte-identical to ciborium (crdb vectors)', () => {
  it('encodes an empty ClientHello', () => {
    expect(hex(encodeClientHello({ major: 1, maxMinor: 0, required: [], optional: [] }))).toBe(
      'a4656d616a6f7201696d61785f6d696e6f720068726571756972656480686f7074696f6e616c80',
    );
  });

  it('encodes a ClientHello with capabilities (transparent newtype strings)', () => {
    expect(
      hex(encodeClientHello({ major: 1, maxMinor: 0, required: ['cql'], optional: ['stream'] })),
    ).toBe(
      'a4656d616a6f7201696d61785f6d696e6f7200687265717569726564816363716c686f7074696f6e616c816673747265616d',
    );
  });

  it('decodes a Negotiated', () => {
    expect(
      decodeNegotiated(
        bytesOf('a26776657273696f6ea2656d616a6f7201656d696e6f720067656e61626c656480'),
      ),
    ).toEqual({
      version: { major: 1, minor: 0 },
      enabled: [],
    });
  });
});

describe('clientHandshake', () => {
  const negotiatePayload = bytesOf(
    'a26776657273696f6ea2656d616a6f7201656d696e6f720067656e61626c656480',
  );

  it('drives Hello -> Negotiate -> Authenticate -> Ready and returns the negotiated profile', async () => {
    const transport = new MockTransport([
      frame(FrameType.Negotiate, negotiatePayload),
      frame(FrameType.Ready, new Uint8Array(0)),
    ]);

    const negotiated = await clientHandshake(transport);

    expect(negotiated).toEqual({ version: { major: 1, minor: 0 }, enabled: [] });
    // Sent exactly Hello then Authenticate, in order.
    expect(transport.sent.map((f) => f.frameType)).toEqual([
      FrameType.Hello,
      FrameType.Authenticate,
    ]);
    expect(transport.sent[0]?.flags).toBe(Flags.END_STREAM);
    expect(transport.sent[1]?.payload.length).toBe(0); // Authenticate is an empty trigger
  });

  it('rejects an out-of-order frame (Ready before Negotiate)', async () => {
    const transport = new MockTransport([frame(FrameType.Ready, new Uint8Array(0))]);
    await expect(clientHandshake(transport)).rejects.toBeInstanceOf(WireProtocolError);
  });
});
