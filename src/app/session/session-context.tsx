import { QueryClientProvider } from '@tanstack/react-query';
import { createContext, use, useSyncExternalStore } from 'react';

import { TelemetryApiProvider } from '@/features/telemetry';

import type { SessionController, SessionSnapshot } from './session-controller';
import type { ReactNode } from 'react';

const SessionContext = createContext<SessionController | null>(null);

/**
 * Provides the active session's QueryClient and TelemetryApi. The subtree is keyed by session id:
 * TanStack's hooks bind to the client they first saw, so a mode switch remounts everything below
 * instead of leaving observers on the previous mode's (cleared) client.
 */
export function AppSessionProvider({
  controller,
  children,
}: {
  controller: SessionController;
  children: ReactNode;
}) {
  const { session } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return (
    <SessionContext value={controller}>
      <QueryClientProvider key={session.id} client={session.client}>
        <TelemetryApiProvider api={session.api}>{children}</TelemetryApiProvider>
      </QueryClientProvider>
    </SessionContext>
  );
}

function useController(): SessionController {
  const controller = use(SessionContext);
  if (!controller) throw new Error('useAppSession must be used inside <AppSessionProvider>');
  return controller;
}

/** The current mode, preferences and the action that changes them. */
export function useAppSession(): SessionSnapshot & { apply: SessionController['apply'] } {
  const controller = useController();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { ...snapshot, apply: (next) => controller.apply(next) };
}
