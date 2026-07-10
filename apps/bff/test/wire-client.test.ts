// apps/bff/test/wire-client.test.ts -- F0.3b-3d the BFF's real engine client (over a mock transport).

import { Flags, FrameType, PROTOCOL_V1_0, type FrameTransport, encode } from '@forge/wire';
import { describe, expect, it } from 'vitest';

import type { BffConfig } from '../src/config.js';
import {
  EngineRefusedError,
  WireCrucibleClient,
  replyToQueryRows,
} from '../src/engine/wire-client.js';

const config: BffConfig = {
  engineHost: '127.0.0.1',
  enginePort: 7878,
  httpPort: 0,
  logLevel: 'error',
  cacheTtlMs: 2000,
  cacheMaxEntries: 100,
  requestTimeoutMs: 1000,
  session: {
    ttlMs: 3_600_000,
    cookieName: 'fc_session',
    cookieSecure: true,
    maxSessions: 4096,
    maxPendingLogins: 256,
  },
  rbac: { groupRoles: {}, localRbac: {} },
};

/** A transport whose recv() returns a single scripted reply frame (a dispatch reply). */
function mockTransport(replyPayload: Uint8Array): FrameTransport {
  return {
    send: () => Promise.resolve(),
    recv: () =>
      Promise.resolve({
        header: {
          protocolVersion: PROTOCOL_V1_0,
          frameType: FrameType.QueryResult,
          streamId: 0,
          flags: Flags.END_STREAM,
          payloadLen: replyPayload.length,
        },
        payload: replyPayload,
      }),
    close: () => Promise.resolve(),
  };
}

describe('replyToQueryRows', () => {
  it('returns the rows on a QueryRows reply', () => {
    const rows = replyToQueryRows({
      QueryRows: { rows: [[['id', { Int: 1 }]]], redacted_fields: [], cursor: null },
    });
    expect(rows.rows).toEqual([[['id', { Int: 1 }]]]);
  });

  it('throws EngineRefusedError on a Refused reply', () => {
    expect(() =>
      replyToQueryRows({
        Refused: { error: { class: 'Denied', code: 2, retry: 'Never', correlation_id: 0 } },
      }),
    ).toThrow(EngineRefusedError);
  });
});

describe('WireCrucibleClient', () => {
  it('querySubmit dispatches and returns decoded rows', async () => {
    const reply = encode({
      QueryRows: { rows: [[['name', { Text: 'ada' }]]], redacted_fields: [], cursor: null },
    });
    const client = new WireCrucibleClient(config, () => Promise.resolve(mockTransport(reply)));
    const rows = await client.querySubmit({ request_id: 1, text: 'FIND person', params: [] });
    expect(rows.rows).toEqual([[['name', { Text: 'ada' }]]]);
  });

  it('querySubmit surfaces an engine refusal as EngineRefusedError', async () => {
    const reply = encode({
      Refused: { error: { class: 'Denied', code: 2, retry: 'Never', correlation_id: 0 } },
    });
    const client = new WireCrucibleClient(config, () => Promise.resolve(mockTransport(reply)));
    await expect(
      client.querySubmit({ request_id: 1, text: 'FIND secret', params: [] }),
    ).rejects.toBeInstanceOf(EngineRefusedError);
  });

  it('ping resolves when the transport connects (reachability)', async () => {
    let connected = false;
    const client = new WireCrucibleClient(config, () => {
      connected = true;
      return Promise.resolve(mockTransport(new Uint8Array(0)));
    });
    await client.ping();
    expect(connected).toBe(true);
  });

  it('ping rejects when the connector fails (engine unreachable)', async () => {
    const client = new WireCrucibleClient(config, () => Promise.reject(new Error('ECONNREFUSED')));
    await expect(client.ping()).rejects.toThrow(/ECONNREFUSED/);
  });
});
