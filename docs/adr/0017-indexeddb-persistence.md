# 0017. IndexedDB persistence of the query cache

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

On a revisit, the dashboard should show the device list, recent history and alert rules immediately, then refresh them. This is a fast first paint, and later (4B) an offline fallback. The TanStack Query cache lives in memory, so it has to be written somewhere that survives a reload.

The constraints:

- **Storage is untrusted:** anything with access to the origin can write it, including an older build of Pulse ([security.md](../security.md#persisted-data-is-untrusted)).
- **Formats change:** the stored format will change across releases, and old records must be upgraded or discarded, never misread.
- **Modes stay apart:** demo and live data must never mix.
- **Bounded storage:** storage is shared with the origin, and quota errors or a blocked database must not break the app.
- **Off the critical path:** persistence must not slow down the UI.

## Decision

1. **Storage:** IndexedDB through `idb-keyval` (database `pulse`, store `query-cache`). It is asynchronous, has a much larger quota than `localStorage`, and is available in workers. Where IndexedDB is missing, persistence is off and the app is memory-only.
2. **A small custom persister** (`src/shared/api/persistence.ts`, generic) plus a telemetry policy (`features/telemetry/api/persistence.ts`). We do not use TanStack's official persister.
3. **What is persisted:** only the device list, readings ranges and alert rules, for the current mode, and only successful queries. Each is validated by its contract schema. Device detail, alert history and live data are never persisted (ADR 0016 explains why per resource). There is nothing secret in these resources.
4. **Format and migrations:** the format is our own, versioned record (`version`, `buster`, `savedAt`, `entries: [{key, updatedAt, data}]`), independent of TanStack's internal dehydrated shape. Migrations are keyed by the version they upgrade from (v1 to v2 exists and is tested). Each migration parses its own input, and versions without a path are discarded. `API.PERSISTED_CACHE_BUSTER` discards records written for another response shape.
5. **Validation on restore:**
   - the record is size-capped, parsed with the prototype-safe parser, migrated, and checked against a strict schema;
   - each entry is validated by its resource's schema, and must be at most 24 h old and not dated in the future;
   - invalid entries are skipped and the rest restored; an invalid record is deleted. Restore never throws.
6. **Caps and eviction on write:** at most 50 entries and 1 MiB of UTF-8 per mode. Entries are written newest first, and the first one that does not fit stops the write, so the oldest are evicted. Writes are debounced (1 s after the cache settles).
7. **Failures:** I/O is abandoned after 2 s. A quota error, a timeout or a blocked database switches the session to memory-only, silently.
8. **Per-mode namespacing:** one record per mode (`pulse.query-cache.telemetry.demo` and `pulse.query-cache.telemetry.live`). The policy also refuses any key whose mode segment differs from the current mode, so a demo entry cannot be restored into Live Mode even if it ends up in the wrong record.

## Alternatives considered

- **The official persister** (`@tanstack/react-query-persist-client` with `@tanstack/query-async-storage-persister`, both 5.107.1).
  - **What it offers:** `buster`, `maxAge`, throttled saves, `serialize`/`deserialize` hooks, a `retry` strategy for failed saves, and `dehydrateOptions` to filter what is saved.
  - **Why not:** per-entry validation (skip one bad entry, keep the others), version migrations and a byte cap with newest-first eviction would all have to live inside `deserialize`/`retry`, operating on TanStack's dehydrated format (`queries[].state`, `queryHash`, ...). That format is an implementation detail of the TanStack version, and we would be validating it rather than our own.
  - **Size:** it is smaller, measured below.
- **localStorage.** It is synchronous (it blocks the main thread on a 1 MiB write), limited to about 5 MB per origin in common browsers, and only stores strings. It is also where small UI preferences belong, not the query cache.
- **No persistence (refetch on every load).** Correct, but every visit starts with skeletons, and 4B's offline mode would have nothing to show.
- **Persisting everything, including live buffers.** Live data is outdated within seconds, and the ring buffers are about 141 KiB per device. Restoring them would show old values as if they were live.

**Size measurement.** Both persisters were bundled with Vite 8 in library mode (`minify: true`, ES module), with React, TanStack Query core, idb-keyval and Zod external, then compressed with Node's `zlib.gzipSync` at level 9. The official one was installed in a scratch directory, never in the project.

| Persister                                                                       | Minified | Gzip    |
| ------------------------------------------------------------------------------- | -------- | ------- |
| Official: `persistQueryClient` + `createAsyncStoragePersister`                  | 3,241 B  | 1,300 B |
| Custom: `src/shared/api/persistence.ts` at commit d7d61c1 (before this session) | 5,472 B  | 2,162 B |
| Custom: current (after the linear-time serializer fix)                          | 5,590 B  | 2,195 B |

An earlier measurement, whose exact method was not recorded, gave 1,291 B (official) and 2,146 B (custom). This method reproduces both within 1 %: 1,300 vs 1,291 B, and 2,162 vs 2,146 B for the same code (d7d61c1). Either way, the custom persister costs about 0.9 kB gzip more. We accept that for validation, migrations and caps we control.

## Consequences

- **Positive:**
  - Restored data passes the same schemas as network data.
  - The stored format is ours and versioned.
  - Demo and live data cannot mix.
  - Storage problems degrade to memory-only instead of failing.
  - Measured in Chromium: restoring a typical cache (14 queries, 91 KiB) takes about 3 to 4 ms; a cache near the cap (38 entries, 995 KiB) takes 32 to 65 ms (p50, across two runs) ([performance.md](../performance.md#phase-4a-data-access-layer)).
- **Negative:**
  - About 0.9 kB gzip more than the official persister, and code we maintain, covered by `persistence.test.ts`.
  - A write near the cap costs about 12 to 14 ms of main-thread time (debounced, at most once per settled second). Phase 6 can move serialization to a worker if that matters.
  - Validation proves well-formedness, not authenticity (security.md).
- **Follow-up:**
  - Phase 5 calls `setupTelemetryPersistence` at startup and on mode switch.
  - 4B decides how persisted data is shown while offline.
