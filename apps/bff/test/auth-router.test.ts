// apps/bff/test/auth-router.test.ts -- F0.5a-2 the operator auth HTTP surface (tier-2, over scripted seams).
//
// Drives the real node:http server (auth router mounted via createServer) with fetch, over a scripted
// OidcProvider and the real in-memory stores. Proves the full device-login lifecycle, the session cookie
// round-trip, and every failure path -- without a network or a browser.

import type { Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { PendingLoginStore } from '../src/auth/login-store.js';
import type { OidcProvider } from '../src/auth/provider.js';
import { createAuthRouter } from '../src/auth/router.js';
import { SessionStore } from '../src/auth/session.js';
import type { OperatorIdentity } from '../src/auth/session.js';
import { EphemeralCache } from '../src/cache.js';
import type { BffConfig } from '../src/config.js';
import type { CrucibleClient } from '../src/engine/client.js';
import { createServer, type ServerLogger } from '../src/server.js';

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
const unusedClient: CrucibleClient = {
  ping: () => Promise.resolve(),
  querySubmit: () => Promise.reject(new Error('unused')),
  policyListByZone: () => Promise.reject(new Error('unused')),
  policyDetail: () => Promise.reject(new Error('unused')),
  policyEffective: () => Promise.reject(new Error('unused')),
  policyCreate: () => Promise.reject(new Error('unused')),
  policyEdit: () => Promise.reject(new Error('unused')),
  policyPublish: () => Promise.reject(new Error('unused')),
  policyDelete: () => Promise.reject(new Error('unused')),
  listAgents: () => Promise.reject(new Error('unused')),
  listPrincipals: () => Promise.reject(new Error('unused')),
  groupCreate: () => Promise.reject(new Error('unused')),
  groupEdit: () => Promise.reject(new Error('unused')),
  groupSetMembers: () => Promise.reject(new Error('unused')),
  principalCreate: () => Promise.reject(new Error('unused')),
  principalEdit: () => Promise.reject(new Error('unused')),
  principalSetStatus: () => Promise.reject(new Error('unused')),
  listGroups: () => Promise.reject(new Error('unused')),
  objectList: () => Promise.reject(new Error('unused')),
  idamConnectors: () => Promise.reject(new Error('unused')),
  idamSync: () => Promise.reject(new Error('unused')),
  idamConnect: () => Promise.reject(new Error('unused')),
  idamConfigure: () => Promise.reject(new Error('unused')),
  objectCreate: () => Promise.reject(new Error('unused')),
  objectEdit: () => Promise.reject(new Error('unused')),
  objectDelete: () => Promise.reject(new Error('unused')),
  objectDetail: () => Promise.reject(new Error('unused')),
  entityDecisions: () => Promise.reject(new Error('unused')),
  entityConnections: () => Promise.reject(new Error('unused')),
  connectivityGraph: () => Promise.reject(new Error('unused')),
  connectivityMembers: () => Promise.reject(new Error('unused')),
  contain: () => Promise.reject(new Error('unused')),
  logQuery: () => Promise.reject(new Error('unused')),
  logExplain: () => Promise.reject(new Error('unused')),
  logExport: () => Promise.reject(new Error('unused')),
  vtzTree: () => Promise.reject(new Error('unused')),
  vtzDetail: () => Promise.reject(new Error('unused')),
  vtzCreate: () => Promise.reject(new Error('unused')),
  bundleCommit: () => Promise.reject(new Error('unused')),
  bundleConvergence: () => Promise.reject(new Error('unused')),
  vtzEdit: () => Promise.reject(new Error('unused')),
  vtzRescope: () => Promise.reject(new Error('unused')),
  vtzDelete: () => Promise.reject(new Error('unused')),
  cursorFetch: () => Promise.reject(new Error('unused')),
  cursorClose: () => Promise.reject(new Error('unused')),
  close: () => Promise.resolve(),
};

/** A mutable, scripted OIDC provider: each test wires the responses it needs. */
interface Scripted extends OidcProvider {
  deviceCode: string;
  pollQueue: Array<{ kind: 'pending' } | { kind: 'complete'; idToken: string } | { kind: 'throw' }>;
  verify: (idToken: string) => Promise<OperatorIdentity | undefined>;
}

function scriptedProvider(): Scripted {
  const p: Scripted = {
    deviceCode: 'DEV-SECRET-CODE',
    pollQueue: [],
    verify: () =>
      Promise.resolve({
        subject: 'auth0|op',
        email: 'op@x.io',
        tier: 'Admin',
        principalId: 'p-op',
        tenant: 'tenant-op',
        role: 'tenant-admin',
      }),
    requestDeviceCode: () =>
      Promise.resolve({
        deviceCode: p.deviceCode,
        userCode: 'WXYZ-1234',
        verificationUri: 'https://idp/activate',
        verificationUriComplete: 'https://idp/activate?user_code=WXYZ-1234',
        expiresInSecs: 900,
        intervalSecs: 5,
      }),
    pollToken: () => {
      const next = p.pollQueue.shift();
      if (next === undefined || next.kind === 'pending')
        return Promise.resolve({ status: 'pending' });
      if (next.kind === 'throw') return Promise.reject(new Error('access_denied'));
      return Promise.resolve({ status: 'complete', idToken: next.idToken, accessToken: 'AT' });
    },
    verifyLogin: (idToken) => p.verify(idToken),
  };
  return p;
}

const servers: Server[] = [];

function start(provider: OidcProvider): Promise<{ base: string; sessions: SessionStore }> {
  const sessions = new SessionStore(config.session.maxSessions);
  const pending = new PendingLoginStore(config.session.maxPendingLogins);
  const authRouter = createAuthRouter({
    oidc: provider,
    sessions,
    pending,
    log: silentLog,
    sessionTtlMs: config.session.ttlMs,
    cookie: { name: config.session.cookieName, secure: config.session.cookieSecure },
  });
  const cache = new EphemeralCache<unknown>(config.cacheTtlMs, config.cacheMaxEntries);
  const server = createServer({ config, log: silentLog, cache, client: unusedClient, authRouter });
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('no server address'));
        return;
      }
      resolve({ base: `http://127.0.0.1:${String(address.port)}`, sessions });
    });
  });
}

