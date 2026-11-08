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
