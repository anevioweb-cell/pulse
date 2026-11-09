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

## Live store ingestion and publishing (Phase 3B)

**Method:**

- **Runner:** a throwaway script (not committed), run with `tsx` on Node 24.21.0, AMD Ryzen 5 8500G, single thread.
- **Input:** `SimulationEngine` (seed 1, dropouts off) pre-generates readings for 120 s at 5 Hz per device, encoded as wire frames, so generation is not timed.
- **What is timed:** `TelemetryIngestor`, the code behind `TelemetryService` (the service only adds the transport callback and the frame request).
- **Runs:** each figure is the median of 5 runs. Publish costs are the median and p95 of 1,800 frames, after 200 warm-up frames.

**Ingestion throughput**

| Path                                                                                       | 12 devices    | 200 devices   |
| ------------------------------------------------------------------------------------------ | ------------- | ------------- |
| Raw frame → parse → ring buffer write (no publish)                                         | 184,711 msg/s | 178,143 msg/s |
| Raw → buffers → published store state, one publish per message (worst case)                | 137,709 msg/s | –             |
| Raw → buffers → published state, one publish per 17 messages (200 devices × 5 Hz ÷ 60 fps) | –             | 170,739 msg/s |
| Raw → buffers → published state, one publish per 200 messages                              | –             | 177,010 msg/s |

Parsing dominates, about 5.4–5.6 µs per message; the buffer writes add little on top of the Phase 3A parser figure. Batching per frame keeps publishing to a few percent of the ingestion cost.

**Publish cost per frame** (`ingestor.publish`: builds the next immutable state, reusing unchanged device objects; excludes React rendering)

| Devices | Every device changed since last frame | One device changed        |
| ------- | ------------------------------------- | ------------------------- |
| 12      | median 1.3 µs, p95 2.1 µs             | median 0.9 µs, p95 1.2 µs |
| 200     | median 13.2 µs, p95 18.7 µs           | median 5.3 µs, p95 6.2 µs |

A 60 fps frame budget is 16.7 ms, so even 200 changing devices use about 0.1 % of it for the store itself. React rendering of subscribers is the real cost, and Phase 5 and Phase 6 measure it.

**Memory:**

- Ring buffers are allocated once per device: 144,000 B with the default capacity of 1800 samples × 5 metrics. That is 1,728,000 B for 12 devices and 28,800,000 B for 200 devices, measured with `bufferBytes` (constant regardless of messages pushed).
- The device cap (`STORE.MAX_DEVICES` = 256) bounds the total at about 36.9 MB.

**Production app bundle:**

| Asset | End of Phase 3A         | After Phase 3B          | Delta (gzip) |
| ----- | ----------------------- | ----------------------- | ------------ |
| JS    | 229.82 kB / 72.18 kB gz | 229.82 kB / 72.18 kB gz | 0            |
| CSS   | 31.07 kB / 7.06 kB gz   | 31.09 kB / 7.07 kB gz   | +0.01 kB     |

- **JS:** the app still imports nothing from `src/features/telemetry`, so Zustand, the store and the service are not in `dist/`. Their cost will be measured when Phase 5 wires them in.
- **CSS:** Tailwind scans source text. A class-list diff against the pre-3B build (built in a separate `git worktree`) showed two new classes:
  - `.static`, from `static instances` in the test fakes. Fixed: `testing/` folders are now excluded from Tailwind's sources, like tests and stories.
  - `.contents`, from the word "contents" in a comment in `store/selectors.ts`. Kept; it is harmless.

## Phase 4A: data-access layer

All figures were measured on the same machine as the earlier sections: AMD Ryzen 5 8500G (12 threads), 6 GB RAM, Node 24.21.0, with a desktop session running. Each table names its method. Runs on this machine vary by up to about 2× between invocations, so two invocations are reported where they differed.

### Downsampling throughput

`npm run bench:downsample` (`scripts/bench/downsample.ts`):

- **Input:** a synthetic sorted series (1 s spacing, noisy sine) as `Float64Array`s.
- **Runs:** one untimed warm-up call per case, then 21 timed runs. Each run calls `downsampleMinMax` enough times to process at least 1,000,000 input points, so small inputs are not lost in timer resolution.
- **Reported:** the median per-call time, and throughput = input points ÷ that time. Two invocations, first / second.

| Input points | maxPoints | Median per call (ms) | Points per second |
| -----------: | --------: | -------------------: | ----------------- |
|       10,000 |       100 |        0.014 / 0.013 | 691 M / 771 M     |
|       10,000 |       500 |        0.015 / 0.015 | 653 M / 654 M     |
|       10,000 |      2000 |        0.030 / 0.031 | 332 M / 326 M     |
|      100,000 |       100 |        0.124 / 0.124 | 808 M / 807 M     |
|      100,000 |       500 |        0.154 / 0.154 | 651 M / 648 M     |
|      100,000 |      2000 |        0.193 / 0.209 | 517 M / 479 M     |
|    1,000,000 |       100 |        1.207 / 1.234 | 828 M / 811 M     |
|    1,000,000 |       500 |        1.289 / 1.313 | 776 M / 762 M     |
|    1,000,000 |      2000 |        1.486 / 1.580 | 673 M / 633 M     |

