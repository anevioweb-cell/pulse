# Performance

This file tracks build-output size over time. The full performance work (budgets with size-limit, profiling, code splitting) happens in Phase 6.

Sizes come from `npm run build` (Vite 8 production build). Gzip sizes are as reported by Vite.

## Baseline (end of Phase 1)

| Asset | Phase 1 (React 18.3.1)  | After React 19 upgrade (React 19.3.1) | Delta (gzip) |
| ----- | ----------------------- | ------------------------------------- | ------------ |
| JS    | 140.86 kB / 45.80 kB gz | 219.79 kB / 68.72 kB gz               | +22.92 kB    |
| CSS   | 8.35 kB / 2.25 kB gz    | 8.37 kB / 2.26 kB gz                  | +0.01 kB     |
| HTML  | 0.45 kB / 0.29 kB gz    | 0.45 kB / 0.29 kB gz                  | 0            |

Notes:

- The JS increase is the React 19 runtime (mostly `react-dom`). App code is a single placeholder component. See [ADR 0003](adr/0003-upgrade-to-react-19.md).
- The small CSS change is not caused by React. It most likely comes from Tailwind CSS v4's automatic source detection, which also scans the Markdown docs, so new words in the ADRs can generate extra utilities. Restricting Tailwind's sources to `src/` should be considered in Phase 2.

## React 19 bundle investigation (start of Phase 2)

The React 19 upgrade added 22.92 kB gzip. Findings from `npm run analyze` (treemap) and an A/B build of the same placeholder app with each React version:

- **No duplicates:** `npm ls` and the treemap show exactly one copy each of `react`, `react-dom` and `scheduler`.
- **No dev code:** only `*.production.js` files are bundled. The bundle contains no `react-dom.development`, `react.development` or `Warning:` strings. The few `__REACT_DEVTOOLS_GLOBAL_HOOK__` references are the normal production DevTools hook.
- **Where the bytes are:** almost all of it is `react-dom`'s client renderer.

Per-package share of the bundle (treemap, pre-minification "rendered" size, gzip). React 19 ships unminified `*.production.js` files, while React 18 shipped pre-minified `*.min.js`, so rendered sizes are not comparable across versions. Use the minified table below for that.

| Package     | React 18.3.1            | React 19.3.1             |
| ----------- | ----------------------- | ------------------------ |
| `react-dom` | 184.47 kB / 48.13 kB gz | 536.69 kB / 101.36 kB gz |
| `react`     | 9.99 kB / 3.72 kB gz    | 17.07 kB / 4.91 kB gz    |
| `scheduler` | 5.85 kB / 2.12 kB gz    | 9.21 kB / 2.43 kB gz     |
| App code    | ~0.8 kB                 | ~0.8 kB                  |

Minified output, with React split into its own chunks. The bundler put `react-dom`, `scheduler` and most of `react` into one chunk, and a small `react` chunk (JSX runtime) into another:

| Chunk                               | React 18.3.1            | React 19.3.1            | Delta (gzip) |
| ----------------------------------- | ----------------------- | ----------------------- | ------------ |
| `react-dom` + `scheduler` + `react` | 139.19 kB / 45.10 kB gz | 218.37 kB / 68.11 kB gz | +23.01 kB    |
| `react` (small chunk)               | 0.67 kB / 0.45 kB gz    | 0.39 kB / 0.29 kB gz    | −0.16 kB     |
| App entry + Vite runtime            | 1.10 kB / 0.64 kB gz    | 1.10 kB / 0.64 kB gz    | 0            |
| **Total React runtime**             | 139.86 kB / 45.55 kB gz | 218.76 kB / 68.40 kB gz | +22.85 kB    |

**Conclusion:** this is not a build problem. It is the size of React 19's `react-dom/client`, which adds Actions and form actions, `useActionState`/`useOptimistic`, document metadata and stylesheet hoisting, resource preloading APIs, and improved hydration and error reporting. There is nothing to fix. Phase 6 will set a size budget (size-limit) against this new baseline, and will look at code splitting for the dashboard's own code.

## Tailwind source scoping (start of Phase 2)

