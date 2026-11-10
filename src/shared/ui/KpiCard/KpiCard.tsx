import { cva } from 'class-variance-authority';
import { useId } from 'react';

import { cn } from '@/shared/lib';

import { Skeleton } from '../Skeleton/Skeleton';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';

const kpiCardVariants = cva(
  'flex min-w-0 flex-col gap-1 rounded-xl border border-s-4 border-border bg-surface-raised p-4 text-text shadow-sm',
  {
    variants: {
      tone: {
        neutral: 'border-s-border-strong',
        accent: 'border-s-accent',
        success: 'border-s-success',
        warning: 'border-s-warning',
        danger: 'border-s-danger',
        info: 'border-s-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

const iconTone = cva('shrink-0 [&_svg]:size-4', {
  variants: {
    tone: {
      neutral: 'text-text-muted',
      accent: 'text-accent',
      success: 'text-success',
      warning: 'text-warning',
      danger: 'text-danger',
      info: 'text-info',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface KpiCardProps
  extends Omit<ComponentProps<'div'>, 'children'>, VariantProps<typeof kpiCardVariants> {
  /** What the number is ("Devices online"). Names the group for assistive technology. */
  label: string;
  /** The figure itself, already formatted for the locale ("8", "21.4", "—"). */
  value: ReactNode;
  /** Unit or context after the value ("°C", "of 12"). */
  unit?: ReactNode;
  /** One line under the value: what it covers, or why it is missing. */
  description?: ReactNode;
  /** Decorative icon next to the label (hidden from assistive technology). */
  icon?: ReactNode;
  /** Shows a skeleton instead of the value and sets `aria-busy`; the label stays readable. */
  loading?: boolean;
  /** Optional control under the description, for example a retry button. */
  action?: ReactNode;
}

/**
 * A single key figure: label, large value with its unit, and a short description. The `tone` is a
 * colored start border and icon only; the label and description must carry the meaning, so it is
 * never conveyed by color alone. Rendered as a labelled group (`role="group"`), so a screen reader
 * announces "Devices online, group" before the value.
 */
export function KpiCard({
  label,
  value,
  unit,
  description,
  icon,
  tone,
  loading = false,
  action,
  className,
  ...props
}: KpiCardProps) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-busy={loading || undefined}
      data-loading={loading ? '' : undefined}
      data-tone={tone ?? 'neutral'}
      className={cn(kpiCardVariants({ tone }), className)}
      {...props}
    >
      <p id={labelId} className="flex items-center gap-2 text-sm font-medium text-text-muted">
        {icon !== undefined && (
          <span aria-hidden="true" className={iconTone({ tone })}>
            {icon}
          </span>
        )}
        {label}
      </p>
      {loading ? (
        <Skeleton className="my-1 h-8 w-24" />
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-3xl font-semibold tabular-nums">
          {value}
          {unit !== undefined && (
            <span className="font-sans text-sm font-normal text-text-muted">{unit}</span>
          )}
        </p>
      )}
      {description !== undefined && <p className="text-sm text-text-muted">{description}</p>}
      {action !== undefined && <div className="mt-1">{action}</div>}
    </div>
  );
}
