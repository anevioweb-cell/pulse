import { cva } from 'class-variance-authority';

import { cn } from '@/shared/lib';

import { StatusIcon } from '../internal/StatusIcon';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';

const bannerVariants = cva(
  'flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border border-s-4 bg-surface-raised p-4 text-text',
  {
    variants: {
      tone: {
        info: 'border-info',
        success: 'border-success',
        warning: 'border-warning',
        danger: 'border-danger',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

const iconVariants = cva('mt-0.5 size-5 shrink-0', {
  variants: {
    tone: {
      info: 'text-info',
      success: 'text-success',
      warning: 'text-warning',
      danger: 'text-danger',
    },
  },
  defaultVariants: { tone: 'info' },
});

type BannerTone = NonNullable<VariantProps<typeof bannerVariants>['tone']>;

export interface BannerProps
  extends Omit<ComponentProps<'div'>, 'title'>, VariantProps<typeof bannerVariants> {
  /** Short heading that names the situation in words (the tone is never conveyed by color alone). */
  title: ReactNode;
  /** Optional details under the title. */
  children?: ReactNode;
  /** Optional action buttons (for example `<Button size="sm">Reload now</Button>`), shown at the end. */
  actions?: ReactNode;
  /**
   * Announce the banner to assistive technology when it appears. On by default: `danger` is an
   * assertive alert (`role="alert"`), every other tone a polite status (`role="status"`). Turn it
   * off for banners that are part of the page from the start, not a change.
   */
  live?: boolean;
}

/**
 * A full-width message about the state of the app (offline, an update, a problem), with an icon
 * and a title so the tone is readable without color, and optional actions. Live-region semantics
 * follow the tone: only errors interrupt.
 */
export function Banner({
  tone,
  title,
  children,
  actions,
  live = true,
  className,
  ...props
}: BannerProps) {
  const resolvedTone: BannerTone = tone ?? 'info';
  const role = live ? (resolvedTone === 'danger' ? 'alert' : 'status') : undefined;
  return (
    <div
      role={role}
      data-variant={resolvedTone}
      className={cn(bannerVariants({ tone }), className)}
      {...props}
    >
      <StatusIcon status={resolvedTone} className={iconVariants({ tone })} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 text-sm text-text-muted">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
