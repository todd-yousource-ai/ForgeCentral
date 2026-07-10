// apps/bff/src/auth/router.ts -- the operator auth HTTP surface (F0.5a-2).
//
// Mounts the login lifecycle for the headless BFF under /auth, over the Device Authorization Grant:
//
//   POST /auth/login        -> start a device login; returns { loginId, userCode, verificationUri... }.
//   POST /auth/login/poll   -> poll once { loginId }; { status: 'pending' } until the operator finishes
//                              MFA, then { status: 'complete', operator } + a Set-Cookie session.
//   POST /auth/logout       -> destroy the session + clear the cookie.
//   GET  /auth/me           -> the current operator (from the session cookie) or 401.
//
// The router depends on the IdP only through the `OidcProvider` seam and on storage only through the two
// in-memory stores, so it is fully unit-testable without a network or a browser. It never returns the
// bearer-grade device code to the client, and it verifies every id_token before minting a session.

import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  clearSessionCookie,
  readCookie,
  serializeSessionCookie,
  type CookieOptions,
} from './cookie.js';
import type { PendingLoginStore } from './login-store.js';
import type { OidcProvider } from './provider.js';
import type { OperatorSession, SessionStore } from './session.js';

/** A structural view of the logger the router needs (matches the pino logger + the server's spy). */
export interface RouterLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/** Everything the auth router needs, injected so it is testable over scripted seams. */
export interface AuthRouterDeps {
  readonly oidc: OidcProvider;
  readonly sessions: SessionStore;
  readonly pending: PendingLoginStore;
  readonly log: RouterLogger;
  readonly sessionTtlMs: number;
  readonly cookie: CookieOptions;
}

/** The mounted auth router. */
export interface AuthRouter {
  /** Handle a request if its path is under /auth; returns `true` when it owned the response. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /** Resolve the session cookie on a request to a live session (for protected routes). Fail-closed. */
  resolveSession(req: IncomingMessage): OperatorSession | undefined;
}

/** The operator projection returned to the client (never carries the session id). */
interface OperatorDto {
  readonly subject: string;
  readonly email?: string;
  readonly tier: OperatorSession['tier'];
}

const MAX_BODY_BYTES = 4096;

function operatorDto(session: OperatorSession): OperatorDto {
  return {
    subject: session.subject,
    tier: session.tier,
    ...(session.email !== undefined ? { email: session.email } : {}),
  };
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

/** Thrown when a request body exceeds the cap (fail-closed, never buffer unboundedly). */
class BodyTooLargeError extends Error {}

/** Read a JSON request body with a hard size cap; returns `undefined` for an empty body. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new BodyTooLargeError();
    chunks.push(chunk);
  }
  if (total === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Extract a required string field from a parsed JSON body, or `undefined` if absent/wrong type. */
function stringField(body: unknown, field: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function createAuthRouter(deps: AuthRouterDeps): AuthRouter {
  const { oidc, sessions, pending, log, sessionTtlMs, cookie } = deps;

  function resolveSession(req: IncomingMessage): OperatorSession | undefined {
    const sid = readCookie(req.headers.cookie, cookie.name);
    if (sid === undefined) return undefined;
    return sessions.get(sid);
  }

  async function handleLogin(res: ServerResponse): Promise<void> {
    let dc;
    try {
      dc = await oidc.requestDeviceCode();
    } catch (err) {
      log.error({ err: err instanceof Error ? err.name : 'unknown' }, 'device code request failed');
      sendJson(res, 502, { error: 'idp_unavailable' });
      return;
    }
    const login = pending.create(
      { deviceCode: dc.deviceCode, intervalSecs: dc.intervalSecs },
      dc.expiresInSecs * 1000,
    );
    sendJson(res, 200, {
      loginId: login.loginId,
      userCode: dc.userCode,
      verificationUri: dc.verificationUri,
      verificationUriComplete: dc.verificationUriComplete,
      expiresInSecs: dc.expiresInSecs,
      intervalSecs: dc.intervalSecs,
    });
  }

  async function handlePoll(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: 'bad_request' });
      return;
    }
    const loginId = stringField(body, 'loginId');
    if (loginId === undefined) {
      sendJson(res, 400, { error: 'bad_request' });
      return;
    }
    const login = pending.get(loginId);
    if (login === undefined) {
      sendJson(res, 404, { error: 'login_expired' });
      return;
    }
    let result;
    try {
      result = await oidc.pollToken(login.deviceCode);
    } catch (err) {
      // A terminal device-flow error (expired, denied, access_denied): the login is dead.
      pending.destroy(loginId);
      log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'device login failed');
      sendJson(res, 401, { status: 'error', error: 'login_failed' });
      return;
    }
    if (result.status === 'pending') {
      sendJson(res, 200, { status: 'pending' });
      return;
    }
    // Complete: verify the id_token before trusting anything from it, then mint the session.
    let identity;
    try {
      identity = await oidc.verifyLogin(result.idToken);
    } catch (err) {
      pending.destroy(loginId);
      log.error(
        { err: err instanceof Error ? err.name : 'unknown' },
        'id_token verification failed',
      );
      sendJson(res, 401, { status: 'error', error: 'token_invalid' });
      return;
    }
    // A valid token whose operator has no resolvable authority (no tenant) is refused: forbidden, not a
    // token error (F0.5c fail-closed).
    if (identity === undefined) {
      pending.destroy(loginId);
      log.warn({}, 'login refused: operator has no resolvable authority');
      sendJson(res, 403, { status: 'error', error: 'no_authority' });
      return;
    }
    const session = sessions.create(identity, sessionTtlMs);
    pending.destroy(loginId);
    const setCookie = serializeSessionCookie(
      session.sessionId,
      Math.floor(sessionTtlMs / 1000),
      cookie,
    );
    sendJson(
      res,
      200,
      { status: 'complete', operator: operatorDto(session) },
      { 'set-cookie': setCookie },
    );
  }

  function handleLogout(req: IncomingMessage, res: ServerResponse): void {
    const sid = readCookie(req.headers.cookie, cookie.name);
    if (sid !== undefined) sessions.destroy(sid);
    sendJson(res, 200, { ok: true }, { 'set-cookie': clearSessionCookie(cookie) });
  }

  function handleMe(req: IncomingMessage, res: ServerResponse): void {
    const session = resolveSession(req);
    if (session === undefined) {
      sendJson(res, 401, { error: 'unauthenticated' });
      return;
    }
    sendJson(res, 200, { operator: operatorDto(session) });
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    if (
      path !== '/auth/login' &&
      path !== '/auth/login/poll' &&
      path !== '/auth/logout' &&
      path !== '/auth/me'
    ) {
      return false;
    }
    const method = req.method ?? 'GET';
    if (path === '/auth/login') {
      if (method !== 'POST') sendJson(res, 405, { error: 'method_not_allowed' });
      else await handleLogin(res);
      return true;
    }
    if (path === '/auth/login/poll') {
      if (method !== 'POST') sendJson(res, 405, { error: 'method_not_allowed' });
      else await handlePoll(req, res);
      return true;
    }
    if (path === '/auth/logout') {
      if (method !== 'POST') sendJson(res, 405, { error: 'method_not_allowed' });
      else handleLogout(req, res);
      return true;
    }
    // /auth/me
    if (method !== 'GET') sendJson(res, 405, { error: 'method_not_allowed' });
    else handleMe(req, res);
    return true;
  }

  return { handle, resolveSession };
}
