// apps/bff/src/engine/reverse-dns.ts -- reverse-DNS name resolution for Overview destinations.
//
// crdb returns destination endpoints as IPs (its ConnectsTo capture is 4-octet); the Console Overview
// shows common DNS names. This resolver does PTR lookups (node:dns), CACHES the results, and resolves the
// whole batch in the BACKGROUND so a later read is fully named -- the first read of a new destination shows
// its IP, and subsequent reads show the name once the lookup lands. Reverse-DNS lives here (the BFF), never
// in the engine, so the database performs no DNS egress.
//
// It owns no durable data (INV-CONSOLE-NO-2ND-DB): the cache is in-memory + TTL'd, so a restart simply
// re-resolves. A miss (no PTR record, or a failed/timed-out lookup) is cached too, so a nameless IP is not
// re-queried every read; the caller falls back to the IP itself (INV-CONSOLE-NO-STUB: never a fake name).

import { promises as dns } from 'node:dns';

/** A cached PTR resolution: the name (or `undefined` when the IP has no usable PTR), and when it landed. */
interface CacheEntry {
  readonly name: string | undefined;
  readonly resolvedAtMs: number;
}

/** Tunables for {@link ReverseDnsResolver}. */
export interface ReverseDnsConfig {
  /** How long a resolution (hit or miss) is trusted before it is re-resolved. */
  readonly ttlMs: number;
  /** Per-lookup timeout; a slow resolver must not stall the background pass. */
  readonly lookupTimeoutMs: number;
  /** The maximum number of concurrent PTR lookups (bounds the background load). */
  readonly maxConcurrent: number;
}

// TUNE(IP-CONSOLE-CONNECTIVITY): destination IP -> name mappings are stable, so a 6h TTL avoids re-querying
// hot destinations every read while still refreshing daily; 2s per lookup and 8-wide concurrency keep the
// background pass from stalling or flooding the resolver.
const DEFAULT_CONFIG: ReverseDnsConfig = {
  ttlMs: 6 * 60 * 60 * 1000,
  lookupTimeoutMs: 2000,
  maxConcurrent: 8,
};

/** Test seams: the clock and the PTR function are injectable so the resolver is deterministically testable. */
export interface ReverseDnsDeps {
  readonly now: () => number;
  readonly reverse: (ip: string) => Promise<string[]>;
}

/** Strip a trailing `:port` from an `IP:port` endpoint, leaving the IP PTR lookups take. IPv4 only (torch
 * captures 4-octet); a value that is not `IPv4:port` is returned unchanged. */
export function ipOf(address: string): string {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(address);
  return match?.[1] ?? address;
}

/** The reverse-DNS resolver: a cached, background PTR lookup over destination endpoints. */
export class ReverseDnsResolver {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Set<string>();
  private readonly config: ReverseDnsConfig;
  private readonly now: () => number;
  private readonly reverse: (ip: string) => Promise<string[]>;

  constructor(config?: Partial<ReverseDnsConfig>, deps?: Partial<ReverseDnsDeps>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.now = deps?.now ?? Date.now;
    this.reverse = deps?.reverse ?? ((ip) => dns.reverse(ip));
  }

  /**
   * The best-known names for `addresses` right now: a map `address -> name` for every address whose IP has
   * a FRESH cached PTR name. Addresses with no fresh name are omitted (the caller falls back to the IP) and,
   * together with any stale entries, enqueued for background resolution so the next read has them.
   */
  namesFor(addresses: readonly string[]): Map<string, string> {
    const names = new Map<string, string>();
    const toResolve: string[] = [];
    for (const address of addresses) {
      const ip = ipOf(address);
      const entry = this.cache.get(ip);
      if (entry && this.now() - entry.resolvedAtMs < this.config.ttlMs) {
        if (entry.name !== undefined) {
          names.set(address, entry.name);
        }
      } else {
        toResolve.push(ip);
      }
    }
    if (toResolve.length > 0) {
      void this.resolveInBackground(toResolve);
    }
    return names;
  }

  /** Resolve `ips` (deduped, skipping in-flight) via PTR, bounded to {@link ReverseDnsConfig.maxConcurrent},
   * caching each result (name or miss). Never throws: a failed lookup is cached as a miss. */
  private async resolveInBackground(ips: readonly string[]): Promise<void> {
    const pending = [...new Set(ips)].filter((ip) => !this.inflight.has(ip));
    for (const ip of pending) {
      this.inflight.add(ip);
    }
    const workers: Promise<void>[] = [];
    let cursor = 0;
    const runNext = async (): Promise<void> => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        const ip = pending[index];
        if (ip === undefined) {
          return;
        }
        const name = await this.lookupOne(ip);
        this.cache.set(ip, { name, resolvedAtMs: this.now() });
        this.inflight.delete(ip);
      }
    };
    for (let i = 0; i < Math.min(this.config.maxConcurrent, pending.length); i += 1) {
      workers.push(runNext());
    }
    await Promise.all(workers);
  }

  /** One PTR lookup, bounded by the lookup timeout; the first PTR name, or `undefined` on miss/failure. */
  private async lookupOne(ip: string): Promise<string | undefined> {
    try {
      const names = await withTimeout(this.reverse(ip), this.config.lookupTimeoutMs);
      const name = names.find((n) => n.trim().length > 0)?.trim();
      return name ?? undefined;
    } catch {
      return undefined;
    }
  }
}

/** Reject with a timeout if `op` does not settle within `ms`. */
function withTimeout<T>(op: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('reverse-dns lookup timed out')), ms);
    op.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
