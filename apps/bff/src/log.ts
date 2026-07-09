// apps/bff/src/log.ts -- structured logging with secret redaction (F0.3).
//
// pino emits structured JSON logs. Redaction is configured centrally so credentials, tokens, keys, and
// authorization headers can never reach the log stream (CRAFTED "No secret leakage"; a federal-customer
// non-negotiable). Application code logs freely; the redaction paths are the safety net.

import { pino, type Logger } from 'pino';

/** Log-object paths that are always censored, wherever they appear. */
const REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'key',
  '*.key',
  'secret',
  '*.secret',
  'authorization',
  '*.authorization',
  'req.headers.authorization',
  'tls.key',
  'tlsKeyPath',
];

/** Create the BFF logger at the given level, with secret redaction always on. */
export function createLogger(level: string, destination?: NodeJS.WritableStream): Logger {
  const options = {
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: { service: 'forge-bff' },
  };
  return destination ? pino(options, destination) : pino(options);
}
