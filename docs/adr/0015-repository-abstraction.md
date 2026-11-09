# 0015. Repository abstraction for server data, and MSW for tests only

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Pulse has two modes:

- **Live Mode** talks to a telemetry server (the mock server in development, a real backend later).
- **Demo Mode** must work with no backend at all: a static deployment, a portfolio link, offline.

Both need the same server data: the device list, device detail, historical readings over any range, alert history, and alert-rule CRUD. Features must not branch on the mode, and the two sources must not drift apart: a screen that works in Demo Mode has to work against the server, including its errors.

Two more forces:

- **History for any range.** Demo history must exist for any requested range and be identical however it is requested. The live `SimulationEngine` is a random walk that depends on where it starts, so it cannot provide that.
- **A service worker in 4B.** Phase 4B adds a service worker (vite-plugin-pwa) for offline support and the PWA install.

## Decision

1. **One interface, two implementations.** Features use `TelemetryApi` (`api/telemetry-api.ts`) through `TelemetryApiProvider`, and never know which implementation is active:
   - `HttpTelemetryApi` (Live Mode) calls the REST API through the validated fetch wrapper;
   - `DemoTelemetryApi` (Demo Mode) computes the same resources in the browser.

   Both validate their input with the contract schemas before doing anything, validate their output against the same schemas, honour `AbortSignal`, and fail only with `ApiError`.

2. **One data source for both sides.** `SimulatedTelemetryData` produces the simulated fleet's REST resources. The mock server uses it behind HTTP, and `DemoTelemetryApi` uses it directly, so the same seed and clock give the same answers. It is built on `HistoryModel`: the value of a metric at time `t` is a pure function of (seed, device, metric, `t`), using the same device profiles as the live engine. Overlapping ranges therefore return identical samples.
3. **Min/max downsampling.** Long ranges are reduced with min/max bucketing (`history/downsample.ts`), not LTTB. Each bucket keeps its minimum and maximum, so the global extremes always survive, whatever the zoom. Extremes are what telemetry alerts are about. It is a single O(n) pass over typed arrays, so Phase 6 can run it directly on ring buffers. Measured throughput is 0.33 to 0.83 billion input points per second on Node ([performance.md](../performance.md#phase-4a-data-access-layer)).
4. **Parity is tested, not assumed.** `server/telemetry-api-contract.test.ts` defines the contract once, as scenarios run through a function that takes an API factory. It runs the scenarios against both implementations, then requires identical outcomes from `DemoTelemetryApi` and from `HttpTelemetryApi` talking to the real mock server on an ephemeral port (same seed, same clock, deterministic rule ids). The scenarios cover:
   - the device list and every device detail;
   - readings: raw, downsampled to 2, 100 and 2000 points, partly and entirely in the future;
   - alert history with limit and truncation;
   - rule CRUD, including the fact that rules drive alert history;
   - the rule cap, 404s, 15 kinds of invalid input, and aborted requests.

   The suite found one real difference, fixed in the same change: Demo Mode reported invalid input as `http`/400/`bad_request`, while the HTTP client rejects it before sending, as `validation`/`invalid_request`. The only deliberate difference left is `mode` (`'demo'` vs `'live'`). Transport failures (network errors, timeouts, 413/414/415/429, injected faults) exist only over HTTP, and their own tests cover them.

5. **MSW is for tests only.** It is used through `msw/node` (no service worker) to make the HTTP client face responses a correct server never sends: wrong content type, oversized or malformed bodies, schema violations, slow or hanging responses. It is never used to run the app.

## Alternatives considered

- **MSW in the browser as the Demo Mode backend.** It would give Demo Mode real `fetch` calls. Rejected for three reasons:
  - **Service worker collision:** MSW's browser mode needs its own service worker (`mockServiceWorker.js`), registered at the app's scope. In 4B the PWA's service worker controls that same scope, and a scope has only one active worker. They would fight over it, and offline caching would have to be merged into MSW's worker or MSW dropped later.
  - **Not production software:** a production Demo Mode would depend on a test library and its worker lifecycle (registration, updates, the first load before the worker is active).
  - **Unnecessary:** going through HTTP semantics in the browser buys nothing. The parity suite already proves the in-browser implementation matches the server.
- **A single HTTP implementation, with Demo Mode pointing at a hosted mock server.** Demo Mode would no longer work offline or as a static site, and a public server would need hardening and hosting it does not deserve.
- **Mode checks inside features or hooks** (`if (mode === 'demo') ...`). This spreads the branch everywhere and makes drift between the modes likely. Injection keeps it in one place.
- **Generating demo history with the live `SimulationEngine`.** Its random walk depends on the start time, so two overlapping requests would disagree. That breaks caching and zooming.
- **LTTB downsampling.** It looks smoother at a given point count, but it chooses points by triangle area, so it can drop a one-sample spike that an alert fired on. It is also more complex to run incrementally. Min/max costs two points per bucket, which halves the horizontal resolution per point budget. The 2000-point cap still covers a 1000-bucket chart.

## Consequences

- **Positive:**
  - Features and hooks are mode-agnostic, and tests inject any `TelemetryApi`.
  - Demo Mode works with no network and needs no service worker.
  - Both modes fail with the same error kinds and codes, and a test fails if they drift.
- **Negative:**
  - Two implementations to maintain. The parity suite is the guard, and every new endpoint must be added to it.
  - Demo Mode computes history on the main thread. A 7-day range at 2000 points takes about 7.5 ms in Node. Phase 6 measures it in browsers and can move it to the simulator worker.
  - Demo alert rules live in memory only, until 4B persists them.
- **Follow-up:** 4B mutations (optimistic updates and rollback) are tested against the mock server's fault injection, not against MSW handlers.
