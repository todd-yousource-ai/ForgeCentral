// apps/bff/test/auth-cookie.test.ts -- F0.5a-2 session cookie parse + serialize.

import { describe, expect, it } from 'vitest';

import {
  clearSessionCookie,
  parseCookies,
  readCookie,
  serializeSessionCookie,
} from '../src/auth/cookie.js';

const opts = { name: 'fc_session', secure: true } as const;

describe('parseCookies', () => {
  it('parses a multi-cookie header', () => {
    const map = parseCookies('a=1; fc_session=abc; b=2');
    expect(map.get('fc_session')).toBe('abc');
    expect(map.get('a')).toBe('1');
  });

  it('returns empty for a missing or empty header', () => {
    expect(parseCookies(undefined).size).toBe(0);
    expect(parseCookies('').size).toBe(0);
  });

  it('ignores malformed segments and keeps the first of a duplicate', () => {
    const map = parseCookies('=nokey; onlyname; fc_session=first; fc_session=second');
    expect(map.get('fc_session')).toBe('first');
    expect(map.has('onlyname')).toBe(false);
  });

  it('readCookie pulls one value by name', () => {
    expect(readCookie('x=1; fc_session=tok', 'fc_session')).toBe('tok');
    expect(readCookie('x=1', 'fc_session')).toBeUndefined();
  });
});

describe('serializeSessionCookie', () => {
  it('emits the hardened attributes', () => {
    const c = serializeSessionCookie('tok', 3600, opts);
    expect(c).toContain('fc_session=tok');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Strict');
    expect(c).toContain('Path=/');
    expect(c).toContain('Max-Age=3600');
    expect(c).toContain('Secure');
  });

  it('omits Secure when not configured (local plain-HTTP)', () => {
    expect(serializeSessionCookie('tok', 60, { name: 'fc_session', secure: false })).not.toContain(
      'Secure',
    );
  });

  it('clearSessionCookie expires the cookie immediately', () => {
    const c = clearSessionCookie(opts);
    expect(c).toContain('fc_session=;');
    expect(c).toContain('Max-Age=0');
  });
});
