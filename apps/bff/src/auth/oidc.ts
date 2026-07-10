// apps/bff/src/auth/oidc.ts -- the OIDC device-authorization login (F0.5a).
//
// The Console BFF runs headless (no browser, no public redirect), so the operator logs in via the OAuth
// 2.0 Device Authorization Grant (RFC 8628): the BFF requests a device code, the operator authenticates +
// completes MFA on their own device, and the BFF polls for the tokens. The id_token is then verified
// against the IdP's JWKS (signature, issuer, audience, expiry) -- never trusted unverified -- and the
// operator identity + EXPLAIN tier are derived from its claims.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { operatorPrincipalId } from './operator-id.js';
import { resolveAuthority, type RbacConfig } from './rbac.js';
import { type OperatorIdentity } from './session.js';
import { deriveTier } from './tier.js';

/** The OIDC endpoints + client the device flow uses (from IdP discovery). */
export interface OidcConfig {
  /** The issuer (`iss`), exactly as the IdP publishes it (Auth0 includes a trailing slash). */
  readonly issuer: string;
  readonly clientId: string;
  readonly jwksUri: string;
  readonly deviceCodeEndpoint: string;
  readonly tokenEndpoint: string;
  /** Requested scopes (e.g. `openid profile email`). */
  readonly scope: string;
  /** The custom claim carrying the operator's roles (deployment-specific). */
  readonly roleClaim: string;
}

/** A device-authorization response: what the operator uses to log in. */
export interface DeviceCode {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete: string;
  readonly expiresInSecs: number;
  readonly intervalSecs: number;
}

/** The outcome of one token-endpoint poll. */
export type PollResult =
  | { readonly status: 'pending' }
  | { readonly status: 'complete'; readonly idToken: string; readonly accessToken: string };

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  id_token?: string;
  access_token?: string;
  error?: string;
}

/** Request a device code to start a login. */
export async function requestDeviceCode(config: OidcConfig): Promise<DeviceCode> {
  const res = await fetch(config.deviceCodeEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, scope: config.scope }),
  });
  if (!res.ok) throw new Error(`device code request failed: HTTP ${String(res.status)}`);
  const body = (await res.json()) as DeviceCodeResponse;
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    verificationUriComplete: body.verification_uri_complete,
    expiresInSecs: body.expires_in,
    intervalSecs: body.interval,
  };
}

/** Poll the token endpoint once. `pending` while the operator has not finished; throws on a real error. */
export async function pollToken(config: OidcConfig, deviceCode: string): Promise<PollResult> {
  const res = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: config.clientId,
    }),
  });
  const body = (await res.json()) as TokenResponse;
  if (res.ok && body.id_token && body.access_token) {
    return { status: 'complete', idToken: body.id_token, accessToken: body.access_token };
  }
  if (body.error === 'authorization_pending' || body.error === 'slow_down') {
    return { status: 'pending' };
  }
  throw new Error(`device token error: ${body.error ?? `HTTP ${String(res.status)}`}`);
}

// One remote JWKS per jwks_uri (jose caches + rotates keys internally).
const jwksByUri = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Verify an id_token against the IdP JWKS (signature, issuer, audience, expiry) and return its claims. */
export async function verifyIdToken(config: OidcConfig, idToken: string): Promise<JWTPayload> {
  let jwks = jwksByUri.get(config.jwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(config.jwksUri));
    jwksByUri.set(config.jwksUri, jwks);
  }
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: config.issuer,
    audience: config.clientId,
  });
  return payload;
}

/** Derive the operator identity (subject/email/tier) from verified id_token claims. */
export function operatorFromClaims(
  payload: JWTPayload,
  roleClaim: string,
  rbac: RbacConfig,
): OperatorIdentity | undefined {
  const email = typeof payload['email'] === 'string' ? payload['email'] : undefined;
  const rawRoles = payload[roleClaim];
  const groups = Array.isArray(rawRoles)
    ? rawRoles.filter((r): r is string => typeof r === 'string')
    : [];
  const subject = String(payload.sub ?? '');
  // The Console's RBAC resolves the operator's tenant + role (F0.5c). Fail-closed: an operator with no
  // resolvable authority has no tenant and cannot be delegated, so the login is refused (undefined).
  const authority = resolveAuthority(subject, groups, rbac);
  if (authority === undefined) return undefined;
  return {
    subject,
    tier: deriveTier(groups),
    principalId: operatorPrincipalId(subject),
    tenant: authority.activeTenant,
    role: authority.role,
    ...(email !== undefined ? { email } : {}),
  };
}
