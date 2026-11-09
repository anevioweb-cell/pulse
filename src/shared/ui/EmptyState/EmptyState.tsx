import { Inbox } from 'lucide-react';

import { cn } from '@/shared/lib';

import { stateIcon, stateLayout } from '../internal/state-layout';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';

export interface EmptyStateProps
  extends Omit<ComponentProps<'div'>, 'title'>, VariantProps<typeof stateLayout> {
  /** Short statement of what is empty, e.g. "No devices yet". */
  title: string;
  /** What the user can do about it. */
  description?: ReactNode;
  /** Decorative icon. Defaults to an inbox. */
  icon?: ReactNode;
  /** Primary action, usually a Button. */
  action?: ReactNode;
  /** Heading level for the title, so it fits the page outline. */
  headingLevel?: 'h2' | 'h3' | 'h4';
}

/** Placeholder for a list, table or panel that has no content yet. */
export function EmptyState({
  title,
  description,
  icon = <Inbox />,
  action,
  headingLevel: Heading = 'h3',
  size,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div className={cn(stateLayout({ size }), className)} {...props}>
      <span aria-hidden="true" className={cn(stateIcon({ size }), 'text-text-muted')}>
        {icon}
      </span>
      <Heading className="text-base font-semibold text-text">{title}</Heading>
      {description && <p className="max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
