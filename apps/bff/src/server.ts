// apps/bff/src/server.ts -- the BFF HTTP surface (F0.3).
//
// A small node:http server (zero framework dependency for the operational skeleton; a router lands with
// the first engine-brokered routes). It serves liveness, readiness, and the OpenAPI document. Readiness
// probes the engine through the injected `CrucibleClient` seam under the configured timeout, so it
// reflects real reachability -- not-ready when the transport is unwired or the engine is down. The server
// is constructed from injected dependencies (config/log/cache/client) so it is unit-testable over a mock
// seam without a live engine (INV-CONSOLE tier 2).

import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { objectId, principalId, toVtzSpecInput, vtzId } from '@forge/contracts';
import type {
  EntityRef,
  IsolateRequest,
  LogExportRequest,
  LogQueryFilter,
  OverviewQuery,
  VtzSpecInput,
} from '@forge/contracts';

import type { AuthRouter } from './auth/router.js';
import type { BffConfig } from './config.js';
import type { CrucibleClient } from './engine/client.js';
import { resolveEntityDetail } from './engine/entity-detail.js';
import { resolveIsolate } from './engine/isolate.js';
import { resolveLogExplain, resolveLogExport, resolveLogQuery } from './engine/logs.js';
import {
  OverviewUnavailableError,
  UnknownContainerError,
  resolveClassMembers,
  resolveEntityConnections,
  resolveOverviewSankey,
} from './engine/overview.js';
import type { OperatorEngine } from './engine/operator-engine.js';
import {
  DEFAULT_VTZ_TREE_LIMIT,
  MAX_VTZ_TREE_LIMIT,
  VtzMutationRefusedError,
  VtzUnavailableError,
  resolveVtzCreate,
  resolveVtzDelete,
  resolveVtzDetail,
  resolveVtzEdit,
  resolveVtzRescope,
  resolveVtzTree,
} from './engine/vtz.js';
import type { ReverseDnsResolver } from './engine/reverse-dns.js';
import { principalFromSession } from './engine/principal.js';
import { EngineRefusedError } from './engine/wire-client.js';
import type { EphemeralCache } from './cache.js';
import { openApiDocument } from './openapi.js';
import { serveSpa } from './static.js';

/** A structural view of the logger the server needs (so tests can pass a spy without pino). */
export interface ServerLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface ServerDeps {
  readonly config: BffConfig;
  readonly log: ServerLogger;
  readonly cache: EphemeralCache<unknown>;
  readonly client: CrucibleClient;
  /** The operator auth router (F0.5a-2). Absent when auth is not configured; /auth/* then 404s. */
  readonly authRouter?: AuthRouter;
  /** The operator-scoped engine facade (DR.3d). Absent when auth is not configured; entity reads 503. */
  readonly operatorEngine?: OperatorEngine;
  /** Reverse-DNS resolver for Overview destination names (cached + background). Absent -> destinations
   * list their IPs (never a fabricated name). */
  readonly reverseDns?: ReverseDnsResolver;
}

/** `/api/entity/<kind>/<id>` -- the drawer detail route (the id is percent-encoded; agent ids carry `:`). */
const ENTITY_DETAIL_RE = /^\/api\/entity\/(principal|vtz|object)\/(.+)$/;

/** Build the typed entity ref from a matched kind + a decoded id. */
function entityRefOf(kind: string, id: string): EntityRef {
  if (kind === 'principal') return { kind, id: principalId(id) };
  if (kind === 'vtz') return { kind, id: vtzId(id) };
  return { kind: 'object', id: objectId(id) };
}

/**
 * The active-tenant override a GLOBAL-ADMIN may set per request (the tenant selector, IP-CONSOLE-00-CONTROL-PLANE
 * F4): the trimmed `x-active-tenant` request header, or `undefined`. `principalFromSession` honors it only for
 * a `global-admin` and ignores it for a tenant-scoped operator (fail-closed -- a tenant-user cannot switch
 * tenants). A duplicate header (array) or an empty value yields `undefined` (the session's resolved tenant).
 */
