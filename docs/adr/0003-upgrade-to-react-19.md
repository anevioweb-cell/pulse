# 0003. Upgrade to React 19

- **Status:** Accepted. Supersedes the React version in [0001](0001-stack-choice.md) and [0002](0002-tooling-versions-and-import-boundaries.md).
- **Date:** 2026-11-08

## Context

Phase 1 shipped on React 18.3, as originally fixed in CLAUDE.md. React 19 (19.3.x at the time of writing) is the current stable major, and the tooling already in place supports it: `create-vite` scaffolds React 19 by default, `@testing-library/react` 16 accepts `^18 || ^19`, and `eslint-plugin-react-hooks` 7 targets it.

At this point the app is a single placeholder component with no third-party UI libraries. Phase 2 (design system) is about to introduce the first real components and dependencies (Radix UI, class-variance-authority), and later phases bring charts, tables, forms and i18n.

## Decision

We will upgrade `react`, `react-dom`, `@types/react` and `@types/react-dom` to React 19 now, before building any components, and update CLAUDE.md so that React 19 is the baseline.

## Alternatives considered

- **Stay on React 18 and upgrade later.** Every component, hook and test written in Phases 2–5 would then go through a migration (ref-as-prop, removed `forwardRef` needs, stricter types, changed `useRef` signatures). The cost grows with each phase, and late upgrades of a portfolio project are exactly the kind of churn this plan aims to avoid.
- **Upgrade only when a feature needs React 19 APIs.** Defers the decision without reducing its cost, and leaves new code written against an API that is about to change.

## Consequences

- **What changed:** only dependency versions and docs. No source changes were needed: the app already uses `createRoot`, has no `forwardRef`, `defaultProps`, string refs, legacy context or `ReactDOM.render`. Typecheck, lint, format check, tests and build all pass unchanged.
- **Positive:**
  - New components can use React 19 idioms from day one: `ref` as a regular prop (no `forwardRef`), `use`, Actions and `useActionState`/`useOptimistic` for settings forms, `<Context>` as a provider, and document metadata.
  - Aligned with the current ecosystem; libraries increasingly target 19 first.
- **Negative:**
  - The production JS bundle grew from 140.86 kB (45.80 kB gzip) to 219.79 kB (68.72 kB gzip), about +23 kB gzip, mostly from `react-dom`. This is recorded in `docs/performance.md` and will be revisited in Phase 6 (performance budgets with size-limit).
  - Every library added later must support React 19. All pre-approved libraries in CLAUDE.md currently do.
