# 0002. Tooling versions and import-boundary enforcement

- **Status:** Accepted. The React version pin is superseded by [0003](0003-upgrade-to-react-19.md).
- **Date:** 2026-11-08

## Context

Phase 1 sets up the toolchain. Two decisions are non-obvious:

1. **Versions.** The latest majors at setup time were TypeScript 7.0 (the native compiler) and ESLint 10. However, `typescript-eslint` 8.x supports TypeScript `<6.1.0` only, and `eslint-plugin-jsx-a11y` declares ESLint `^9` as its newest peer. CLAUDE.md also fixes React at 18, while `create-vite` now scaffolds React 19.
2. **Import boundaries.** CLAUDE.md requires that `shared/` never imports from `features/` or `app/`, and that features import other features only through their `index.ts`. This has to be enforced by lint, including deep imports written with aliases (`@/features/x/internal`) or relative paths (`../x/internal`).

## Decision

- Pin **TypeScript `~6.0`** and **ESLint `^9`** so that type-aware linting (`strictTypeChecked`) and every requested plugin run on supported peer versions. Keep **React 18** per CLAUDE.md (since upgraded to React 19, see ADR 0003). Other tools use their current stable majors (Vite 8, Vitest 5, Tailwind CSS 4).
- Enforce import boundaries with **`eslint-plugin-boundaries`** (`boundaries/dependencies`, default `disallow`). Elements are `app` (`src/app`), `feature` (`src/features/*`, capturing the feature name), and `shared` (`src/shared`). The policies are:
  - `app` → `app`, `shared`, or a feature's `index.ts`
  - `feature` → `shared`, the same feature, or another feature's `index.ts`
  - `shared` → `shared` only
  - Any element → external packages and Node built-ins

  Imports are resolved through `eslint-import-resolver-typescript`, so aliases and relative paths are treated alike.

## Alternatives considered

- **TypeScript 7 / ESLint 10 now.** Rejected: unsupported by `typescript-eslint` and `jsx-a11y`, which would mean peer-dependency overrides and broken or missing type-aware rules.
- **`import-x/no-restricted-paths` zones.** Works for "shared must not import features", but "only through `index.ts`" needs one zone per feature with `except` globs, which must be kept in sync as features are added.
- **`no-restricted-imports` patterns.** Matches import strings, not resolved files, so relative deep imports slip through.
- **Convention only.** Rejected: CLAUDE.md requires enforcement by lint.

## Consequences

- Type-aware linting and all requested plugins run on supported versions.
- New features are covered automatically by the `src/features/*` pattern.
- Upgrading to TypeScript 7 / ESLint 10 is a follow-up once `typescript-eslint` and `jsx-a11y` support them. It should be recorded in an ADR that supersedes this one.
- `npm audit` currently reports a moderate advisory in `minimatch`, pulled in by `typescript-eslint` (dev-only, no runtime exposure). The suggested `--force` fix downgrades `typescript-eslint`, so it is left until upstream ships a patched release.
