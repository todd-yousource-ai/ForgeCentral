// apps/bff/src/engine/session-client.ts -- the sidecar admin-session lookup client (IP-CONSOLE-11 ST.5b).
//
// The crypto sidecar terminates the operator's admin TLS and byte-tunnels it to this BFF over a
// loopback connection per session, so the BFF cannot see which key exchange the browser negotiated.
// The sidecar registers each live tunnel's group under the tunnel's loopback SOURCE port and answers a
// lookup by that port on a loopback NDJSON socket: `{"port":N}` in, `{"group":"..."|null}` out. The
// port is the request's own `socket.remotePort`, so the answer describes THIS request's session; the
// browser supplies nothing (a header it sent could claim any group).
//
// Fail-closed: an error line, an unparseable line, a closed socket and a timeout are typed errors.

import { createConnection } from 'node:net';

/** The lookup seam failed (socket, framing, refusal, or timeout). */
export class SessionLookupError extends Error {
  constructor(detail: string) {
    super(`admin session lookup failed: ${detail}`);
    this.name = 'SessionLookupError';
  }
}

function parseResponse(line: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new SessionLookupError('unparseable response line');
  }
  if (typeof parsed === 'object' && parsed !== null && 'group' in parsed) {
    const group = parsed.group;
    if (group === null || typeof group === 'string') {
      return group;
    }
  }
  if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
    throw new SessionLookupError('the sidecar refused the lookup');
  }
  throw new SessionLookupError('response carries no group');
}

/**
 * The key-exchange group the live admin tunnel from loopback `remotePort` negotiated, or `null` when no
 * live tunnel uses that port (the request did not come through the admin terminator). One-shot: connect,
 * one line each way, close; the timeout bounds the exchange.
 */
export async function lookupSessionGroup(
  host: string,
  port: number,
  remotePort: number,
  timeoutMs: number,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let buffer = '';
    let settled = false;
    const settle = (fn: () => void): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        fn();
      }
    };
    const timer = setTimeout(
      () => settle(() => reject(new SessionLookupError(`timeout after ${String(timeoutMs)}ms`))),
      timeoutMs,
    );
    timer.unref();
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ port: remotePort })}\n`);
    });
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      settle(() => {
        try {
          resolve(parseResponse(line));
        } catch (err) {
          reject(err instanceof Error ? err : new SessionLookupError('unknown'));
        }
      });
    });
    socket.on('error', (err) => settle(() => reject(new SessionLookupError(err.message))));
    socket.on('close', () =>
      settle(() => reject(new SessionLookupError('connection closed before a response'))),
    );
  });
}
