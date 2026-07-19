// apps/bff/src/cache.ts -- the ephemeral, version-tagged, non-authoritative cache (F0.3).
//
// INV-CONSOLE-NO-2ND-DB: the BFF persists NO durable domain data. This is the only state it keeps for
// reads -- an in-memory, bounded, short-TTL cache that is a projection of engine state, never a system of
// record. Each entry is tagged with the engine commit version it was read at; a lookup at a newer version
// misses (the entry is stale), so the cache can be invalidated by a version bump without tracking keys.
// It is bounded by a max entry count (oldest evicted) so memory cannot grow without bound.

interface Entry<V> {
  readonly value: V;
  readonly version: string;
  readonly expiresAt: number;
}

/** A clock function, injectable for deterministic tests. Defaults to `Date.now`. */
export type Clock = () => number;

export class EphemeralCache<V> {
  private readonly entries = new Map<string, Entry<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: Clock = Date.now,
  ) {}

  /**
   * Return the cached value for `key` iff it exists, has not expired, AND was stored at `version`
   * (a newer engine version makes the entry stale). Otherwise `undefined` (a miss).
   */
  get(key: string, version: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.version !== version || entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Store `value` for `key` at `version`, evicting the oldest entry if at capacity. */
  set(key: string, value: V, version: string): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, version, expiresAt: this.now() + this.ttlMs });
  }

  /**
   * Drop every entry whose key starts with `prefix`. Used after an audited mutation: the projection of a
   * store the operator just changed must not be served again from cache, or their own edit would appear
   * not to have taken. Callers scope the prefix by tenant so one tenant's write never evicts another's.
   */
  deletePrefix(prefix: string): void {
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  /** Drop everything (e.g. on session end). */
  clear(): void {
    this.entries.clear();
  }

  /** Current entry count (test observation of the bound). */
  get size(): number {
    return this.entries.size;
  }
}
