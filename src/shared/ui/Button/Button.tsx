import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from '@/shared/lib';

import { disabledStyles, focusRing } from '../internal/styles';
import { Spinner } from '../Spinner/Spinner';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap',
    'transition-colors duration-fast select-none [&_svg]:shrink-0',
    'data-loading:cursor-wait',
    focusRing,
    disabledStyles,
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-foreground hover:bg-accent/90 active:bg-accent/80',
        secondary:
          'border border-border-strong bg-surface-raised text-text hover:bg-surface-sunken active:bg-surface-sunken',
        ghost: 'text-text hover:bg-surface-sunken active:bg-surface-sunken',
        danger: 'bg-danger text-danger-foreground hover:bg-danger/90 active:bg-danger/80',
      },
      size: {
        sm: 'h-8 px-3 text-sm [&_svg]:size-4',
        md: 'h-10 px-4 text-sm [&_svg]:size-4',
        lg: 'h-12 px-5 text-base [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /**
   * Render the single child element (for example a link) with button styles instead of a
   * `<button>`. The loading spinner is not rendered in this mode.
   */
  asChild?: boolean;
  /**
   * Show a spinner, set `aria-busy`, and block interaction. The label stays visible and in the
   * accessibility tree, so the button keeps its name while busy.
   */
  loading?: boolean;
}

/** Primary action control. Defaults to `type="button"` so it never submits a form by accident. */
export function Button({
  asChild = false,
  loading = false,
  variant,
  size,
  className,
  disabled,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Slot className={classes} data-loading={loading || undefined} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...props}
    >
      {loading && <Spinner decorative size="sm" />}
      <Slottable>{children}</Slottable>
    </button>
  );
}
