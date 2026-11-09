import { createStore, del, get, set } from 'idb-keyval';
import { z } from 'zod/mini';

import { parseJsonSafely } from '../lib/safe-json';
import { PERSISTENCE } from './config';

import type { QueryClient, QueryKey } from '@tanstack/react-query';

/* ---------------------------------------------------------------------------------------------- */
/* Storage                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

/** Minimal async key-value storage (IndexedDB in browsers, memory in tests). */
export interface KeyValueStorage {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: string) => Promise<void>;
  del: (key: string) => Promise<void>;
}

const DATABASE = 'pulse';
const OBJECT_STORE = 'query-cache';

/** IndexedDB via idb-keyval, or null where IndexedDB does not exist (old browsers, some tests). */
export function createIdbStorage(): KeyValueStorage | null {
  if (typeof globalThis.indexedDB === 'undefined') return null;
  try {
    const store = createStore(DATABASE, OBJECT_STORE);
    return {
      get: (key) => get(key, store),
      set: (key, value) => set(key, value, store),
      del: (key) => del(key, store),
    };
  } catch {
    return null;
  }
}

export function createMemoryStorage(): KeyValueStorage & { readonly data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: (key) => Promise.resolve(data.get(key)),
    set: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    del: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* Persisted format and migrations                                                                */
/* ---------------------------------------------------------------------------------------------- */

/** JSON-safe query keys: arrays of strings, numbers, null, or flat records of those. */
const keyPartSchema = z.union([
  z.string(),
  z.number(),
  z.null(),
  z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
]);
const queryKeySchema = z.array(keyPartSchema).check(z.minLength(1));

/** Current (v2) format: one record per namespace. Entry data is validated separately per resource. */
const recordSchemaV2 = z.strictObject({
  version: z.literal(PERSISTENCE.SCHEMA_VERSION),
  buster: z.string(),
  savedAt: z.number(),
  entries: z.array(
    z.strictObject({ key: queryKeySchema, updatedAt: z.number(), data: z.unknown() }),
  ),
});
/** What the writer produces (keys come from live queries; the reader re-validates them). */
interface StoredRecord {
  version: number;
  buster: string;
  savedAt: number;
  entries: { key: unknown[]; updatedAt: number; data: unknown }[];
}

/**
 * Migrations, keyed by the version they upgrade FROM. Each receives untrusted data and returns
 * the next version's shape (still validated afterwards). Versions without a path are discarded.
 *
 * v1 -> v2: v1 stored a redundant `queryHash` per entry and no record-level `savedAt`.
 */
const recordSchemaV1 = z.object({
  version: z.literal(1),
  buster: z.string(),
  entries: z.array(
    z.object({ queryHash: z.string(), key: z.unknown(), updatedAt: z.number(), data: z.unknown() }),
  ),
});

const MIGRATIONS: ReadonlyMap<number, (record: unknown) => unknown> = new Map([
  [
    1,
    (record: unknown) => {
      const v1 = recordSchemaV1.parse(record);
      return {
        version: 2,
        buster: v1.buster,
        savedAt: Math.max(0, ...v1.entries.map((entry) => entry.updatedAt)),
        entries: v1.entries.map(({ key, updatedAt, data }) => ({ key, updatedAt, data })),
      };
    },
  ],
]);

const versionOf = (value: unknown): number | null => {
  const parsed = z.object({ version: z.int() }).safeParse(value);
  return parsed.success ? parsed.data.version : null;
};

/** Upgrades an untrusted record to the current version, or returns null if impossible. */
export function migrateRecord(value: unknown): unknown {
  let current = value;
  let version = versionOf(current);
  while (version !== null && version < PERSISTENCE.SCHEMA_VERSION) {
    const migrate = MIGRATIONS.get(version);
    if (!migrate) return null;
    try {
      current = migrate(current);
    } catch {
      return null;
    }
    version = versionOf(current);
  }
  return version === PERSISTENCE.SCHEMA_VERSION ? current : null;
}

/* ---------------------------------------------------------------------------------------------- */
/* Restore and persist                                                                            */
/* ---------------------------------------------------------------------------------------------- */

export interface PersistPolicy {
  /** Validator for a key's data if the key may be persisted, null otherwise. */
  schemaFor: (key: QueryKey) => z.ZodMiniType | null;
}

export interface QueryPersistenceOptions {
  client: QueryClient;
  /** null: storage unavailable, memory-only. */
  storage: KeyValueStorage | null;
  /** Separates records (e.g. "telemetry.demo" vs "telemetry.live"). */
  namespace: string;
  /** Changes whenever cached data shapes change; a mismatch discards the record. */
  buster: string;
  policy: PersistPolicy;
  now?: () => number;
  limits?: Partial<{ maxBytes: number; maxEntries: number; maxAgeMs: number }>;
}

export type RestoreReport =
  | { status: 'restored'; restored: number; skipped: number }
  | { status: 'empty' | 'unavailable' }
  | {
      status: 'discarded';
      reason: 'storage_error' | 'too_large' | 'invalid' | 'version' | 'buster';
    };

const encoder = new TextEncoder();
const storageKey = (namespace: string) => `pulse.query-cache.${namespace}`;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('storage timeout'));
    }, PERSISTENCE.IO_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('storage error'));
      },
    );
  });
}

