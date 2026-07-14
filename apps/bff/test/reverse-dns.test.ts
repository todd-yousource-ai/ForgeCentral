import { describe, expect, it } from 'vitest';

import { ipOf, ReverseDnsResolver } from '../src/engine/reverse-dns.js';

/** Flush pending microtasks + timers so the resolver's fire-and-forget background pass completes. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('ipOf', () => {
  it('strips a trailing port from an IPv4:port endpoint and leaves a bare IP unchanged', () => {
    expect(ipOf('140.82.112.5:443')).toBe('140.82.112.5');
    expect(ipOf('8.8.8.8')).toBe('8.8.8.8');
  });
});

describe('ReverseDnsResolver', () => {
  it('returns names only after background resolution, then serves them keyed by the original address', async () => {
    const map: Record<string, string[]> = {
      '140.82.112.5': ['github.com'],
      '8.8.8.8': ['dns.google'],
    };
    const reverse = (ip: string): Promise<string[]> => Promise.resolve(map[ip] ?? []);
    const resolver = new ReverseDnsResolver({}, { now: () => 1000, reverse });

    // First call: nothing cached -> empty result, background resolution kicked off.
    expect(resolver.namesFor(['140.82.112.5:443', '8.8.8.8'])).toEqual(new Map());
    await flush();
    // Second call: resolved names now cached, keyed by the original address (port preserved).
    expect(resolver.namesFor(['140.82.112.5:443', '8.8.8.8'])).toEqual(
      new Map([
        ['140.82.112.5:443', 'github.com'],
        ['8.8.8.8', 'dns.google'],
      ]),
    );
  });

  it('caches a miss so a nameless IP is not re-queried (caller falls back to the IP)', async () => {
    let calls = 0;
    const reverse = (): Promise<string[]> => {
      calls += 1;
      return Promise.resolve([]);
    };
    const resolver = new ReverseDnsResolver({}, { now: () => 1000, reverse });

    resolver.namesFor(['10.0.0.9']);
    await flush();
    // No PTR name -> omitted from the map (the projection uses the IP), and the miss is cached.
    expect(resolver.namesFor(['10.0.0.9'])).toEqual(new Map());
    await flush();
    expect(calls).toBe(1);
  });

  it('re-resolves after the TTL expires', async () => {
    let calls = 0;
    const reverse = (): Promise<string[]> => {
      calls += 1;
      return Promise.resolve(['host.example']);
    };
    let clock = 1000;
    const resolver = new ReverseDnsResolver({ ttlMs: 100 }, { now: () => clock, reverse });

    resolver.namesFor(['1.2.3.4']);
    await flush();
    resolver.namesFor(['1.2.3.4']); // within TTL -> served from cache, no new lookup
    await flush();
    expect(calls).toBe(1);

    clock += 200; // advance past the TTL
    resolver.namesFor(['1.2.3.4']);
    await flush();
    expect(calls).toBe(2);
  });
});
