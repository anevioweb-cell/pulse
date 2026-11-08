# Design system

The Pulse design system is built in two parts: **2A**, foundations (tokens, theming, typography; this document), and **2B**, components and Storybook. Decisions are recorded in [ADR 0004](adr/0004-design-tokens-as-css-variables.md) (tokens) and [ADR 0005](adr/0005-theme-strategy.md) (theming).

## Token architecture

```
primitives (:root)              semantic roles (@theme, re-pointed per theme)       Tailwind utilities
--neutral-50  #f6f7f8  ───────▶ --color-surface: var(--neutral-50)        ───────▶ bg-surface
--neutral-975 #111418  ─ dark ▶ --color-surface: var(--neutral-975)
--brand-700   #066868  ───────▶ --color-accent:  var(--brand-700)         ───────▶ bg-accent, text-accent
```

### Files

| File                               | Contents                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/styles/tokens.css`     | Primitives, semantic roles (light in `@theme`, dark under `:root[data-theme='dark']`), reduced motion, `numeric` utility, `dark:` variant |
| `src/shared/styles/fonts.css`      | `@font-face` rules for the self-hosted variable fonts (only the subsets used)                                                             |
| `src/shared/styles/tokens.test.ts` | WCAG contrast guard and reduced-motion guard                                                                                              |
| `src/app/index.css`                | Tailwind entry: scoped `@source`, imports, base `body` styles                                                                             |

### Layer 1: primitives

Raw scales, never used directly by components. Generated from OKLCH ramps (even perceptual lightness per step) and stored as hex.

| Scale     | Steps                  | Role                                    |
| --------- | ---------------------- | --------------------------------------- |
| `neutral` | 0, 50–950, 975, 1000   | Surfaces, text, borders (slightly cool) |
| `brand`   | 50–950                 | Teal accent                             |
| `green`   | 50–950                 | Success                                 |
| `amber`   | 50–950                 | Warning                                 |
| `red`     | 50–950                 | Danger                                  |
| `blue`    | 50–950                 | Info                                    |
| `chart-*` | light and dark per hue | Okabe-Ito based series colors           |

### Layer 2: semantic roles

| Role                | Light         | Dark           | Use                                                                         |
| ------------------- | ------------- | -------------- | --------------------------------------------------------------------------- |
| `surface`           | `neutral-50`  | `neutral-975`  | App background                                                              |
| `surface-raised`    | `neutral-0`   | `neutral-950`  | Cards, popovers, menus                                                      |
| `surface-sunken`    | `neutral-100` | `neutral-1000` | Wells, inputs, track backgrounds                                            |
| `text`              | `neutral-950` | `neutral-50`   | Body text                                                                   |
| `text-muted`        | `neutral-700` | `neutral-400`  | Secondary text, labels                                                      |
| `border`            | `neutral-200` | `neutral-800`  | Decorative dividers (exempt from 3:1)                                       |
| `border-strong`     | `neutral-500` | `neutral-500`  | Control borders (inputs, toggles); ≥ 3:1                                    |
| `accent`            | `brand-700`   | `brand-400`    | Primary actions, links, selection                                           |
| `accent-foreground` | `neutral-0`   | `neutral-1000` | Text and icons on `accent`                                                  |
| `success`           | `green-700`   | `green-400`    | Online, healthy                                                             |
| `warning`           | `amber-700`   | `amber-400`    | Degraded, approaching a threshold                                           |
| `danger`            | `red-700`     | `red-400`      | Offline, threshold crossed, destructive                                     |
| `info`              | `blue-700`    | `blue-400`     | Neutral notices                                                             |
| `focus-ring`        | `brand-600`   | `brand-400`    | Keyboard focus outline (always with `outline-offset-2`)                     |
| `chart-1…6`         | darkened hues | lightened hues | Data series: blue, vermillion, bluish green, reddish purple, ochre, neutral |

Status colors are meant for text and icons on surfaces. Status _backgrounds_ (tinted banners) will be added in Phase 2B with their own contrast checks.

### Other tokens

| Group    | Tokens                                                                                                      | Tailwind usage                |
| -------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Radius   | `sm` 0.25rem, `md` 0.375rem, `lg` 0.5rem, `xl` 0.75rem, `2xl` 1rem                                          | `rounded-md`, `rounded-s-lg`  |
| Shadow   | `sm`, `md`, `lg`, tinted per theme through `--shadow-tint`                                                  | `shadow-md`                   |
| Duration | `instant` 50ms, `fast` 120ms, `normal` 200ms (default), `slow` 320ms                                        | `duration-fast`, `transition` |
| Easing   | `standard` (default), `enter`, `exit`                                                                       | `ease-enter`                  |
| Z-index  | `base` 0, `raised` 10, `sticky` 100, `dropdown` 200, `overlay` 300, `modal` 400, `toast` 500, `tooltip` 600 | `z-modal`                     |
| Spacing  | Tailwind's default `--spacing` (0.25rem steps)                                                              | `p-4`, `gap-2`, `ms-3`        |

Under `prefers-reduced-motion: reduce`, every duration token becomes `0.01ms` (not `0`, so `transitionend` still fires).

### Typography

| Token       | Family                                                                  | Subsets loaded | File size        |
| ----------- | ----------------------------------------------------------------------- | -------------- | ---------------- |
| `font-sans` | Inter Variable (Latin UI), then Vazirmatn Variable (Arabic) by fallback | latin, arabic  | 48.3 kB, 46.3 kB |
| `font-mono` | JetBrains Mono Variable                                                 | latin          | 40.4 kB          |

- All faces use `font-display: swap` and `unicode-range`, so a file downloads only when the page contains characters in its range. A page with no Arabic never fetches Vazirmatn.
- Inter's Latin subset covers English and French (including `œ`, `«»` and the euro sign).
- **Type scale** (`--text-*`, each with a paired line height): `xs` 12/16, `sm` 14/20, `base` 16/24, `lg` 18/28, `xl` 20/28, `2xl` 24/32, `3xl` 30/36, `4xl` 36/40 (px).
- **Numbers:** use the `numeric` utility for telemetry values. It sets the mono family, `tabular-nums` (fixed-width digits, so values don't jitter while updating) and `slashed-zero`. For tabular digits in the UI font, use Tailwind's `tabular-nums`.

### Rules

- Components use semantic utilities only. Primitives are not exposed as utilities, and Tailwind's default palette is removed, so off-system colors fail to compile.
- Use logical utilities only (`ms-`, `pe-`, `start-`, `text-end`, `rounded-s-`). ESLint enforces this for string literals.
- Merge classes with `cn()` from `@/shared/lib` (clsx + tailwind-merge, configured with the project's z-index, duration, ease and font tokens).
- A new semantic color role must be added to both themes and to the pair lists in `tokens.test.ts`.