/** Pull the session id out of a Set-Cookie header (fc_session=<id>; ...). */
function cookieValue(setCookie: string | null): string {
  const first = (setCookie ?? '').split(';')[0] ?? '';
  return first.split('=')[1] ?? '';
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

describe('auth router -- device login lifecycle', () => {
  it('runs login -> pending -> complete -> me -> logout end to end', async () => {
    const p = scriptedProvider();
    p.pollQueue = [{ kind: 'pending' }, { kind: 'complete', idToken: 'ID-TOKEN' }];
    const { base } = await start(p);

    // 1. login: issues a device code, returns a loginId + user code but NEVER the device code.
    const login = await fetch(`${base}/auth/login`, { method: 'POST' });
    expect(login.status).toBe(200);
    const loginBody = (await login.json()) as Record<string, unknown>;
    expect(loginBody['userCode']).toBe('WXYZ-1234');
    expect(typeof loginBody['loginId']).toBe('string');
    expect(JSON.stringify(loginBody)).not.toContain('DEV-SECRET-CODE');
    const loginId = loginBody['loginId'] as string;

    // 2. first poll: still pending.
    const poll1 = await fetch(`${base}/auth/login/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loginId }),
    });
    expect(poll1.status).toBe(200);
    expect(await poll1.json()).toEqual({ status: 'pending' });

    // 3. second poll: complete -> operator + session cookie.
    const poll2 = await fetch(`${base}/auth/login/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loginId }),
    });
    expect(poll2.status).toBe(200);
    const poll2Body = (await poll2.json()) as Record<string, unknown>;
    expect(poll2Body['status']).toBe('complete');
    expect(poll2Body['operator']).toEqual({ subject: 'auth0|op', email: 'op@x.io', tier: 'Admin' });
    const setCookie = poll2.headers.get('set-cookie');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    const sid = cookieValue(setCookie);
    expect(sid).toHaveLength(64);

    // 4. /auth/me with the cookie returns the operator.
    const me = await fetch(`${base}/auth/me`, { headers: { cookie: `fc_session=${sid}` } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as Record<string, unknown>)['operator']).toEqual({
      subject: 'auth0|op',
      email: 'op@x.io',
      tier: 'Admin',
    });

    // 5. logout destroys the session; /auth/me is then unauthenticated.
    const logout = await fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: { cookie: `fc_session=${sid}` },
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    const meAfter = await fetch(`${base}/auth/me`, { headers: { cookie: `fc_session=${sid}` } });
    expect(meAfter.status).toBe(401);
  });

  it('reuses a loginId until it completes, then invalidates it', async () => {
    const p = scriptedProvider();
    p.pollQueue = [{ kind: 'complete', idToken: 'ID' }];
    const { base } = await start(p);
    const loginId = (
      (await (await fetch(`${base}/auth/login`, { method: 'POST' })).json()) as Record<
        string,
        unknown
      >
    )['loginId'] as string;

    const first = await fetch(`${base}/auth/login/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loginId }),
    });
    expect(first.status).toBe(200);
    // The login is consumed on completion: a replay of the same loginId is now unknown.
    const replay = await fetch(`${base}/auth/login/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loginId }),
    });
    expect(replay.status).toBe(404);
  });
});

