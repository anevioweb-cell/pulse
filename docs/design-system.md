# Design system

The Pulse design system has two parts: **foundations** (tokens, theming, typography) and **components** (`src/shared/ui`, documented in Storybook). Decisions are recorded in [ADR 0004](adr/0004-design-tokens-as-css-variables.md) (tokens) and [ADR 0005](adr/0005-theme-strategy.md) (theming).

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

## Components

All components live in `src/shared/ui/<Component>/` and are imported only from `@/shared/ui`. Conventions are in [ADR 0007](adr/0007-component-api-conventions.md), and the choice of Radix in [ADR 0008](adr/0008-radix-as-accessibility-base.md). Run `npm run storybook` to browse every variant and state with the theme, direction and locale toolbar. The **Foundations** docs page there replaces the temporary preview page from Phase 2A.

### Catalog

| Component      | Radix base                               | Variants and sizes                                                                   | Accessibility notes                                                                                                                                                                                                          |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Button**     | `Slot` (for `asChild`)                   | `primary`, `secondary`, `ghost`, `danger` · `sm`, `md`, `lg` · `loading`, `disabled` | `type="button"` by default. Loading sets `aria-busy`, disables, and keeps the label as the accessible name. `asChild` renders links with button styles.                                                                      |
| **IconButton** | via Button                               | Button variants · `sm`, `md`, `lg`                                                   | `label` is required (becomes `aria-label`). While loading, the spinner replaces the icon. Mirror directional icons with `rtl:-scale-x-100`.                                                                                  |
| **Input**      | none (native `<input>`)                  | `sm`, `md`, `lg` · hint, error, required, hidden label                               | Label required. Hint and error linked with `aria-describedby`. Error sets `aria-invalid` and `data-invalid` and shows an icon plus text. The required asterisk is hidden from assistive tech (native `required` carries it). |
| **Select**     | `@radix-ui/react-select`                 | `sm`, `md`, `lg` · placeholder, hint, error, disabled options                        | Combobox trigger and listbox. Arrows, Home/End, typeahead, Escape. Rendered in a portal at `z-dropdown`. Checked option shows a check icon.                                                                                  |
| **Switch**     | `@radix-ui/react-switch`                 | `sm`, `md` · description                                                             | `role="switch"` with `aria-checked`. Space toggles, the label toggles. The thumb translation mirrors in RTL.                                                                                                                 |
| **Tabs**       | `@radix-ui/react-tabs`                   | `underline`, `pill`                                                                  | Arrow keys (mirrored in RTL through `DirectionProvider`), Home/End, disabled tabs skipped. The active tab is marked by a bar or raised surface, not color alone. Panels are focusable.                                       |
| **Dialog**     | `@radix-ui/react-dialog`                 | `sm`, `md`, `lg` · optional built-in close button                                    | Focus trap and restore, Escape and outside click close, background hidden with `aria-hidden` and scroll-locked. `DialogTitle` names it and `DialogDescription` describes it.                                                 |
| **Tooltip**    | `@radix-ui/react-tooltip`                | side, align, delay                                                                   | Opens on hover and keyboard focus, closes on Escape, linked with `aria-describedby`. Supplementary only (not available on touch).                                                                                            |
| **Badge**      | none                                     | `neutral`, `accent`, `success`, `warning`, `danger`, `info` · `sm`, `md`             | Status variants show a distinct icon shape as well as color. Text sits on a raised surface (contrast token-checked).                                                                                                         |
| **Card**       | `Slot` (for `asChild`)                   | `raised`, `flat`, `sunken` · padding `none`, `sm`, `md`                              | `CardTitle` heading level is configurable (`as`) to fit the page outline.                                                                                                                                                    |
| **Skeleton**   | none                                     | `text`, `rect`, `circle`                                                             | `aria-hidden`. The loading region sets `aria-busy` and a hidden label. The shimmer stops under reduced motion.                                                                                                               |
| **Toast**      | none (own store, `useSyncExternalStore`) | `neutral`, `success`, `warning`, `danger`, `info` · duration                         | Live regions exist before any toast: assertive for danger, polite otherwise. Auto-dismiss pauses on hover and focus. Escape or the button dismisses. At most 4 visible.                                                      |
| **Spinner**    | none                                     | `sm`, `md`, `lg` · `decorative`                                                      | `role="status"` with a hidden label, or `aria-hidden` when decorative (inside a busy button). Stops rotating under reduced motion.                                                                                           |
| **EmptyState** | none                                     | `sm`, `md` · icon, action, heading level                                             | A heading plus description, so it is not just an illustration. The icon is decorative.                                                                                                                                       |
| **ErrorState** | none                                     | `sm`, `md` · retry, retrying, heading level, `announce`                              | `role="alert"` by default (turn off for initial renders). A warning icon plus the title, not color alone. The retry button supports a busy state.                                                                            |

### Checklist for adding a new component

1. **Need.** Check that the catalog does not already cover it (a variant of an existing component is usually better). If it needs a library that isn't pre-approved, write an ADR first.
2. **Base.**
   - Interactive patterns with a WAI-ARIA keyboard model (menus, comboboxes, popovers, sliders): use the Radix primitive.
   - Otherwise use the native element.
   - Never use `div` with `onClick`.
3. **Folder.** Create `src/shared/ui/<Component>/` with `Component.tsx`, `Component.test.tsx`, `Component.stories.tsx` and `index.ts`, and export it from `src/shared/ui/index.ts`.
4. **API (ADR 0007).**
   - Extend the rendered element's props and spread the rest.
   - Use `ref` as a regular prop.
   - Use `cva` for `variant` and `size`, and `cn()` with `className` last.
   - Use compound parts for structured widgets.
   - Use `asChild` (Slot) when the styles are useful on another element.
   - Add TSDoc on the component and on non-obvious props.
5. **Styling.**
   - Use semantic token utilities only. Add a new role to `tokens.css` (both themes) and to `tokens.test.ts` if needed.
   - Use logical properties only, and mirror directional icons and translations in RTL.
   - No inline styles, no `dangerouslySetInnerHTML`, no magic numbers (name constants such as offsets and delays).
   - Drive state from `data-*` or ARIA attributes.
6. **Accessibility.**
   - Give it an accessible name (make the label prop required where there is no visible text).
   - Use `focusRing` from `internal/styles` (offset mandatory) on every focusable part.
   - Disabled and loading states must be visible and exposed to assistive tech.
   - Never convey status by color alone.
   - Respect reduced motion: use the duration tokens, and add `motion-reduce:animate-none` on loops.
7. **Tests.**
   - Cover behavior with Testing Library: keyboard, pointer, states and callbacks.
   - Add `expectNoAxeViolations()` for each meaningful state (on `document.body` for portaled content).
8. **Stories.**
   - Add one story per variant and state, with controls (`argTypes`) and autodocs.
   - Check light and dark, and LTR and RTL, in the toolbar.
   - The a11y panel must show no violations.
9. **Cost.** If it adds a dependency, measure its gzip cost (method in `docs/performance.md`) and add it to the component cost table. Note any runtime-injected styles in `docs/security.md`.
10. **Verify.** typecheck, lint, format:check, test, build, build-storybook.
