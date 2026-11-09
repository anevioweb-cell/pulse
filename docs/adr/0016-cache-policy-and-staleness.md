# 0016. Cache policy and staleness per resource

- **Status:** Accepted. The alert-rules row is amended by [0018](0018-demo-alert-rules-persistence.md), which adds revalidation on every mount.
- **Date:** 2026-11-09

## Context

TanStack Query decides when to refetch from two numbers per query:

- `staleTime`: how long data is served without refetching;
- `gcTime`: how long unused data stays in memory (and, here, stays eligible for persistence).

TanStack's own defaults are 0 and 5 minutes. With `staleTime` 0, every mount and every window focus refetches. Pulse's resources differ a lot in how quickly they change:

- a past readings range never changes;
- alert history can change any minute;
- the latest reading per device is pushed by the live stream anyway.

A single global value would be wrong for most of them. [docs/caching.md](../caching.md) lists the result per data type, including the live (Zustand, ring buffer) side.

## Decision

Every telemetry resource sets its own policy in `QUERY_POLICY` (`src/features/telemetry/config.ts`), applied in `api/query-options.ts`:

| Resource                     | staleTime | gcTime | Persisted | Justification                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | --------- | ------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Device list                  | 60 s      | 24 h   | Yes       | Membership changes only when someone adds or removes a device. A minute of staleness is invisible, and the long gcTime keeps the small list available for persistence and instant navigation.                                                                                                                                     |
| Device detail                | 30 s      | 10 min | No        | Its `latest` reading is superseded by the live stream within seconds, so refetching more often buys nothing. Persisting it would only restore something older than what is about to arrive.                                                                                                                                       |
| Readings, range in the past  | Infinity  | 30 min | Yes       | The past does not change, so refetching it is pure waste. 30 minutes keeps ranges around while the user zooms and pans back and forth.                                                                                                                                                                                            |
| Readings, range reaching now | 30 s      | 30 min | Yes       | The range grows by one stored sample every 10 s, and the ring buffer already shows the newest samples. 30 s keeps requests rare without the chart's history falling visibly behind. `staleTime` is a function evaluated whenever TanStack checks freshness, so the same entry becomes fresh forever once its `to` is in the past. |
| Alert history                | 15 s      | 10 min | No        | The most time-sensitive server resource: a new alert can fire any minute, and the list should not lag much behind. It is cheap to recompute, and restoring an old list would show outdated alerts.                                                                                                                                |
| Alert rules                  | 5 min     | 24 h   | Yes       | Rules change only through this client's own mutations, which will invalidate `['telemetry', mode, 'alerts']` (rules and history) in 4B. Staleness is only a backstop for edits made elsewhere.                                                                                                                                    |
| Anything else (default)      | 30 s      | 5 min  | No        | `QUERY_DEFAULTS`: a conservative fallback, so a new query without a policy neither refetches on every mount nor lives forever.                                                                                                                                                                                                    |

Shared defaults (`createQueryClient`):

- **Refetch triggers:** `refetchOnWindowFocus` and refetch on reconnect stay on, so stale data is refreshed when someone looks at it again.
- **Retries:** queries retry only retryable `ApiError`s (network, timeout, 5xx, 429), at most 3 times, with exponential backoff (500 ms, 1 s, 2 s, capped at 8 s). 4xx and validation errors fail at once.
- **Mutations:** never retried automatically, because a retried POST could create a rule twice.
- **Errors:** `throwOnError` is off, so errors are returned as state, not thrown into error boundaries.

## Alternatives considered

- **One global policy** (for example 30 s everywhere). It is simpler, but it either refetches immutable history every 30 s or lets alert history go minutes out of date.
- **TanStack's defaults** (`staleTime` 0). Every mount and focus would refetch, including 2000-point readings that cannot have changed.
- **Push invalidation over the WebSocket** (the server announces changes). This is the right tool for rules edited by other clients, but the protocol has no such message yet, and the cost is not justified for one dashboard. Reconsider with a real multi-user backend.
- **Separate gcTimes for past and recent ranges.** Not possible per query: TanStack accepts a function for `staleTime` but only a number for `gcTime`, fixed at creation. A range that reaches "now" becomes a past range later. One value (30 min) is used for both, and docs/caching.md records this as a limitation.
- **`staleTime: 'static'` for past ranges.** Unlike Infinity, it would also ignore explicit `invalidateQueries` calls. Infinity keeps the option of forcing a refetch, for example after a backend data correction.

## Consequences

- **Positive:**
  - Immutable history is fetched once per session (or restored from IndexedDB).
  - Time-sensitive data is at most 15 to 60 s behind while someone is looking.
  - Every value is a named constant with its reason next to it.
- **Negative:**
  - A rule edited from another client can be up to 5 minutes stale until 4B adds invalidation, or a push mechanism exists.
  - The readings gcTime is a compromise (see above).
- **Follow-up:**
  - 4B mutations must invalidate by key prefix (`['telemetry', mode, 'alerts']`).
  - Phase 5 measures real request counts on the dashboard and revisits these numbers if they are off.
