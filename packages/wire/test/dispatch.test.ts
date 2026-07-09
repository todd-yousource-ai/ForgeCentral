// packages/wire/test/dispatch.test.ts -- F0.3b-3c operation dispatch (hermetic).

import { Duplex, PassThrough } from 'node:stream';

import type { WireReply, WireRequest } from '@forge/contracts';
import { describe, expect, it } from 'vitest';

import { FrameType, StreamFrameTransport, decode, dispatch, encode } from '../src/index.js';

function duplexPair(): [Duplex, Duplex] {
  const a = new PassThrough();
  const b = new PassThrough();
  return [Duplex.from({ readable: b, writable: a }), Duplex.from({ readable: a, writable: b })];
}

describe('dispatch', () => {
  it('sends a QuerySubmit (tagged Request over the QuerySubmit opcode) and decodes the QueryRows reply', async () => {
    const [clientStream, serverStream] = duplexPair();
    const client = new StreamFrameTransport(clientStream);
    const server = new StreamFrameTransport(serverStream);

    const serverScript = (async () => {
      const reqFrame = await server.recv();
      expect(reqFrame.header.frameType).toBe(FrameType.QuerySubmit);
      // The payload is the externally-tagged Request enum: { QuerySubmit: { request_id, text, params } }.
      const decoded = decode(reqFrame.payload) as { QuerySubmit?: { text: string } };
      expect(decoded.QuerySubmit?.text).toBe('FIND id');
      const reply = encode({
        QueryRows: { rows: [[['id', { Int: 1 }]]], redacted_fields: [], cursor: null },
      });
      await server.send({ frameType: FrameType.QueryResult, streamId: 0, payload: reply });
    })();

    const request: WireRequest = {
      QuerySubmit: { request_id: 1, text: 'FIND id', params: [] },
    };
    const [reply] = await Promise.all([dispatch(client, request), serverScript]);

    const asReply = reply as Extract<WireReply, { QueryRows: unknown }>;
    expect(asReply.QueryRows.rows).toEqual([[['id', { Int: 1 }]]]);
    expect(asReply.QueryRows.cursor).toBeNull();
  });

  it('refuses a request variant with no wired frame opcode (fails loud, not mis-framed)', async () => {
    const [clientStream] = duplexPair();
    const client = new StreamFrameTransport(clientStream);
    const unwired = { TxnCommit: { txn: [], request_id: 1 } } as unknown as WireRequest;
    await expect(dispatch(client, unwired)).rejects.toThrow(/not yet wired/);
  });
});
