# 0021. React Router data routes, lazy pages, and the URL as the source of truth for view state

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Phase 5A adds the first pages: Overview, a Devices table, a device page placeholder (charts in 5B), and Alerts and Settings placeholders (5C). The requirements:

- **Deep links and reloads work,** including offline: the service worker already serves `index.html` for navigations (ADR 0020).
- **The main chunk stays lean:** page code, and above all the table and virtualization libraries, must load only with their page.
- **Route parameters are untrusted input** (CLAUDE.md data boundaries): `/devices/:id` must pass the same id rule as the REST contract before anything uses it.
- **A broken page must not take the app down:** errors stay inside the layout, and there is a way to retry.
- **Route changes are accessible:** a new document title, focus moved to the new content, scroll to top, and no focus trap.
- **View state is shareable and survives a reload:** a filtered, sorted table is a URL someone can bookmark or send.

React Router is pre-approved in CLAUDE.md.

## Decision

1. **React Router 8 data routes** (`createBrowserRouter`, `RouterProvider`). The route table is `createAppRoutes()` in `src/app/router/routes.tsx`. Tests render the same table in a memory router.
2. **One lazy module per page.** Each feature exports a loader from its `index.ts` (`loadOverviewRoute`, `loadDevicesRoute`, `loadDeviceRoute`, `loadAlertsRoute`, `loadSettingsRoute`). The dynamic `import()` lives inside the feature, so `app/` never deep-imports, and each page is its own chunk. React Router loads the module during the navigation, so the previous page stays on screen until the next one is ready.
3. **Failed page modules are retryable.** When a `lazy` import rejects, React Router keeps the route marked as lazy and renders nothing for it (read in its `_renderMatches`), so the route's error boundary never shows. `resilientLazy()` therefore turns a failed import into a render error (`RouteModuleError`) that the route's boundary catches. Its "Try again" imports the module again, then navigates to the same location.
4. **An error boundary on every route,** inside the layout (`RouteErrorBoundary`): a 404 shows the not-found page, anything else the shared `ErrorState` with a retry. The layout route has one too, as a last resort.
5. **Parameter guards in loaders.** `/devices/:id` has a loader that checks the id with the contract's `deviceIdSchema` (through `isDeviceId` from the devices feature) and throws a 404 response otherwise. An invalid id shows the not-found page and never reaches a query key or a request.
6. **Route accessibility in the layout:**
   - every page renders the shared `PageHeader`, which sets `document.title` from the messages module and gives its `<h1>` `tabIndex={-1}`;
   - after a navigation to another **path**, `useRouteFocus` moves focus to that heading (or to `main`). It does not on the first load, and not when only the query string changes, so typing in a table filter keeps focus in the input;
   - `ScrollRestoration` keys positions by path: a new path scrolls to the top, back and forward restore, and query-string changes do not scroll.
7. **The URL is the source of truth for view state.** Table sort, search, status filter and hidden columns live in the query string, never in component state or storage:
   - they are parsed with zod/mini on every read, as untrusted input: unknown keys are ignored, every value is length-capped, and anything malformed or hostile falls back to its default, field by field, without throwing;
   - updates use `replace`, not `push`, so typing does not add history entries, and the search box writes the URL debounced;
   - only non-default values are written, so the default view has a clean URL.

## Alternatives considered

- **TanStack Router.** Typed search params and route-level validation are built in, which fits this decision well. But it is not on the pre-approved list (it would need its own ADR and bundle cost), and React Router's loaders and lazy routes cover what Phase 5 needs.
- **`React.lazy` and `Suspense` per page,** without data routes. Simpler, but the old page would unmount into a fallback on every navigation, parameter validation would happen during render, and failures would need a hand-written boundary per page.
- **Validating `:id` inside the page component.** It works, but every page with a parameter would repeat it, and the invalid value would already be in the component tree. A loader rejects it before anything renders.
- **View state in component state or Zustand.** Lost on reload, not shareable, and back/forward would not restore it. The URL already is the shared, persistent, user-visible state.
- **`push` on every change.** Each keystroke in the search box would become a history entry, so the back button would replay typing.
- **Announcing route changes through a live region** instead of moving focus. Focus on the heading both announces the page and puts keyboard users at its start. A live region would announce but leave focus on the link that was clicked, in a navigation that may no longer be relevant.

## Consequences

- **Positive:**
  - Pages, and later the table libraries, load only when visited. The chunk list is in docs/performance.md.
  - Deep links, reloads and the 404 page work the same online and offline (the service worker serves the shell).
  - An invalid id or a missing chunk shows a page inside the layout, with working navigation.
  - The tests cover each route, invalid ids, both error kinds with retry, focus on navigation, no focus move on query-string changes, keyboard navigation, and axe on every page.
- **Negative:**
  - React Router is in the main chunk, because the router renders the shell.
  - `resilientLazy` relies on React Router's behavior for rejected `lazy` functions. If a later version renders the route's boundary itself, the wrapper becomes unnecessary, but stays harmless.
  - The first visit shows a spinner (`HydrateFallback`) until the first page module has loaded.
