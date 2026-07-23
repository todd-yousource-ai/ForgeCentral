// apps/bff/src/engine/secret-client.ts -- the sidecar IdAM secret-set client (ID.4 part 4).
//
// The onboarding form's secret must reach the node's mode-protected store without the Console ever
// storing it or the engine wire ever carrying it. The crypto sidecar owns that store and serves a
// secret-set leg on a loopback NDJSON socket: one JSON request line in ({ provider, secret }), one
// response line out ("ok" or {"refused":{"reason":...}}). This client is that seam's only caller. The
// secret rides through the BFF as a transient request value here -- forwarded to loopback, never
// persisted, never logged, never a durable Console type (INV-CONSOLE-NO-2ND-DB).
//
// Fail-closed at every edge: a refused response, an unparseable line, a closed socket, and a timeout
// are all typed errors.

import { createConnection } from 'node:net';

/** The sidecar refused to write the secret (its reason names no secret and no path). */
export class SecretRefusedError extends Error {
  constructor(reason: string) {
    super(`secret set refused: ${reason}`);
    this.name = 'SecretRefusedError';
  }
}

/** The secret seam failed (socket, framing, or timeout) -- distinct from a typed refusal. */
export class SecretUnavailableError extends Error {
  constructor(detail: string) {
    super(`secret set unavailable: ${detail}`);
    this.name = 'SecretUnavailableError';
  }
}

/** Narrow the sidecar's externally tagged response line, fail-closed. `"ok"` is the success unit. */
function parseResponse(line: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new SecretUnavailableError('unparseable response line');
  }
  if (parsed === 'ok') {
    return;
  }
  if (typeof parsed === 'object' && parsed !== null && 'refused' in parsed) {
    const refused = (parsed as { refused: { reason?: unknown } }).refused;
    throw new SecretRefusedError(typeof refused.reason === 'string' ? refused.reason : 'unknown');
  }
  throw new SecretUnavailableError('response is neither ok nor refused');
}

/**
 * Write one connector secret over the loopback seam: connect, send one line, read one line, close.
 *
 * One-shot by design -- onboarding is operator-cadence, not hot-path, and a fresh connection per
 * request means no framing state survives a failure. The timeout bounds the whole exchange. The
 * `secret` is a transient argument: it is never returned, logged, or retained past this call.
 */
export async function setConnectorSecret(
  host: string,
  port: number,
  provider: string,
  secret: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let buffer = '';
    let settled = false;
    const settle = (fn: () => void): void => {
      if (!settled) {
        settled = true;
        socket.destroy();
        fn();
      }
    };
    const timer = setTimeout(
      () => settle(() => reject(new SecretUnavailableError(`timeout after ${timeoutMs}ms`))),
      timeoutMs,
    );
    timer.unref();
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ provider, secret })}\n`);
    });
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      settle(() => {
        clearTimeout(timer);
        try {
          parseResponse(line);
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new SecretUnavailableError('unknown'));
        }
      });
    });
    socket.on('error', (err) =>
      settle(() => {
        clearTimeout(timer);
        reject(new SecretUnavailableError(err.message));
      }),
    );
    socket.on('close', () =>
      settle(() => {
        clearTimeout(timer);
        reject(new SecretUnavailableError('connection closed before a response'));
      }),
    );
  });
}
