// packages/wire/test/dispatch.test.ts -- F0.3b-3c operation dispatch (hermetic).

import { Duplex, PassThrough } from 'node:stream';

import type { WireReply, WireRequest } from '@forge/contracts';
import { describe, expect, it } from 'vitest';

import { FrameType, StreamFrameTransport, decode, dispatch, encode } from '../src/index.js';

/** A minimal well-formed zone spec for the VTZ write variants. */
const VTZ_SPEC = {
  name: 'YouSource.Corp',
  description: 'd',
  zone_type: 'standard',
  own_postures: [{ domain: 'governed-egress', posture: 'deny', floor: true }],
  micro_segmentation: true,
  telemetry: 'full',
  reauth_interval_hours: 8,
  lifecycle: 'draft',
};

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

  // REGRESSION (2026-07-19): the VTZ surface shipped its client methods, reply mappers, resolvers and
  // routes, but the six `Vtz*` variants were never added to `frameTypeForRequest` -- so every zone read
  // threw `WireProtocolError` before the request left the BFF, and the live surface showed "Could not
  // load the trust zones". Nothing caught it because every other test mocked at or above the client seam.
  // This table asserts that EVERY request variant a surface dispatches actually maps to an opcode; a new
  // verb added without wiring it fails here instead of in front of an operator.
  const QUERY_SUBMIT_VARIANTS: readonly WireRequest[] = [
    { QuerySubmit: { request_id: 1, text: 'FIND id', params: [] } },
    { ListAgents: { request_id: 1, operator: null } },
    {
      EntityDecisions: {
        request_id: 1,
        operator: null,
        entity_type: 'agent',
        entity_value: 'e',
        limit: 10,
      },
    },
    {
      EntityConnections: {
        request_id: 1,
        operator: null,
        subject_id: 'e',
        subject_kind: 'k',
        limit: 10,
      },
    },
    { ConnectivityGraph: { request_id: 1, operator: null, since: null, until: null, limit: 10 } },
    { ConnectivityMembers: { request_id: 1, operator: null, class: 'agents', limit: 10 } },
    { LogQuery: { request_id: 1, operator: null, limit: 10 } },
    { LogExplain: { request_id: 1, operator: null, decision_id: 'd' } },
    {
      LogExport: {
        operator: null,
        query: { request_id: 1, limit: 10 },
        command_id: 'c',
        issued_at: 1,
      },
    },
    {
      Contain: {
        operator: null,
        request: { subject: 'aig:agent:a', action: 'quarantine', reason: 'r' },
      } as never,
    },
    // IP-CONSOLE-02: the VTZ reads + the four audited writes.
    { VtzTree: { request_id: 1, operator: null, limit: 10 } },
    { VtzDetail: { request_id: 1, operator: null, vtz_id: 'YouSource.Corp' } },
    { VtzCreate: { request_id: 1, operator: null, spec: VTZ_SPEC } },
    { VtzEdit: { request_id: 1, operator: null, spec: VTZ_SPEC } },
    { VtzRescope: { request_id: 1, operator: null, vtz_id: 'a', new_name: 'b' } },
    { VtzDelete: { request_id: 1, operator: null, vtz_id: 'a' } },
  ];

  it.each(QUERY_SUBMIT_VARIANTS.map((r) => [Object.keys(r)[0] ?? '?', r] as const))(
    'wires %s to the QuerySubmit opcode (the engine discriminates by CBOR tag)',
    async (_name, request) => {
      const [clientStream, serverStream] = duplexPair();
      const client = new StreamFrameTransport(clientStream);
      const server = new StreamFrameTransport(serverStream);
      const serverScript = (async () => {
        const reqFrame = await server.recv();
        expect(reqFrame.header.frameType).toBe(FrameType.QuerySubmit);
        await server.send({
          frameType: FrameType.QueryResult,
          streamId: 0,
          payload: encode({ QueryRows: { rows: [], redacted_fields: [], cursor: null } }),
        });
      })();
      await Promise.all([dispatch(client, request), serverScript]);
    },
  );

  it('refuses a request variant with no wired frame opcode (fails loud, not mis-framed)', async () => {
    const [clientStream] = duplexPair();
    const client = new StreamFrameTransport(clientStream);
    const unwired = { TxnCommit: { txn: [], request_id: 1 } } as unknown as WireRequest;
    await expect(dispatch(client, unwired)).rejects.toThrow(/not yet wired/);
  });
});
