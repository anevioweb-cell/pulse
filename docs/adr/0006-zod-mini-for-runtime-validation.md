# 0006. Use `zod/mini` for runtime validation

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

CLAUDE.md requires Zod at every external data boundary (WebSocket, REST, storage, URL), and ADR 0001 chose Zod. The first boundary landed in Phase 2: the theme preference read from `localStorage`, validated by a single three-value enum.

Importing the classic `zod` entry point added about 13 kB gzip to the production JS (68.72 → 84.04 kB gzip, measured with `npm run build`). The treemap showed `zod` at 94.63 kB rendered / 25.86 kB gzip before minification. Its method-chaining API (`z.string().min(1).optional()`) hangs every feature off shared prototypes, so the bundler cannot drop what is unused.

Zod 4 ships a second entry point in the same package, `zod/mini`, with a functional, tree-shakable API (`z.optional(z.string().check(z.minLength(1)))`). Schemas still have `.parse()` and `.safeParse()`, and `z.infer` works the same.

## Decision

Application code imports Zod only from `zod/mini`. An ESLint `no-restricted-imports` rule rejects `import ... from 'zod'`.

With `zod/mini`, the same build is 72.17 kB gzip, so validation plus the theme module cost about 3.5 kB gzip instead of about 15 kB.

## Alternatives considered

- **Classic `zod`.** The more familiar API and the best docs coverage, but its cost stays roughly fixed no matter how few schemas we use, and it rivals the app code itself in a bundle whose budget React 19 already took a large share of (see `docs/performance.md`).
- **Valibot.** Similar size to `zod/mini` and designed for tree-shaking, but it is a different library from the one ADR 0001 chose and CLAUDE.md names, so it would need a stack change for little extra gain.
- **Hand-written guards for small boundaries (like the theme enum).** Smallest, but it splits validation into two styles and drifts from the types. CLAUDE.md requires Zod.

## Consequences

- **Positive:** about 13 kB gzip saved now, and new schemas only pay for the validators they use. The WebSocket schemas in Phase 3 will be on the hot path, so keeping the validator small matters there too.
- **Negative:** the functional API (`z.optional(x)`, `.check(z.minLength(n))`) is less familiar than method chaining, and many online examples use the classic API.
- **Neutral:** the `zod` package version is unchanged. Moving back to the classic API would mean editing imports and rewriting chained modifiers; it would be recorded in a new ADR.
- This refines ADR 0001 ("Zod at boundaries") without changing its decision.
