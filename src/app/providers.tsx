import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { createQueryClient } from '@/shared/api';

import { QueryDevtools } from './query-devtools';
import { StatusBanners } from './status-banners';

import type { ReactNode } from 'react';

/**
 * App-wide providers: the server-state cache (one QueryClient per app instance, created once),
 * the status banners (offline, update available) and, in development only, the Query devtools. The TelemetryApi
 * provider and persistence are wired here when the app starts reading server data (Phase 5).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <StatusBanners />
      {children}
      <QueryDevtools />
    </QueryClientProvider>
  );
}