function activeTenantOverride(req: IncomingMessage): string | undefined {
  const value = req.headers['x-active-tenant'];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Serve the entity drawer detail: resolve the operator session (fail-closed 401 without one), then broker
 * the live reads through the OperatorEngine into an `EntityDetailView`. Returns true iff it claimed the
 * request.
 */
async function handleEntityDetail(
  deps: ServerDeps,
  req: IncomingMessage,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  const match = ENTITY_DETAIL_RE.exec(path);
  if (!match) return false;
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  const ref = entityRefOf(match[1] ?? '', decodeURIComponent(match[2] ?? ''));
  const detail = await resolveEntityDetail(
    deps.operatorEngine,
    principalFromSession(session, activeTenantOverride(req)),
    ref,
    {
      timeoutMs: deps.config.requestTimeoutMs,
    },
  );
  sendJson(res, 200, detail);
  return true;
}

/** `POST /api/entity/<kind>/<id>/isolate` -- the Isolate quick-action command (DR.5c). */
const ENTITY_ISOLATE_RE = /^\/api\/entity\/(principal|vtz|object)\/(.+)\/isolate$/;

/** The largest isolate request body accepted (a tiny JSON envelope; anything larger is rejected). */
const MAX_COMMAND_BODY_BYTES = 8_192;

/** Read a bounded JSON request body; throws on an over-limit body or invalid JSON. */
async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > limit) throw new Error('request body too large');
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text === '' ? {} : (JSON.parse(text) as unknown);
}

/** Parse + validate the isolate body into a typed `IsolateRequest` (with the URL-derived ref), or null. */
function parseIsolateRequest(ref: EntityRef, body: unknown): IsolateRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const { commandId, posture } = b;
  if (typeof commandId !== 'string' || commandId.trim() === '') return null;
  if (posture !== 'quarantine' && posture !== 'deny') return null;
  return { ref, commandId, posture };
}

/**
 * Serve the Isolate command: resolve the operator session (fail-closed 401), parse the confirm-gated
 * request, and broker the containment to the engine (which injects the operator delegation). A denial
 * (beyond-tier / no Delegation grant) is sanitized to a typed 403 with no internal detail. Returns true
 * iff it claimed the request.
 */
