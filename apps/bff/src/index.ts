// apps/bff/src/index.ts -- the BFF entrypoint (F0.3).
//
// Boots the stateless service: validate config (fail-closed), build the logger, the ephemeral cache, the
// engine client, and the HTTP server, then listen. Graceful shutdown drains the server and closes the
// transport. This module is the only one with process-level side effects; the unit tests exercise the
// pieces directly.

import { createAuthRouter, type AuthRouter } from './auth/router.js';
import { createOidcProvider } from './auth/provider.js';
import { PendingLoginStore } from './auth/login-store.js';
import { SessionStore } from './auth/session.js';
import { EphemeralCache } from './cache.js';
import { loadConfig } from './config.js';
import { createEngineClient, createOperatorEngine, loggerDelegationSink } from './engine/index.js';
import { ReverseDnsResolver } from './engine/reverse-dns.js';
import { createLogger } from './log.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.logLevel);
  const cache = new EphemeralCache<unknown>(config.cacheTtlMs, config.cacheMaxEntries);
  const client = createEngineClient(config);
  // The operator-scoped engine facade (DR.3d): every entity read runs as the operator + is delegation-traced.
  const operatorEngine = createOperatorEngine(client, loggerDelegationSink(log));
  // Reverse-DNS for Overview destination names (cached + background; owns no durable data).
  const reverseDns = new ReverseDnsResolver();

  // Operator auth mounts only when OIDC is configured (F0.5a-2); otherwise /auth/* is not served.
  let authRouter: AuthRouter | undefined;
  if (config.oidc !== undefined) {
    authRouter = createAuthRouter({
      oidc: createOidcProvider(config.oidc, config.rbac),
      sessions: new SessionStore(config.session.maxSessions),
      pending: new PendingLoginStore(config.session.maxPendingLogins),
      log,
      sessionTtlMs: config.session.ttlMs,
      cookie: { name: config.session.cookieName, secure: config.session.cookieSecure },
    });
    log.info({}, 'operator auth enabled (OIDC device flow)');
  } else {
    log.warn({}, 'operator auth DISABLED (FC_OIDC_ISSUER not set)');
  }

  const server = createServer({
    config,
    log,
    cache,
    client,
    operatorEngine,
    reverseDns,
    ...(authRouter !== undefined ? { authRouter } : {}),
  });

  await new Promise<void>((resolve) => {
    server.listen(config.httpPort, () => {
      log.info({ port: config.httpPort }, 'BFF listening');
      resolve();
    });
  });

  const shutdown = (signal: string): void => {
    log.info({ signal }, 'shutting down');
    server.close(() => {
      void client.close().finally(() => {
        process.exit(0);
      });
    });
  };
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
}

void main().catch((err: unknown) => {
  // Startup failure (invalid config, port in use): fail closed with a non-zero exit. Config may be
  // invalid, so write directly to stderr rather than through the (config-driven) logger.
  process.stderr.write(
    `BFF failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
