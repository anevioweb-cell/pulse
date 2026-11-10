import { QueryDevtools } from './query-devtools';
import { AppSessionProvider } from './session/session-context';

import type { SessionController } from './session/session-controller';
import type { ReactNode } from 'react';

/**
 * App-wide providers: the active session (its QueryClient and TelemetryApi, rebuilt for each
 * mode by the SessionController) and, in development only, the Query devtools. The status banners
 * live in the layout (AppLayout).
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
      {children}
      <QueryDevtools />
    </AppSessionProvider>
  );
}
