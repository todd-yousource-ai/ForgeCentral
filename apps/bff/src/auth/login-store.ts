// apps/bff/src/auth/login-store.ts -- in-flight device-login store (F0.5a-2).
//
// The Device Authorization Grant (oidc.ts) issues a `device_code` the BFF must hold while the operator
// authenticates + completes MFA on their own device. That `device_code` is a bearer-grade secret (whoever
// polls with it receives the tokens), so it stays SERVER-SIDE: the BFF hands the browser an opaque
// `loginId` and keeps the device code here, keyed by that id. Like the session store, this is ephemeral
// operational state -- in-memory, bounded, TTL'd -- never durable domain data (INV-CONSOLE-NO-2ND-DB).

import { randomBytes } from 'node:crypto';

import type { Clock } from './session.js';

/** A device login in progress. */
export interface PendingLogin {
  readonly loginId: string;
  /** The bearer-grade device code held server-side (never returned to the browser). */
  readonly deviceCode: string;
  /** The minimum poll interval the IdP asked for (seconds). */
  readonly intervalSecs: number;
  /** Absolute expiry (ms since epoch); the login is dead at/after this. */
  readonly expiresAt: number;
}

/** The fields captured when a device login starts (before a login id + expiry are assigned). */
export interface PendingLoginInit {
  readonly deviceCode: string;
  readonly intervalSecs: number;
}

/** An in-memory, bounded, short-TTL store of in-flight device logins. */
export class PendingLoginStore {
  private readonly logins = new Map<string, PendingLogin>();

  constructor(
    private readonly maxLogins: number,
    private readonly now: Clock = Date.now,
  ) {}

  /** Start tracking a device login, returning it with a fresh opaque login id. */
  create(init: PendingLoginInit, ttlMs: number): PendingLogin {
    if (this.logins.size >= this.maxLogins) {
      const oldest = this.logins.keys().next().value;
      if (oldest !== undefined) this.logins.delete(oldest);
    }
    const loginId = randomBytes(32).toString('hex');
    const login: PendingLogin = {
      loginId,
      deviceCode: init.deviceCode,
      intervalSecs: init.intervalSecs,
      expiresAt: this.now() + ttlMs,
    };
    this.logins.set(loginId, login);
    return login;
  }

  /** Resolve a login id to its live login, or `undefined` if unknown or expired (fail-closed). */
  get(loginId: string): PendingLogin | undefined {
    const login = this.logins.get(loginId);
    if (!login) return undefined;
    if (login.expiresAt <= this.now()) {
      this.logins.delete(loginId);
      return undefined;
    }
    return login;
  }

  /** Drop a login (completed, failed, or abandoned). */
  destroy(loginId: string): void {
    this.logins.delete(loginId);
  }

  /** Current in-flight login count (test observation of the bound). */
  get size(): number {
    return this.logins.size;
  }
}
