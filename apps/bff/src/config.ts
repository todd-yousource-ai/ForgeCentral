// apps/bff/src/config.ts -- BFF configuration, validated at startup (F0.3 + F0.5a-2 auth).
//
// The BFF reads its configuration from the environment and validates it with zod at the process boundary
// (TypeScript_Dev_Rules: zod at every trust boundary). Validation is FAIL-CLOSED: a missing or malformed
// value throws `ConfigError` before the service serves anything, rather than starting in a half-configured
// state. The BFF holds NO TLS material -- it speaks plaintext over a LOOPBACK socket to the AWS-LC crypto
// sidecar, which originates the engine mTLS (IP-CONSOLE-00-CRYPTO-SIDECAR; INV-CONSOLE-CRYPTO-AWSLC). The
// engine endpoint is therefore the sidecar egress and must be loopback (guarded below).
//
// Operator auth (F0.5a-2) is configured as an OPTIONAL block: when `FC_OIDC_ISSUER` is present the auth
// router mounts (the operator login endpoints), and the issuer additionally requires a client id + role
// claim (fail-closed if half-specified). When absent, the BFF boots without operator login -- honest for
// the incremental foundation; a release build enables it (a note the release gate will enforce).

import { z } from 'zod';

import type { OidcConfig } from './auth/oidc.js';
import type { RbacConfig } from './auth/rbac.js';

/** A single RBAC grant (a Console role + optional tenant), validated at the config boundary. */
const RoleGrantSchema = z.object({
  role: z.enum(['global-admin', 'tenant-admin', 'tenant-user']),
  tenant: z.string().min(1).optional(),
});

/** The Console RBAC v1 (F0.5c): group->grant + local subject->grant + a global-admin default tenant. */
const RbacConfigSchema = z.object({
  groupRoles: z.record(RoleGrantSchema).default({}),
  localRbac: z.record(RoleGrantSchema).default({}),
  defaultTenant: z.string().min(1).optional(),
});

const ConfigSchema = z.object({
  /** The loopback host of the crypto sidecar's egress the BFF dials (must be loopback; guarded below). */
  engineHost: z.string().min(1).default('127.0.0.1'),
  /** The crypto sidecar's egress port (the BFF speaks plaintext wire to it; the sidecar owns the mTLS). */
  enginePort: z.coerce.number().int().positive().default(8789),
  /** The port the BFF's own HTTP surface listens on. */
  httpPort: z.coerce.number().int().positive().default(8787),
  /** Log level. */
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Ephemeral-cache entry lifetime in ms (non-authoritative; short by design). */
  cacheTtlMs: z.coerce.number().int().positive().default(2000),
  /** Ephemeral-cache capacity (bounded; oldest evicted). */
  cacheMaxEntries: z.coerce.number().int().positive().default(1000),
  /** Default per-call engine timeout in ms (every engine call is bounded). */
  requestTimeoutMs: z.coerce.number().int().positive().default(5000),
  // The sidecar bundle-signing service port (FD.2), loopback-only; absent = the distribute
  // surface answers 503 (the signing plane is provisioned by FD.5, not assumed).
  signerPort: z.coerce.number().int().positive().optional(),
  // The sidecar IdAM secret-set service port (ID.4), loopback-only; absent = the connector
  // onboarding secret step answers 503 (provisioned with the sidecar's secret_addr/secret_path).
  secretPort: z.coerce.number().int().positive().optional(),
  /** Engine heartbeat interval in ms. The wire client sends a PING within this cadence to refresh the
   * engine session lease (TRD-04a 3.1: a client must heartbeat within the lease window or the engine
   * closes the connection; the crdb default lease is 60s). Keep it well under the lease so a missed beat
   * or two does not lapse it. */
  engineHeartbeatMs: z.coerce.number().int().positive().default(20_000),
  /** Path to the built Console SPA (apps/console/dist) the BFF serves behind the admin plane. When
   * unset the BFF is API-only (no UI served). */
  spaDir: z.string().min(1).optional(),

  // -- Operator session settings (used only when auth is enabled) --------------------------------
  /** Operator session lifetime in ms. */
  sessionTtlMs: z.coerce.number().int().positive().default(3_600_000),
  /** The session cookie name. */
  sessionCookieName: z.string().min(1).default('fc_session'),
  /** Whether the session cookie carries `Secure` (true in production; false only for local plain-HTTP). */
  // Explicit true/false parse: `z.coerce.boolean()` would treat the string "false" as truthy.
  sessionCookieSecure: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Max concurrent operator sessions held in memory (bounded). */
  sessionMax: z.coerce.number().int().positive().default(4096),
  /** Max concurrent in-flight device logins held in memory (bounded). */
  loginMax: z.coerce.number().int().positive().default(256),

  // -- OIDC (optional block; see loadConfig post-processing) --------------------------------------
  oidcIssuer: z.string().url().optional(),
  oidcClientId: z.string().min(1).optional(),
  oidcRoleClaim: z.string().min(1).optional(),
  oidcScope: z.string().min(1).default('openid profile email'),
  oidcJwksUri: z.string().url().optional(),
  oidcDeviceCodeEndpoint: z.string().url().optional(),
  oidcTokenEndpoint: z.string().url().optional(),
});

