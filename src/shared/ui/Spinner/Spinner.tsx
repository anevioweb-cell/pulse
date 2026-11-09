import { cva } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';

import { cn } from '@/shared/lib';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

const spinnerVariants = cva('inline-block shrink-0 animate-spin motion-reduce:animate-none', {
  variants: {
    size: {
      sm: 'size-4',
      md: 'size-5',
      lg: 'size-8',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface SpinnerProps
  extends Omit<ComponentProps<'span'>, 'children'>, VariantProps<typeof spinnerVariants> {
  /** Accessible label announced to screen readers. Ignored when `decorative`. */
  label?: string;
  /**
   * Hide the spinner from assistive technology, for example inside a button that already sets
   * `aria-busy` and keeps its own label.
   */
  decorative?: boolean;
}

/**
 * Indeterminate loading indicator. Under reduced motion it stops rotating; the label (or the
 * surrounding busy state) still communicates loading.
 */
export function Spinner({
  label = 'Loading',
  decorative = false,
  size,
  className,
  ...props
}: SpinnerProps) {
  return (
    <span
      role={decorative ? undefined : 'status'}
      aria-hidden={decorative || undefined}
      className={cn('inline-flex items-center', className)}
      {...props}
    >
      <LoaderCircle aria-hidden="true" className={spinnerVariants({ size })} />
      {!decorative && <span className="sr-only">{label}</span>}
    </span>
  );
}