Downsampling a 7-day range (60,481 samples) therefore costs about 0.1 ms (interpolated from the table). The whole Demo Mode readings request for a 7-day range at 2000 points takes a median of 7.5 ms over 11 calls (generating the samples with `HistoryModel` dominates), measured once with a throwaway script.

### Mock server REST latency (localhost)

`npm run bench:rest` (`scripts/bench/rest-latency.ts`):

- **Server:** the mock server runs as a separate Node process (`server/index.ts --seed 7`, so it has its own event loop), on 127.0.0.1.
- **Client:** Node `fetch` (keep-alive). Latency is the time from `fetch()` to the full body being read.
- **Requests:** per row, 20 untimed warm-up requests, then 400 timed requests, sent in bursts of _concurrency_ simultaneous requests.
- **Pacing:** bursts are paced to at most 40 requests per second, below the server's limit of 50 per second per client. No request got a 429 (the script fails on any non-200), and pacing time is not counted.
- **Reported:** p50 and p95 (nearest rank). Two invocations, first / second.

| Endpoint                                                                | Response size | Concurrency | Requests | p50 (ms)    | p95 (ms)      |
| ----------------------------------------------------------------------- | ------------- | ----------: | -------: | ----------- | ------------- |
| `GET /api/devices` (12 devices)                                         | 1,199 B       |           1 |      400 | 0.88 / 0.91 | 1.10 / 1.18   |
| `GET /api/devices`                                                      | 1,199 B       |           8 |      400 | 1.17 / 1.13 | 1.75 / 1.64   |
| `GET /api/devices/esp32-01/readings` (24 h, temperature, maxPoints=500) | 10,068 B      |           1 |      400 | 2.56 / 2.48 | 3.14 / 2.95   |
| same readings query                                                     | 10,068 B      |           8 |      400 | 7.18 / 6.91 | 12.53 / 11.75 |

A 24 h readings request computes 8,641 samples (10 s resolution, both ends included) and downsamples them on every call. The server does not cache, so with 8 in flight the requests queue on its single thread. That is fine for a dev tool. The rate limit, not CPU, bounds what one client can ask for.

### Persistence read and write (Chromium, real IndexedDB)

`npm run bench:persistence`, then open the printed URL (`scripts/bench/persistence/`). It runs in the desktop app's built-in Chromium 152, where `performance.now()` is coarsened to 0.1 ms.

- **Typical cache:** device list, alert rules, and the last hour of temperature for each of the 12 devices (14 queries).
- **Near the cap:** the typical cache plus 24 h ranges at 2000 points for every device and metric (74 queries). The serializer stops at the 1 MiB cap after 38 entries (995.4 KiB).
- **Write:** `serializeQueryCache` (filter, sort, cap, JSON) + IndexedDB `set`, that is one debounced persist.
- **Read:** `restoreQueryCache` into an empty QueryClient: IndexedDB `get`, size check, safe JSON parse, migration check, schema validation of every entry, `setQueryData`.
- **Runs:** one warm-up, then 25 timed runs of each. p50 / p95.

| Cache                              | Stored size | Write p50 / p95 (ms)         | Read p50 / p95 (ms)          |
| ---------------------------------- | ----------- | ---------------------------- | ---------------------------- |
| Typical (14 entries)               | 90.6 KiB    | 1.4 / 3.0, and 1.6 / 4.4     | 3.1 / 5.0, and 4.1 / 6.5     |
| Near the cap (38 entries)          | 995.4 KiB   | 12.0 / 13.2, and 13.5 / 28.1 | 32.5 / 38.4, and 64.7 / 81.6 |
| Near the cap, before the fix below | 995.4 KiB   | 90.8 / 105.7                 | 31.7 / 36.6                  |

**Fix made while measuring.** `serializeQueryCache` re-stringified the whole record after adding each entry, to check the byte cap. That made a write near the cap quadratic: 38 entries meant about 19 MB of JSON work. It now adds each entry's byte length (plus one comma) to a running total. The output is identical (same 38 entries, same bytes), and a test pins the exact byte boundary. The near-cap write went from 90.8 ms to 12.0 ms (p50). Reads were unaffected. They are dominated by schema validation of every point, and their spread between invocations (32 to 65 ms) is machine noise, not code.

### Smoke test against the running server

Server started with `npm run server -- --port 8788` (defaults: seed 20,261,109, 12 devices, allowed origins `http://localhost:5173` and `http://127.0.0.1:5173`). Commands and full output:

**1. Valid request** (allowed origin, 10-minute range, 4 points):