type RawConfig = z.infer<typeof ConfigSchema>;

/** The operator session + cookie settings. */
export interface SessionSettings {
  readonly ttlMs: number;
  readonly cookieName: string;
  readonly cookieSecure: boolean;
  readonly maxSessions: number;
  readonly maxPendingLogins: number;
}

/** The validated BFF configuration. */
export interface BffConfig {
  readonly engineHost: string;
  readonly enginePort: number;
  readonly httpPort: number;
  readonly logLevel: RawConfig['logLevel'];
  readonly cacheTtlMs: number;
  readonly cacheMaxEntries: number;
  readonly requestTimeoutMs: number;
  /** The loopback port of the sidecar's FD.2 signing service, or undefined when unprovisioned. */
  readonly signerPort?: number;
  /** The loopback port of the sidecar's IdAM secret-set service (ID.4), or undefined when unprovisioned. */
  readonly secretPort?: number;
  /** Engine heartbeat cadence in ms (PING keeps the engine session lease alive; see the schema note). */
  readonly heartbeatIntervalMs: number;
  /** Path to the built Console SPA served behind the admin plane; absent -> the BFF is API-only. */
  readonly spaDir?: string;
  readonly session: SessionSettings;
  /** The OIDC login config, present only when `FC_OIDC_ISSUER` is set (auth enabled). */
  readonly oidc?: OidcConfig;
  /** The Console RBAC (F0.5c): resolves an operator's tenant + role. Empty (fail-closed) by default. */
  readonly rbac: RbacConfig;
}

/** Thrown when configuration is missing or invalid. Carries field paths, never secret values. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Trim exactly one trailing slash (Auth0 issuers carry one; endpoint paths must not double it). */
function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Assemble the OIDC config from the raw env, deriving the standard Auth0 endpoints from the issuer when
 * they are not overridden. Returns `undefined` when auth is disabled (no issuer). Fail-closed: an issuer
 * without a client id + role claim is a misconfiguration, not a silent half-auth.
 */
function resolveOidc(raw: RawConfig): OidcConfig | undefined {
  if (raw.oidcIssuer === undefined) return undefined;
  const missing: string[] = [];
  if (raw.oidcClientId === undefined) missing.push('FC_OIDC_CLIENT_ID');
  if (raw.oidcRoleClaim === undefined) missing.push('FC_OIDC_ROLE_CLAIM');
  if (missing.length > 0) {
    throw new ConfigError(
      `FC_OIDC_ISSUER is set but auth is incomplete: set ${missing.join(', ')}`,
    );
  }
  const base = trimTrailingSlash(raw.oidcIssuer);
  return {
    issuer: raw.oidcIssuer,
    clientId: raw.oidcClientId as string,
    roleClaim: raw.oidcRoleClaim as string,
    scope: raw.oidcScope,
    jwksUri: raw.oidcJwksUri ?? `${base}/.well-known/jwks.json`,
    deviceCodeEndpoint: raw.oidcDeviceCodeEndpoint ?? `${base}/oauth/device/code`,
    tokenEndpoint: raw.oidcTokenEndpoint ?? `${base}/oauth/token`,
  };
}

/**
 * Parse the Console RBAC from `FC_RBAC_CONFIG` (a JSON object). Absent or empty -> a fail-closed empty
 * RBAC (every operator resolves to no authority, so logins are refused until it is configured). Malformed
 * JSON or a schema violation is a `ConfigError` (never a silent half-config).
 */
