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
