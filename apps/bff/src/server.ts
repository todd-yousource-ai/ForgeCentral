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

import { objectId, principalId, toPolicyDraftInput, toVtzSpecInput, vtzId } from '@forge/contracts';
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
  resolveBundleConvergence,
  resolveVtzDetail,
  resolveVtzEdit,
  resolveVtzRescope,
  resolveVtzTree,
} from './engine/vtz.js';
import {
  resolveCreateObject,
  resolveDeleteObject,
  resolveEditObject,
  resolveObjectCatalog,
  resolveObjectDetail,
  ObjectCommandError,
  ObjectsUnavailableError,
} from './engine/objects.js';
import {
  PoliciesUnavailableError,
  resolveCreatePolicy,
  resolveDeletePolicy,
  resolveEditPolicy,
  resolvePolicyDetail,
  resolvePolicyZones,
  resolvePublishPolicy,
} from './engine/policies.js';
import {
  resolveIdamConfigure,
  resolveIdamConnect,
  resolveIdamConnectors,
  resolveIdamSync,
} from './engine/idam.js';
import { SecretRefusedError, setConnectorSecret } from './engine/secret-client.js';
import {
  resolveCreateGroup,
  resolveCreatePrincipal,
  resolveEditGroup,
  resolveEditPrincipal,
  resolveGroupsList,
  resolveSetGroupMembers,
  resolveSetPrincipalStatus,
  resolveUsersList,
  UsersUnavailableError,
} from './engine/users.js';
import { DistributeZoneUnknownError, resolveDistribute } from './engine/distribute.js';
import { SigningRefusedError, SigningUnavailableError } from './engine/sign-client.js';
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
 * zone + its effective-posture ancestors; `GET /api/vtz/convergence?id=<zone>` -> which endpoints have
 * the zone's distributed bundle, FD.7c). Session-gated (401) and engine-gated (503). Fails CLOSED: an
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
  if (path !== '/api/vtz/tree' && path !== '/api/vtz/detail' && path !== '/api/vtz/convergence')
    return false;
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
  if ((path === '/api/vtz/detail' || path === '/api/vtz/convergence') && !zoneId) {
    sendJson(res, 400, { error: 'bad_request' });
    return true;
  }
  const limit = parseVtzLimit(params);
  // Tenant-scoped key: a warm projection is never served across tenants (INV-CONSOLE-ENGINE-AUTHZ).
  // Convergence is live -- endpoints report continuously -- so it is never cached: a stale reading
  // could tell an operator a box holds a policy it has since lost. Tree/detail keep their warm cache.
  if (path !== '/api/vtz/convergence') {
    const cacheKey =
      path === '/api/vtz/tree'
        ? `${vtzCachePrefix(principal.tenant)}tree:${String(limit)}`
        : `${vtzCachePrefix(principal.tenant)}detail:${zoneId ?? ''}`;
    const cached = deps.cache.get(cacheKey, VTZ_CACHE_VERSION);
    if (cached !== undefined) {
      sendJson(res, 200, cached);
      return true;
    }
  }
  const engine = deps.operatorEngine;
  const opts = { timeoutMs: deps.config.requestTimeoutMs };
  try {
    if (path === '/api/vtz/convergence') {
      const view = await resolveBundleConvergence(engine, principal, zoneId ?? '', opts);
      sendJson(res, 200, view);
      return true;
    }
    const cacheKey =
      path === '/api/vtz/tree'
        ? `${vtzCachePrefix(principal.tenant)}tree:${String(limit)}`
        : `${vtzCachePrefix(principal.tenant)}detail:${zoneId ?? ''}`;
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
/**
 * Serve `POST /api/vtz/<id>/distribute` (FD.2): compose the zone's bundle, sign it in the sidecar,
 * commit it to the crdb carrier under the operator's delegation, and return the version plus the
 * composition record (the unexpressed domains/fields -- visible, never dropped). 503 when the signing
 * plane is unprovisioned (FD.5 provisions it); the operator names the target endpoints, non-empty,
 * because FC is 1Source and an implicit all-devices scope would be a fabricated authoring decision.
 */
async function handleVtzDistribute(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  const match = /^\/api\/vtz\/([^/]+)\/distribute$/.exec(path);
  if (!match || method !== 'POST') return false;
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  if (deps.config.signerPort === undefined) {
    sendJson(res, 503, { error: 'signer_unavailable' });
    return true;
  }
  let members: string[];
  try {
    const body: unknown = await readJsonBody(req, 64 * 1024);
    const raw = (body as { members?: unknown }).members;
    if (
      !Array.isArray(raw) ||
      raw.length === 0 ||
      !raw.every((m) => typeof m === 'string' && m.length > 0)
    ) {
      throw new Error('members');
    }
    members = raw as string[];
  } catch {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  const principal = principalFromSession(session, activeTenantOverride(req));
  const signer = {
    host: '127.0.0.1',
    port: deps.config.signerPort,
    timeoutMs: deps.config.requestTimeoutMs,
  };
  try {
    const result = await resolveDistribute(
      deps.operatorEngine,
      signer,
      principal,
      { zoneId: decodeURIComponent(match[1] ?? ''), members },
      { timeoutMs: deps.config.requestTimeoutMs },
    );
    sendJson(res, 200, result);
  } catch (err) {
    if (err instanceof DistributeZoneUnknownError) {
      sendJson(res, 404, { error: 'unknown_zone' });
    } else if (err instanceof SigningRefusedError) {
      sendJson(res, 422, { error: 'signing_refused' });
    } else if (err instanceof SigningUnavailableError) {
      sendJson(res, 503, { error: 'signer_unavailable' });
    } else if (err instanceof EngineRefusedError) {
      // Includes the carrier's monotonicity refusal: a non-advancing version is the caller's state
      // problem (409-shaped), everything else a denial.
      sendJson(res, err.wireError.class === 'Framing' ? 409 : 403, {
        error: 'refused',
        class: err.wireError.class,
      });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'distribute failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

async function handleVtzCommand(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (!path.startsWith('/api/vtz')) return false;
  if (path === '/api/vtz/tree' || path === '/api/vtz/detail' || path === '/api/vtz/convergence')
    return false;
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

/**
 * The Users-surface reads (IP-CONSOLE-04 UY.2/UY.3): GET /api/users (the All Users table: the LUG
 * principal directory + the AIG agent cross-bind) and GET /api/users/groups (the Groups tab).
 * Session-gated, engine-gated, operator-delegated; the engine bounds and refuses rather than
 * truncating, so the Console always holds the COMPLETE directory or an error -- client-side search
 * over it narrows a complete dataset, never fabricates one.
 */
const USERS_COMMAND_PATHS = new Set([
  '/api/users',
  '/api/users/edit',
  '/api/users/status',
  '/api/users/groups',
  '/api/users/groups/edit',
  '/api/users/groups/members',
]);

/** A parsed principal draft from a command body, or null when malformed (400, fail-closed). */
function parsePrincipalDraft(body: Record<string, unknown>): {
  username: string;
  kind: 'human' | 'service';
  email: string | null;
  org: string | null;
} | null {
  const username = typeof body['username'] === 'string' ? body['username'].trim() : '';
  const kind = body['kind'];
  if (username === '' || (kind !== 'human' && kind !== 'service')) return null;
  const email =
    typeof body['email'] === 'string' && body['email'].trim() !== '' ? body['email'].trim() : null;
  const org =
    typeof body['org'] === 'string' && body['org'].trim() !== '' ? body['org'].trim() : null;
  return { username, kind, email, org };
}

async function handleUsersCommand(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (!USERS_COMMAND_PATHS.has(path) || method !== 'POST') return false;
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req, MAX_COMMAND_BODY_BYTES)) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  const principal = principalFromSession(session, activeTenantOverride(req));
  const engine = deps.operatorEngine;
  const opts = { timeoutMs: deps.config.requestTimeoutMs };
  const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
  const description = typeof body['description'] === 'string' ? body['description'].trim() : '';
  try {
    let receipt;
    if (path === '/api/users' || path === '/api/users/edit') {
      const draft = parsePrincipalDraft(body);
      if (draft === null) {
        sendJson(res, 400, { error: 'malformed_request' });
        return true;
      }
      receipt =
        path === '/api/users'
          ? await resolveCreatePrincipal(engine, principal, draft, opts)
          : await resolveEditPrincipal(engine, principal, draft, opts);
    } else if (path === '/api/users/status') {
      const username = typeof body['username'] === 'string' ? body['username'].trim() : '';
      const status = body['status'];
      if (
        username === '' ||
        (status !== 'active' && status !== 'suspended' && status !== 'revoked')
      ) {
        sendJson(res, 400, { error: 'malformed_request' });
        return true;
      }
      receipt = await resolveSetPrincipalStatus(engine, principal, username, status, opts);
    } else if (path === '/api/users/groups/members') {
      const members = Array.isArray(body['members'])
        ? body['members'].filter((m): m is string => typeof m === 'string')
        : null;
      if (name === '' || members === null) {
        sendJson(res, 400, { error: 'malformed_request' });
        return true;
      }
      receipt = await resolveSetGroupMembers(engine, principal, name, members, opts);
    } else {
      if (name === '') {
        sendJson(res, 400, { error: 'malformed_request' });
        return true;
      }
      receipt =
        path === '/api/users/groups'
          ? await resolveCreateGroup(engine, principal, name, description, opts)
          : await resolveEditGroup(engine, principal, name, description, opts);
    }
    sendJson(res, 200, receipt);
  } catch (err) {
    if (err instanceof EngineRefusedError) {
      // Conflict = the name exists; Framing = malformed; anything else = a denial.
      const cls = err.wireError.class;
      const httpStatus = cls === 'Conflict' ? 409 : cls === 'Framing' ? 400 : 403;
      sendJson(res, httpStatus, { error: 'refused', class: cls });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'users command failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

async function handleUsers(
  deps: ServerDeps,
  req: IncomingMessage,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== '/api/users' && path !== '/api/users/groups') return false;
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
    const view =
      path === '/api/users'
        ? await resolveUsersList(deps.operatorEngine, principal, opts)
        : await resolveGroupsList(deps.operatorEngine, principal, opts);
    sendJson(res, 200, view);
  } catch (err) {
    if (err instanceof UsersUnavailableError) {
      // The engine returned a record the Console cannot render honestly; surface unavailability.
      sendJson(res, 503, { error: 'unavailable' });
    } else if (err instanceof EngineRefusedError) {
      sendJson(res, 403, { error: 'refused', class: err.wireError.class });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'users read failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

/**
 * The Objects-surface reads (IP-CONSOLE-10 O10.2): GET /api/objects (the catalog, grouped by kind
 * client-side) and GET /api/objects/detail?name=... (one object + its read-time members). Session-
 * gated, engine-gated, operator-delegated; the engine bounds and refuses rather than truncating, so
 * the Console holds the COMPLETE catalog or an error.
 */

/** A parsed object draft from a command body, or null when malformed (400, fail-closed). */
function parseObjectDraft(
  body: Record<string, unknown>,
): import('@forge/contracts').ObjectDraft | null {
  const str = (k: string): string => (typeof body[k] === 'string' ? body[k].trim() : '');
  const name = str('name');
  const kind = body['kind'];
  const selectorKind = body['selectorKind'];
  const selectorValue = str('selectorValue');
  const lifecycle = body['lifecycle'];
  const KINDS = new Set([
    'user',
    'group',
    'agent',
    'service',
    'server',
    'application',
    'uri',
    'network',
    'registry_key',
    'certificate',
    'script',
    'data_store',
  ]);
  const SELECTORS = new Set(['exact', 'glob', 'group_ref', 'cidr']);
  if (
    name === '' ||
    typeof kind !== 'string' ||
    !KINDS.has(kind) ||
    typeof selectorKind !== 'string' ||
    !SELECTORS.has(selectorKind) ||
    selectorValue === '' ||
    (lifecycle !== 'draft' && lifecycle !== 'published')
  ) {
    return null;
  }
  const tags = Array.isArray(body['tags'])
    ? (body['tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  return {
    name,
    kind: kind as import('@forge/contracts').ObjectKind,
    selectorKind: selectorKind as import('@forge/contracts').SelectorKind,
    selectorValue,
    description: str('description'),
    tags,
    lifecycle,
  };
}

/**
 * The Objects-surface commands (IP-CONSOLE-10 O10.3): POST /api/objects (create), /api/objects/edit,
 * /api/objects/delete. Audited engine commands with typed refusals (Conflict -> 409 duplicate,
 * Framing -> 400 malformed, else 403). NO apply/enforce command exists -- objects are nouns.
 */
async function handleObjectsCommand(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  const paths = new Set(['/api/objects', '/api/objects/edit', '/api/objects/delete']);
  if (!paths.has(path) || method !== 'POST') return false;
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req, MAX_COMMAND_BODY_BYTES)) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  const principal = principalFromSession(session, activeTenantOverride(req));
  const opts = { timeoutMs: deps.config.requestTimeoutMs };
  try {
    let receipt;
    if (path === '/api/objects/delete') {
      const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
      if (name === '') {
        sendJson(res, 400, { error: 'malformed_request' });
        return true;
      }
      receipt = await resolveDeleteObject(deps.operatorEngine, principal, name, opts);
    } else {
      const draft = parseObjectDraft(body);
      if (draft === null) {
        sendJson(res, 400, { error: 'malformed_request' });
        return true;
      }
      receipt =
        path === '/api/objects'
          ? await resolveCreateObject(deps.operatorEngine, principal, draft, opts)
          : await resolveEditObject(deps.operatorEngine, principal, draft, opts);
    }
    sendJson(res, 200, receipt);
  } catch (err) {
    if (err instanceof ObjectCommandError || err instanceof EngineRefusedError) {
      const cls = err instanceof EngineRefusedError ? err.wireError.class : err.wireClass;
      const httpStatus = cls === 'Conflict' ? 409 : cls === 'Framing' ? 400 : 403;
      sendJson(res, httpStatus, { error: 'refused', class: cls });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'objects command failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

async function handleObjects(
  deps: ServerDeps,
  req: IncomingMessage,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== '/api/objects' && path !== '/api/objects/detail') return false;
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
  const name = params.get('name')?.trim();
  if (path === '/api/objects/detail' && !name) {
    sendJson(res, 400, { error: 'bad_request' });
    return true;
  }
  const principal = principalFromSession(session, activeTenantOverride(req));
  const opts = { timeoutMs: deps.config.requestTimeoutMs };
  try {
    const view =
      path === '/api/objects'
        ? await resolveObjectCatalog(deps.operatorEngine, principal, opts)
        : await resolveObjectDetail(deps.operatorEngine, principal, name ?? '', opts);
    sendJson(res, 200, view);
  } catch (err) {
    if (err instanceof ObjectsUnavailableError) {
      sendJson(res, 503, { error: 'unavailable' });
    } else if (err instanceof EngineRefusedError) {
      sendJson(res, 403, { error: 'refused', class: err.wireError.class });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'objects read failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

// The Policies read cache generation. Same discipline as the VTZ/Overview reads: a tenant-scoped,
// short-TTL projection cache over a stateless BFF (INV-CONSOLE-NO-2ND-DB -- the crdb policy store remains
// the system of record; this is a bounded-staleness projection, never a second copy of the truth). Bump
// the generation whenever the view-model shape or semantics change, so no pre-upgrade projection is served.
const POLICIES_CACHE_VERSION = 'policies-v1';

/**
 * The cache-key prefix for every Policies projection of one tenant, so an audited write (P5.4) can drop
 * exactly that tenant's stale policy views and nothing else -- a write must never evict another tenant's
 * cache, and the operator must never be shown a pre-write list that makes their own edit look lost.
 */
function policiesCachePrefix(tenant: string | undefined): string {
  return `policies:${tenant ?? ''}:`;
}

/**
 * The Policies-surface reads (IP-CONSOLE-05 P5.2): GET /api/policies (the tenant's policies grouped by
 * VTZ) and GET /api/policies/detail?vtz=<zone>&id=<policy> (one policy + its version history). Session-
 * gated (401), engine-gated (503), operator-delegated; the engine bounds and refuses rather than
 * truncating, so the Console holds the COMPLETE list or an error. Fails CLOSED: a record carrying an enum
 * tag the Console cannot narrow is a 503 (never a defaulted disposition on a governance surface), a
 * query-gate refusal a sanitized 403, any other engine error a 502. Returns true iff it claimed the request.
 */
async function handlePolicies(
  deps: ServerDeps,
  req: IncomingMessage,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== '/api/policies' && path !== '/api/policies/detail') return false;
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
  // The detail read needs its zone id + policy id up front, so a malformed request never reaches the engine.
  const vtz = params.get('vtz')?.trim();
  const id = params.get('id')?.trim();
  if (path === '/api/policies/detail' && (!vtz || !id)) {
    sendJson(res, 400, { error: 'bad_request' });
    return true;
  }
  const principal = principalFromSession(session, activeTenantOverride(req));
  // Tenant-scoped key: a warm projection is never served across tenants (INV-CONSOLE-ENGINE-AUTHZ).
  const cacheKey =
    path === '/api/policies'
      ? `${policiesCachePrefix(principal.tenant)}byZone`
      : `${policiesCachePrefix(principal.tenant)}detail:${vtz ?? ''}:${id ?? ''}`;
  const cached = deps.cache.get(cacheKey, POLICIES_CACHE_VERSION);
  if (cached !== undefined) {
    sendJson(res, 200, cached);
    return true;
  }
  const engine = deps.operatorEngine;
  const opts = { timeoutMs: deps.config.requestTimeoutMs };
  try {
    const view =
      path === '/api/policies'
        ? await resolvePolicyZones(engine, principal, opts)
        : await resolvePolicyDetail(engine, principal, vtz ?? '', id ?? '', opts);
    deps.cache.set(cacheKey, view, POLICIES_CACHE_VERSION);
    sendJson(res, 200, view);
  } catch (err) {
    if (err instanceof PoliciesUnavailableError) {
      sendJson(res, 503, { error: 'unavailable' });
    } else if (err instanceof EngineRefusedError) {
      sendJson(res, 403, { error: 'refused', class: err.wireError.class });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'policies read failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

/**
 * The Policies-surface commands (IP-CONSOLE-05 P5.4): POST /api/policies (create), /api/policies/edit,
 * /api/policies/publish, /api/policies/delete. Audited engine commands with typed refusals (Conflict ->
 * 409 duplicate/state-conflict, Framing -> 400 malformed, else 403). The draft body is parsed fail-closed
 * (`toPolicyDraftInput`) so a malformed authoring payload never reaches the engine. A successful mutation
 * drops the tenant's warm policy projection so the operator's own edit is never masked by a stale read.
 */
async function handlePoliciesCommand(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  const paths = new Set([
    '/api/policies',
    '/api/policies/edit',
    '/api/policies/publish',
    '/api/policies/delete',
  ]);
  if (!paths.has(path) || method !== 'POST') return false;
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req, MAX_COMMAND_BODY_BYTES)) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  const str = (key: string): string => (typeof body[key] === 'string' ? body[key].trim() : '');
  const principal = principalFromSession(session, activeTenantOverride(req));
  const engine = deps.operatorEngine;
  const opts = { timeoutMs: deps.config.requestTimeoutMs };
  try {
    let receipt;
    if (path === '/api/policies/delete') {
      const vtz = str('vtz');
      const id = str('id');
      if (vtz === '' || id === '') {
        sendJson(res, 400, { error: 'malformed_request' });
        return true;
      }
      receipt = await resolveDeletePolicy(engine, principal, vtz, id, opts);
    } else if (path === '/api/policies/publish') {
      const vtz = str('vtz');
      const id = str('id');
      const version = str('version');
      if (vtz === '' || id === '' || version === '') {
        sendJson(res, 400, { error: 'malformed_request' });
        return true;
      }
      receipt = await resolvePublishPolicy(engine, principal, vtz, id, version, opts);
    } else {
      const draft = toPolicyDraftInput(body);
      if (draft === null) {
        sendJson(res, 400, { error: 'malformed_request' });
        return true;
      }
      if (path === '/api/policies') {
        receipt = await resolveCreatePolicy(engine, principal, draft, opts);
      } else {
        const id = str('id');
        if (id === '') {
          sendJson(res, 400, { error: 'malformed_request' });
          return true;
        }
        receipt = await resolveEditPolicy(engine, principal, id, draft, opts);
      }
    }
    deps.cache.deletePrefix(policiesCachePrefix(principal.tenant));
    sendJson(res, 200, receipt);
  } catch (err) {
    if (err instanceof PoliciesUnavailableError) {
      sendJson(res, 503, { error: 'unavailable' });
    } else if (err instanceof EngineRefusedError) {
      const cls = err.wireError.class;
      const httpStatus = cls === 'Conflict' ? 409 : cls === 'Framing' ? 400 : 403;
      sendJson(res, httpStatus, { error: 'refused', class: cls });
    } else {
      deps.log.warn(
        { err: err instanceof Error ? err.name : 'unknown' },
        'policies command failed',
      );
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

/**
 * The path the on-node crypto-sidecar writes the Auth0 client secret to, and the engine reads it from
 * (crdb `client_secret_ref`). The secret VALUE never reaches this tier; the BFF only ever names the
 * path. A later increment moves this to config so the BFF and the sidecar share one source.
 */
const IDAM_SECRET_REF = '/etc/cdb/secrets/auth0-management.secret';

async function handleIdamConfigure(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== '/api/idam/configure' || method !== 'POST') return false;
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req, MAX_COMMAND_BODY_BYTES)) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  const provider = typeof body['provider'] === 'string' ? body['provider'].trim() : '';
  const enabled = body['enabled'];
  const poll = body['pollIntervalSecs'];
  const full = body['fullSyncCadenceHours'];
  if (
    provider === '' ||
    typeof enabled !== 'boolean' ||
    typeof poll !== 'number' ||
    !Number.isInteger(poll) ||
    typeof full !== 'number' ||
    !Number.isInteger(full)
  ) {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  const draft = { provider, enabled, pollIntervalSecs: poll, fullSyncCadenceHours: full };
  const principal = principalFromSession(session, activeTenantOverride(req));
  const opts = { timeoutMs: deps.config.requestTimeoutMs };
  try {
    const receipt = await resolveIdamConfigure(deps.operatorEngine, principal, draft, opts);
    sendJson(res, 200, receipt);
  } catch (err) {
    if (err instanceof EngineRefusedError) {
      const cls = err.wireError.class;
      // Framing = an out-of-range cadence / bad provider (the engine holds the bound); Conflict = no
      // connector; else a denial. The form's range hints are UX; this is where the engine refuses.
      const httpStatus = cls === 'Framing' ? 400 : cls === 'Conflict' ? 409 : 403;
      sendJson(res, httpStatus, { error: 'refused', class: cls });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'idam configure failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

async function handleIdamSecret(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== '/api/idam/secret' || method !== 'POST') return false;
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  // The secret-set plane is provisioned with the sidecar's secret leg; absent = 503, never a stub.
  if (deps.config.secretPort === undefined) {
    sendJson(res, 503, { error: 'secret_plane_unprovisioned' });
    return true;
  }
  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req, MAX_COMMAND_BODY_BYTES)) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  const provider = typeof body['provider'] === 'string' ? body['provider'].trim() : '';
  const secret = typeof body['secret'] === 'string' ? body['secret'] : '';
  if (provider === '' || secret === '') {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  try {
    // The secret is forwarded to the on-node sidecar over loopback and never persisted, logged, or
    // returned; the BFF holds it only for the duration of this call.
    await setConnectorSecret(
      deps.config.engineHost,
      deps.config.secretPort,
      provider,
      secret,
      deps.config.requestTimeoutMs,
    );
    sendJson(res, 200, { ok: true });
  } catch (err) {
    if (err instanceof SecretRefusedError) {
      sendJson(res, 409, { error: 'refused' });
    } else {
      // Never log the error message here -- a transport error could echo request context.
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'idam secret set failed');
      sendJson(res, 503, { error: 'secret_plane_unavailable' });
    }
  }
  return true;
}

async function handleIdamConnect(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== '/api/idam/connect' || method !== 'POST') return false;
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req, MAX_COMMAND_BODY_BYTES)) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  const str = (key: string): string => {
    const value = body[key];
    return typeof value === 'string' ? value : '';
  };
  const draft = {
    provider: str('provider').trim(),
    domain: str('domain').trim(),
    clientId: str('clientId').trim(),
    audience: str('audience').trim(),
  };
  // The connectivity that authenticates the connector must be present (audience may be empty; the
  // engine re-validates and derives the conventional audience). The secret is NOT accepted here.
  if (draft.provider === '' || draft.domain === '' || draft.clientId === '') {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  const principal = principalFromSession(session, activeTenantOverride(req));
  const opts = { timeoutMs: deps.config.requestTimeoutMs };
  try {
    const receipt = await resolveIdamConnect(
      deps.operatorEngine,
      principal,
      draft,
      IDAM_SECRET_REF,
      opts,
    );
    sendJson(res, 200, receipt);
  } catch (err) {
    if (err instanceof EngineRefusedError) {
      const cls = err.wireError.class;
      // Conflict = no connector / unreadable secret file; Framing = malformed connectivity; else denial.
      const httpStatus = cls === 'Conflict' ? 409 : cls === 'Framing' ? 400 : 403;
      sendJson(res, httpStatus, { error: 'refused', class: cls });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'idam connect failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

async function handleIdamCommand(
  deps: ServerDeps,
  req: IncomingMessage,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== '/api/idam/sync' || method !== 'POST') return false;
  const session = deps.authRouter?.resolveSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!deps.operatorEngine) {
    sendJson(res, 503, { error: 'engine_unavailable' });
    return true;
  }
  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req, MAX_COMMAND_BODY_BYTES)) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  const provider = typeof body['provider'] === 'string' ? body['provider'].trim() : '';
  if (provider === '') {
    sendJson(res, 400, { error: 'malformed_request' });
    return true;
  }
  const principal = principalFromSession(session, activeTenantOverride(req));
  const opts = { timeoutMs: deps.config.requestTimeoutMs };
  try {
    const receipt = await resolveIdamSync(deps.operatorEngine, principal, provider, opts);
    sendJson(res, 200, receipt);
  } catch (err) {
    if (err instanceof EngineRefusedError) {
      const cls = err.wireError.class;
      // Conflict = a disabled or unconfigured connector; Framing = unknown provider; else a denial.
      const httpStatus = cls === 'Conflict' ? 409 : cls === 'Framing' ? 400 : 403;
      sendJson(res, httpStatus, { error: 'refused', class: cls });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'idam sync failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
}

async function handleIdam(
  deps: ServerDeps,
  req: IncomingMessage,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== '/api/idam/connectors') return false;
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
    const view = await resolveIdamConnectors(deps.operatorEngine, principal, opts);
    sendJson(res, 200, view);
  } catch (err) {
    if (err instanceof EngineRefusedError) {
      sendJson(res, 403, { error: 'refused', class: err.wireError.class });
    } else {
      deps.log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'idam read failed');
      sendJson(res, 502, { error: 'engine_error' });
    }
  }
  return true;
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
  if (await handleVtzDistribute(deps, req, method, path, res)) {
    return;
  }
  if (await handleVtzCommand(deps, req, method, path, res)) {
    return;
  }
  if (await handleUsersCommand(deps, req, method, path, res)) {
    return;
  }
  if (await handleObjectsCommand(deps, req, method, path, res)) {
    return;
  }
  if (await handlePoliciesCommand(deps, req, method, path, res)) {
    return;
  }
  if (await handleIdamCommand(deps, req, method, path, res)) {
    return;
  }
  if (await handleIdamConnect(deps, req, method, path, res)) {
    return;
  }
  if (await handleIdamSecret(deps, req, method, path, res)) {
    return;
  }
  if (await handleIdamConfigure(deps, req, method, path, res)) {
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
  if (await handleUsers(deps, req, path, res)) {
    return;
  }
  if (await handleObjects(deps, req, path, res)) {
    return;
  }
  if (await handlePolicies(deps, req, path, res)) {
    return;
  }
  if (await handleIdam(deps, req, path, res)) {
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