function resolveRbac(env: NodeJS.ProcessEnv): RbacConfig {
  const raw = env['FC_RBAC_CONFIG'];
  if (raw === undefined || raw.trim() === '') return { groupRoles: {}, localRbac: {} };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ConfigError('FC_RBAC_CONFIG is not valid JSON');
  }
  const parsed = RbacConfigSchema.safeParse(json);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)').join(', ');
    throw new ConfigError(`invalid FC_RBAC_CONFIG: check ${fields}`);
  }
  // zod renders optional fields as `T | undefined`; the domain `RbacConfig` uses `?:` (exactOptional).
  return parsed.data as RbacConfig;
}

/** Load and validate configuration from an environment map. Fail-closed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BffConfig {
  const parsed = ConfigSchema.safeParse({
    engineHost: env['FC_ENGINE_HOST'],
    enginePort: env['FC_ENGINE_PORT'],
    httpPort: env['FC_HTTP_PORT'],
    logLevel: env['FC_LOG_LEVEL'],
    cacheTtlMs: env['FC_CACHE_TTL_MS'],
    cacheMaxEntries: env['FC_CACHE_MAX_ENTRIES'],
    requestTimeoutMs: env['FC_REQUEST_TIMEOUT_MS'],
    signerPort: env['FC_SIGNER_PORT'],
    secretPort: env['FC_IDAM_SECRET_PORT'],
    engineHeartbeatMs: env['FC_ENGINE_HEARTBEAT_MS'],
    spaDir: env['FC_SPA_DIST'],
    sessionTtlMs: env['FC_SESSION_TTL_MS'],
    sessionCookieName: env['FC_SESSION_COOKIE'],
    sessionCookieSecure: env['FC_SESSION_COOKIE_SECURE'],
    sessionMax: env['FC_SESSION_MAX'],
    loginMax: env['FC_LOGIN_MAX'],
    oidcIssuer: env['FC_OIDC_ISSUER'],
    oidcClientId: env['FC_OIDC_CLIENT_ID'],
    oidcRoleClaim: env['FC_OIDC_ROLE_CLAIM'],
    oidcScope: env['FC_OIDC_SCOPE'],
    oidcJwksUri: env['FC_OIDC_JWKS_URI'],
    oidcDeviceCodeEndpoint: env['FC_OIDC_DEVICE_ENDPOINT'],
    oidcTokenEndpoint: env['FC_OIDC_TOKEN_ENDPOINT'],
  });
  if (!parsed.success) {
    // Report the offending field paths only -- never echo the (possibly sensitive) values.
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)').join(', ');
    throw new ConfigError(`invalid BFF configuration: check ${fields}`);
  }
  const raw = parsed.data;
  // The BFF may only reach the engine through a LOOPBACK sidecar egress (it speaks plaintext wire; the
  // sidecar owns the mTLS). A routable engine host would mean unencrypted wire traffic on the wire --
  // refuse it fail-closed (INV-CONSOLE-CRYPTO-AWSLC).
  if (!isLoopbackHost(raw.engineHost)) {
    throw new ConfigError(
      `FC_ENGINE_HOST must be loopback (the crypto sidecar egress), not a routable host: ${raw.engineHost}`,
    );
  }
  const oidc = resolveOidc(raw);
  return {
    engineHost: raw.engineHost,
    enginePort: raw.enginePort,
    httpPort: raw.httpPort,
    logLevel: raw.logLevel,
    cacheTtlMs: raw.cacheTtlMs,
    cacheMaxEntries: raw.cacheMaxEntries,
    requestTimeoutMs: raw.requestTimeoutMs,
    heartbeatIntervalMs: raw.engineHeartbeatMs,
    session: {
      ttlMs: raw.sessionTtlMs,
      cookieName: raw.sessionCookieName,
      cookieSecure: raw.sessionCookieSecure,
      maxSessions: raw.sessionMax,
      maxPendingLogins: raw.loginMax,
    },
    rbac: resolveRbac(env),
    ...(raw.signerPort !== undefined ? { signerPort: raw.signerPort } : {}),
    ...(raw.secretPort !== undefined ? { secretPort: raw.secretPort } : {}),
    ...(raw.spaDir !== undefined ? { spaDir: raw.spaDir } : {}),
    ...(oidc !== undefined ? { oidc } : {}),
  };
}

/** True when `host` names the local loopback (the only interface the sidecar egress is reached on). */
function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host === '127.0.0.1' || host.startsWith('127.');
}
