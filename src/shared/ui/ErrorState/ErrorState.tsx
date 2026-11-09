import { RotateCw, TriangleAlert } from 'lucide-react';

import { cn } from '@/shared/lib';

import { Button } from '../Button/Button';
import { stateIcon, stateLayout } from '../internal/state-layout';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';

export interface ErrorStateProps
  extends Omit<ComponentProps<'div'>, 'title'>, VariantProps<typeof stateLayout> {
  /** What failed, e.g. "Could not load devices". */
  title: string;
  /** Why it failed or what to try. Keep technical details out of user-facing text. */
  description?: ReactNode;
  /** Shows a retry button when provided. */
  onRetry?: () => void;
  /** Label of the retry button. */
  retryLabel?: string;
  /** Busy state for the retry button while a retry is running. */
  retrying?: boolean;
  /** Heading level for the title, so it fits the page outline. */
  headingLevel?: 'h2' | 'h3' | 'h4';
  /**
   * Announce the error when it appears (`role="alert"`). Turn off when the error is part of the
   * initial render and should not interrupt the user.
   */
  announce?: boolean;
}

/**
 * Failure state for a panel or page, with an optional retry. The warning icon and the title carry
 * the meaning together, not color alone.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = 'Try again',
  retrying = false,
  headingLevel: Heading = 'h3',
  announce = true,
  size,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      role={announce ? 'alert' : undefined}
      className={cn(stateLayout({ size }), className)}
      {...props}
    >
      <span aria-hidden="true" className={cn(stateIcon({ size }), 'text-danger')}>
        <TriangleAlert />
      </span>
      <Heading className="text-base font-semibold text-text">{title}</Heading>
      {description && <p className="max-w-sm text-sm text-text-muted">{description}</p>}
      {onRetry && (
        <Button variant="secondary" className="mt-2" loading={retrying} onClick={onRetry}>
          {!retrying && <RotateCw aria-hidden="true" />}
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