```
$ curl -sS -i 'http://127.0.0.1:8788/api/devices/esp32-01/readings?metric=temperature&from=1794254194254&to=1794254794256&maxPoints=4' -H 'Origin: http://localhost:5173'
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:5173
Vary: Origin
Content-Type: application/json; charset=utf-8
X-Content-Type-Options: nosniff
Cache-Control: no-store
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
Referrer-Policy: no-referrer
Content-Length: 320
Date: Mon, 09 Nov 2026 20:06:34 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"deviceId":"esp32-01","metric":"temperature","from":1794254194254,"to":1794254794256,"source":"simulated","resolution":{"method":"min-max","sampleIntervalMs":10000,"bucketSize":30,"rawCount":60,"returnedCount":4},"timestamps":[1794254200000,1794254370000,1794254500000,1794254670000],"values":[21.77,26.02,23.65,19.74]}
```

**2. Invalid query parameters** (unknown metric, `from` below the minimum timestamp, `to` not a number):

```
$ curl -sS -i 'http://127.0.0.1:8788/api/devices/esp32-01/readings?metric=co2&from=1&to=yesterday' -H 'Origin: http://localhost:5173'
HTTP/1.1 400 Bad Request
Access-Control-Allow-Origin: http://localhost:5173
Vary: Origin
Content-Type: application/json; charset=utf-8
X-Content-Type-Options: nosniff
Cache-Control: no-store
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
Referrer-Policy: no-referrer
Content-Length: 183
Date: Mon, 09 Nov 2026 20:06:34 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"error":{"code":"bad_request","message":"Invalid request","issues":[{"path":"from","code":"too_small"},{"path":"to","code":"invalid_type"},{"path":"metric","code":"invalid_value"}]}}
```

**3. Disallowed origin, REST** (refused before routing, no CORS headers):

```
$ curl -sS -i http://127.0.0.1:8788/api/devices -H 'Origin: https://evil.example'
HTTP/1.1 403 Forbidden
Content-Type: application/json; charset=utf-8
X-Content-Type-Options: nosniff
Cache-Control: no-store
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
Referrer-Policy: no-referrer
Content-Length: 68
Date: Mon, 09 Nov 2026 20:06:34 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"error":{"code":"forbidden_origin","message":"Origin not allowed"}}
```

**4. WebSocket upgrade with a disallowed Origin**, then the same upgrade from an allowed origin as a control:

```
$ curl -sS -i --http1.1 http://127.0.0.1:8788/ -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://evil.example' --max-time 3
HTTP/1.1 401 Unauthorized
Connection: close
Content-Type: text/html
Content-Length: 12

Unauthorized

$ curl -sS -i --http1.1 http://127.0.0.1:8788/ -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: http://localhost:5173' --max-time 2
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

The 401 body is written by the `ws` library (`verifyClient` returning false), not by Pulse, which is why it is `text/html` without the JSON envelope.

### Query devtools are absent from production

`src/app/query-devtools.tsx` imports `@tanstack/react-query-devtools` only inside an `import.meta.env.DEV` branch. That constant is `false` in a production build, so the dynamic import is dead code. After `npm run build`:

```
$ ls dist/assets
index-8_WYCBUh.js  index-nqkatVR7.css  inter-latin-wght-normal-Dx4kXJAl.woff2  jetbrains-mono-latin-wght-normal-B9CIFXIH.woff2  vazirmatn-arabic-wght-normal-Cafbb7Zc.woff2
$ grep -rl "react-query-devtools" dist; echo "exit=$?"
exit=1
$ grep -rlE "ReactQueryDevtools|TanstackQueryDevtools|query-devtools|tsqd-" dist; echo "exit=$?"
exit=1
$ grep -rlE "Open Tanstack query devtools|Close tanstack query devtools" dist; echo "exit=$?"
exit=1
```

- **No output:** no file matches the package name, the component names, the devtools CSS class prefix (`tsqd-`) or the devtools' UI strings, and no extra chunk is emitted.
- **Positive control:** the same grep on a `--mode development` build finds three files, including a separate `DevtoolsComponent-*.js` chunk, so an empty result means "absent", not "grep is wrong".
- **Sanity check:** TanStack Query core is present in the production bundle (`gcTime` appears 7 times, `queryHash` 15 times).

### Production app bundle

| Asset | End of Phase 3B         | End of Phase 4A         | Delta (gzip) |
| ----- | ----------------------- | ----------------------- | ------------ |
| JS    | 229.82 kB / 72.18 kB gz | 256.36 kB / 79.84 kB gz | +7.66 kB     |
| CSS   | 31.09 kB / 7.07 kB gz   | 31.09 kB / 7.07 kB gz   | 0            |

What the app imports now:

- **New in 4A:** `main.tsx` wraps the app in `AppProviders`, which creates the QueryClient (`createQueryClient`: retry policy, `ApiError`, query defaults) and renders `QueryClientProvider`. That is the whole JS delta: TanStack Query's client, cache and provider. No dashboard UI uses them yet.
- **Not in `dist/` yet:**
  - the telemetry feature (both `TelemetryApi` implementations, hooks, query keys and policies, the simulator, the Zustand store);
  - the fetch wrapper;
  - the persistence code and `idb-keyval`.

  `grep` finds no `keyval-store`, `telemetry-rest-v1`, `esp32` or `Request timed out` in the bundle. Phase 5 wires them in, and their cost is measured there.

- **Unchanged:** Zod is in the bundle as before 3B ended, for the theme's `localStorage` validation.
