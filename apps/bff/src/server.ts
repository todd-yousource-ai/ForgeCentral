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

import { objectId, principalId, vtzId } from '@forge/contracts';
import type { EntityRef, IsolateRequest } from '@forge/contracts';

import type { AuthRouter } from './auth/router.js';
import type { BffConfig } from './config.js';
import type { CrucibleClient } from './engine/client.js';
import { resolveEntityDetail } from './engine/entity-detail.js';
import { resolveIsolate } from './engine/isolate.js';
import type { OperatorEngine } from './engine/operator-engine.js';
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
    principalFromSession(session),
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
      principalFromSession(session),
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
