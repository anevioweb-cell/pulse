# 0018. Demo Mode alert rules persist in IndexedDB and are the source of truth

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

In Phase 4A:

- `DemoTelemetryApi` kept alert rules in memory only, so a reload brought back the two default rules;
- the query persister (ADR 0017) stores the alert-rules query in IndexedDB and restores it on the next load.

After a reload in Demo Mode, the cache therefore showed the rules the user had created, while the API had only the defaults. The next refetch, up to 5 minutes later (ADR 0016), made them silently disappear, and edits to a rule that existed only in the cache failed with 404. A test reproduces this ("control" in `api/demo-rules-reload.test.tsx`).

Live Mode does not have the problem: the server owns the rules, and a restored cache is just an older copy of what the server has.

## Decision

1. **The repository is the source of truth in both modes.** In Live Mode that is the server. In Demo Mode it is `DemoTelemetryApi`, which now persists its rules itself. The query cache is only ever a copy.
2. **Demo rules have their own record.** `DemoRuleStorage` (`api/demo-rule-storage.ts`) stores `{version: 1, rules}` under `pulse.demo.alert-rules`, in its own IndexedDB database (`pulse-demo`, store `alert-rules`). idb-keyval cannot add an object store to the query cache's existing database.
   - **Loading:** rules are loaded once, before the first API call is answered. Persisted rules replace the defaults. An empty or invalid record keeps the defaults.
   - **Writing:** every successful create, update and delete is written through before the call resolves. Writes are queued, so an older snapshot cannot overwrite a newer one.
3. **Same untrusted-data rules as the query cache** (docs/security.md):
   - the value must be a string of at most 32 KiB, checked as characters and as UTF-8 bytes;
   - it is parsed without prototype keys and checked against a strict schema: the version, at most 50 rules each validated by the REST `alertRuleSchema`, and unique ids;
   - an invalid record is deleted;
   - read or write failures and 2 s timeouts switch the session to memory-only, silently, and the API keeps working.
4. **Cached rules are always revalidated on mount.** `alertRulesQuery` sets `refetchOnMount: 'always'`. A restored list paints at once, and the repository's answer replaces it a moment later, even within the 5-minute `staleTime`. This also covers another tab changing the rules. It amends the alert-rules row of ADR 0016: staleTime and gcTime are unchanged, and the extra mount refetch is new.
5. **The query cache keeps persisting rules.** It gives a correct first paint in the common case, and the revalidation fixes the rare stale one.
6. **Multiple tabs:** last write wins, with no cross-tab locking. Demo Mode is a single-user demo, and a tab picks up the other tab's rules on its next load.

The contract parity suite needs no reset hook: it builds a fresh `DemoTelemetryApi` per scenario, and Node has no IndexedDB, so those instances stay memory-only, exactly as before.

## Alternatives considered

- **Stop persisting the alert-rules query.** This is consistent, but Demo rules would still vanish on reload. That is a bug in its own right: the demo forgets what the user did.
- **Make the persisted query cache the demo source of truth** (the API reads its rules from the cache). This inverts the dependency: the repository would depend on TanStack's cache, and the cache's eviction (gcTime, byte cap, 24 h restore window) would delete user data.
- **Store demo rules in the query-cache record.** The two have different lifetimes. Cache entries are disposable and capped, while rules are user data that must not be evicted.
- **localStorage.** Synchronous, and ADR 0017 already chose IndexedDB for persisted data.
- **Revalidate only when stale (no `refetchOnMount: 'always'`).** A restored list could then be wrong for up to 5 minutes whenever another tab changed it.

## Consequences

- **Positive:**
  - After a reload, the cache and the API agree (tested).
  - Demo Mode remembers rule edits.
  - The same validation protects both persisted records.
- **Negative:**
  - One extra rules request per mount of a rules screen. It is tiny: the list is capped at 50 rules.
  - A second IndexedDB database per origin.
  - Cross-tab edits are last write wins.
- **Follow-up:** the optimistic mutations (ADR 0019) invalidate the rules after each mutation, and the repository's state wins there too.
