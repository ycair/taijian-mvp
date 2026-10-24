export type TtlCache<T> = {
  /** Returns the cached promise for `key`, or starts `load` and caches it. */
  get(key: string, load: () => Promise<T>): Promise<T>;
  /** Drops one entry so the next `get` re-reads its source. */
  invalidate(key: string): void;
  /** Drops every entry (used by tests and on configuration changes). */
  clear(): void;
};

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 1_000;

/**
 * Promise cache with a time-to-live. It exists so a Firestore transaction that
 * is retried on contention does not repeat outbound LINE/Firebase Auth calls.
 * Rejected promises are never cached: a transient failure must stay retryable.
 */
export function createTtlCache<T>(
  ttlMs = DEFAULT_TTL_MS,
  maxEntries = DEFAULT_MAX_ENTRIES,
): TtlCache<T> {
  const entries = new Map<string, { promise: Promise<T>; expiresAt: number }>();

  function prune(now: number): void {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
  }

  return {
    get(key, load) {
      const now = Date.now();
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now) return hit.promise;

      if (entries.size >= maxEntries) {
        prune(now);
        // A flood of distinct keys must not grow a warm instance without bound.
        if (entries.size >= maxEntries) entries.clear();
      }

      const promise = load();
      entries.set(key, { promise, expiresAt: now + ttlMs });
      promise.catch(() => {
        if (entries.get(key)?.promise === promise) entries.delete(key);
      });
      return promise;
    },
    invalidate(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}
