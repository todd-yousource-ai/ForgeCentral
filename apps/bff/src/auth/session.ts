// apps/bff/src/auth/session.ts -- the operator session model + ephemeral store (F0.5a).
//
// An operator authenticates via OIDC (F0.5a-2, the device flow) and the BFF holds an ephemeral session:
// the verified OIDC subject + email + the derived EXPLAIN tier + an expiry. Sessions are operational state
// (never durable domain data, INV-CONSOLE-NO-2ND-DB): in-memory, bounded, and short-lived. The session id
// is a cryptographically-random token (the session cookie value); it is never derived from the subject.

import { randomBytes } from 'node:crypto';

import type { ExplainTier } from './tier.js';

/** A logged-in operator's session. */
export interface OperatorSession {
  /** The opaque, cryptographically-random session id (the cookie value). */
  readonly sessionId: string;
  /** The verified OIDC subject (`sub`). */
  readonly subject: string;
  /** The operator's email, if the IdP released it. */
  readonly email?: string;
  /** The derived Crucible EXPLAIN tier. */
  readonly tier: ExplainTier;
  /** Absolute expiry (ms since epoch); the session is invalid at/after this. */
  readonly expiresAt: number;
}

/** The identity fields captured from a verified login (before a session id + expiry are assigned). */
export interface OperatorIdentity {
  readonly subject: string;
  readonly email?: string;
  readonly tier: ExplainTier;
}

/** An injectable clock (for deterministic tests). */
export type Clock = () => number;

/** An in-memory, bounded, short-TTL session store. No durable state (INV-CONSOLE-NO-2ND-DB). */
export class SessionStore {
  private readonly sessions = new Map<string, OperatorSession>();

  constructor(
    private readonly maxSessions: number,
    private readonly now: Clock = Date.now,
  ) {}

  /** Create a session for a verified operator, returning it (with a fresh random id). */
  create(identity: OperatorIdentity, ttlMs: number): OperatorSession {
    if (this.sessions.size >= this.maxSessions) {
      const oldest = this.sessions.keys().next().value;
      if (oldest !== undefined) this.sessions.delete(oldest);
    }
    const sessionId = randomBytes(32).toString('hex');
    const session: OperatorSession = {
      sessionId,
      subject: identity.subject,
      tier: identity.tier,
      expiresAt: this.now() + ttlMs,
      ...(identity.email !== undefined ? { email: identity.email } : {}),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  /** Resolve a session id to its live session, or `undefined` if unknown or expired (fail-closed). */
  get(sessionId: string): OperatorSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return session;
  }

  /** End a session (logout). */
  destroy(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Current session count (test observation of the bound). */
  get size(): number {
    return this.sessions.size;
  }
}
