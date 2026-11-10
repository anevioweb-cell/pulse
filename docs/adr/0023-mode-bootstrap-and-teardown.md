# 0023. One session controller composes and tears down each mode

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Phase 5A is the first time the app reads server data and runs a live session. Each mode needs a matching set of pieces:

- **Demo Mode:** `DemoTelemetryApi`, the simulator worker (`SimulatorTransport`), and a QueryClient whose queries never pause offline (`networkMode: 'always'`, from `requiresNetwork: false`).
- **Live Mode:** `HttpTelemetryApi` for a REST base URL, the WebSocket transport for a user-provided `ws:`/`wss:` URL, and a QueryClient with `networkMode: 'online'`.
- **Both:** query-cache persistence in the mode's own IndexedDB namespace (ADR 0017), and the live store reset (`TelemetryService.start()`).

Switching modes must not leak anything from the previous mode: a worker, a socket, a transport listener, a timer, a pending frame, a persistence writer, or query data. The pieces were built in Phases 3 and 4 with public APIs, but nothing composed them. React 19 StrictMode runs effects twice in development, so starting sessions from effects risks double starts. TanStack's hooks keep the QueryClient they were created with, so swapping the client under mounted components leaves their observers on the old one.

The mode and the Live URL are stored between visits, and storage is untrusted (CLAUDE.md data boundaries).

## Decision

1. **One composition point: `SessionController` (`src/app/session/session-controller.ts`).** It reads the stored preference, builds the `AppSession` (`id`, `mode`, `api`, `client`) for that mode, and on `start()` starts the telemetry session and persistence. `apply({ mode, liveUrl })` replaces the session when the mode changes, or when the Live URL changes while in Live Mode; otherwise it only stores the preference. It is a plain class with `subscribe`/`getSnapshot`, created and started once in `main.tsx`, outside React.
2. **Teardown order before the next session starts:**
   1. stop persistence (a restore still in flight is stopped as soon as its handle arrives);
   2. `TelemetryService.stop()`, which disconnects the transport, removes its listeners, cancels the pending frame and the stale timer, and publishes the final `closed` state;
   3. cancel in-flight queries and `clear()` the old QueryClient.

   Demo and live keys are already namespaced by mode (`['telemetry', mode, ...]`), so clearing is about memory, not correctness.

3. **The network mode comes from the API.** Each `TelemetryApi` declares `requiresNetwork`, and `createTelemetryQueryClient(api)` sets the queries' `networkMode`. No query sets it.
4. **The REST base comes from the Live URL.** `ws://host:port` maps to `http://host:port` and `wss:` to `https:`, path and query dropped, because the mock server serves REST and WebSocket on one origin.
5. **React remounts per session.** `AppSessionProvider` keys `QueryClientProvider` by the session id, so a switch remounts the subtree and every hook binds to the new client and API.
6. **The stored preference is validated, never trusted** (`src/app/session/preferences.ts`): localStorage access in try/catch, a length cap before parsing, JSON parsed without prototype keys, a strict zod/mini schema with a version, and the URL checked with the transport's own `validateWebSocketUrl` (ws: or wss: only, no credentials). Anything wrong gives the defaults, which are Demo Mode. A write failure is ignored: the choice still applies for the session.
7. **An invalid URL is UI state.** `apply` returns `{ ok: false, problem }` and changes nothing. The header's data-source dialog shows the problem on the field. The transport's own check stays as a second line: a URL that reached it anyway ends in a `failed` connection state, not an exception.

## Alternatives considered

- **Start sessions in a React effect.** StrictMode would start and stop each session twice in development, and teardown would depend on render timing. Tests would need a rendered tree to exercise it.
- **One QueryClient for both modes.** Keys are namespaced, so it would be correct, but the network mode is a client default, and a shared client would need per-query `networkMode` options, which is the scattering this ADR avoids. A switch would also keep the other mode's data in memory.
- **Swap the client without remounting.** TanStack's `useQuery` creates its observer once with the client it first saw, so mounted components would keep reading the cleared client.
- **A Zustand store for the preference.** It would hold two values that change only through `apply`. The controller already has `subscribe`/`getSnapshot`, which `useSyncExternalStore` reads directly.
- **Ask for a separate REST URL.** More flexible, but the only server today serves both on one origin, and a second field doubles the validation and the ways to misconfigure Live Mode. Phase 5C's Settings page can add it if a backend needs it.

## Consequences

- **Positive:**
  - One file decides what runs in each mode, and its tests count every resource with fakes around the real `TelemetryService` and transports (`session-controller.test.ts`): after demo → live → demo and `dispose()`, 0 workers, 0 sockets, 0 transport subscriptions, 0 active persistence handles, 0 pending frames and 0 fake timers remain, and the previous client holds no queries.
  - A hostile or broken stored record cannot change the mode or reach the transport.
- **Negative:**
  - A mode switch remounts the whole app below the provider: local UI state (an open menu, a scroll position) is lost. The URL keeps the route and view state.
  - The session code (`TelemetryService`, both APIs, the simulator transport, persistence) is now in the main bundle, because the first page needs it. Measured in docs/performance.md.
- **Follow-up:** Phase 5C's Settings page uses `apply` too, and can add more preferences to the same validated record (bump `PREFERENCES.SCHEMA_VERSION`).