Tailwind v4's automatic source detection scanned every non-ignored file, including `docs/*.md`, configs and `CLAUDE.md`, and generated utilities for words that look like class names. `src/app/index.css` now uses `@import 'tailwindcss' source(none)` with explicit `@source` entries for `src/` and `index.html` only.

| Asset | Before scoping          | After scoping           | Delta (gzip) |
| ----- | ----------------------- | ----------------------- | ------------ |
| CSS   | 8.37 kB / 2.26 kB gz    | 4.93 kB / 1.71 kB gz    | −0.55 kB     |
| JS    | 219.79 kB / 68.72 kB gz | 219.79 kB / 68.72 kB gz | 0            |

## End of Phase 2A (tokens, theming, typography)

| Asset | Phase 1 baseline (React 18) | After React 19 + Tailwind scoping | End of Phase 2A         | Delta vs React 19 (gzip) |
| ----- | --------------------------- | --------------------------------- | ----------------------- | ------------------------ |
| JS    | 140.86 kB / 45.80 kB gz     | 219.79 kB / 68.72 kB gz           | 267.20 kB / 83.61 kB gz | +14.89 kB                |
| CSS   | 8.35 kB / 2.25 kB gz        | 4.93 kB / 1.71 kB gz              | 20.03 kB / 5.23 kB gz   | +3.52 kB                 |
| HTML  | 0.45 kB / 0.29 kB gz        | 0.45 kB / 0.29 kB gz              | 0.59 kB / 0.36 kB gz    | +0.07 kB                 |

Where the +14.89 kB gzip of JS comes from, measured by building with and without each piece:

| Addition                          | Min + gzip | How it was measured                                           |
| --------------------------------- | ---------- | ------------------------------------------------------------- |
| `tailwind-merge` (via `cn()`)     | ~9.03 kB   | Build with `cn()` reduced to `clsx` only: 74.58 → 83.61 kB gz |
| `zod/mini` + theme module         | ~3.45 kB   | 68.72 → 72.17 kB gz (classic `zod` would be ~15 kB, ADR 0006) |
| Foundations preview page + `clsx` | ~2.41 kB   | 72.17 → 74.58 kB gz                                           |

- **CSS** grew with the token variables (both themes), the `@font-face` rules, and the utilities the preview page uses. The preview page is temporary (Phase 2B moves it into Storybook).
- **Fonts** are separate files, fetched only when a glyph in their `unicode-range` is used: Inter latin 48.25 kB, Vazirmatn arabic 46.30 kB, JetBrains Mono latin 40.40 kB (woff2, already compressed).
- **No-flash script:** `public/theme-init.js` is 0.6 kB and render-blocking by design (ADR 0005).
- **Watch item for Phase 6:** `tailwind-merge` is now the largest dependency after React. Options are a reduced `createTailwindMerge` config, `twJoin` where conflicts are impossible, or relying on cva variants so merging is rarely needed.

## Component library cost (end of Phase 2)

Measured with a throwaway entry (not committed): the current app (`src/main.tsx`) plus `Object.assign(window, { keep: module })` for one component folder's whole public API, built with the production Vite config. Sizes are the summed gzip of the emitted JS, as reported by Vite. Baseline is the app alone: **72.18 kB gzip**.

The first component of any kind pays for the shared base: `cn()` (`clsx` + `tailwind-merge` with the project config) and `class-variance-authority`, about **9.4 kB gzip**, almost all of it `tailwind-merge`. "Own cost" is what a component adds on top of that base.

