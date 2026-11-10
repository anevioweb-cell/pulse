import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

import { PAGE_HEADING_ATTRIBUTE } from '@/shared/ui';

import type { RefObject } from 'react';

/**
 * After a navigation to another path, moves focus to the new page's heading (or to `main` if a
 * page has none), so keyboard and screen-reader users start at the new content and hear its name.
 * Not on the first load (focus stays at the top of the document) and not when only the query
 * string changes (table filters must keep focus in their input). Focus is never trapped: it is a
 * single programmatic move, and Tab continues from there.
 */
export function useRouteFocus(main: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return; // first render, StrictMode re-run, search-only change
    previous.current = pathname;
    const container = main.current;
    if (!container) return;
    const heading = container.querySelector<HTMLElement>(`[${PAGE_HEADING_ATTRIBUTE}]`);
    (heading ?? container).focus();
  }, [pathname, main]);
}
