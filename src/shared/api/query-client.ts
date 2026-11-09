import { QueryClient } from '@tanstack/react-query';

import { QUERY_DEFAULTS } from './config';
import { retryDelay, shouldRetry } from './retry';

/**
 * Creates the app's QueryClient: typed retry rules (no retry on 4xx or validation errors),
 * exponential backoff, and conservative defaults. Mutations are never retried automatically:
 * a retried POST could create a rule twice.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_DEFAULTS.STALE_TIME_MS,
        gcTime: QUERY_DEFAULTS.GC_TIME_MS,
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: true,
        throwOnError: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