| Component               | Radix / other dependencies                                                                                                                   | Alone (app + component) | Δ vs baseline | Own cost (Δ − shared base) |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------- | -------------------------- |
| Skeleton                | none (shared base only)                                                                                                                      | 81.56 kB                | +9.38 kB      | ~0                         |
| Card                    | `react-slot`                                                                                                                                 | 83.08 kB                | +10.90 kB     | 1.52 kB                    |
| Spinner                 | lucide (runtime + 1 icon)                                                                                                                    | 82.92 kB                | +10.74 kB     | 1.36 kB                    |
| EmptyState              | lucide                                                                                                                                       | 83.13 kB                | +10.95 kB     | 1.57 kB                    |
| Badge                   | lucide (4 status icons)                                                                                                                      | 83.42 kB                | +11.24 kB     | 1.86 kB                    |
| Input                   | lucide                                                                                                                                       | 83.43 kB                | +11.25 kB     | 1.87 kB                    |
| Button                  | `react-slot`, Spinner                                                                                                                        | 84.78 kB                | +12.60 kB     | 3.22 kB                    |
| IconButton              | Button                                                                                                                                       | 84.96 kB                | +12.78 kB     | 3.40 kB                    |
| ErrorState              | Button, lucide                                                                                                                               | 85.36 kB                | +13.18 kB     | 3.80 kB                    |
| Switch                  | `react-switch`                                                                                                                               | 86.30 kB                | +14.12 kB     | 4.74 kB                    |
| Toast (toast + Toaster) | IconButton, lucide (own store, no Radix)                                                                                                     | 86.38 kB                | +14.20 kB     | 4.82 kB                    |
| Tabs                    | `react-tabs`, `react-roving-focus`, `react-collection`                                                                                       | 90.48 kB                | +18.30 kB     | 8.92 kB                    |
| Dialog                  | `react-dialog`, `react-focus-scope`, `react-dismissable-layer`, `react-remove-scroll`, `aria-hidden`, `react-portal`, `react-presence`       | 96.83 kB                | +24.65 kB     | 15.27 kB                   |
| Tooltip                 | `react-tooltip`, `react-popper` + `@floating-ui/*`, `react-dismissable-layer`, `react-portal`                                                | 99.99 kB                | +27.81 kB     | 18.43 kB                   |
| Select                  | `react-select`, `react-popper` + `@floating-ui/*`, `react-collection`, `react-focus-scope`, `react-dismissable-layer`, `react-remove-scroll` | 113.68 kB               | +41.50 kB     | 32.12 kB                   |
| **All 15 components**   |                                                                                                                                              | **125.17 kB**           | **+52.99 kB** |                            |

Own costs do not add up, because components share infrastructure (`@floating-ui` between Select and Tooltip; focus-scope, dismissable-layer, remove-scroll and portal between Select and Dialog). Everything together costs +52.99 kB, not the ~112 kB the sum suggests.

**lucide-react:** runtime plus the first icon is about 1.3 kB gzip, and each further icon about 0.07 kB (11 icons: 1.99 kB). Icons are tree-shaken per import.

**Largest packages in the all-components build** (visualizer treemap, per-module gzip before minification, so they overstate final sizes but rank correctly): `tailwind-merge` 11.76 kB, `@radix-ui/react-select` 9.36 kB, `@floating-ui/{dom,core,utils,react-dom}` 13.56 kB together, `react-remove-scroll` (+ bar, style-singleton, sidecar) 7.62 kB, `@radix-ui/react-tooltip` 4.18 kB, `@radix-ui/react-collection` 3.95 kB, `@radix-ui/react-focus-scope` 2.73 kB, `@radix-ui/react-popper` 2.63 kB, `@radix-ui/react-dismissable-layer` 2.59 kB, `@radix-ui/react-dialog` 2.59 kB.

### Tree-shaking fixes made while measuring

- **Module-level JSX:** Badge and Toaster first kept their status icons in a module-level `Map` of JSX elements. Element creation at module scope counts as a side effect, so every build that touched the `@/shared/ui` barrel kept those modules and four icons (a Skeleton-only build contained 46 UI modules). Icons are now rendered by a small `StatusIcon` component, so unused modules drop out.
- **`sideEffects`:** `package.json` now declares `"sideEffects": ["**/*.css", "./src/main.tsx"]`, so the bundler can drop unused modules behind the barrel.
- **Tailwind sources:** stories, MDX docs and tests are now excluded from the app's Tailwind sources (`@source not`), so Storybook-only classes never reach the app CSS. `.storybook/preview.css` adds them back for Storybook only.

### Production bundle at the end of Phase 2

