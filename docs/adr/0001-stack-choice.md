# 0001. Stack choice: Vite SPA, Zustand for live data, TanStack Query for server state, Zod at boundaries

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Pulse is a real-time IoT telemetry dashboard. ESP32 sensors push readings over a WebSocket, potentially many messages per second across many devices. The UI must render high-frequency updates (live charts, status tiles, alerts) without jank, while also loading slower-changing server data over REST (device registry, historical readings, settings).

Constraints and forces:

- **Client-heavy and interactive.** Almost all value is in the browser, behind a dashboard that is useless without a live socket. There is no public, SEO-relevant content.
- **Two very different kinds of state.**
  - _Live state_: a high-frequency push stream, owned by the client, kept in bounded in-memory buffers, never "refetched".
  - _Server state_: request/response data that has a canonical copy on a server and needs caching, deduplication, background refresh, and invalidation.
- **Untrusted inputs.** Firmware bugs, version skew between devices and the dashboard, and tampered storage or URLs all produce malformed data. TypeScript types do not exist at runtime.
- **Static hosting and offline.** The dashboard should deploy as static files to any CDN, and later work offline as a PWA (Phase 4).
- **Portfolio goal.** Every choice should be explainable and conventional enough for reviewers to evaluate quickly.

## Decision

1. **Build tool and framework: Vite + React 18 + TypeScript (strict), as a client-rendered single-page app.** No server rendering framework.
2. **Live data: Zustand.** WebSocket messages are validated and written into Zustand stores (later backed by fixed-size ring buffers, Phase 3). Components subscribe through narrow selectors so a new reading re-renders only the widgets that depend on it. Stores are also usable outside React (WebSocket handlers, Web Workers' message handlers) through `getState`/`setState`.
3. **Server state: TanStack Query.** All REST data goes through query hooks, which provide caching, request deduplication, stale-while-revalidate, retries, and invalidation. Live data is not forced into the query cache, and server data is not copied into Zustand.
4. **Runtime validation: Zod at every external boundary.** WebSocket frames, REST responses, `localStorage`/IndexedDB reads, and URL params are parsed with Zod schemas before they enter the app. Static types are derived with `z.infer`, so the schema is the single source of truth.

## Alternatives considered

- **Next.js (App Router) instead of Vite.** Next.js excels at server rendering, streaming HTML, SEO, and server-side data access. None of these help here: the dashboard is behind a live socket, has no indexable content, and real-time updates must be client-rendered anyway. Next.js would add a server runtime (or the static-export subset with its limitations), Server/Client Component boundaries to manage on nearly every component, and more framework-specific concepts for reviewers. Vite gives fast dev startup and HMR, a plain static build that is easy to host and to turn into a PWA, and full control over the client architecture.
- **Remix / React Router framework mode.** Similar reasoning as Next.js: its strengths (loaders, actions, progressive enhancement) target request/response apps. React Router may still be used in library mode for client routing (pre-approved in CLAUDE.md).
- **Redux Toolkit (with RTK Query) for all state.** Mature and capable, but more boilerplate for a high-frequency stream, and a single global store makes it easier to cause wide re-renders. RTK Query is a solid server-state tool, but TanStack Query has a richer cache model and better devtools for this use case.
- **React Context + `useReducer` for live data.** Context re-renders every consumer on each update, which is unacceptable at sensor message rates.
- **Jotai / Valtio.** Good fine-grained alternatives. Zustand was chosen for its tiny API, easy use outside React (sockets, workers), and widespread familiarity.
- **TanStack Query for live data too (writing socket messages into the query cache).** Workable for low-rate updates, but the query cache is designed around fetch lifecycles (staleness, refetching, garbage collection), not bounded high-frequency buffers. Mixing the two blurs ownership.
- **Hand-written type guards, Valibot, io-ts, or ArkType instead of Zod.** Type guards drift from the types and scale poorly. Valibot is smaller and ArkType faster; io-ts is more verbose. Zod has the largest ecosystem, clear error messages, and is the most recognizable to reviewers. If bundle size or parse throughput on the hot WebSocket path becomes a problem, this can be revisited with measurements (Phase 6).
- **No runtime validation (trust TypeScript types).** Rejected: types are erased at runtime, so malformed device data would flow silently into charts and alert logic.

## Consequences

- **Positive:**
  - Simple, static deployment, and a straightforward path to a PWA and offline support.
  - Clear ownership: live data lives in Zustand, server data in TanStack Query, and data never enters either without passing a Zod schema.
  - Selector-based subscriptions keep high-frequency renders localized.
  - Schemas double as documentation of the device protocol and as fixtures for tests.
- **Negative:**
  - No server rendering, so first paint shows an app shell until JavaScript loads. Acceptable for an authenticated, real-time dashboard.
  - Two state libraries to learn and keep separate; contributors must know which kind of state they are handling.
  - Zod parsing adds CPU cost on every message. It must be measured on the hot path and may need batching, a worker, or a faster validator later.
- **Follow-up:**
  - Phase 3: ring buffers in Zustand, WebSocket transport, and the simulator worker.
  - Phase 4: TanStack Query persistence and service worker.
  - Phase 6: measure validation and render cost under load.