const limitsOf = (limits: QueryPersistenceOptions['limits']) => ({
  maxBytes: limits?.maxBytes ?? PERSISTENCE.MAX_BYTES,
  maxEntries: limits?.maxEntries ?? PERSISTENCE.MAX_ENTRIES,
  maxAgeMs: limits?.maxAgeMs ?? PERSISTENCE.MAX_AGE_MS,
});

/**
 * Restores persisted queries into `client`. Everything read is untrusted: size-capped, parsed
 * without prototype keys, migrated, schema-checked per entry. Invalid records are deleted; invalid
 * entries are skipped. Never throws.
 */
export async function restoreQueryCache(options: QueryPersistenceOptions): Promise<RestoreReport> {
  const { client, storage, namespace, buster, policy, now = () => Date.now() } = options;
  const limits = limitsOf(options.limits);
  if (!storage) return { status: 'unavailable' };
  const key = storageKey(namespace);

  const discard = async (
    reason: Extract<RestoreReport, { status: 'discarded' }>['reason'],
  ): Promise<RestoreReport> => {
    try {
      await withTimeout(storage.del(key));
    } catch {
      // Could not delete either: nothing else to do.
    }
    return { status: 'discarded', reason };
  };

  let raw: unknown;
  try {
    raw = await withTimeout(storage.get(key));
  } catch {
    return { status: 'discarded', reason: 'storage_error' };
  }
  if (raw === undefined) return { status: 'empty' };
  if (typeof raw !== 'string') return discard('invalid');
  if (raw.length > limits.maxBytes || encoder.encode(raw).length > limits.maxBytes)
    return discard('too_large');

  const json = parseJsonSafely(raw);
  if (!json.ok) return discard('invalid');
  const migrated = migrateRecord(json.value);
  if (migrated === null) return discard('version');
  const record = recordSchemaV2.safeParse(migrated);
  if (!record.success) return discard('invalid');
  if (record.data.buster !== buster) return discard('buster');

  let restored = 0;
  let skipped = 0;
  const oldest = now() - limits.maxAgeMs;
  for (const entry of record.data.entries.slice(0, limits.maxEntries)) {
    const schema = policy.schemaFor(entry.key);
    const data = schema?.safeParse(entry.data);
    if (!data?.success || entry.updatedAt < oldest || entry.updatedAt > now()) {
      skipped += 1;
      continue;
    }
    client.setQueryData(entry.key, data.data, { updatedAt: entry.updatedAt });
    restored += 1;
  }
  return { status: 'restored', restored, skipped };
}

/** Builds the record to store: allowed successful queries, newest first, within the caps. */
export function serializeQueryCache(options: QueryPersistenceOptions): string {
  const { client, buster, policy, now = () => Date.now() } = options;
  const limits = limitsOf(options.limits);
  const candidates = client
    .getQueryCache()
    .getAll()
    .filter(
      (query) => query.state.status === 'success' && policy.schemaFor(query.queryKey) !== null,
    )
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);

  const record: StoredRecord = {
    version: PERSISTENCE.SCHEMA_VERSION,
    buster,
    savedAt: now(),
    entries: [],
  };
  // Size is tracked incrementally: the record's JSON is the empty record's JSON plus each entry's
  // JSON and one comma between entries. Re-stringifying the whole record per entry made a write
  // near the byte cap quadratic (docs/performance.md has the before/after measurement).
  let bytes = encoder.encode(JSON.stringify(record)).length;
  for (const query of candidates) {
    if (record.entries.length >= limits.maxEntries) break;
    const entry = {
      key: [...query.queryKey],
      updatedAt: query.state.dataUpdatedAt,
      data: query.state.data,
    };
    const added =
      encoder.encode(JSON.stringify(entry)).length + (record.entries.length > 0 ? 1 : 0);
    // Evict: this entry (older than every entry already kept) does not fit.
    if (bytes + added > limits.maxBytes) break;
    record.entries.push(entry);
    bytes += added;
  }
  return JSON.stringify(record);
}

/**
 * Writes the cache to storage (debounced) whenever queries change. Write failures (quota,
 * blocked database) switch to memory-only for the rest of the session, silently. Returns a
 * function that stops persisting.
 */
export function persistQueryCache(options: QueryPersistenceOptions): () => void {
  const { client, storage, namespace } = options;
  if (!storage) return () => undefined;
  let disabled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = async () => {
    timer = null;
    if (disabled) return;
    try {
      await withTimeout(storage.set(storageKey(namespace), serializeQueryCache(options)));
    } catch {
      disabled = true; // quota exceeded, blocked or broken: memory-only from now on
    }
  };

  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (disabled || (event.type !== 'updated' && event.type !== 'removed')) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      void write();
    }, PERSISTENCE.WRITE_DEBOUNCE_MS);
  });

  return () => {
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}
