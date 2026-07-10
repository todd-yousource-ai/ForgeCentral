// apps/bff/test/auth-login-store.test.ts -- F0.5a-2 in-flight device-login store.

import { describe, expect, it } from 'vitest';

import { PendingLoginStore } from '../src/auth/login-store.js';

describe('PendingLoginStore', () => {
  it('creates a login with a random id and resolves it', () => {
    const store = new PendingLoginStore(10, () => 1000);
    const login = store.create({ deviceCode: 'DC', intervalSecs: 5 }, 5000);
    expect(login.loginId).toHaveLength(64);
    expect(login.expiresAt).toBe(6000);
    expect(store.get(login.loginId)).toEqual(login);
  });

  it('expires a login (fail-closed) and removes it', () => {
    let now = 0;
    const store = new PendingLoginStore(10, () => now);
    const { loginId } = store.create({ deviceCode: 'DC', intervalSecs: 5 }, 1000);
    now = 999;
    expect(store.get(loginId)).toBeDefined();
    now = 1000;
    expect(store.get(loginId)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('is bounded (evicts the oldest) and can be destroyed', () => {
    const store = new PendingLoginStore(2, () => 0);
    const a = store.create({ deviceCode: 'A', intervalSecs: 5 }, 10_000);
    store.create({ deviceCode: 'B', intervalSecs: 5 }, 10_000);
    store.create({ deviceCode: 'C', intervalSecs: 5 }, 10_000); // evicts A
    expect(store.size).toBe(2);
    expect(store.get(a.loginId)).toBeUndefined();
    const d = store.create({ deviceCode: 'D', intervalSecs: 5 }, 10_000);
    store.destroy(d.loginId);
    expect(store.get(d.loginId)).toBeUndefined();
  });

  it('mints unique login ids', () => {
    const store = new PendingLoginStore(10, () => 0);
    const a = store.create({ deviceCode: 'X', intervalSecs: 5 }, 1000);
    const b = store.create({ deviceCode: 'X', intervalSecs: 5 }, 1000);
    expect(a.loginId).not.toBe(b.loginId);
  });
});
