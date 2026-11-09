# 0008. Radix UI primitives as the accessibility base

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Overlay and composite widgets (Select, Dialog, Tooltip, Tabs, Switch) are where most custom UI fails accessibility. Getting them right means correct ARIA roles and states, keyboard models from the WAI-ARIA Authoring Practices (arrow keys, Home/End, typeahead, Escape), focus trapping and restoration, hiding background content from assistive technology, scroll locking, collision-aware positioning, and RTL-aware keyboard navigation (required in Phase 8). The library has to fit the rest of the stack: React 19, Tailwind v4 styling with our own tokens (unstyled primitives), the no-inline-styles and logical-properties rules, and a strict CSP later.

## Decision

Use **Radix UI primitives** (individual `@radix-ui/react-*` packages, pre-approved in CLAUDE.md) as the behavior and accessibility layer for Select, Dialog, Tooltip, Tabs and Switch, plus `react-slot` for `asChild` and `react-direction` for RTL. All styling is ours: Tailwind with semantic tokens, keyed on Radix's `data-*` state attributes. Simple components with no complex interaction model (Button, Input, Badge, Card, Skeleton, Spinner, EmptyState, ErrorState) use native elements. Toast uses our own tiny store and live regions (no Radix Toast), because the requirements (an imperative `toast()` API, no new state library) are simple, and that keeps it free of Radix's toast viewport and swipe code.

## Alternatives considered

- **Headless UI (Tailwind Labs).**
  - Pros: unstyled, Tailwind-friendly, good defaults.
  - Cons: a smaller component set (no Tooltip, no Toast; Tabs and Select variants are more limited), less granular composition, and no direction provider for RTL keyboard handling.
- **React Aria (Adobe).**
  - Pros: the most rigorous accessibility and internationalization of the three, with first-class RTL, locale-aware behavior and mobile screen-reader quirks handled.
  - Cons: larger and more abstract (hooks plus render-prop components with their own class-name conventions), and a steeper learning curve for reviewers. It would be the choice if Pulse needed date pickers, number fields with locale formatting, or drag-and-drop. Keep it in mind for Phase 8 if those appear.
- **Build from scratch.**
  - Pros: smallest possible bundle and full control.
  - Cons: re-implementing focus traps, typeahead, scroll locking, collision handling and screen-reader workarounds is weeks of work with a long tail of bugs, which is exactly the failure mode this ADR avoids. It's reserved for simple components (as done for Toast).
- **A styled kit (MUI, Chakra, Mantine).** Fast, but it brings its own styling engine, which conflicts with Tailwind tokens, adds runtime style injection (CSP) and makes the UI look generic.

## Consequences

- **Positive:**
  - Tested keyboard and ARIA behavior out of the box. Our own tests (jsdom plus jest-axe) and a real-browser axe pass over every story found 0 violations.
  - RTL keyboard navigation through `DirectionProvider`.
  - Small, separately versioned packages; we only ship what we import.
- **Negative:**
  - **Bundle size.** Select (about 32 kB gzip own cost) and Tooltip (about 18 kB, mostly `@floating-ui`) are the heaviest components (`docs/performance.md`). They share infrastructure, so the marginal cost falls as more are used.
  - **CSP.** Two runtime `<style>` injections (the Select viewport and `react-remove-scroll`) need a hash, a nonce or `'unsafe-inline'` under a strict CSP (`docs/security.md`).
  - **Upgrades.** Radix packages version independently. Upgrade them together and rerun the a11y checks.
- **Follow-up:**
  - **App root:** wrap the app in `DirectionProvider` when i18n lands (Phase 8). Storybook already does.
  - **Phase 6:** revisit a native `<select>` for simple choices.
