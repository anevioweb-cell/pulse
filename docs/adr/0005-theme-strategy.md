# 0005. Theme strategy: `data-theme` attribute, system default, external no-flash script

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Pulse offers light and dark themes, with three user choices: `system` (follow the OS), `light`, and `dark`. Requirements:

- No flash of the wrong theme on first paint, even though React renders after the bundle loads.
- Compatible with a strict Content Security Policy in Phase 7 (`script-src 'self'`, no `'unsafe-inline'`, no hashes to maintain).
- The persisted choice is an external data boundary, so per CLAUDE.md it is validated with Zod and storage failures are handled.
- While in `system` mode, follow OS theme changes live.

## Decision

- **Mechanism:** the resolved theme (`light` or `dark`, never `system`) is written to `<html data-theme="…">`. The token CSS re-points semantic variables under `:root[data-theme='dark']`, and a Tailwind custom variant makes `dark:` follow the attribute as well. `color-scheme` is set per theme so native controls and scrollbars match.
- **Default:** `system`.
- **No-flash script:** `public/theme-init.js` is a tiny, dependency-free classic script, loaded with a blocking `<script src="/theme-init.js">` in `<head>` before any CSS or the app bundle. It:
  - reads `localStorage['pulse.theme']` inside `try/catch`;
  - accepts only `light`, `dark` or `system`;
  - resolves `system` through `matchMedia('(prefers-color-scheme: dark)')`;
  - sets the attribute.

  It is an external file, not inline, so `script-src 'self'` allows it with no hash or nonce. Vite copies it to `dist/` unchanged.

- **React side:** `ThemeProvider` in `src/shared/theme`:
  - reads the stored mode through a `zod/mini` enum schema (invalid values fall back to `system`; storage exceptions are caught);
  - subscribes to `prefers-color-scheme` with `useSyncExternalStore`;
  - applies the resolved theme in a layout effect;
  - persists changes (write failures are ignored, so the choice still applies for the session).

  `useTheme()` exposes `{ mode, resolvedTheme, setMode }` and throws outside the provider.

- **Drift guard:** the script cannot import the TypeScript constants. A test checks that the script contains the same storage key, attribute, media query and mode values, and runs the script in jsdom against the same scenarios as the provider.

## Alternatives considered

- **Inline script in `index.html`.** The common approach, but a strict CSP would need `'unsafe-inline'` or a hash that changes with every edit.
- **CSS-only `@media (prefers-color-scheme)`.** No flash and no JS, but no user override. Combining it with an attribute override duplicates every dark token value.
- **A `.dark` class.** Equivalent to the attribute, but an attribute with values extends naturally to more themes (`data-theme="high-contrast"`).
- **Apply the theme in React only.** Simplest, but users with a dark preference would see a light flash on every load.
- **Cookie plus server-rendered attribute.** The robust SSR answer, but Pulse is a static SPA (ADR 0001).

## Consequences

- **Positive:**
  - No flash, CSP-friendly, and no dependency.
  - Theme changes do not re-render the tree beyond the provider's consumers.
  - Live OS-change tracking.
  - Invalid or hostile storage values are rejected in both places.
- **Negative:**
  - One small extra request (about 0.6 kB) blocks rendering. It is cacheable and same-origin. Phase 4's service worker will precache it.
  - Two implementations of the resolve logic (script and provider), kept in sync by tests rather than by shared code.
  - Without JavaScript, the page renders in the light theme.
- **Follow-up:** cross-tab sync through the `storage` event could be added in Phase 5 (settings).
