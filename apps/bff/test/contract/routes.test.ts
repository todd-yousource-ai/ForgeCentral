// apps/bff/test/contract/routes.test.ts -- INV-BINDING-ROUTE-COVERAGE (IP-CONSOLE-11-guide GD.1), tier 2.
//
// The BFF route table (src/routes.ts) and the no-stub binding registry (@forge/bindings) form one index of
// the Console's operations. Proven here: every declared route realizes registered LIVE bindings of the
// right kind, every LIVE binding is served by a declared route, every declared route is claimed by a real
// handler, the dispatcher refuses an undeclared `/api` request, and every `/api` path the server matches
// literally or the SPA calls is declared.

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bindings } from '@forge/bindings';
import type { OperatorSession } from '../../src/auth/session.js';
import { afterEach, describe, expect, it } from 'vitest';

import type { AuthRouter } from '../../src/auth/router.js';
import { EphemeralCache } from '../../src/cache.js';
import type { BffConfig } from '../../src/config.js';
import type { CrucibleClient } from '../../src/engine/client.js';
import { API_ROUTES, apiRouteVerdict } from '../../src/routes.js';
import { createServer, type ServerLogger } from '../../src/server.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const config: BffConfig = {
  engineHost: 'engine.internal',
  enginePort: 7878,
  httpHost: '127.0.0.1',
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

/** No engine op is reachable in these tests: a handler that calls one answers 500 and fails the test. */
const unreachableEngine = {} as unknown as CrucibleClient;

/** An auth router that claims nothing and resolves no session: every handler must answer 401. */
const noSession: AuthRouter = {
  handle: () => Promise.resolve(false),
  resolveSession: (): OperatorSession | undefined => undefined,
};

/** A concrete sample for each path parameter the table uses. */
const SAMPLE: Readonly<Record<string, string>> = { kind: 'principal', id: 'x', proposal: '3' };

function concrete(template: string): string {
  return template.replace(/:([a-z]+)\+?/g, (_whole, name: string) => {
    const value = SAMPLE[name];
    if (value === undefined) throw new Error(`no sample value for path parameter ':${name}'`);
    return value;
  });
}

const servers: Server[] = [];

function start(spaDir?: string): Promise<string> {
  const cache = new EphemeralCache<unknown>(config.cacheTtlMs, config.cacheMaxEntries);
  const server = createServer({
    config: spaDir === undefined ? config : { ...config, spaDir },
    log: silentLog,
    cache,
    client: unreachableEngine,
    authRouter: noSession,
  });
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

/** Is the path declared under any method (the dispatcher answers `declared` or `method`)? */
function pathDeclared(path: string): boolean {
  return apiRouteVerdict('GET', path) !== 'undeclared';
}

/** Every `/api` path named in a string or template literal, with `${...}` sampled and the query dropped. */
function apiPathsIn(source: string): string[] {
  const paths: string[] = [];
  for (const match of source.matchAll(/['`](\/api\/[^'`\s]*)['`]/g)) {
    const literal = (match[1] ?? '').replace(/\$\{[^}]*\}?/g, 'x');
    paths.push(literal.split('?')[0] ?? literal);
  }
  return paths;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file))
    .filter((file) => !/(^|\/)test\//.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => join(dir, file));
}

