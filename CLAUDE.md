# Pulse

Pulse is a real-time IoT telemetry dashboard (ESP32 sensors streaming over WebSocket). It is a portfolio project built to demonstrate senior-level frontend engineering, so correctness, structure, and documented reasoning matter as much as features.

## Stack

- React 19 + TypeScript (`strict: true`) + Vite
- Tailwind CSS
- Zustand: client and live (streaming) state
- TanStack Query: server state
- Zod: runtime validation
- Vitest + Testing Library (unit/component), Playwright (e2e)

Pre-approved additions to the stack (no ADR needed):

- Radix UI primitives
- class-variance-authority
- clsx
- tailwind-merge
- lucide-react
- `@fontsource-variable/*` font packages
- uPlot
- TanStack Table and TanStack Virtual
- idb-keyval
- vite-plugin-pwa
- react-i18next
- react-router
- DOMPurify (only if rich text is ever needed)
- MSW
- Storybook
- jest-axe
- size-limit

Anything else requires recording an ADR first.

## Architecture

Feature-based folders:

```
src/
  app/        # app shell, providers, routing, global setup
  features/   # one folder per feature (e.g. devices, telemetry, alerts)
    <feature>/
      index.ts   # the feature's only public API
      ...
  shared/     # feature-agnostic UI, hooks, utils, constants, tokens
```

- Features must not import from other features, except through that feature's `index.ts`. Never deep-import (`features/a/internal/...`) from outside `a`.
- `shared/` must not import from `features/` or `app/`. `features/` may import from `shared/`. `app/` may import from both.
- Enforce these boundaries with lint rules, not just convention.

## Code rules

- No `any` (including `as any` and implicit any). Use `unknown` and narrow, or Zod-inferred types.
- No `dangerouslySetInnerHTML`.
- No inline styles (`style={...}`). Use Tailwind classes and design tokens.
- Logical properties only, because RTL (Arabic) support is required in Phase 8. Use `ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`, `text-start`/`text-end`, `border-s`/`border-e`, `rounded-s`/`rounded-e`. Never use `ml-`/`mr-`, `pl-`/`pr-`, `left-`/`right-`, `text-left`/`text-right`, `border-l`/`border-r`, `rounded-l`/`rounded-r`, or physical properties in CSS (`margin-left`, `left`, and so on). ESLint flags physical Tailwind utilities in string literals.
- No magic numbers or strings. Use named constants or design tokens (thresholds, intervals, retry limits, breakpoints, colors, etc.).
- Derive types from Zod schemas (`z.infer`) rather than duplicating them.

## Data boundaries

Every external data boundary is validated with Zod before it enters the app:

- WebSocket messages
- REST responses
- `localStorage` / `sessionStorage`
- URL (search params, route params)

Invalid data is handled explicitly (dropped, logged, or surfaced), never cast through.

## Git

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, etc.), with an optional scope, e.g. `feat(telemetry): add reconnecting socket`.
- Small, focused commits: one logical change each.
- Never add `Co-Authored-By` trailers, "Generated with Claude Code" lines, session links, or any other AI attribution to commit messages, PR descriptions, or code comments. Commits are authored solely by the repository owner. This is also enforced in `.claude/settings.json` (`attribution`).

## Decisions (ADRs)

Every non-trivial technical decision is recorded as an ADR in `docs/adr/NNNN-title.md` using `docs/adr/0000-template.md` (context, decision, alternatives, consequences). Write the ADR in the same change as the decision. Never edit an accepted ADR's decision; supersede it with a new one.

## Definition of done

Before finishing any task, run typecheck, lint, and tests, and report the results (including failures or anything skipped). Do not claim a task is done if any of these fail.

## Roadmap

Progress is tracked in `docs/ROADMAP.md`. Tick items off as phases complete.
