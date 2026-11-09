# 0007. Component API conventions

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Phase 2B adds the first 15 shared components (`src/shared/ui`). Every later feature builds on them, so their APIs need to be predictable: a developer who has used one component should be able to guess how the next one works. The conventions must also keep the CLAUDE.md rules (tokens only, logical properties, no inline styles, strict types, React 19) and stay accessible by default.

## Decision

1. **One folder per component, one public barrel.** `src/shared/ui/<Component>/` holds `Component.tsx`, `Component.test.tsx`, `Component.stories.tsx` and `index.ts`. Consumers import only from `@/shared/ui`. Shared internals (`internal/`: focus-ring classes, `Field`, `StatusIcon`, state layout) are not exported.
2. **Composition over configuration for structured widgets.** Dialog, Tabs and Card are compound components (`DialogContent`, `DialogTitle`, `TabsList`, `TabsTrigger`, `CardHeader`…) that mirror the Radix part structure, so layout stays in the consumer's hands. Leaf controls with a fixed structure (Input, Select, Switch) take props (`label`, `hint`, `error`, `options`), so the accessible wiring (`id`, `aria-describedby`, `aria-invalid`) can't be forgotten.
3. **Variants with class-variance-authority.** Visual options are `variant` and `size` props defined with `cva`. Types come from `VariantProps<typeof x>`. There are no boolean style flags (`isLarge`, `isPrimary`). Consumer overrides go through `className`, merged last with `cn()` (tailwind-merge), so consumers can adjust layout without forking.
4. **State through data attributes.** Visual state comes from attributes, not from ad-hoc class toggling:
   - Radix sets `data-state`, `data-disabled`, `data-highlighted` and `data-placeholder`;
   - our own components set `data-loading`, `data-invalid` and `data-variant`;
   - styles target them (`data-[state=checked]:bg-accent`, `data-invalid:border-danger`).

   State is then inspectable in DevTools and tests, and styling and logic stay separate.

5. **React 19 refs.** `ref` is a regular prop (`ComponentProps<'button'>` includes it), so there is no `forwardRef`. Context is provided with `<Context value>` and read with `use()`.
6. **`asChild` through Radix `Slot`** where a component's styling is useful on another element: Button (render a link as a button), Card (render a `<section>`/`<article>`), and the Dialog and Tooltip triggers.
7. **Native props pass through.** Each component extends the props of the element it renders (`ComponentProps<'input'>`, `ComponentProps<typeof Radix.Root>`) and spreads the rest, so `aria-*`, `data-*`, `name`, `autoComplete` and event handlers work without extra API.
8. **Accessible by default; some props required.**
   - `IconButton.label`, `Input.label`, `Select.label` and `Switch.label` are required.
   - Status components always show an icon or text as well as color.
   - Every interactive element uses the shared `focusRing` (`outline-offset-2`, required by ADR 0004).
   - Buttons default to `type="button"`.
   - Loading keeps the accessible name and sets `aria-busy`.
9. **TSDoc on every exported component and non-obvious prop**, so Storybook autodocs and editor hovers explain the behavior, not just the type.
10. **Each component ships with tests and stories.** The tests cover keyboard, states and callbacks, plus a jest-axe check. The stories cover every variant and state.

## Alternatives considered

- **Single-component APIs with many props for everything** (`<Dialog title actions footer />`). Easier for trivial cases, but they turn into prop soup and block custom layouts. We use them only for leaf controls.
- **Styled-system or variant props mapped to inline styles.** Violates the no-inline-styles rule and the token pipeline.
- **`forwardRef` everywhere.** No longer needed in React 19 and adds noise.
- **Class toggling from React state** (`className={open ? 'x' : 'y'}`). Duplicates state Radix already exposes and drifts from the real ARIA state.
- **Deep imports** (`@/shared/ui/Button/Button`). They make refactoring harder and bypass the public API. The barrel plus `"sideEffects"` in `package.json` keeps tree-shaking intact (measured in `docs/performance.md`).

## Consequences

- **Positive:**
  - The APIs are consistent, so components are fast to learn.
  - Accessibility wiring is built in.
  - State lives in attributes, so tests can assert it and DevTools can show it.
  - Overrides are possible without forking.
- **Negative:**
  - Compound components need more lines at the call site than a single prop-driven component.
  - Every component carries the `cn()`/tailwind-merge base cost (about 9 kB gzip, shared).
- **Follow-up:** "Checklist for adding a new component" in `docs/design-system.md` turns these rules into a review list.
