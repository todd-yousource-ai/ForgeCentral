// apps/bff/test/auth.test.ts -- F0.5a operator auth (tier, session store, claim mapping).

import { describe, expect, it } from 'vitest';

import {
  SessionStore,
  deriveTier,
  operatorFromClaims,
  type ExplainTier,
  type OperatorIdentity,
} from '../src/auth/index.js';

/** A full operator identity for the session-store tests (F0.5c adds principalId/tenant/role). */
function identity(subject: string, tier: ExplainTier, email?: string): OperatorIdentity {
  return {
    subject,
    tier,
    principalId: `p-${subject}`,
    tenant: 'tenant-x',
    role: 'tenant-admin',
    ...(email !== undefined ? { email } : {}),
  };
}

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

  it('the platform global-admin carries Admin clearance (live-found 2026-07-22)', () => {
    // Without this mapping the box owner fail-closed to User (Internal clearance) and could not
    // read Confidential engine records: the LUG directory + the Overview users lane read empty.
    expect(deriveTier(['global-admin'])).toBe('Admin');
  });
});

describe('SessionStore', () => {
  it('creates a session with a random id and resolves it', () => {
    const store = new SessionStore(10, () => 1000);
    const session = store.create(identity('auth0|abc', 'Admin', 'op@x.io'), 5000);
    expect(session.sessionId).toHaveLength(64); // 32 random bytes as hex
    expect(session.expiresAt).toBe(6000);
    expect(store.get(session.sessionId)).toEqual(session);
  });

  it('expires a session (fail-closed) and removes it', () => {
    let now = 0;
    const store = new SessionStore(10, () => now);
    const { sessionId } = store.create(identity('s', 'User'), 1000);
    now = 999;
    expect(store.get(sessionId)).toBeDefined();
    now = 1000;
    expect(store.get(sessionId)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('destroys a session (logout) and is bounded', () => {
    const store = new SessionStore(2, () => 0);
    const a = store.create(identity('a', 'User'), 10_000);
    store.create(identity('b', 'User'), 10_000);
    store.create(identity('c', 'User'), 10_000); // evicts the oldest
    expect(store.size).toBe(2);
    expect(store.get(a.sessionId)).toBeUndefined();
    const b = store.create(identity('d', 'User'), 10_000);
    store.destroy(b.sessionId);
    expect(store.get(b.sessionId)).toBeUndefined();
  });

  it('mints unique session ids', () => {
    const store = new SessionStore(10, () => 0);
    const s1 = store.create(identity('a', 'User'), 1000);
    const s2 = store.create(identity('a', 'User'), 1000);
    expect(s1.sessionId).not.toBe(s2.sessionId);
  });
});

describe('operatorFromClaims', () => {
  const ROLE = 'https://yousource.ai/roles';
  const rbac = {
    groupRoles: { 'console-admin': { role: 'tenant-admin' as const, tenant: 'tenant-x' } },
    localRbac: {},
  };

  it('resolves subject/tier/principal/tenant/role from verified claims + RBAC', () => {
    const op = operatorFromClaims(
      { sub: 'auth0|123', email: 'op@x.io', [ROLE]: ['console-admin'] },
      ROLE,
      rbac,
    );
    expect(op?.subject).toBe('auth0|123');
    expect(op?.email).toBe('op@x.io');
    expect(op?.tier).toBe('Admin');
    expect(op?.tenant).toBe('tenant-x');
    expect(op?.role).toBe('tenant-admin');
    expect(op?.principalId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('fails closed (undefined) when the operator has no resolvable authority', () => {
    // A group that is not in the RBAC map -> no tenant -> login refused.
    expect(operatorFromClaims({ sub: 'x', [ROLE]: ['unknown'] }, ROLE, rbac)).toBeUndefined();
    // No group at all, and no local RBAC entry -> refused.
    expect(operatorFromClaims({ sub: 'x' }, ROLE, rbac)).toBeUndefined();
  });
});
