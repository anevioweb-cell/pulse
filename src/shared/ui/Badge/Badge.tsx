import { cva } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

import { cn } from '@/shared/lib';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border bg-surface-raised font-medium whitespace-nowrap [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'border-border-strong text-text-muted',
        accent: 'border-accent text-accent',
        success: 'border-success text-success',
        warning: 'border-warning text-warning',
        danger: 'border-danger text-danger',
        info: 'border-info text-info',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs [&_svg]:size-3',
        md: 'px-2.5 py-0.5 text-sm [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'neutral', size: 'sm' },
  },
);

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

// Status variants carry a distinct shape as well as a color (WCAG 1.4.1).
const STATUS_ICONS = new Map<BadgeVariant, ReactNode>([
  ['success', <CircleCheck key="success" aria-hidden="true" />],
  ['warning', <TriangleAlert key="warning" aria-hidden="true" />],
  ['danger', <CircleAlert key="danger" aria-hidden="true" />],
  ['info', <Info key="info" aria-hidden="true" />],
]);

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  /**
   * Leading icon. Status variants show a default icon so the status is not conveyed by color
   * alone; pass `false` to hide it (only when the text itself names the status).
   */
  icon?: ReactNode;
}

/** Small status or category label. Text is drawn on a raised surface, so contrast is token-checked. */
export function Badge({ variant, size, icon, className, children, ...props }: BadgeProps) {
  const resolvedVariant = variant ?? 'neutral';
  const leadingIcon = icon === undefined ? STATUS_ICONS.get(resolvedVariant) : icon;

  return (
    <span
      data-variant={resolvedVariant}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    >
      {leadingIcon}
      {children}
    </span>
  );
}