| Asset | End of Phase 2A         | End of Phase 2          | Delta (gzip) |
| ----- | ----------------------- | ----------------------- | ------------ |
| JS    | 267.20 kB / 83.61 kB gz | 229.82 kB / 72.18 kB gz | −11.43 kB    |
| CSS   | 20.03 kB / 5.23 kB gz   | 30.59 kB / 7.01 kB gz   | +1.78 kB     |

- **JS** is smaller because the temporary preview page (and with it `tailwind-merge`) is gone. The app does not use any component yet. Phase 5 pays the costs above as it adopts them.
- **CSS** is larger because Tailwind generates every class used in `src/shared/ui`, whether or not the app renders the component (Tailwind scans files, not imports). Story-only classes are excluded.

### Revisit in Phase 6

- **Select (+32 kB own)** is the heaviest component. Consider a native `<select>` styled with tokens for simple single-choice fields (perfect a11y and zero JS), and keep Radix Select for rich content. Lazy-load screens that need it.
- **Tooltip (+18 kB)** is mostly `@floating-ui`. That cost is shared with Select, so the first of the two pays it. Evaluate CSS anchor positioning once browser support allows.
- **Dialog (+15 kB):** lazy-load dialog contents and settings screens. Scroll locking (`react-remove-scroll`) is the bulk.
- **`tailwind-merge` (~9 kB base):** use `twJoin`/`clsx` where conflicts are impossible, or a reduced `createTailwindMerge` config. cva variants already avoid most conflicts.
- **CSS:** about 1.8 kB gzip of component classes ship before the app uses those components. Acceptable now; recheck with route-level code splitting (CSS per route).
- Add `size-limit` budgets for the app entry and per-route chunks (Phase 6).

## Telemetry parser throughput (Phase 3A)

**Method:**

- **Runner:** a throwaway script (not committed), run with `tsx` on Node 24.21.0 (V8), on an AMD Ryzen 5 8500G (single thread).
- **Valid input:** 12,138 frames from `SimulationEngine` (seed 1, 50 devices at 5 Hz for 60 s: 70 announcements and 12,068 readings), 170 bytes on average.
- **Hostile input:** five frames: a `NaN` literal, a `__proto__` key, an unknown version, an out-of-range reading, and an oversized frame.
- **Procedure:** each input set is cycled through `parseTelemetryMessage` 100,000 times per run, for 5 runs after a 2,000-call warm-up. The table reports the median, minimum and maximum of the 5 runs.

| Input                 | Median        | Min     | Max     |
| --------------------- | ------------- | ------- | ------- |
| Valid (simulator mix) | 178,587 msg/s | 175,198 | 181,693 |
| Hostile mix           | 280,637 msg/s | 268,466 | 286,402 |

- **Per message:** about **5.6 µs per valid message**, end to end (size check, `JSON.parse` with the forbidden-key reviver, envelope checks, zod/mini strict schema, string sanitization).
- **Hostile frames are faster:** they fail at the cheapest check (the oversized frame never reaches `JSON.parse`).
- **Headroom:** the transport's rate limit (200 msg/s) uses about 0.1 % of one core at this speed. Browser engines and slower phones will be slower; Phase 6 re-measures in the browser under load.

**Production app bundle:** JS unchanged; CSS +1 utility class.

| Asset | End of Phase 2          | After Phase 3A          | Delta (gzip) |
| ----- | ----------------------- | ----------------------- | ------------ |
| JS    | 229.82 kB / 72.18 kB gz | 229.82 kB / 72.18 kB gz | 0            |
| CSS   | 30.59 kB / 7.01 kB gz   | 31.07 kB / 7.06 kB gz   | +0.05 kB     |

- **JS:** nothing in the app imports `src/features/telemetry` yet, so none of the feature's code, the simulator worker or the server is in `dist/`. The JS is byte-for-byte the same size.
- **CSS:** Tailwind scans source _text_, not imports. The word `transition` in `transport/state-machine.ts` (comments and an error message) matches the `transition` utility, so `.transition` was generated (diffed against the previous build's class list; it is the only new class). It is harmless and the UI will use it anyway. Excluding non-UI folders from Tailwind's sources is not worth the fragility.