async function handleEntityIsolate(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  const match = ENTITY_ISOLATE_RE.exec(path);
  if (!match) return false;
  if (method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  const ref = entityRefOf(match[1] ?? '', decodeURIComponent(match[2] ?? ''));
  let request: IsolateRequest | null;
  try {
    request = parseIsolateRequest(ref, await readJsonBody(req, MAX_COMMAND_BODY_BYTES));
  } catch {
    request = null;
  }
  if (!request) {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  try {
    const effect = await resolveIsolate(
      deps.operatorEngine,
      principalFromSession(session, activeTenantOverride(req)),
      ref,
      request,
      Date.now(),
      { timeoutMs: deps.config.requestTimeoutMs },
    );
    sendJson(res, 200, effect);
  } catch (err) {
    if (err instanceof EngineRefusedError) {
      // Sanitized refusal: the typed Section 12 class only, no internal detail (TRD-CONSOLE-12 Sec 7).
      sendJson(res, 403, { error: 'refused', class: err.wireError.class });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'isolate command failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

/** Parse + validate the export body into a typed `LogExportRequest` (bounded filter), or null. */
function parseLogExportRequest(body: unknown): LogExportRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const commandId = b['commandId'];
  const rawFilter = b['filter'];
  if (typeof commandId !== 'string' || commandId.trim() === '') return null;
  if (typeof rawFilter !== 'object' || rawFilter === null) return null;
  const f = rawFilter as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v !== '' ? v : undefined;
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  const requested = num(f['limit']);
  const limit =
    requested !== undefined && requested > 0
      ? Math.min(requested, MAX_LOG_LIMIT)
      : DEFAULT_LOG_LIMIT;
  const since = num(f['since']);
  const until = num(f['until']);
  const technique = str(f['technique']);
  const tactic = str(f['tactic']);
  const ruleId = str(f['ruleId']);
  const confidence = str(f['confidence']);
  const action = str(f['action']);
  const search = str(f['search']);
  const offsetRaw = Number(f['offset'] ?? 0);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : undefined;
  const filter: LogQueryFilter = {
    ...(since !== undefined ? { since } : {}),
    ...(until !== undefined ? { until } : {}),
    ...(technique !== undefined ? { technique } : {}),
    ...(tactic !== undefined ? { tactic } : {}),
    ...(ruleId !== undefined ? { ruleId } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(action !== undefined ? { action } : {}),
    ...(search !== undefined ? { search } : {}),
    limit,
    ...(offset !== undefined ? { offset } : {}),
  };
  return { commandId, filter };
}

/**
 * Serve `POST /api/logs/export` -- the audited LOG export (LG.6). Resolve the operator session (401),
 * parse the bounded body, and broker the audited `LOG_EXPORT` (the engine records the receipt on the audit
 * chain; the operator delegation is injected server-side). A refusal is sanitized to a typed 403. Returns
 * true iff it claimed the request.
 */
async function handleLogExport(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== '/api/logs/export') return false;
  if (method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  let request: LogExportRequest | null;
  try {
    request = parseLogExportRequest(await readJsonBody(req, MAX_COMMAND_BODY_BYTES));
  } catch {
    request = null;
  }
  if (!request) {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  try {
    const view = await resolveLogExport(
      deps.operatorEngine,
      principalFromSession(session, activeTenantOverride(req)),
      request,
      Date.now(),
      { timeoutMs: deps.config.requestTimeoutMs },
    );
    sendJson(res, 200, view);
  } catch (err) {
    if (err instanceof EngineRefusedError) {
      sendJson(res, 403, { error: 'refused', class: err.wireError.class });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'logs export failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

/** `/api/logs/explain/<decisionId>` -- the decision EXPLAIN read (LG.2; the id is percent-encoded). */
const LOG_EXPLAIN_RE = /^\/api\/logs\/explain\/(.+)$/;

// TUNE(IP-CONSOLE-09 LG.2): the Logs page size. The engine further clamps to the committed per-tenant
// result ceiling; these are the Console-side request bounds so an unbounded/oversized ask is refused here.
const DEFAULT_LOG_LIMIT = 100;
const MAX_LOG_LIMIT = 500;

/** Parse the `/api/logs` query string into a bounded `LogQueryFilter`. Unknown/blank params are omitted. */
function parseLogFilter(params: URLSearchParams): LogQueryFilter {
  const str = (key: string): string | undefined => {
    const value = params.get(key);
    return value === null || value === '' ? undefined : value;
  };
  const num = (key: string): number | undefined => {
    const value = params.get(key);
    if (value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const requested = num('limit');
  const limit =
    requested !== undefined && requested > 0
      ? Math.min(requested, MAX_LOG_LIMIT)
      : DEFAULT_LOG_LIMIT;
  const since = num('since');
  const until = num('until');
  const technique = str('technique');
  const tactic = str('tactic');
  const ruleId = str('ruleId');
  const confidence = str('confidence');
  const action = str('action');
  const search = str('search');
  return {
    ...(since !== undefined ? { since } : {}),
    ...(until !== undefined ? { until } : {}),
    ...(technique !== undefined ? { technique } : {}),
    ...(tactic !== undefined ? { tactic } : {}),
    ...(ruleId !== undefined ? { ruleId } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(action !== undefined ? { action } : {}),
    ...(search !== undefined ? { search } : {}),
    limit,
  };
}

/**
 * Serve the Logs reads (`GET /api/logs` -> a filtered LOG page; `GET /api/logs/explain/<id>` -> one
 * decision's detail): resolve the operator session (fail-closed 401), broker the read through the
 * OperatorEngine, and project the DTOs to view models. A refusal is sanitized (403 for the query gate; 404
 * for an absent/denied decision, non-oracle). Returns true iff it claimed the request.
 */
async function handleLogs(
  deps: ServerDeps,
  req: IncomingMessage,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  const explainMatch = LOG_EXPLAIN_RE.exec(path);
  if (path !== '/api/logs' && !explainMatch) return false;
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  const principal = principalFromSession(session, activeTenantOverride(req));
  const opts = { timeoutMs: deps.config.requestTimeoutMs };
  try {
    if (explainMatch) {
      const detail = await resolveLogExplain(
        deps.operatorEngine,
        principal,
        decodeURIComponent(explainMatch[1] ?? ''),
        opts,
      );
      sendJson(res, 200, detail);
    } else {
      const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
      const page = await resolveLogQuery(
        deps.operatorEngine,
        principal,
        parseLogFilter(params),
        opts,
      );
      sendJson(res, 200, page);
    }
  } catch (err) {
    if (err instanceof EngineRefusedError) {
      // A query-gate refusal is a sanitized 403; an absent/denied decision is a non-oracle 404 (existence
      // never leaks). No internal detail crosses the boundary.
      if (explainMatch) sendJson(res, 404, { error: 'not_found' });
      else sendJson(res, 403, { error: 'refused', class: err.wireError.class });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'logs read failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

// TUNE(IP-CONSOLE-01 O1.3, operator steer 2026-07-16): the Overview request bound -- engine-side it
// scopes the risk-window decision selection (the edge population is bounded by the engine's own
// connectivity ceiling and served from the live overlay). Raised 1000 -> 10k to build out the current
// environment; the engine further clamps to its committed per-tenant ceiling, and these Console-side
// bounds refuse an unbounded/oversized ask here.
const DEFAULT_OVERVIEW_LIMIT = 10_000;
const MAX_OVERVIEW_LIMIT = 10_000;

// The connectivity graph reply carries no engine commit version to tag the cache with, so the ephemeral
// cache degrades to a pure short-TTL projection cache under this constant sentinel (staleness bounded by
// `cacheTtlMs`, short by design). The key is scoped by tenant + the query bounds, so a cached graph can
// never be served across tenants (INV-CONSOLE-ENGINE-AUTHZ) or across differing windows.
// v2: the view models carry `truncated` + distinct-entity counts (INV-CONNECTIVITY-NODE-DISTINCT);
// the bump guarantees no pre-upgrade cached projection (old shape/semantics) is ever served.
const OVERVIEW_CACHE_VERSION = 'overview-v2';

/** Parse the `/api/overview/sankey` query string into a bounded `OverviewQuery`. `since`/`until` are millis. */
function parseOverviewQuery(params: URLSearchParams): OverviewQuery {
  const num = (key: string): number | undefined => {
    const value = params.get(key);
    if (value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const requested = num('limit');
  const limit =
    requested !== undefined && requested > 0
      ? Math.min(requested, MAX_OVERVIEW_LIMIT)
      : DEFAULT_OVERVIEW_LIMIT;
  const since = num('since');
  const until = num('until');
  return {
    ...(since !== undefined ? { since } : {}),
    ...(until !== undefined ? { until } : {}),
    limit,
  };
}

/** The shape of an overview resolver: brokers the read + projects to a view model. */
type OverviewResolver = (
  engine: OperatorEngine,
  principal: ReturnType<typeof principalFromSession>,
  query: OverviewQuery,
  opts?: { readonly timeoutMs?: number },
) => Promise<unknown>;

/**
 * Serve an Overview read: resolve the operator session (fail-closed 401), broker the tenant-wide
 * CONNECTIVITY_GRAPH read through the OperatorEngine, and project it via `resolve`. Served from a
 * tenant-scoped, short-TTL cache when warm (keyed by `kind` so the flat and Sankey projections never
 * collide). Fails CLOSED: an unknown risk-band tag is 503, a query-gate refusal a sanitized 403.
 */
async function serveOverviewRead(
  deps: ServerDeps,
  req: IncomingMessage,
  res: ServerResponse,
  kind: string,
  resolve: OverviewResolver,
): Promise<void> {
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return;
  }
  const principal = principalFromSession(session, activeTenantOverride(req));
  const query = parseOverviewQuery(new URL(req.url ?? '/', 'http://localhost').searchParams);
  // Tenant-scoped + bounds-scoped key: a warm graph is never served across tenants or across windows.
  const cacheKey = `overview:${kind}:${principal.tenant}:${String(query.since ?? '')}:${String(
    query.until ?? '',
  )}:${String(query.limit)}`;
  const cached = deps.cache.get(cacheKey, OVERVIEW_CACHE_VERSION);
  if (cached !== undefined) {
    sendJson(res, 200, cached);
    return;
  }
  try {
    const view = await resolve(deps.operatorEngine, principal, query, {
      timeoutMs: deps.config.requestTimeoutMs,
    });
    deps.cache.set(cacheKey, view, OVERVIEW_CACHE_VERSION);
    sendJson(res, 200, view);
  } catch (err) {
    if (err instanceof OverviewUnavailableError) {
      // The engine returned a graph the Console cannot color; surface the unavailable state, never a default.
      sendJson(res, 503, { error: 'unavailable' });
    } else if (err instanceof EngineRefusedError) {
      sendJson(res, 403, { error: 'refused', class: err.wireError.class });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'overview read failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
}

/**
 * The Overview read: `GET /api/overview/sankey`, the RD.4 VTZ-routed two-stage view. (The O1.3 flat
 * `GET /api/overview/graph` was the pre-redesign route; RD.4b retired its SPA consumer and the route
 * itself is retired with it -- an unconsumed route is a stub in reverse, INV-CONSOLE-NO-STUB.) Returns
 * true iff it claimed the request.
 */
async function handleOverview(
  deps: ServerDeps,
  req: IncomingMessage,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path === '/api/overview/sankey') {
    await serveOverviewRead(deps, req, res, 'sankey', (engine, principal, query, opts) =>
      resolveOverviewSankey(engine, principal, query, opts, deps.reverseDns),
    );
    return true;
  }
  if (path === '/api/overview/entity-connections') {
    await serveEntityConnections(deps, req, res);
    return true;
  }
  if (path === '/api/overview/members') {
    await serveClassMembers(deps, req, res);
    return true;
  }
  return false;
}

/**
 * Serve one entity's outbound connections (`GET /api/overview/entity-connections?id=&kind=`, O1.6a): the
 * PR-2 hover prefetch + drawer read. Session-gated (401), engine-gated (503); `id` + `kind` identify the
 * Sankey node's entity and are required (400 without them). The engine bounds + tier-redacts; the result
 * is served from a tenant + entity-scoped short-TTL cache. Fails CLOSED: a query-gate refusal is a
 * sanitized 403, any other engine error a 502.
 */
async function serveEntityConnections(
  deps: ServerDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return;
  }
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const id = params.get('id')?.trim();
  const kind = params.get('kind')?.trim();
  if (!id || !kind) {
    sendJson(res, 400, { error: 'bad_request' });
    return;
  }
  const principal = principalFromSession(session, activeTenantOverride(req));
  // Tenant + entity scoped key: a warm list never crosses tenants or entities.
  const cacheKey = `overview:connections:${principal.tenant}:${kind}:${id}`;
  const cached = deps.cache.get(cacheKey, OVERVIEW_CACHE_VERSION);
  if (cached !== undefined) {
    sendJson(res, 200, cached);
    return;
  }
  try {
    const view = await resolveEntityConnections(deps.operatorEngine, principal, id, kind, {
      timeoutMs: deps.config.requestTimeoutMs,
    });
    deps.cache.set(cacheKey, view, OVERVIEW_CACHE_VERSION);
    sendJson(res, 200, view);
  } catch (err) {
    if (err instanceof EngineRefusedError) {
      sendJson(res, 403, { error: 'refused', class: err.wireError.class });
    } else {
      deps.log.warn(
        { err: err instanceof Error ? err.name : 'unknown' },
        'entity connections read failed',
      );
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
}

/**
 * Serve one clicked container's member entities (`GET /api/overview/members?container=<...>`, O1.6b): the
 * PR-2c drawer LIST -> detail read. Session-gated (401), engine-gated (503); `container` is one of the
 * seven Overview containers (three source lanes + four destination rings) and is required + validated
 * (400 for a missing or unknown container). A source lane maps to the engine class directly; a
 * destination ring is re-bucketed from the engine's flat `network` members (RD.5). The engine bounds +
 * tier-redacts; the result is served from a tenant + container-scoped short-TTL cache. Fails CLOSED: a
 * query-gate refusal is a sanitized 403, any other engine error a 502.
 */
async function serveClassMembers(
  deps: ServerDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return;
  }
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const container = params.get('container')?.trim();
  if (!container) {
    sendJson(res, 400, { error: 'bad_request' });
    return;
  }
  const principal = principalFromSession(session, activeTenantOverride(req));
  // Tenant + container scoped key: a warm list never crosses tenants or containers.
  const cacheKey = `overview:members:${principal.tenant}:${container}`;
  const cached = deps.cache.get(cacheKey, OVERVIEW_CACHE_VERSION);
  if (cached !== undefined) {
    sendJson(res, 200, cached);
    return;
  }
  try {
    const view = await resolveClassMembers(
      deps.operatorEngine,
      principal,
      container,
      { timeoutMs: deps.config.requestTimeoutMs },
      deps.reverseDns,
    );
    deps.cache.set(cacheKey, view, OVERVIEW_CACHE_VERSION);
    sendJson(res, 200, view);
  } catch (err) {
    if (err instanceof UnknownContainerError) {
      sendJson(res, 400, { error: 'bad_request' });
    } else if (err instanceof EngineRefusedError) {
      sendJson(res, 403, { error: 'refused', class: err.wireError.class });
    } else {
      deps.log.warn(
        { err: err instanceof Error ? err.name : 'unknown' },
        'class members read failed',
      );
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
}

// The VTZ read cache generation. Same discipline as the Overview: a tenant-scoped, short-TTL projection
// cache over a stateless BFF (INV-CONSOLE-NO-2ND-DB -- the crdb VTZ store remains the system of record,
// this is a bounded-staleness projection, never a second copy of the truth). Bump the generation whenever
// the view-model shape or semantics change, so no pre-upgrade projection is ever served.
const VTZ_CACHE_VERSION = 'vtz-v1';

/**
 * Serve the VTZ reads (`GET /api/vtz/tree` -> the tenant zone tree; `GET /api/vtz/detail?id=<zone>` -> one
 * zone + its effective-posture ancestors). Session-gated (401) and engine-gated (503). Fails CLOSED: an
 * enum tag the Console does not know is a 503 (never a defaulted posture on a governance surface), a
 * query-gate refusal a sanitized 403, any other engine error a 502. Returns true iff it claimed the
 * request.
 */
async function handleVtz(
  deps: ServerDeps,
  req: IncomingMessage,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== '/api/vtz/tree' && path !== '/api/vtz/detail') return false;
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const principal = principalFromSession(session, activeTenantOverride(req));
  // The detail read needs its zone id up front, so a malformed request never reaches the engine.
  const zoneId = params.get('id')?.trim();
  if (path === '/api/vtz/detail' && !zoneId) {
    sendJson(res, 400, { error: 'bad_request' });
    return true;
  }
  const limit = parseVtzLimit(params);
  // Tenant-scoped key: a warm projection is never served across tenants (INV-CONSOLE-ENGINE-AUTHZ).
  const cacheKey =
    path === '/api/vtz/tree'
      ? `${vtzCachePrefix(principal.tenant)}tree:${String(limit)}`
      : `${vtzCachePrefix(principal.tenant)}detail:${zoneId ?? ''}`;
  const cached = deps.cache.get(cacheKey, VTZ_CACHE_VERSION);
  if (cached !== undefined) {
    sendJson(res, 200, cached);
    return true;
  }
  const engine = deps.operatorEngine;
  const opts = { timeoutMs: deps.config.requestTimeoutMs };
  try {
    const view =
      path === '/api/vtz/tree'
        ? await resolveVtzTree(engine, principal, limit, opts)
        : await resolveVtzDetail(engine, principal, zoneId ?? '', opts);
    deps.cache.set(cacheKey, view, VTZ_CACHE_VERSION);
    sendJson(res, 200, view);
  } catch (err) {
    if (err instanceof VtzUnavailableError) {
      // The engine returned a zone the Console cannot render honestly; surface the unavailable state.
      sendJson(res, 503, { error: 'unavailable' });
    } else if (err instanceof EngineRefusedError) {
      sendJson(res, 403, { error: 'refused', class: err.wireError.class });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'vtz read failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

/**
 * The cache-key prefix for every VTZ projection of one tenant, so an audited write can drop exactly that
 * tenant's stale zone views and nothing else (a write must never evict another tenant's cache, and the
 * operator must never be shown a pre-write tree that makes their own edit look lost).
 */
function vtzCachePrefix(tenant: string | undefined): string {
  return `vtz:${tenant ?? ''}:`;
}

/** Parse the `limit` query param into a bounded zone-tree limit (absent/malformed -> the default). */
function parseVtzLimit(params: URLSearchParams): number {
  const raw = params.get('limit');
  if (raw === null || raw === '') return DEFAULT_VTZ_TREE_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_VTZ_TREE_LIMIT;
  return Math.min(parsed, MAX_VTZ_TREE_LIMIT);
}

/** `/api/vtz/<id>` -- the edit + delete routes (the dotted zone id is percent-encoded). */
const VTZ_ZONE_RE = /^\/api\/vtz\/(?!tree$|detail$)([^/]+)$/;

/** `/api/vtz/<id>/rescope` -- the re-scope (rename) route. */
const VTZ_RESCOPE_RE = /^\/api\/vtz\/([^/]+)\/rescope$/;

/** The audited zone mutation a request resolved to, once the path + method + body all validated. */
type VtzCommand =
  | { readonly kind: 'create'; readonly spec: VtzSpecInput }
  | { readonly kind: 'edit'; readonly spec: VtzSpecInput }
  | { readonly kind: 'rescope'; readonly id: string; readonly newName: string }
  | { readonly kind: 'delete'; readonly id: string };

/** Parse a re-scope body into its new dotted name, or null when it is missing/blank. */
function parseRescopeName(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const newName = (body as Record<string, unknown>)['newName'];
  if (typeof newName !== 'string' || newName.trim() === '') return null;
  return newName.trim();
}

/**
 * Resolve the request to a {@link VtzCommand}, or `null` if the path+method pair is not a zone mutation,
 * or `'bad'` if it is one but the body did not validate. Every spec is narrowed fail-closed by
 * `toVtzSpecInput` (no partial accept, no defaulting) before it can reach the engine.
 */
async function parseVtzCommand(
  req: IncomingMessage,
  method: string,
  path: string,
): Promise<VtzCommand | 'bad' | null> {
  const rescope = VTZ_RESCOPE_RE.exec(path);
  if (rescope && method === 'POST') {
    const name = parseRescopeName(await readJsonBody(req, MAX_COMMAND_BODY_BYTES));
    if (name === null) return 'bad';
    return { kind: 'rescope', id: decodeURIComponent(rescope[1] ?? ''), newName: name };
  }
  if (path === '/api/vtz' && method === 'POST') {
    const spec = toVtzSpecInput(await readJsonBody(req, MAX_COMMAND_BODY_BYTES));
    return spec === null ? 'bad' : { kind: 'create', spec };
  }
  const zone = VTZ_ZONE_RE.exec(path);
  if (zone && method === 'PUT') {
    const spec = toVtzSpecInput(await readJsonBody(req, MAX_COMMAND_BODY_BYTES));
    return spec === null ? 'bad' : { kind: 'edit', spec };
  }
  if (zone && method === 'DELETE') {
    return { kind: 'delete', id: decodeURIComponent(zone[1] ?? '') };
  }
  return null;
}

/**
 * Serve the audited zone mutations: `POST /api/vtz` (create), `PUT /api/vtz/<id>` (edit),
 * `POST /api/vtz/<id>/rescope`, `DELETE /api/vtz/<id>`. Session-gated (401), engine-gated (503), body
 * validated fail-closed (400). Each commits through the crdb Committer with the operator delegation
 * injected server-side, so a success has already landed on the audit chain attributed to this operator.
 *
 * A REFUSAL IS REPORTED, NEVER SWALLOWED: the engine refuses a catastrophic-floor relaxation or an
 * inheritance contradiction (403) and a state conflict such as a zone that still has children (409). The
 * engine returns no message (it is not an oracle), so the response names the class of rule and nothing
 * more specific. On success the tenant's cached zone projections are dropped, so the operator's next read
 * cannot serve a pre-write tree that would make their own change look lost. Returns true iff it claimed
 * the request.
 */
async function handleVtzCommand(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (!path.startsWith('/api/vtz')) return false;
  if (path === '/api/vtz/tree' || path === '/api/vtz/detail') return false;
  if (method === 'GET') return false;
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  let command: VtzCommand | 'bad' | null;
  try {
    command = await parseVtzCommand(req, method, path);
  } catch {
    command = 'bad';
  }
  if (command === null) {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  if (command === 'bad') {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  const principal = principalFromSession(session, activeTenantOverride(req));
  const engine = deps.operatorEngine;
  const opts = { timeoutMs: deps.config.requestTimeoutMs };
  try {
    let result;
    if (command.kind === 'create') {
      result = await resolveVtzCreate(engine, principal, command.spec, opts);
    } else if (command.kind === 'edit') {
      result = await resolveVtzEdit(engine, principal, command.spec, opts);
    } else if (command.kind === 'rescope') {
      result = await resolveVtzRescope(engine, principal, command.id, command.newName, opts);
    } else {
      result = await resolveVtzDelete(engine, principal, command.id, opts);
    }
    // The write landed; every cached projection of this tenant's zones is now stale.
    deps.cache.deletePrefix(vtzCachePrefix(principal.tenant));
    sendJson(res, 200, result);
  } catch (err) {
    if (err instanceof VtzMutationRefusedError) {
      // Nothing was committed. `conflict` is a state clash, `denied` a floor/inheritance/tenant rule.
      sendJson(res, err.kind === 'conflict' ? 409 : 403, { error: 'refused', reason: err.kind });
    } else if (err instanceof VtzUnavailableError) {
      sendJson(res, 503, { error: 'unavailable' });
    } else if (err instanceof EngineRefusedError) {
      sendJson(res, 403, { error: 'refused', class: err.wireError.class });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'vtz mutation failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function route(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<void> {
  // Command routes (POST) are matched before the read-only gate.
  if (await handleEntityIsolate(deps, req, method, path, res)) {
    return;
  }
  if (await handleLogExport(deps, req, method, path, res)) {
    return;
  }
  if (await handleVtzCommand(deps, req, method, path, res)) {
    return;
  }
  if (method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }
  if (path === '/healthz') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  if (path === '/readyz') {
    try {
      await deps.client.ping({ timeoutMs: deps.config.requestTimeoutMs });
      sendJson(res, 200, { ready: true });
    } catch (err) {
      // Log the real reason internally; return a generic not-ready to the caller (no internal detail).
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'readiness probe failed');
      sendJson(res, 503, { ready: false });
    }
    return;
  }
  if (path === '/openapi.json') {
    sendJson(res, 200, openApiDocument());
    return;
  }
  if (await handleEntityDetail(deps, req, path, res)) {
    return;
  }
  if (await handleLogs(deps, req, path, res)) {
    return;
  }
  if (await handleOverview(deps, req, path, res)) {
    return;
  }
  if (await handleVtz(deps, req, path, res)) {
    return;
  }
  // The Console SPA (served behind the admin plane) owns every other GET path -- a static asset or a
  // client-side route. Only when FC_SPA_DIST is configured; otherwise the BFF stays API-only.
  if (deps.config.spaDir !== undefined && (await serveSpa(deps.config.spaDir, path, res))) {
    return;
  }
  sendJson(res, 404, { error: 'not_found' });
}

/** Build the request handler over the injected dependencies. */
export function createRequestHandler(
  deps: ServerDeps,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const method = req.method ?? 'GET';
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    // Try the auth router first (it owns /auth/*); if it did not claim the request, fall through to the
    // operational routes. Both paths handle their own errors; the outer catch is the last-resort guard.
    const dispatch = async (): Promise<void> => {
      if (deps.authRouter && (await deps.authRouter.handle(req, res))) return;
      await route(deps, req, method, path, res);
    };
    void dispatch().catch((err: unknown) => {
      deps.log.error(
        { err: err instanceof Error ? err.name : 'unknown' },
        'unhandled request error',
      );
      if (!res.headersSent) sendJson(res, 500, { error: 'internal' });
    });
  };
}

/** Create (but do not start) the BFF HTTP server. */
export function createServer(deps: ServerDeps): Server {
  return createHttpServer(createRequestHandler(deps));
}
