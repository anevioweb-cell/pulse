import { QueryClient } from '@tanstack/react-query';

import { QUERY_DEFAULTS } from './config';
import { retryDelay, shouldRetry } from './retry';

import type { ApiError } from './errors';
import type { NetworkMode } from '@tanstack/react-query';

export interface QueryClientOptions {
  /**
   * TanStack network mode for queries. `online` (the default) pauses fetches while the browser
   * reports offline; `always` runs them anyway, for data sources that need no network (Demo Mode).
   * Mutations are unaffected: they set their own mode (ADR 0019).
   */
  networkMode?: NetworkMode;
}

/**
 * Creates the app's QueryClient: typed retry rules (no retry on 4xx or validation errors),
 * exponential backoff, and conservative defaults. Mutations are never retried automatically:
 * a retried POST could create a rule twice.
 */
export function createQueryClient({
  networkMode = 'online',
}: QueryClientOptions = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_DEFAULTS.STALE_TIME_MS,
        gcTime: QUERY_DEFAULTS.GC_TIME_MS,
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: true,
        throwOnError: false,
        networkMode,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

declare module '@tanstack/react-query' {
  interface Register {
    /** Every query and mutation in the app fails with ApiError (the data layer throws nothing else). */
    defaultError: ApiError;
  }
}
