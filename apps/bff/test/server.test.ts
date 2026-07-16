// apps/bff/test/server.test.ts -- F0.3 tier-2 HTTP surface over a mocked engine seam.

import type { Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { EphemeralCache } from '../src/cache.js';
import type { BffConfig } from '../src/config.js';
import type { AuthRouter } from '../src/auth/router.js';
import type { OperatorSession } from '../src/auth/session.js';
import type { CrucibleClient } from '../src/engine/client.js';
import type { OperatorEngine } from '../src/engine/operator-engine.js';
import { EngineRefusedError } from '../src/engine/wire-client.js';
import { createServer, type ServerDeps, type ServerLogger } from '../src/server.js';

const config: BffConfig = {
  engineHost: 'engine.internal',
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

const silentLog: ServerLogger = { info: () => {}, warn: () => {}, error: () => {} };

/** A CrucibleClient whose `ping` is scripted; the other methods reject (unused in these tests). */
function mockClient(ping: () => Promise<void>): CrucibleClient {
  const unused = (): Promise<never> => Promise.reject(new Error('not used in this test'));
  return {
    ping,
    querySubmit: unused,
    listAgents: unused,
    entityDecisions: unused,
    entityConnections: unused,
    connectivityGraph: unused,
    contain: unused,
    logQuery: unused,
    logExplain: unused,
    logExport: unused,
    cursorFetch: unused,
    cursorClose: unused,
    close: () => Promise.resolve(),
  };
}

const operatorSession: OperatorSession = {
  sessionId: 's1',
  subject: 'auth0|op',
  tier: 'Admin',
  principalId: 'principal-op',
  tenant: 'tenant-op',
  role: 'tenant-admin',
  expiresAt: Number.MAX_SAFE_INTEGER,
};

/** A minimal AuthRouter: it never claims a request (handle -> false) and resolves the given session. */
function authRouterWith(session: OperatorSession | undefined): AuthRouter {
  return { handle: () => Promise.resolve(false), resolveSession: () => session };
}

/** A minimal OperatorEngine: the directory carries one active agent with one capability edge. */
function operatorEngineWith(): OperatorEngine {
  const unused = () => Promise.reject(new Error('unused'));
  return {
    querySubmit: () =>
      Promise.resolve({
        rows: [
          [
            ['relation', { Text: 'USES_TOOL' }],
            ['target', { Text: 'tool:search' }],
          ],
        ],
        cursor: null,
        redacted_fields: [],
      }),
    cursorFetch: unused,
    cursorClose: unused,
    listAgents: () =>
      Promise.resolve({
        agents: [{ agent_id: 'aig:agent:a', status: 'active', enrolled_at: 1, attributes: [] }],
      }),
    entityDecisions: () => Promise.resolve({ decisions: [] }),
    entityConnections: () => Promise.resolve({ connections: [] }),
    connectivityGraph: () =>
      Promise.resolve({
        sources: [
          { class: 'agents', count: 3 },
          { class: 'users', count: 1 },
        ],
        destinations: [{ class: 'saas', count: 4 }],
        edges: [{ source_class: 'agents', dest_class: 'saas', weight: 4 }],
        risk: { level: 'yellow', escalate: 0, candidate: 2, observe: 5 },
        vtzs: [
          {
            id: 'demo-public-agent',
            name: 'Demo.Public.Agent',
            profile: 'observe',
            risk: { level: 'red', escalate: 1, candidate: 0, observe: 0 },
          },
        ],
        source_edges: [{ source_class: 'agents', vtz_id: 'demo-public-agent', weight: 3 }],
        dest_edges: [{ vtz_id: 'demo-public-agent', dest_class: 'saas', weight: 4 }],
        top_destinations: [],
        truncated: false,
      }),
    // This route test does not exercise CONTAIN; fail loudly if it is reached (not a canned success).
    contain: unused,
    logQuery: () =>
      Promise.resolve({
        decisions: [
          {
            decision_id: 'sha512:d1',
            rule_id: 'LR-EX-001',
            finding: 'Suspicious command',
            tactics: ['TA0002'],
            technique: 'T1059',
            evidence: ['dc:process_creation'],
            confidence: 'HIGH',
            recommended_action: 'escalate',
            created_at: 1_700_000_000,
          },
        ],
      }),
    logExplain: () =>
      Promise.resolve({
        decision_id: 'sha512:d1',
        rule_id: 'LR-EX-001',
        finding: 'Suspicious command',
        technique: 'T1059',
        tactics: ['TA0002'],
        evidence: ['dc:process_creation'],
        confidence: 'HIGH',
        recommended_action: 'escalate',
        scope: 'host-7',
        source_hosts: ['host-7'],
        source_subjects: ['host-7:pid:1234'],
        source_context: [],
        source_observations: [],
        correlation_id: 'corr-1',
        replay_as_of: 42,
        watermark_seconds: 100,
        window_seconds: 60,
        replay_digest: 'sha512:rd',
        created_at: 1_700_000_000,
      }),
    logExport: () =>
      Promise.resolve({
        export_id: 'sha512:e1',
        commit_version: 42,
        row_count: 1,
        rows: [
          {
            decision_id: 'sha512:d1',
            rule_id: 'LR-EX-001',
            finding: 'Suspicious command',
            tactics: ['TA0002'],
            technique: 'T1059',
            evidence: ['dc:process_creation'],
            confidence: 'HIGH',
            recommended_action: 'escalate',
            created_at: 1_700_000_000,
          },
        ],
      }),
  };
}

const servers: Server[] = [];

function start(
  client: CrucibleClient,
  extra?: Pick<ServerDeps, 'authRouter' | 'operatorEngine'>,
): Promise<string> {
  const cache = new EphemeralCache<unknown>(config.cacheTtlMs, config.cacheMaxEntries);
  const server = createServer({ config, log: silentLog, cache, client, ...extra });
  servers.push(server);
  return new Promise<string>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('no server address'));
        return;
      }
      resolve(`http://127.0.0.1:${String(address.port)}`);
    });
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

