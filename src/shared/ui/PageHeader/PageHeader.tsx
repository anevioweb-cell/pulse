import { useDocumentTitle } from '@/shared/hooks';
import { cn } from '@/shared/lib';

import { focusRing } from '../internal/styles';

import type { ComponentProps, ReactNode } from 'react';

/** Marks the page heading, so the router can move focus to it after a navigation. */
export const PAGE_HEADING_ATTRIBUTE = 'data-page-heading';

export interface PageHeaderProps extends Omit<ComponentProps<'div'>, 'title'> {
  /** The page's name: its only `<h1>`, and the browser tab title ("Devices · Pulse"). */
  title: string;
  /** One line under the title. */
  description?: ReactNode;
  /** Page-level actions, placed at the end of the row (start of the row in RTL). */
  actions?: ReactNode;
}

/**
 * Title block at the top of every page. The heading has `tabIndex={-1}` so focus can be moved to
 * it programmatically after a route change (screen readers then read the new page's name); it is
 * not in the tab order. Also sets `document.title`.
 */
export function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
  useDocumentTitle(title);
  const heading = { [PAGE_HEADING_ATTRIBUTE]: '' };
  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)} {...props}>
      <div className="me-auto flex min-w-0 flex-col gap-1">
        <h1
          tabIndex={-1}
          {...heading}
          className={cn('text-2xl font-semibold break-words', focusRing)}
        >
          {title}
        </h1>
        {description !== undefined && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
