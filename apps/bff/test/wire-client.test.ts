// apps/bff/test/wire-client.test.ts -- F0.3b-3d the BFF's real engine client (over a mock transport).

import {
  Flags,
  FrameType,
  PROTOCOL_V1_0,
  type FrameTransport,
  type OutboundFrame,
  type WireFrame,
  encode,
} from '@forge/wire';
import { describe, expect, it, vi } from 'vitest';

import type { BffConfig } from '../src/config.js';
import {
  EngineRefusedError,
  WireCrucibleClient,
  replyToAgentList,
  replyToConnectionList,
  replyToConnectivityGraph,
  replyToDecisionList,
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
  heartbeatIntervalMs: 20_000,
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

/** A frame of a given opcode with an empty payload (a PONG heartbeat reply). */
function pongFrame(): WireFrame {
  return {
    header: {
      protocolVersion: PROTOCOL_V1_0,
      frameType: FrameType.Pong,
      streamId: 0,
      flags: Flags.END_STREAM,
      payloadLen: 0,
    },
    payload: new Uint8Array(0),
  };
}

/** A transport that answers every recv() with a PONG (a healthy heartbeat peer). */
function pongTransport(): FrameTransport {
  return {
    send: () => Promise.resolve(),
    recv: () => Promise.resolve(pongFrame()),
    close: () => Promise.resolve(),
  };
}

/** A dead transport: send/recv reject as a closed wire stream would (a lapsed lease / restart). */
function deadTransport(): FrameTransport {
  const closed = (): Promise<never> => Promise.reject(new Error('wire stream closed'));
  return { send: closed, recv: closed, close: () => Promise.resolve() };
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

describe('the entity-read reply helpers (DR.3c)', () => {
  const refused = {
    Refused: {
      error: { class: 'Denied' as const, code: 2, retry: 'Never' as const, correlation_id: 0 },
    },
  };

  it('replyToAgentList returns the list, or throws on a refusal', () => {
    expect(replyToAgentList({ AgentList: { agents: [] } }).agents).toEqual([]);
    expect(() => replyToAgentList(refused)).toThrow(EngineRefusedError);
  });

  it('replyToDecisionList returns the list, or throws on a refusal', () => {
    expect(replyToDecisionList({ DecisionList: { decisions: [] } }).decisions).toEqual([]);
    expect(() => replyToDecisionList(refused)).toThrow(EngineRefusedError);
  });

  it('replyToConnectionList returns the list, or throws on a refusal', () => {
    expect(replyToConnectionList({ ConnectionList: { connections: [] } }).connections).toEqual([]);
    expect(() => replyToConnectionList(refused)).toThrow(EngineRefusedError);
  });

  it('replyToConnectivityGraph returns the graph, or throws on a refusal (O1.3)', () => {
    const graph = {
      sources: [],
      destinations: [],
      edges: [],
      risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
    };
    expect(replyToConnectivityGraph({ ConnectivityGraph: graph }).risk.level).toBe('green');
    expect(() => replyToConnectivityGraph(refused)).toThrow(EngineRefusedError);
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

  it('ping does a real PING/PONG round-trip (readiness reflects reachability)', async () => {
    let connected = false;
    const client = new WireCrucibleClient(config, () => {
      connected = true;
      return Promise.resolve(pongTransport());
    });
    await client.ping();
    expect(connected).toBe(true);
    await client.close();
  });

  it('ping rejects when the connector fails (engine unreachable -> fails closed)', async () => {
    const client = new WireCrucibleClient(config, () => Promise.reject(new Error('ECONNREFUSED')));
    await expect(client.ping()).rejects.toThrow(/ECONNREFUSED/);
  });

  it('ping rejects when the peer never PONGs (a stale handle is not "ready")', async () => {
    // A non-PONG reply is not liveness; readiness must fail closed rather than trust a cached handle.
    const client = new WireCrucibleClient(config, () =>
      Promise.resolve(mockTransport(new Uint8Array(0))),
    );
    await expect(client.ping()).rejects.toThrow();
    await client.close();
  });

  it('listAgents dispatches and returns the decoded agent list (DR.3c)', async () => {
    const reply = encode({
      AgentList: {
        agents: [{ agent_id: 'aig:agent:a', status: 'active', enrolled_at: 1, attributes: [] }],
      },
    });
    const client = new WireCrucibleClient(config, () => Promise.resolve(mockTransport(reply)));
    const list = await client.listAgents({ request_id: 1 });
    expect(list.agents[0]?.status).toBe('active');
    await client.close();
  });

  it('connectivityGraph dispatches and returns the decoded graph (O1.3)', async () => {
    const reply = encode({
      ConnectivityGraph: {
        sources: [{ class: 'agents', count: 2 }],
        destinations: [{ class: 'saas', count: 2 }],
        edges: [{ source_class: 'agents', dest_class: 'saas', weight: 2 }],
        risk: { level: 'red', escalate: 3, candidate: 1, observe: 0 },
      },
    });
    const client = new WireCrucibleClient(config, () => Promise.resolve(mockTransport(reply)));
    const graph = await client.connectivityGraph({
      request_id: 1,
      operator: null,
      since: null,
      until: null,
      limit: 1000,
    });
    expect(graph.risk.level).toBe('red');
    expect(graph.edges[0]?.weight).toBe(2);
    await client.close();
  });

  it('reconnects and retries once after a transport failure (self-heals, never fails open)', async () => {
    const good = encode({
      AgentList: { agents: [{ agent_id: 'a', status: 'active', enrolled_at: 1, attributes: [] }] },
    });
    let dials = 0;
    const client = new WireCrucibleClient(config, () => {
      dials += 1;
      // First dial hands back a dead transport (a lapsed lease / restart); the retry gets a live one.
      return Promise.resolve(dials === 1 ? deadTransport() : mockTransport(good));
    });
    const list = await client.listAgents({ request_id: 1 });
    expect(dials).toBe(2); // it re-dialed rather than reusing the dead transport
    expect(list.agents[0]?.status).toBe('active');
    await client.close();
  });

  it('does NOT reconnect on an engine refusal (a Denied is a domain result, not a dead link)', async () => {
    const refused = encode({
      Refused: { error: { class: 'Denied', code: 2, retry: 'Never', correlation_id: 0 } },
    });
    let dials = 0;
    const client = new WireCrucibleClient(config, () => {
      dials += 1;
      return Promise.resolve(mockTransport(refused));
    });
    await expect(
      client.querySubmit({ request_id: 1, text: 'FIND x', params: [] }),
    ).rejects.toBeInstanceOf(EngineRefusedError);
    expect(dials).toBe(1); // one dial: a refusal must not churn the connection
    await client.close();
  });

  it('sends PING heartbeats on the configured interval (keeps the session lease alive)', async () => {
    vi.useFakeTimers();
    try {
      let pings = 0;
      const transport: FrameTransport = {
        send: (frame: OutboundFrame) => {
          if (frame.frameType === FrameType.Ping) pings += 1;
          return Promise.resolve();
        },
        recv: () => Promise.resolve(pongFrame()),
        close: () => Promise.resolve(),
      };
      const client = new WireCrucibleClient({ ...config, heartbeatIntervalMs: 1000 }, () =>
        Promise.resolve(transport),
      );
      await client.ping(); // establishes the transport and starts the heartbeat
      const afterConnect = pings;
      await vi.advanceTimersByTimeAsync(3200);
      expect(pings).toBeGreaterThan(afterConnect); // background heartbeats fired within the lease window
      await client.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
