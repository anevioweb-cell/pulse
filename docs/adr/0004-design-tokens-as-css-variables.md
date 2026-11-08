# 0004. Design tokens as CSS variables with a semantic layer, exposed through Tailwind v4 `@theme`

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Phase 2 needs a token system that:

- supports light and dark themes now, and possibly more (high contrast) later, switchable at runtime without rebuilding or re-rendering React;
- keeps components independent of raw colors, so a theme change never means editing components;
- works with Tailwind CSS v4, which is configured in CSS (`@theme`) and has no `tailwind.config.js`;
- can be checked automatically for WCAG contrast;
- covers more than color: radius, shadows, motion, z-index, typography, and a colorblind-safe chart palette.

## Decision

Tokens live in `src/shared/styles/tokens.css` as CSS custom properties, in two layers:

1. **Primitives** (`:root`): raw scales, such as `--neutral-0…1000`, `--brand-50…950`, `--green|amber|red|blue-50…950` and the chart hues. They are sRGB hex values generated from OKLCH ramps, so each step has an even perceptual lightness. Components never use primitives.
2. **Semantic roles** (Tailwind `@theme`): `--color-surface`, `--color-text-muted`, `--color-accent`, `--color-focus-ring`, `--color-chart-1…6`, and so on, defined as `var(--primitive)`. Because they are declared in `@theme`, Tailwind generates utilities for them (`bg-surface`, `text-text-muted`, `outline-focus-ring`). The dark theme only re-points the same variables under `:root[data-theme='dark']`. Utilities reference the variables, so switching themes is just an attribute change.

Tailwind's default palette and scales (`--color-*`, `--radius-*`, `--shadow-*`, `--ease-*`, `--font-*`, `--text-*`) are reset to `initial`, so only project tokens exist and an off-system class such as `bg-red-500` simply does not compile. Other token groups use Tailwind's own namespaces: `--radius-*`, `--shadow-*`, `--transition-duration-*` (for `duration-fast`), `--ease-*`, `--z-index-*` (for `z-modal`), `--font-*` and `--text-*`.

A Vitest test (`tokens.test.ts`) parses the CSS, resolves every `var()` chain for both themes, and requires:

- 4.5:1 for every text role on every surface;
- 3:1 for `border-strong` and `focus-ring` on every surface, and for every chart series on every surface (WCAG 1.4.11);
- 4.5:1 for `accent-foreground` on `accent`;
- that every duration token collapses under `prefers-reduced-motion`.

## Alternatives considered

- **Tailwind's default palette used directly in components** (`bg-slate-50 dark:bg-slate-900`). Fast to start, but every component encodes both themes, a palette change touches every file, and nothing enforces contrast.
- **`dark:` variants instead of variable swapping.** Doubles the class lists, can't add a third theme without editing every component, and is easy to forget on one element.
- **Tokens in TypeScript (a JS theme object, or CSS-in-JS).** Type-safe, but runtime theming would need React re-renders or style injection, and it conflicts with the Tailwind and no-inline-styles rules.
- **Style Dictionary or another token pipeline generating CSS.** Worth it for multi-platform design systems. For one web app it adds a build step and a second source of truth.
- **Semantic layer only (no primitives).** Fewer variables, but both themes would duplicate raw values, and adding a theme would mean choosing every color again instead of re-pointing roles.
- **OKLCH values in the CSS.** Better perceptual control, but the contrast test would need a color-space conversion. Generating in OKLCH and storing hex keeps the runtime and the test simple.

## Consequences

- **Positive:** a theme switch is a single attribute change with no React work. Components read like their intent (`text-text-muted`). Contrast regressions fail CI. Off-palette colors don't compile.
- **Negative:**
  - Utility names can read redundantly (`text-text`, `border-border`).
  - Raw primitives are reachable only through `var()` in CSS, which is intended but occasionally inconvenient.
  - Tailwind emits every token as a CSS variable, adding about 3 kB of CSS.
- **Follow-up:**
  - The decorative `border` role is deliberately exempt from the 3:1 check (WCAG 1.4.11 only covers borders needed to identify a control). Control borders must use `border-strong`.
  - The focus ring has low contrast on `accent` (1.0–1.4:1), so focus outlines must always be drawn with an offset over the surface (`outline-offset-2`). Part B components will follow this.
  - Charts must not rely on color alone: lines also get markers or dash patterns (Phase 5).
