// apps/bff/src/index.ts -- the BFF entrypoint (F0.3).
//
// Boots the stateless service: validate config (fail-closed), build the logger, the ephemeral cache, the
// engine client, and the HTTP server, then listen. Graceful shutdown drains the server and closes the
// transport. This module is the only one with process-level side effects; the unit tests exercise the
// pieces directly.

import { EphemeralCache } from './cache.js';
import { loadConfig } from './config.js';
import { createEngineClient } from './engine/index.js';
import { createLogger } from './log.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.logLevel);
  const cache = new EphemeralCache<unknown>(config.cacheTtlMs, config.cacheMaxEntries);
  const client = createEngineClient(config);
  const server = createServer({ config, log, cache, client });

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
