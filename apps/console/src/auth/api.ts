// The client for the BFF auth plane (apps/bff/src/auth/router.ts). Same-origin fetch with the session
// cookie (the BFF fronts the SPA; the dev server proxies /auth). The SPA never holds a token; the cookie
// session is the only credential and the engine re-authorizes under the operator Principal regardless
// (INV-CONSOLE-ENGINE-AUTHZ). Shapes mirror the router exactly.

/** The operator's Crucible EXPLAIN tier (mirrors apps/bff/src/auth/tier.ts). */
export type OperatorTier = 'User' | 'Developer' | 'Admin' | 'SecurityAudit';

/** The operator projection the BFF returns (never carries the session id or internal ids). */
export interface OperatorDto {
  readonly subject: string;
  readonly tier: OperatorTier;
  readonly email?: string;
}

/** The device-login start payload (POST /auth/login). */
export interface LoginStart {
  readonly loginId: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete?: string;
  readonly expiresInSecs: number;
  readonly intervalSecs: number;
}

export type PollResult =
  | { readonly status: 'pending' }
  | { readonly status: 'complete'; readonly operator: OperatorDto }
  | { readonly status: 'error'; readonly error: string }
  | { readonly status: 'expired' };

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

async function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_HEADERS,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** The current operator, or null when unauthenticated (401). Other failures throw. */
export async function getMe(): Promise<OperatorDto | null> {
  const res = await fetch('/auth/me', { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`auth/me failed: ${String(res.status)}`);
  const data = (await res.json()) as { operator: OperatorDto };
  return data.operator;
}

/** Start a device login. Throws on an IdP/transport failure. */
export async function startLogin(): Promise<LoginStart> {
  const res = await postJson('/auth/login');
  if (!res.ok) throw new Error(`auth/login failed: ${String(res.status)}`);
  return (await res.json()) as LoginStart;
}

/** Poll a pending login once. Maps the router's status + HTTP code to a discriminated result. */
export async function pollLogin(loginId: string): Promise<PollResult> {
  const res = await postJson('/auth/login/poll', { loginId });
  if (res.status === 404) return { status: 'expired' };
  const data = (await res.json()) as
    | { status: 'pending' }
    | { status: 'complete'; operator: OperatorDto }
    | { status: 'error'; error: string };
  return data;
}

/** Destroy the session + clear the cookie. */
export async function logout(): Promise<void> {
  await postJson('/auth/logout');
}
