// apps/bff/test/server.test.ts -- F0.3 tier-2 HTTP surface over a mocked engine seam.

import type { Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { EphemeralCache } from '../src/cache.js';
import type { BffConfig } from '../src/config.js';
import type { AuthRouter } from '../src/auth/router.js';
import type { OperatorSession } from '../src/auth/session.js';
import type { CrucibleClient } from '../src/engine/client.js';
import type { OperatorEngine } from '../src/engine/operator-engine.js';
import { createServer, type ServerDeps, type ServerLogger } from '../src/server.js';

const config: BffConfig = {
  engineHost: 'engine.internal',
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
});
