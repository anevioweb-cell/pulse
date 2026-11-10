import { QueryDevtools } from './query-devtools';
import { AppSessionProvider } from './session/session-context';
import { StatusBanners } from './status-banners';

import type { SessionController } from './session/session-controller';
import type { ReactNode } from 'react';

/**
 * App-wide providers: the active session (its QueryClient and TelemetryApi, rebuilt for each
 * mode by the SessionController), the status banners (offline, update available) and, in
 * development only, the Query devtools.
 */
export function AppProviders({
  controller,
  children,
}: {
  controller: SessionController;
  children: ReactNode;
}) {
  return (
    <AppSessionProvider controller={controller}>
      <StatusBanners />
      {children}
      <QueryDevtools />
    </AppSessionProvider>
  );
}
