import { cva } from 'class-variance-authority';

import { cn } from '@/shared/lib';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

const indicatorVariants = cva('inline-flex items-center gap-2 text-sm text-text', {
  variants: {
    size: { sm: 'text-xs', md: 'text-sm' },
  },
  defaultVariants: { size: 'md' },
});

// The dot differs by shape as well as color: filled circle (online), diamond (degraded), ring
// (offline), dashed ring (unknown). The label carries the meaning; the shapes help scanning.
const dotVariants = cva('inline-block size-2.5 shrink-0 rounded-full', {
  variants: {
    status: {
      online: 'bg-success',
      degraded: 'size-2 rotate-45 rounded-[1px] bg-warning',
      offline: 'border-2 border-danger',
      unknown: 'border-2 border-dashed border-text-muted motion-safe:animate-pulse',
    },
  },
  defaultVariants: { status: 'unknown' },
});

export interface StatusIndicatorProps
  extends ComponentProps<'span'>, VariantProps<typeof indicatorVariants> {
  status: NonNullable<VariantProps<typeof dotVariants>['status']>;
  /** Visible text naming the status ("Online", "Reconnecting…"). Required: never color alone. */
  label: string;
}

/**
 * Connection state as a small dot plus text. Not a live region: pair it with a Banner (or set
 * `role="status"`) where a change must be announced.
 */
export function StatusIndicator({
  status,
  label,
  size,
  className,
  ...props
}: StatusIndicatorProps) {
  return (
    <span data-status={status} className={cn(indicatorVariants({ size }), className)} {...props}>
      <span aria-hidden="true" className={dotVariants({ status })} />
      <span>{label}</span>
    </span>
  );
}
