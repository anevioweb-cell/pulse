# 0020. Service worker and PWA: generateSW, app shell only, user-driven updates

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Phase 4B makes Pulse installable and lets the app shell load without a network. The constraints:

- **Data has its own caches.** Server data is cached by TanStack Query and IndexedDB (ADR 0016, 0017), and live data lives in memory (ring buffers, ADR 0012). A second data cache in the worker would serve stale API responses that bypass the query policies and the validation of persisted data.
- **Live Mode URLs are user-provided** and may point anywhere. A worker must never cache or intercept them.
- **Phase 7 adds a strict CSP**, so the worker must be same-origin (`worker-src 'self'`) and must not `importScripts` from a CDN.
- **No surprise reloads.** A new worker that activates and reloads by itself would wipe the in-memory live buffers.
- **The app must work without the worker:** unsupported browsers, private modes, a registration error.
- **No worker outside production:** `vite` dev and Storybook must never register one, because a stale dev worker is a classic source of confusing bugs.

## Decision

1. **vite-plugin-pwa (pre-approved) with `strategies: 'generateSW'`.**
   - **Why generateSW:** the vite-pwa docs present generateSW as the default, where the plugin writes the worker, and injectManifest for custom worker code. We need nothing custom: a precache, a navigation fallback, cleanup, and the skip-waiting message handler are all generateSW options. Less code of ours runs in the most privileged script on the origin.
   - **What it adds:** two transitive packages, `workbox-build` (build time only) and `workbox-window` (runtime, loaded lazily by the registration code), both dependencies of the plugin.
2. **Precache the app shell only.** The worker precaches the hashed JS and CSS, `index.html`, the three `woff2` fonts, `theme-init.js`, the favicon, the icons and the manifest. Non-hashed files carry Workbox revision hashes, so they update with every new worker. No stale-while-revalidate route is needed, because every static file is in the precache.
3. **Never cache data.** `runtimeCaching` is empty:
   - REST responses, WebSocket traffic (service workers cannot intercept it anyway) and every cross-origin request go straight to the network;
   - navigations fall back to the cached `index.html`, except `/api` paths (`navigateFallbackDenylist`).

   A test builds the app and asserts that the precache contains the shell and no `/api`, `ws:`, cross-origin or `.map` entries.

4. **Same-origin, single file.** `inlineWorkboxRuntime: true`, so `sw.js` contains Workbox itself. There is no `importScripts` at all (tested). Scope is `/`.
5. **Updates wait for the user.**
   - The worker is built with `registerType: 'prompt'`, `skipWaiting: false` and `clientsClaim: false`. It calls `skipWaiting()` only when the page sends `SKIP_WAITING` (tested on the generated `sw.js`).
   - `UpdateAvailableBanner` offers "Reload now", which sends that message through workbox-window. vite-plugin-pwa reloads when the new worker takes control (`controlling` event, read in its source). "Later" hides the banner until the next version.
   - The state machine (`src/app/pwa/update-store.ts`) is unit-tested, and the flow was verified in Chromium against `vite preview`.
6. **Registration** (`src/app/pwa/register.ts`) runs after the first render, in production builds only:
   - `vite` dev registers nothing unless `VITE_SW_DEV=1`. Vitest never registers. Storybook's config removes the PWA plugins.
   - An unsupported browser, a registration error or a failed chunk load leaves the app working online, and the update store records why.
7. **Cache hygiene.** `cleanupOutdatedCaches` deletes precaches from older Workbox versions on activate. Within the current precache, entries whose revision changed are replaced, and removed files are deleted by the new worker.
8. **Kill switch.** If a broken worker ever ships, build with `PULSE_SW_KILL=1`:
   - vite-plugin-pwa's `selfDestroying` emits a `sw.js` that unregisters itself and deletes its caches;
   - browsers check `sw.js` for updates on navigation, bypassing the HTTP cache for at most 24 h, so every client picks it up on its next visit;
   - the same URL (`/sw.js`) must keep being served, never a 404: a missing script leaves the old worker in place;
   - normal builds resume once the fix ships.
9. **Manifest.**
   - `name`, `short_name`, `description`, `id`/`start_url`/`scope` `/`, `display: standalone`;
   - 192 and 512 px PNG icons, plus a 512 px maskable icon with the glyph inside the 80 % safe zone. The chosen formats match Chrome's documented install criteria (web.dev): HTTPS, a name, 192 and 512 px icons, `start_url`, and a standalone-type display;
   - an apple-touch icon;
   - the `theme_color` and `background_color` equal `--color-surface` (light), and `index.html` has `theme-color` metas for light and dark. A test parses `tokens.css` to keep them equal.
   - **Icon generation:** a committed Pillow script (`scripts/pwa/generate-icons.py`) generates the icons. Pillow was already on the system, so no npm dependency was added.

## Alternatives considered

- **injectManifest (our own worker source).** It gives full control, but means more privileged code to maintain for no extra capability. Revisit if Phase 4+ needs background sync or push.
- **autoUpdate (skipWaiting + clientsClaim).** Always fresh, but a reload nobody asked for destroys in-memory live data, and assets can mix versions mid-session.
- **Caching API responses in the worker** (stale-while-revalidate on `/api`). This would duplicate TanStack Query's cache with weaker rules (no per-resource staleness, no schema validation, no per-mode namespaces). It would also need a URL allowlist that cannot be known for user-provided Live Mode servers.
- **Workbox from a CDN (`importScripts`).** One less byte in our bundle, but a third-party script would run with full control over the origin's requests, and it needs a CSP exception.
- **No service worker.** Simpler, but no installability guarantee on older Chromium versions, no offline shell, and Demo Mode, which needs no server, could not start offline.

## Consequences

- **Positive:**
  - The shell loads with the server unreachable: verified in Chromium, including a deep link.
  - Demo Mode's code is in the shell, so it can run offline once Phase 5 gives it a UI.
  - Data caching stays in one place, and updates never interrupt live data.
- **Negative:**
  - `sw.js` is about 16 KB (about 5.7 KB gzip) because Workbox is inlined.
  - The registration code is a lazily loaded chunk (workbox-window).
  - The precache is about 0.5 MiB on first visit, mostly fonts and the JS bundle. Measured numbers are in docs/performance.md.
  - Users on an old version see it until they choose to reload.
- **Follow-up:**
  - Phase 7 sets the CSP: `worker-src 'self'`, `manifest-src 'self'` (docs/security.md).
  - Phase 9 adds Playwright tests for offline load and the update flow. Phase 5 wires Demo Mode's UI.
  - The `theme-color` meta follows the system scheme, not an explicit in-app theme choice, so the ThemeProvider could update it (Phase 12).