describe('INV-BINDING-ROUTE-COVERAGE: the route table against the binding registry', () => {
  it('declares each method and path once', () => {
    const keys = API_ROUTES.map((route) => `${route.method} ${route.path}`);
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([]);
  });

  it('names only registered LIVE bindings, each at most once per route', () => {
    const problems: string[] = [];
    for (const route of API_ROUTES) {
      const where = `${route.method} ${route.path}`;
      if (route.bindings.length === 0) problems.push(`${where}: names no binding`);
      if (new Set(route.bindings).size !== route.bindings.length) {
        problems.push(`${where}: names a binding twice`);
      }
      for (const id of route.bindings) {
        const binding = bindings[id];
        if (binding === undefined) problems.push(`${where}: '${id}' is not registered`);
        else if (binding.status.kind !== 'live') problems.push(`${where}: '${id}' is PENDING`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('serves every LIVE binding through at least one declared route', () => {
    const served = new Set<string>(API_ROUTES.flatMap((route) => route.bindings));
    const unserved = Object.values(bindings)
      .filter((binding) => binding.status.kind === 'live' && !served.has(binding.id))
      .map((binding) => binding.id);
    expect(unserved).toEqual([]);
  });

  it('serves reads on GET and commands on every other method', () => {
    const mismatched = API_ROUTES.flatMap((route) =>
      route.bindings
        .filter((id) => {
          const kind = bindings[id]?.kind;
          return route.method === 'GET' ? kind !== 'read' : kind !== 'command';
        })
        .map((id) => `${route.method} ${route.path}: '${id}'`),
    );
    expect(mismatched).toEqual([]);
  });
});

describe('INV-BINDING-ROUTE-COVERAGE: the dispatcher serves exactly the declared routes', () => {
  it('claims every declared route with a real handler (401 without a session, never an unrouted refusal)', async () => {
    const base = await start();
    const answers: { route: string; status: number; body: unknown }[] = [];
    for (const route of API_ROUTES) {
      const res = await fetch(`${base}${concrete(route.path)}`, { method: route.method });
      answers.push({
        route: `${route.method} ${route.path}`,
        status: res.status,
        body: await res.json(),
      });
    }
    expect(answers.filter((a) => a.status !== 401)).toEqual([]);
    for (const answer of answers) expect(answer.body).toEqual({ error: 'unauthorized' });
  });

  it('refuses an undeclared /api path with 404 and a declared path under another method with 405', async () => {
    const base = await start();
    for (const [method, path, status, error] of [
      ['GET', '/api/nope', 404, 'not_found'],
      ['POST', '/api/nope', 404, 'not_found'],
      ['GET', '/api/logs/', 404, 'not_found'],
      ['DELETE', '/api/overview/sankey', 405, 'method_not_allowed'],
      ['GET', '/api/soc/act', 405, 'method_not_allowed'],
      ['PUT', '/api/settings', 405, 'method_not_allowed'],
    ] as const) {
      const res = await fetch(`${base}${path}`, { method });
      expect({ method, path, status: res.status, body: await res.json() }).toEqual({
        method,
        path,
        status,
        body: { error },
      });
    }
    // Paths outside /api keep their own handling.
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });

  it('answers an undeclared /api path with JSON 404 even when the SPA is served, never the SPA entrypoint', async () => {
    const spaDir = mkdtempSync(join(tmpdir(), 'fc-spa-'));
    try {
      writeFileSync(join(spaDir, 'index.html'), '<!doctype html><title>spa</title>');
      const base = await start(spaDir);
      const res = await fetch(`${base}/api/nope`);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({ error: 'not_found' });
      // A client-side route outside /api still gets the SPA entrypoint.
      const page = await fetch(`${base}/settings`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<title>spa</title>');
    } finally {
      rmSync(spaDir, { recursive: true, force: true });
    }
  });
});

describe('INV-BINDING-ROUTE-COVERAGE: the table covers every /api path the code names', () => {
  it('declares every /api path the server matches literally', () => {
    const server = readFileSync(join(repoRoot, 'apps', 'bff', 'src', 'server.ts'), 'utf8');
    const named = apiPathsIn(server).filter((path) => path !== '/api/');
    expect(named.length).toBeGreaterThan(0);
    expect([...new Set(named.filter((path) => !pathDeclared(path)))]).toEqual([]);
  });

  it('declares every /api path the SPA calls', () => {
    const named = sourceFiles(join(repoRoot, 'apps', 'console', 'src')).flatMap((file) =>
      apiPathsIn(readFileSync(file, 'utf8')).map((path) => ({ file, path })),
    );
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter(({ path }) => !pathDeclared(path))).toEqual([]);
  });
});
