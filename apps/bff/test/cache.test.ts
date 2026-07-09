// apps/bff/test/cache.test.ts -- F0.3 ephemeral cache (TTL, version tag, bound).

import { describe, expect, it } from 'vitest';

import { EphemeralCache } from '../src/cache.js';

describe('EphemeralCache', () => {
  it('returns a fresh value at the matching version', () => {
    const cache = new EphemeralCache<string>(1000, 10, () => 0);
    cache.set('k', 'v', 'ver-1');
    expect(cache.get('k', 'ver-1')).toBe('v');
  });

  it('misses when the engine version has moved on (stale)', () => {
    const cache = new EphemeralCache<string>(1000, 10, () => 0);
    cache.set('k', 'v', 'ver-1');
    expect(cache.get('k', 'ver-2')).toBeUndefined();
  });

  it('expires an entry after its TTL', () => {
    let now = 0;
    const cache = new EphemeralCache<string>(1000, 10, () => now);
    cache.set('k', 'v', 'ver-1');
    now = 999;
    expect(cache.get('k', 'ver-1')).toBe('v');
    now = 1000;
    expect(cache.get('k', 'ver-1')).toBeUndefined();
  });

  it('is bounded: evicts the oldest entry at capacity', () => {
    const cache = new EphemeralCache<number>(10_000, 2, () => 0);
    cache.set('a', 1, 'v');
    cache.set('b', 2, 'v');
    cache.set('c', 3, 'v'); // evicts 'a'
    expect(cache.size).toBe(2);
    expect(cache.get('a', 'v')).toBeUndefined();
    expect(cache.get('b', 'v')).toBe(2);
    expect(cache.get('c', 'v')).toBe(3);
  });

  it('clears everything', () => {
    const cache = new EphemeralCache<string>(1000, 10, () => 0);
    cache.set('k', 'v', 'ver-1');
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
