# Caching

Where each kind of data lives, how long it is trusted, and what replaces it. Values come from `src/features/telemetry/config.ts` (`STORE`, `QUERY_POLICY`, `API`) and `src/shared/api/config.ts` (`QUERY_DEFAULTS`, `RETRY`, `PERSISTENCE`). The reasoning per resource is in [ADR 0016](adr/0016-cache-policy-and-staleness.md), and persistence is in [ADR 0017](adr/0017-indexeddb-persistence.md).

## Two kinds of data, two stores

| Live data                                                    | Server data                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Readings pushed over WebSocket (or by the simulator worker)  | Resources fetched on request through `TelemetryApi` (REST or Demo) |
| Zustand store (latest state) + typed-array ring buffers      | TanStack Query cache (memory), optionally IndexedDB                |
| Written by `TelemetryService`, at most one publish per frame | Written by TanStack Query from `queryFn` results                   |
| Read with `live.ts` hooks                                    | Read with `useDevices`, `useHistoricalReadings`, and so on         |

The boundary is strict, in both directions:

- Live readings never go into the Query cache, and no hook in `api/hooks.ts` reads the Zustand store.
- Server responses are never copied into the Zustand store or the ring buffers.

A chart that shows "the last 24 hours up to now" combines both: the historical range from the Query cache, and the most recent samples from the ring buffer. A range that reaches "now" is refetched at most every 30 seconds, because the ring buffer covers the gap in between (see readings below). Combining the two in one chart is Phase 5 work.

## Policy per data type

"Fresh" means TanStack serves the cached value without refetching. "gcTime" is how long an entry stays in memory after the last component using it unmounts. Only entries still in memory are written to IndexedDB, so gcTime also bounds persistence.

| Data                                             | Where                                   | Freshness                                                                                  | Invalidation / replacement                                                                                                                                        | Persisted                      | Why                                                                                                                                     |
| ------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Latest reading and status per device             | Zustand store                           | Live: replaced by every published frame. A device with no message for 15 s is shown stale. | Overwritten per frame. `TelemetryService.start()` resets the store (new session or mode).                                                                         | No                             | Changes every second. A persisted value would be wrong on the next frame.                                                               |
| Recent samples per device and metric             | Ring buffers (1800 samples × 5 metrics) | Live: append-only.                                                                         | The oldest sample is overwritten when a buffer is full (30 min at 1 Hz). Reset with the store on `start()`.                                                       | No                             | Fixed memory, no allocation per sample (ADR 0012). Server history covers anything older.                                                |
| Device list                                      | Query cache                             | 60 s                                                                                       | Refetched when stale and observed, on window focus, and on reconnect. Mode is part of the key.                                                                    | Yes                            | Fleet membership changes rarely.                                                                                                        |
| Device detail (metadata + latest stored reading) | Query cache                             | 30 s, gcTime 10 min                                                                        | Same triggers as above.                                                                                                                                           | No                             | The live stream supersedes `latest` within seconds, so a restored value would only show something older than what is about to arrive.   |
| Historical readings, range ended before now      | Query cache                             | Forever (`staleTime` = `Infinity`)                                                         | Never refetched while cached. Evicted 30 min after its last observer leaves.                                                                                      | Yes                            | The simulated (and recorded) past does not change.                                                                                      |
| Historical readings, range reaching now          | Query cache                             | 30 s                                                                                       | Refetched when stale. Once its `to` is in the past, the same entry becomes fresh forever (`staleTime` is a function evaluated at check time).                     | Yes                            | The range grows by one sample every 10 s, but the live ring buffer shows the newest data in the meantime.                               |
| Alert history                                    | Query cache                             | 15 s, gcTime 10 min                                                                        | Refetched when stale and observed.                                                                                                                                | No                             | New alerts can fire any minute, and recomputing is cheap.                                                                               |
| Alert rules                                      | Query cache                             | 5 min, gcTime 24 h                                                                         | Today: staleness only. Phase 4B: every rule mutation invalidates `['telemetry', mode, 'alerts']`, which covers rules and history, since rules change the history. | Yes                            | Rules change only through this client's own mutations.                                                                                  |
| Anything without its own policy                  | Query cache                             | 30 s, gcTime 5 min (`QUERY_DEFAULTS`)                                                      | Default triggers.                                                                                                                                                 | No (not in the persist policy) | Safe fallback. Every telemetry resource sets its own policy.                                                                            |
| Persisted query snapshot                         | IndexedDB, one record per mode          | Entries older than 24 h, or dated in the future, are skipped on restore.                   | Rewritten 1 s after the cache settles (debounced). Discarded on a buster or format-version mismatch, or if invalid or over 1 MiB.                                 | n/a                            | A fast first paint on revisit. Everything restored still follows the freshness rules above, so stale data is refetched right away.      |
| Service worker caches                            | Phase 4B                                | Phase 4B                                                                                   | Phase 4B                                                                                                                                                          | Phase 4B                       | Not built yet. The service worker (vite-plugin-pwa) is the reason MSW stays test-only ([ADR 0015](adr/0015-repository-abstraction.md)). |

The 24 h gcTime for the device list and alert rules is long on purpose: they are small, and keeping them lets the persisted snapshot include them even when no screen shows them.

### Failures and retries

Every query fails with `ApiError`. Network errors, timeouts, 5xx and 429 are retried up to 3 times, with a backoff of 500 ms, 1 s and 2 s (capped at 8 s). 4xx and validation errors are never retried, because retrying cannot fix them. Mutations are never retried automatically, because a retried POST could create a rule twice.

## Keys and invalidation

Keys are hierarchical, and the mode is the second level (`api/query-keys.ts`):

```
['telemetry', mode]                                   everything for one mode
['telemetry', mode, 'devices', 'list']
['telemetry', mode, 'devices', 'detail', id]
['telemetry', mode, 'devices', 'readings', id, {metric, from, to, maxPoints}]
['telemetry', mode, 'alerts', 'rules']
['telemetry', mode, 'alerts', 'history', {from, to, limit}]
```

- Demo and live data can never share an entry, so switching modes needs no cache clearing for correctness.
- Every level is a prefix of the next, so `invalidateQueries({ queryKey: ['telemetry', mode, 'devices', 'readings', id] })` drops every range of one device, and `['telemetry', mode, 'alerts']` covers rules and history together.

No application code calls `invalidateQueries` yet (a test checks the targeted case). The mutations that need it are Phase 4B.

## Known limitations

- **One gcTime for every readings range.** `gcTime` is a plain number fixed when the query is created: TanStack's types allow a function for `staleTime` (evaluated whenever freshness is checked) but not for `gcTime`. A range that reaches "now" today is in the past an hour later, so a gcTime chosen at creation would be wrong for it. All ranges therefore share one value, 30 minutes, which suits past ranges (zooming back and forth) and is longer than a growing range needs.
- **The debounce can postpone writes.** Persistence is debounced, not throttled. A cache that changes at least once a second is not written until it settles. With the policies above, the fastest refetch is every 15 s, so the cache does settle in practice. A tab closed less than 1 s after the last change loses that change, and the next visit refetches it.
- **Nothing is wired into the app yet.** `AppProviders` creates the QueryClient, but no screen calls the hooks, and `setupTelemetryPersistence` is not called at startup. Phase 5 wires them. The policies above are covered by unit tests (`api/hooks.test.tsx`, `api/persistence.test.ts`).
