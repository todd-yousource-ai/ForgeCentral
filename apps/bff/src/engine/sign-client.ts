// apps/bff/src/engine/sign-client.ts -- the sidecar bundle-signing client (FD.2).
//
// The BFF composes a bundle's unsigned parts and needs them signed by a key it must never hold. The
// crypto sidecar owns that key and serves signing on a loopback NDJSON socket: one JSON draft line in,
// one response line out (`{"signed": {...}}` or `{"refused": {"reason": ...}}`). This client is that
// seam's only caller. The signer fills `signing_key_id` and `signature_algorithm` from the key it
// actually holds, so nothing here (or in any caller) can steer which key signs.
//
// Fail-closed at every edge: a refused response, an unparseable line, a closed socket, and a timeout
// are all typed errors -- never an unsigned bundle passed downstream.

import { createConnection } from 'node:net';

import type { SignedPolicyBundle } from '@forge/contracts';

/**
 * A signed bundle as the sidecar returns it: the typed `bundle` plus the CANONICAL ciborium `cbor`
 * bytes the engine's bundle store parses and stores verbatim. The producer commits `cbor` as-is and
 * MUST NOT re-encode `bundle` -- a JSON round-trip is lossy (the contributor `PolicyId` is a uuid,
 * serde-human-readable, so it is a string here but 16 bytes in the engine's CBOR), which the engine
 * then rejects as malformed.
 */
export interface SignedBundleResult {
  readonly bundle: SignedPolicyBundle;
  readonly cbor: readonly number[];
}

/** The unsigned parts of a bundle, exactly as the sidecar's `BundleDraft` deserializes them. */
export interface BundleDraft {
  readonly version: number;
  readonly policy: SignedPolicyBundle['policy'];
  /** The authored-ruleset carriage (P5.5). Empty signs the unchanged v1 preimage; non-empty signs v2. */
  readonly rules: SignedPolicyBundle['rules'];
  readonly contributors: SignedPolicyBundle['contributors'];
  readonly scope: SignedPolicyBundle['scope'];
  readonly lease: SignedPolicyBundle['lease'];
}

/** The sidecar refused to sign (its reason echoes the caller's own payload, never key material). */
export class SigningRefusedError extends Error {
  constructor(reason: string) {
    super(`signing refused: ${reason}`);
    this.name = 'SigningRefusedError';
  }
}

/** The signing seam failed (socket, framing, or timeout) -- distinct from a typed refusal. */
export class SigningUnavailableError extends Error {
  constructor(detail: string) {
    super(`signing unavailable: ${detail}`);
    this.name = 'SigningUnavailableError';
  }
}

/** Narrow the sidecar's externally tagged response line, fail-closed. */
function parseResponse(line: string): SignedBundleResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new SigningUnavailableError('unparseable response line');
  }
  if (typeof parsed === 'object' && parsed !== null) {
    if ('signed' in parsed) {
      const signed = (parsed as { signed: { bundle?: unknown; cbor?: unknown } }).signed;
      const cbor = signed.cbor;
      if (
        typeof signed.bundle !== 'object' ||
        signed.bundle === null ||
        !Array.isArray(cbor) ||
        !cbor.every((b) => typeof b === 'number')
      ) {
        // A signed response missing the canonical bytes is unusable -- never fall back to re-encoding.
        throw new SigningUnavailableError('signed response missing bundle or canonical cbor bytes');
      }
      return { bundle: signed.bundle as SignedPolicyBundle, cbor };
    }
    if ('refused' in parsed) {
      const refused = (parsed as { refused: { reason?: unknown } }).refused;
      throw new SigningRefusedError(
        typeof refused.reason === 'string' ? refused.reason : 'unknown',
      );
    }
  }
  throw new SigningUnavailableError('response is neither signed nor refused');
}

/**
 * Sign one draft over the loopback seam: connect, send one line, read one line, close.
 *
 * One-shot by design -- distribution is operator-cadence, not hot-path, and a fresh connection per
 * request means no framing state survives a failure. The timeout bounds the whole exchange.
 */
export async function signBundle(
  host: string,
  port: number,
  draft: BundleDraft,
  timeoutMs: number,
): Promise<SignedBundleResult> {
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
      () => settle(() => reject(new SigningUnavailableError(`timeout after ${timeoutMs}ms`))),
      timeoutMs,
    );
    timer.unref();
    socket.on('connect', () => {
      socket.write(`${JSON.stringify(draft)}\n`);
    });
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      settle(() => {
        clearTimeout(timer);
        try {
          resolve(parseResponse(line));
        } catch (err) {
          reject(err instanceof Error ? err : new SigningUnavailableError('unknown'));
        }
      });
    });
    socket.on('error', (err) =>
      settle(() => {
        clearTimeout(timer);
        reject(new SigningUnavailableError(err.message));
      }),
    );
    socket.on('close', () =>
      settle(() => {
        clearTimeout(timer);
        reject(new SigningUnavailableError('connection closed before a response'));
      }),
    );
  });
}
