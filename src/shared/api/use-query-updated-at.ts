import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';

import type { QueryKey } from '@tanstack/react-query';

/**
 * When the query's data was last successfully refreshed (its `dataUpdatedAt`), or null if it has
 * no data. Re-renders when the cache changes, without starting or observing the query itself.
 */
export function useQueryUpdatedAt(queryKey: QueryKey): number | null {
  const client = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => client.getQueryCache().subscribe(onChange),
    [client],
  );
  const read = () => {
    const state = client.getQueryState(queryKey);
    return state && state.dataUpdatedAt > 0 ? state.dataUpdatedAt : null;
  };
  return useSyncExternalStore(subscribe, read, read);
}