describe('BFF HTTP surface', () => {
  it('GET /healthz is 200 ok (liveness)', async () => {
    const base = await start(mockClient(() => Promise.resolve()));
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /readyz is 200 when the engine ping resolves', async () => {
    const base = await start(mockClient(() => Promise.resolve()));
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ready: true });
  });

  it('GET /readyz is 503 when the engine ping rejects (transport unwired / engine down)', async () => {
    const base = await start(mockClient(() => Promise.reject(new Error('unreachable'))));
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ready: false });
  });

  it('GET /openapi.json returns the OpenAPI 3.1 skeleton', async () => {
    const base = await start(mockClient(() => Promise.resolve()));
    const res = await fetch(`${base}/openapi.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toContain('/readyz');
  });

  it('an unknown path is 404', async () => {
    const base = await start(mockClient(() => Promise.resolve()));
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });

  it('GET /api/entity/<kind>/<id> is 401 without an operator session (fail-closed)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(undefined),
        operatorEngine: operatorEngineWith(),
      },
    );
    const res = await fetch(`${base}/api/entity/principal/aig%3Aagent%3Aa`);
    expect(res.status).toBe(401);
  });

  it('GET /api/entity/<kind>/<id> resolves the live drawer detail for an operator (DR.3d-3)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: operatorEngineWith(),
      },
    );
    // The agent id carries colons; it is percent-encoded in the path and decoded server-side.
    const res = await fetch(`${base}/api/entity/principal/aig%3Aagent%3Aa`);
    expect(res.status).toBe(200);
    const detail = (await res.json()) as {
      ref: { kind: string; id: string };
      header: { status: string; data?: { status: string; displayName: string } };
      capabilities: { status: string };
    };
    expect(detail.ref).toEqual({ kind: 'principal', id: 'aig:agent:a' });
    expect(detail.header.status).toBe('ok');
    expect(detail.header.data?.status).toBe('active');
    expect(detail.header.data?.displayName).toBe('aig:agent:a');
    // Capabilities resolve live from the agent_capabilities relation (VR.3), through the HTTP payload.
    expect(detail.capabilities.status).toBe('ok');
  });

  it('GET /api/logs brokers the LOG_QUERY read + projects the rows (LG.2)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: operatorEngineWith(),
      },
    );
    const res = await fetch(`${base}/api/logs?technique=T1059&limit=25`);
    expect(res.status).toBe(200);
    const page = (await res.json()) as {
      rows: {
        decisionId: string;
        at: number;
        technique: string;
        outcome: string;
        status: string;
      }[];
    };
    expect(page.rows).toHaveLength(1);
    // created_at seconds -> millis; the row projects the real decision fields.
    expect(page.rows[0]?.at).toBe(1_700_000_000_000);
    expect(page.rows[0]?.technique).toBe('T1059');
    expect(page.rows[0]?.outcome).toBe('escalate');
    // `escalate` is the most severe advisory posture -> the `denied` (most severe) badge classification.
    expect(page.rows[0]?.status).toBe('denied');
  });

  it('GET /api/logs is 401 without an operator session (fail-closed)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(undefined), operatorEngine: operatorEngineWith() },
    );
    const res = await fetch(`${base}/api/logs`);
    expect(res.status).toBe(401);
  });

  it('GET /api/logs/explain/<id> brokers LOG_EXPLAIN + derives the acting entity (LG.2)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: operatorEngineWith(),
      },
    );
    const res = await fetch(`${base}/api/logs/explain/sha512%3Ad1`);
    expect(res.status).toBe(200);
    const detail = (await res.json()) as {
      decisionId: string;
      scope: string;
      sourceSubjects: string[];
      actingEntity: { kind: string; id: string } | null;
    };
    expect(detail.decisionId).toBe('sha512:d1');
    expect(detail.scope).toBe('host-7');
    // The acting entity for the row -> drawer drill-in derives from the source subject.
    expect(detail.actingEntity).toEqual({ kind: 'principal', id: 'host-7:pid:1234' });
  });

  it('GET /api/logs/explain sanitizes an absent/denied decision to a non-oracle 404', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      logExplain: () =>
        Promise.reject(
          new EngineRefusedError({ class: 'Denied', code: 0, retry: 'Never', correlation_id: 0 }),
        ),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const res = await fetch(`${base}/api/logs/explain/sha512%3Aabsent`);
    expect(res.status).toBe(404);
  });

  it('POST /api/logs/export brokers the audited export + returns the receipt + rows (LG.6)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: operatorEngineWith() },
    );
    const res = await fetch(`${base}/api/logs/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'cmd-1', filter: { technique: 'T1059', limit: 25 } }),
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as {
      exportId: string;
      commitVersion: number;
      rowCount: number;
      rows: { decisionId: string }[];
    };
    // The audited receipt (id + commit version) proves it landed on the chain; the rows are the audited set.
    expect(view.exportId).toBe('sha512:e1');
    expect(view.commitVersion).toBe(42);
    expect(view.rowCount).toBe(1);
    expect(view.rows[0]?.decisionId).toBe('sha512:d1');
  });

  it('POST /api/logs/export is 401 without a session and 400 on a malformed body', async () => {
    const noSession = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(undefined), operatorEngine: operatorEngineWith() },
    );
    expect(
      (await fetch(`${noSession}/api/logs/export`, { method: 'POST', body: '{}' })).status,
    ).toBe(401);

    const session = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: operatorEngineWith() },
    );
    // A body missing commandId is a sanitized 400.
    expect(
      (
        await fetch(`${session}/api/logs/export`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filter: { limit: 10 } }),
        })
      ).status,
    ).toBe(400);
  });

  it('GET /api/overview/graph brokers CONNECTIVITY_GRAPH + projects the camelCase graph (O1.3)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: operatorEngineWith() },
    );
    const res = await fetch(`${base}/api/overview/graph?limit=100`);
    expect(res.status).toBe(200);
    const graph = (await res.json()) as {
      sources: { class: string; count: number }[];
      destinations: { class: string; count: number }[];
      edges: { sourceClass: string; destClass: string; weight: number }[];
      risk: { level: string; candidate: number; observe: number };
    };
    // The DTO's snake_case edge fields project to the camelCase view model, real engine facts throughout.
    expect(graph.sources).toEqual([
      { class: 'agents', count: 3 },
      { class: 'users', count: 1 },
    ]);
    expect(graph.edges).toEqual([{ sourceClass: 'agents', destClass: 'saas', weight: 4 }]);
    // The "Public" zone is colored by the risk band derived from detected alerts (no trust score).
    expect(graph.risk.level).toBe('yellow');
    expect(graph.risk.candidate).toBe(2);
  });

  it('GET /api/overview/sankey projects the VTZ-routed two-stage view model (RD.4)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: operatorEngineWith(),
      },
    );
    const res = await fetch(`${base}/api/overview/sankey?limit=100`);
    expect(res.status).toBe(200);
    const sankey = (await res.json()) as {
      vtzs: { id: string; name: string; profile: string; risk: { level: string } }[];
      sourceEdges: { sourceClass: string; vtzId: string; weight: number }[];
      destEdges: { vtzId: string; destClass: string; weight: number }[];
      destinations: { class: string; count: number; apps: unknown[]; moreCount: number }[];
    };
    // The two-stage flow: each VTZ carries its own detection-driven risk; the edges are source->VTZ->dest.
    expect(sankey.vtzs).toEqual([
      {
        id: 'demo-public-agent',
        name: 'Demo.Public.Agent',
        profile: 'observe',
        risk: { level: 'red', escalate: 1, candidate: 0, observe: 0 },
      },
    ]);
    expect(sankey.sourceEdges).toEqual([
      { sourceClass: 'agents', vtzId: 'demo-public-agent', weight: 3 },
    ]);
    expect(sankey.destEdges).toEqual([
      { vtzId: 'demo-public-agent', destClass: 'saas', weight: 4 },
    ]);
    // No per-app breakdown on the wire yet -> apps empty, moreCount = the category count.
    // All four category rings render; the engine-side saas count merges into its ring.
    expect(sankey.destinations).toEqual([
      { class: 'network', count: 0, apps: [], moreCount: 0 },
      { class: 'saas', count: 4, apps: [], moreCount: 4 },
      { class: 'private-apps', count: 0, apps: [], moreCount: 0 },
      { class: 'data-stores', count: 0, apps: [], moreCount: 0 },
    ]);
  });

  it('GET /api/overview/graph is 401 without an operator session (fail-closed)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(undefined), operatorEngine: operatorEngineWith() },
    );
    expect((await fetch(`${base}/api/overview/graph`)).status).toBe(401);
  });

  it('GET /api/overview/graph is 503 when the operator engine is not wired', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession) },
    );
    const res = await fetch(`${base}/api/overview/graph`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'engine_unavailable' });
  });

  it('GET /api/overview/graph fails closed to 503 unavailable on an unknown risk-band tag (O1.3)', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      // An engine risk-band level the Console does not know must never be silently mis-colored.
      connectivityGraph: () =>
        Promise.resolve({
          sources: [],
          destinations: [],
          edges: [],
          risk: { level: 'chartreuse', escalate: 0, candidate: 0, observe: 0 },
          vtzs: [],
          source_edges: [],
          dest_edges: [],
          top_destinations: [],
          truncated: false,
        }),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const res = await fetch(`${base}/api/overview/graph`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('GET /api/overview/graph serves an identical query from the short-TTL cache (O1.3)', async () => {
    let hits = 0;
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      connectivityGraph: () => {
        hits += 1;
        return Promise.resolve({
          sources: [],
          destinations: [],
          edges: [],
          risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
          vtzs: [],
          source_edges: [],
          dest_edges: [],
          top_destinations: [],
          truncated: false,
        });
      },
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    expect((await fetch(`${base}/api/overview/graph?limit=100`)).status).toBe(200);
    expect((await fetch(`${base}/api/overview/graph?limit=100`)).status).toBe(200);
    // The second identical read is served from the cache; the engine is hit exactly once.
    expect(hits).toBe(1);
    // A different window is a distinct cache key -> a fresh engine read.
    expect((await fetch(`${base}/api/overview/graph?limit=200`)).status).toBe(200);
    expect(hits).toBe(2);
  });

  it('GET /api/overview/graph keys the cache by tenant so a graph never leaks across tenants (O1.3)', async () => {
    let hits = 0;
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      connectivityGraph: () => {
        hits += 1;
        return Promise.resolve({
          sources: [],
          destinations: [],
          edges: [],
          risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
          vtzs: [],
          source_edges: [],
          dest_edges: [],
          top_destinations: [],
          truncated: false,
        });
      },
    };
    // One server, two operators in different tenants (the resolved session flips between requests).
    let current: OperatorSession = operatorSession;
    const router: AuthRouter = {
      handle: () => Promise.resolve(false),
      resolveSession: () => current,
    };
    const cache = new EphemeralCache<unknown>(config.cacheTtlMs, config.cacheMaxEntries);
    const server = createServer({
      config,
      log: silentLog,
      cache,
      client: mockClient(() => Promise.resolve()),
      authRouter: router,
      operatorEngine: engine,
    });
    servers.push(server);
    const base = await new Promise<string>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address === null || typeof address === 'string') return reject(new Error('no address'));
        resolve(`http://127.0.0.1:${String(address.port)}`);
      });
    });
    expect((await fetch(`${base}/api/overview/graph?limit=100`)).status).toBe(200);
    current = { ...operatorSession, tenant: 'tenant-two' };
    expect((await fetch(`${base}/api/overview/graph?limit=100`)).status).toBe(200);
    // Same bounds, different tenant -> a distinct cache key -> the engine is read again (no cross-tenant reuse).
    expect(hits).toBe(2);
  });

  it('POST /api/entity/<kind>/<id>/isolate brokers the containment + returns the honest effect (DR.5c)', async () => {
    // The engine records the disposition and returns the effect; enforcement is off (AG.7).
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      contain: (_principal, req) =>
        Promise.resolve({
          action: req.request.action,
          enforcement_active: false,
          summary: `${req.request.action} recorded; enforcement off`,
        }),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: engine,
      },
    );
    const res = await fetch(`${base}/api/entity/principal/aig%3Aagent%3Aa/isolate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'cmd-1', posture: 'quarantine' }),
    });
    expect(res.status).toBe(200);
    const effect = (await res.json()) as {
      posture: string;
      enforcementActive: boolean;
      summary: string;
    };
    expect(effect.posture).toBe('quarantine');
    expect(effect.enforcementActive).toBe(false);
  });

  it('POST isolate is 401 without an operator session (fail-closed)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(undefined),
        operatorEngine: operatorEngineWith(),
      },
    );
    const res = await fetch(`${base}/api/entity/principal/aig%3Aagent%3Aa/isolate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'c', posture: 'quarantine' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST isolate sanitizes an engine refusal to a typed 403 (beyond-tier / no delegation)', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      contain: () =>
        Promise.reject(
          new EngineRefusedError({ class: 'Denied', code: 2, retry: 'Never', correlation_id: 0 }),
        ),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: engine,
      },
    );
    const res = await fetch(`${base}/api/entity/principal/aig%3Aagent%3Aa/isolate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'c', posture: 'deny' }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; class: string };
    expect(body.class).toBe('Denied');
  });

  it('POST isolate rejects a malformed body (bad posture) with 400', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: operatorEngineWith(),
      },
    );
    const res = await fetch(`${base}/api/entity/principal/aig%3Aagent%3Aa/isolate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'c', posture: 'nuke' }),
    });
    expect(res.status).toBe(400);
  });
});