describe('auth router -- failure paths', () => {
  it('404s an unknown loginId', async () => {
    const { base } = await start(scriptedProvider());
    const res = await fetch(`${base}/auth/login/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loginId: 'nope' }),
    });
    expect(res.status).toBe(404);
  });

  it('400s a malformed poll body', async () => {
    const { base } = await start(scriptedProvider());
    const res = await fetch(`${base}/auth/login/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });

  it('401s and kills the login when the device flow errors', async () => {
    const p = scriptedProvider();
    p.pollQueue = [{ kind: 'throw' }];
    const { base } = await start(p);
    const loginId = (
      (await (await fetch(`${base}/auth/login`, { method: 'POST' })).json()) as Record<
        string,
        unknown
      >
    )['loginId'] as string;
    const res = await fetch(`${base}/auth/login/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loginId }),
    });
    expect(res.status).toBe(401);
    // The dead login is gone.
    const after = await fetch(`${base}/auth/login/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loginId }),
    });
    expect(after.status).toBe(404);
  });

  it('401s when the id_token fails verification (no session minted)', async () => {
    const p = scriptedProvider();
    p.pollQueue = [{ kind: 'complete', idToken: 'BAD' }];
    p.verify = () => Promise.reject(new Error('ERR_JWS_SIGNATURE_VERIFICATION_FAILED'));
    const { base, sessions } = await start(p);
    const loginId = (
      (await (await fetch(`${base}/auth/login`, { method: 'POST' })).json()) as Record<
        string,
        unknown
      >
    )['loginId'] as string;
    const res = await fetch(`${base}/auth/login/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loginId }),
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as Record<string, unknown>)['error']).toBe('token_invalid');
    expect(sessions.size).toBe(0);
  });

  it('401s /auth/me without a session cookie', async () => {
    const { base } = await start(scriptedProvider());
    expect((await fetch(`${base}/auth/me`)).status).toBe(401);
  });

  it('405s the wrong method on an auth route', async () => {
    const { base } = await start(scriptedProvider());
    expect((await fetch(`${base}/auth/login`)).status).toBe(405); // GET on a POST route
  });

  it('still serves the operational routes with auth mounted', async () => {
    const { base } = await start(scriptedProvider());
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });
});
