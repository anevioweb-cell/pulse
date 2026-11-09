import { cva } from 'class-variance-authority';

import { cn } from '@/shared/lib';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

const skeletonVariants = cva('block animate-shimmer bg-surface-sunken motion-reduce:animate-none', {
  variants: {
    shape: {
      text: 'h-4 w-full rounded-sm',
      rect: 'h-24 w-full rounded-lg',
      circle: 'size-10 rounded-full',
    },
  },
  defaultVariants: { shape: 'text' },
});

export interface SkeletonProps
  extends Omit<ComponentProps<'span'>, 'children'>, VariantProps<typeof skeletonVariants> {}

/**
 * Placeholder shape shown while content loads. It is hidden from assistive technology: mark the
 * loading region itself with `aria-busy="true"` (and a visually hidden "Loading" text if needed).
 * The shimmer stops under reduced motion. Size it with `className` (e.g. `w-1/2`).
 */
export function Skeleton({ shape, className, ...props }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      data-shape={shape ?? 'text'}
      className={cn(skeletonVariants({ shape }), className)}
      {...props}
    />
  );
}
