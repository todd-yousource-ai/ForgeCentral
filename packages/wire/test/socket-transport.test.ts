// packages/wire/test/socket-transport.test.ts -- F0.3b-3b stream transport + handshake integration.

import { Duplex, PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import {
  Flags,
  FrameType,
  PROTOCOL_V1_0,
  StreamFrameTransport,
  clientHandshake,
  encodeFrame,
} from '../src/index.js';

const bytesOf = (h: string): Uint8Array =>
  Uint8Array.from(h.match(/.{2}/g)?.map((p) => Number.parseInt(p, 16)) ?? []);

/** A connected in-memory duplex pair (client writes reach server reads and vice versa). */
function duplexPair(): [Duplex, Duplex] {
  const a = new PassThrough();
  const b = new PassThrough();
  const client = Duplex.from({ readable: b, writable: a });
  const server = Duplex.from({ readable: a, writable: b });
  return [client, server];
}

describe('StreamFrameTransport framing', () => {
  it('reassembles a frame split across chunk boundaries', async () => {
    const loop = new PassThrough();
    const transport = new StreamFrameTransport(loop);
    const bytes = encodeFrame(
      {
        protocolVersion: PROTOCOL_V1_0,
        frameType: FrameType.Ping,
        streamId: 5,
        flags: Flags.END_STREAM,
      },
      new Uint8Array([1, 2, 3]),
    );
    loop.write(bytes.subarray(0, 9)); // header not even complete yet
    loop.write(bytes.subarray(9));
    const frame = await transport.recv();
    expect(frame.header.frameType).toBe(FrameType.Ping);
    expect(frame.header.streamId).toBe(5);
    expect([...frame.payload]).toEqual([1, 2, 3]);
  });

  it('splits two frames delivered in one chunk', async () => {
    const loop = new PassThrough();
    const transport = new StreamFrameTransport(loop);
    const f1 = encodeFrame(
      { protocolVersion: PROTOCOL_V1_0, frameType: FrameType.Ping, streamId: 1, flags: 0 },
      new Uint8Array([1]),
    );
    const f2 = encodeFrame(
      { protocolVersion: PROTOCOL_V1_0, frameType: FrameType.Pong, streamId: 2, flags: 0 },
      new Uint8Array([2, 2]),
    );
    const both = new Uint8Array(f1.length + f2.length);
    both.set(f1);
    both.set(f2, f1.length);
    loop.write(both);
    expect((await transport.recv()).header.frameType).toBe(FrameType.Ping);
    const second = await transport.recv();
    expect(second.header.frameType).toBe(FrameType.Pong);
    expect([...second.payload]).toEqual([2, 2]);
  });

  it('serializes an outbound frame onto the stream', async () => {
    const loop = new PassThrough();
    const transport = new StreamFrameTransport(loop);
    await transport.send({
      frameType: FrameType.Hello,
      streamId: 7,
      payload: new Uint8Array([9, 9]),
    });
    const frame = await transport.recv(); // loopback
    expect(frame.header.frameType).toBe(FrameType.Hello);
    expect([...frame.payload]).toEqual([9, 9]);
  });
});

describe('clientHandshake over the framed transport', () => {
  it('completes Hello -> Negotiate -> Authenticate -> Ready end to end', async () => {
    const [clientStream, serverStream] = duplexPair();
    const client = new StreamFrameTransport(clientStream);
    const server = new StreamFrameTransport(serverStream);
    const negotiatePayload = bytesOf(
      'a26776657273696f6ea2656d616a6f7201656d696e6f720067656e61626c656480',
    );

    const serverScript = (async () => {
      expect((await server.recv()).header.frameType).toBe(FrameType.Hello);
      await server.send({ frameType: FrameType.Negotiate, payload: negotiatePayload });
      expect((await server.recv()).header.frameType).toBe(FrameType.Authenticate);
      await server.send({ frameType: FrameType.Ready, payload: new Uint8Array(0) });
    })();

    const [negotiated] = await Promise.all([clientHandshake(client), serverScript]);
    expect(negotiated).toEqual({ version: { major: 1, minor: 0 }, enabled: [] });
  });
});
