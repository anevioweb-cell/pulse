// Class fragments shared by components in src/shared/ui. Internal: not exported from the barrel.

/**
 * Keyboard focus ring. The offset is mandatory: focus-ring has only 1.0-1.4:1 contrast against
 * accent (ADR 0004), so the ring must be drawn over the surface, not on the control.
 */
export const focusRing =
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring';

/** Same ring for composite widgets whose focus lands on an inner element. */
export const focusWithinRing =
  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring';

/** Disabled look for native controls (`:disabled`) and Radix parts (`data-disabled`). */
export const disabledStyles =
  'disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:opacity-50';

/** Mirrors icons that point in the reading direction (chevrons, arrows) in RTL. */
export const directionalIcon = 'rtl:-scale-x-100';

/** Field chrome shared by Input and Select triggers. */
export const fieldStyles =
  'w-full rounded-md border border-border-strong bg-surface-raised text-text placeholder:text-text-muted transition-colors duration-fast data-invalid:border-danger aria-invalid:border-danger';
