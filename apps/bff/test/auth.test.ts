// apps/bff/test/auth.test.ts -- F0.5a operator auth (tier, session store, claim mapping).

import { describe, expect, it } from 'vitest';

import { SessionStore, deriveTier, operatorFromClaims } from '../src/auth/index.js';

describe('deriveTier', () => {
  it('fails closed to User for no/unknown roles', () => {
    expect(deriveTier([])).toBe('User');
    expect(deriveTier(['not-a-console-role'])).toBe('User');
  });

  it('maps recognized roles and picks the highest', () => {
    expect(deriveTier(['console-developer'])).toBe('Developer');
    expect(deriveTier(['console-admin'])).toBe('Admin');
    expect(deriveTier(['console-user', 'console-security-audit'])).toBe('SecurityAudit');
  });

  it('is case-insensitive', () => {
    expect(deriveTier(['CONSOLE-ADMIN'])).toBe('Admin');
  });
});

describe('SessionStore', () => {
  it('creates a session with a random id and resolves it', () => {
    const store = new SessionStore(10, () => 1000);
    const session = store.create({ subject: 'auth0|abc', email: 'op@x.io', tier: 'Admin' }, 5000);
    expect(session.sessionId).toHaveLength(64); // 32 random bytes as hex
    expect(session.expiresAt).toBe(6000);
    expect(store.get(session.sessionId)).toEqual(session);
  });

  it('expires a session (fail-closed) and removes it', () => {
    let now = 0;
    const store = new SessionStore(10, () => now);
    const { sessionId } = store.create({ subject: 's', tier: 'User' }, 1000);
    now = 999;
    expect(store.get(sessionId)).toBeDefined();
    now = 1000;
    expect(store.get(sessionId)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('destroys a session (logout) and is bounded', () => {
    const store = new SessionStore(2, () => 0);
    const a = store.create({ subject: 'a', tier: 'User' }, 10_000);
    store.create({ subject: 'b', tier: 'User' }, 10_000);
    store.create({ subject: 'c', tier: 'User' }, 10_000); // evicts the oldest
    expect(store.size).toBe(2);
    expect(store.get(a.sessionId)).toBeUndefined();
    const b = store.create({ subject: 'd', tier: 'User' }, 10_000);
    store.destroy(b.sessionId);
    expect(store.get(b.sessionId)).toBeUndefined();
  });

  it('mints unique session ids', () => {
    const store = new SessionStore(10, () => 0);
    const s1 = store.create({ subject: 'a', tier: 'User' }, 1000);
    const s2 = store.create({ subject: 'a', tier: 'User' }, 1000);
    expect(s1.sessionId).not.toBe(s2.sessionId);
  });
});

describe('operatorFromClaims', () => {
  const ROLE = 'https://yousource.ai/roles';

  it('derives subject/email/tier from verified claims', () => {
    const identity = operatorFromClaims(
      { sub: 'auth0|123', email: 'op@x.io', [ROLE]: ['console-admin'] },
      ROLE,
    );
    expect(identity).toEqual({ subject: 'auth0|123', email: 'op@x.io', tier: 'Admin' });
  });

  it('fails closed to User when the role claim is absent or non-string', () => {
    expect(operatorFromClaims({ sub: 'x' }, ROLE).tier).toBe('User');
    expect(operatorFromClaims({ sub: 'x', [ROLE]: [42, {}] }, ROLE).tier).toBe('User');
  });
});
