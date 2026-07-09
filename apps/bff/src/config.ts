// apps/bff/src/config.ts -- BFF configuration, validated at startup (F0.3).
//
// The BFF reads its configuration from the environment and validates it with zod at the process boundary
// (TypeScript_Dev_Rules: zod at every trust boundary). Validation is FAIL-CLOSED: a missing or malformed
// value throws `ConfigError` before the service serves anything, rather than starting in a half-configured
// state. The mTLS material (CA + client cert + key paths) is REQUIRED -- the BFF has no non-mTLS path to
// the engine (TRD-CONSOLE-00 Section 8).

import { z } from 'zod';

const ConfigSchema = z.object({
  /** The engine host the BFF connects to over mTLS. */
  engineHost: z.string().min(1),
  /** The engine wire port (the mTLS gateway). */
  enginePort: z.coerce.number().int().positive().default(7878),
  /** Path to the CA bundle that signs the engine's server cert. */
  tlsCaPath: z.string().min(1),
  /** Path to the BFF's own enrolled client certificate (the service Principal). */
  tlsCertPath: z.string().min(1),
  /** Path to the BFF client private key. */
  tlsKeyPath: z.string().min(1),
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
});

/** The validated BFF configuration. */
export type BffConfig = z.infer<typeof ConfigSchema>;

/** Thrown when configuration is missing or invalid. Carries field paths, never secret values. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Load and validate configuration from an environment map. Fail-closed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BffConfig {
  const parsed = ConfigSchema.safeParse({
    engineHost: env['FC_ENGINE_HOST'],
    enginePort: env['FC_ENGINE_PORT'],
    tlsCaPath: env['FC_TLS_CA'],
    tlsCertPath: env['FC_TLS_CERT'],
    tlsKeyPath: env['FC_TLS_KEY'],
    httpPort: env['FC_HTTP_PORT'],
    logLevel: env['FC_LOG_LEVEL'],
    cacheTtlMs: env['FC_CACHE_TTL_MS'],
    cacheMaxEntries: env['FC_CACHE_MAX_ENTRIES'],
    requestTimeoutMs: env['FC_REQUEST_TIMEOUT_MS'],
  });
  if (!parsed.success) {
    // Report the offending field paths only -- never echo the (possibly sensitive) values.
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)').join(', ');
    throw new ConfigError(`invalid BFF configuration: check ${fields}`);
  }
  return parsed.data;
}
