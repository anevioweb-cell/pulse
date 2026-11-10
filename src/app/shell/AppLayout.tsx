import { useRef } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';

import { messages } from '@/shared/i18n';

import { StatusBanners } from '../status-banners';
import { ConnectionStatus } from './ConnectionStatus';
import { DataSourceControl } from './DataSourceControl';
import { MainNav } from './MainNav';
import { SimulatedDataBadge } from './SimulatedDataBadge';
import { ThemeToggle } from './ThemeToggle';
import { useRouteFocus } from './use-route-focus';

import type { Location } from 'react-router';

export const MAIN_CONTENT_ID = 'main-content';

/** Scroll positions are kept per path: a query-string change (table state) does not scroll. */
const scrollKey = (location: Location) => location.pathname;

/**
 * The page frame: skip link, header (banner landmark) with the data source, connection status,
 * theme and simulated-data label, the one navigation landmark (bottom bar below `lg`, sidebar from
 * `lg`), the status banners and `main`. Placement uses grid areas and logical properties only, so
 * it mirrors in RTL.
 */
export function AppLayout() {
  const main = useRef<HTMLElement>(null);
  useRouteFocus(main);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr]">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only z-tooltip rounded-md bg-surface-raised px-3 py-2 font-medium text-accent shadow-md focus:not-sr-only focus:fixed focus:start-2 focus:top-2"
      >
        {messages.app.skipLink}
      </a>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface-raised px-4 py-3 lg:col-start-2 lg:row-start-1">
        <p className="me-auto text-lg font-semibold">{messages.app.name}</p>
        <SimulatedDataBadge />
        <ConnectionStatus />
        <ThemeToggle />
        <DataSourceControl />
      </header>
      <MainNav className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface-raised px-2 py-1 lg:sticky lg:top-0 lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:h-dvh lg:border-e lg:border-t-0 lg:px-3 lg:py-4" />
      <div className="lg:col-start-2 lg:row-start-2">
        <StatusBanners />
      </div>
      <main
        ref={main}
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="flex min-w-0 flex-col gap-6 px-4 pt-6 pb-24 outline-none lg:col-start-2 lg:row-start-3 lg:px-8 lg:pb-8"
      >
        <Outlet />
      </main>
      <ScrollRestoration getKey={scrollKey} />
    </div>
  );
}
