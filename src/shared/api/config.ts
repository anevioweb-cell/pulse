// Limits of the generic data-access layer (fetch wrapper, retries, persistence). Each value
// states why. Resource-specific cache policy lives with the resources (telemetry config.ts).

const MS_PER_SECOND = 1000;
const KIB = 1024;
const MS_PER_HOUR = 60 * 60 * MS_PER_SECOND;

export const HTTP = {
  /** A request with no complete response after 10 s is reported as a timeout (and retried). */
  TIMEOUT_MS: 10 * MS_PER_SECOND,
  /**
   * Largest accepted response body. The biggest legitimate payload is a readings series at the
   * 2000-point cap (36-44 KB of JSON, measured) or a 256-device list (~26 KB at the measured
   * ~100 B per device); 512 KiB is >10x headroom while keeping a hostile or buggy server from
   * filling memory.
   */
  MAX_RESPONSE_BYTES: 512 * KIB,
  /** Validation issues kept in an error (enough to debug, bounded for logs and UI). */
  MAX_ERROR_ISSUES: 10,
  /** Server error messages are cut to this length before they reach the UI. */
  MAX_ERROR_MESSAGE_LENGTH: 200,
} as const;

export const QUERY_DEFAULTS = {
  /**
   * Fallback freshness for queries that do not set their own (every telemetry resource does; see
   * docs/caching.md): 30 s fresh, 5 min in memory after the last observer leaves.
   */
  STALE_TIME_MS: 30 * MS_PER_SECOND,
  GC_TIME_MS: 5 * 60 * MS_PER_SECOND,
} as const;

export const RETRY = {
  /** Retries after the first attempt (4 attempts in total) for retryable errors only. */
  MAX_RETRIES: 3,
  /** Exponential backoff: 500 ms, 1 s, 2 s ... capped at 8 s, so the worst case waits ~3.5 s. */
  BASE_DELAY_MS: 500,
  MAX_DELAY_MS: 8 * MS_PER_SECOND,
} as const;

export const PERSISTENCE = {
  /**
   * Persisted cache format version. Bump it when the stored shape changes and add a migration
   * from the previous version (persistence.ts); older unknown versions are discarded.
   */
  SCHEMA_VERSION: 2,
  /** Upper bound on the serialized cache per mode (IndexedDB quotas are shared with the origin). */
  MAX_BYTES: 1024 * KIB,
  /** At most this many queries are persisted; the least recently updated are evicted first. */
  MAX_ENTRIES: 50,
  /** Entries older than a day are dropped on restore: history is cheap to refetch, stale UI is not. */
  MAX_AGE_MS: 24 * MS_PER_HOUR,
  /** Cache writes are debounced: one write per second at most, after the cache settles. */
  WRITE_DEBOUNCE_MS: MS_PER_SECOND,
  /**
   * An IndexedDB read or write that takes longer than 2 s (blocked by another tab, broken
   * storage) is abandoned and persistence falls back to memory-only for the session.
   */
  IO_TIMEOUT_MS: 2 * MS_PER_SECOND,
} as const;
