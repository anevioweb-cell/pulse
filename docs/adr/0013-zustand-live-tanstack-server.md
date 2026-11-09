# 0013. Zustand for live data, TanStack Query for server state

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

ADR 0001 named Zustand for live data and TanStack Query for server state. Phase 3B implements the live store, so the choice is now concrete and needs to be weighed against the alternatives with the actual requirements:

- one writer (the TelemetryService, outside React) and many narrow readers (per-device components);
- at most one publish per frame;
- writes from non-React code, including Node tests;
- selector-based subscriptions that skip re-renders for unrelated devices;
- a small bundle.

Server state (device registry, history, settings over REST, Phase 4) has different needs: caching, deduplication, refetching and persistence.

## Decision

- **Live data:** a **vanilla Zustand store** (`createStore` from `zustand/vanilla`), written only by the TelemetryService via `setState` once per frame. React reads it through hooks built with `useStore(store, selector)`, with `useShallow` for selectors that return new objects. The store and its hooks are plain modules (no provider needed), and tests create isolated stores with `createTelemetryStore()` and `createTelemetryHooks(store)`.
- **Server state:** **TanStack Query** (Phase 4), unchanged from ADR 0001. Live data never goes into the query cache, and server data is never copied into the Zustand store.

## Alternatives considered

- **Redux Toolkit.**
  - Pros: mature, great devtools, `createSelector` memoization.
  - Cons: more ceremony (slices, actions, dispatch) for a store with exactly one writer and no reducers worth naming. It is also larger than Zustand (about 1 kB gzip for the parts used here). Live updates do not benefit from Redux's action log.
- **Jotai.**
  - Pros: fine-grained atoms, natural per-device subscriptions.
  - Cons: atoms are React-first (writing from the service needs a store reference anyway), and a family of per-device atoms is more machinery than one store with per-device selectors.
- **Signals** (Preact signals, or the TC39 proposal via a library).
  - Pros: excellent fine-grained updates.
  - Cons: React integration relies on non-standard hooks or compiler transforms, and it is less familiar to reviewers.
- **`useSyncExternalStore` with a custom store.**
  - Pros: no dependency at all (the Toast store does exactly this, ADR 0007).
  - Cons: for the live store we would rewrite selector support, `useShallow`-style equality and the vanilla/React split that Zustand already provides in about 1 kB, with tests. The Toast store has one consumer and needs none of that.
- **React Context plus `useReducer`.** Every consumer re-renders on every publish. This was rejected in ADR 0001.

## Consequences

- **Positive:**
  - Tiny API surface: `getState`, `setState`, `subscribe`, `useStore`.
  - The writer is plain TypeScript, testable in Node.
  - Narrow selectors are proven by a render-counter test.
  - Zustand is pre-approved core stack.
- **Negative:**
  - Selector discipline is the components' responsibility; a careless `useStore(store, (s) => s)` re-renders everything. The rules are documented in `docs/architecture.md`, and Phase 5 code review enforces them.
  - Two state libraries remain (by design, per ADR 0001).
- **Measured:** publishing costs 1.3 µs (12 devices) to 13.2 µs (200 devices, all changed) per frame, excluding React rendering (`docs/performance.md`).
