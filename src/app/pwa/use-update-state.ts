import { useSyncExternalStore } from 'react';

import { updateStore } from './update-store';

import type { UpdateState, UpdateStore } from './update-store';

export function useUpdateState(store: UpdateStore = updateStore): UpdateState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
