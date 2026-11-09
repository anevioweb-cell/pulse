import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from '@/shared/lib';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

const cardVariants = cva('flex flex-col rounded-xl border text-text', {
  variants: {
    variant: {
      raised: 'border-border bg-surface-raised shadow-sm',
      flat: 'border-border bg-surface-raised',
      sunken: 'border-transparent bg-surface-sunken',
    },
    padding: {
      none: '',
      sm: 'gap-3 p-4',
      md: 'gap-4 p-6',
    },
  },
  defaultVariants: { variant: 'raised', padding: 'md' },
});

export interface CardProps extends ComponentProps<'div'>, VariantProps<typeof cardVariants> {
  /** Render the child element instead of a `<div>`, e.g. `<section>` or `<article>`. */
  asChild?: boolean;
}

/** Surface that groups related content. Compose with CardHeader, CardContent and CardFooter. */
export function Card({ asChild = false, variant, padding, className, ...props }: CardProps) {
  const Component = asChild ? Slot : 'div';
  return <Component className={cn(cardVariants({ variant, padding }), className)} {...props} />;
}

/** Title and description block. */
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1', className)} {...props} />;
}

export interface CardTitleProps extends ComponentProps<'h3'> {
  /** Heading level, so the card fits the page's heading outline. */
  as?: 'h2' | 'h3' | 'h4';
}

/** Card heading. Defaults to `<h3>`; choose the level that fits the page outline. */
export function CardTitle({ as: Heading = 'h3', className, ...props }: CardTitleProps) {
  return <Heading className={cn('text-lg font-semibold', className)} {...props} />;
}

/** Secondary text under the title. */
export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-text-muted', className)} {...props} />;
}

/** Main body of the card. */
export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-3', className)} {...props} />;
}

/** Actions row, aligned to the end of the reading direction. */
export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center justify-end gap-2', className)} {...props} />;
}
