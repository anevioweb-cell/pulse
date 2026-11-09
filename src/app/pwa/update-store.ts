// The service-worker update flow as a small state machine, independent of the registration code
// (ADR 0020), so it is tested with fakes. Updates are never applied automatically: live data
// lives in memory, so a reload the user did not ask for would wipe it.
//
//   unsupported  no service worker API (old browser, some private modes): the app works as is
//   disabled     not registered on purpose (development, Storybook, tests)
//   registering  registration in progress
//   ready        a worker controls the app; no update waiting
//   available    a new worker is installed and waiting: show the banner
//   dismissed    the user chose "Later"; the banner returns for the next new version
//   reloading    the user chose "Reload now": the waiting worker was told to activate, and the
//                page reloads when it takes control
//   failed       registration failed: the app keeps working without a worker

export type UpdateStatus =
  | 'unsupported'
  | 'disabled'
  | 'registering'
  | 'ready'
  | 'available'
  | 'dismissed'
  | 'reloading'
  | 'failed';

export interface UpdateState {
  readonly status: UpdateStatus;
  /** The app shell is cached: the next load works offline. */
  readonly offlineReady: boolean;
}

/** Activates the waiting worker and reloads once it controls the page (workbox-window). */
export type ApplyUpdate = () => Promise<void>;

export interface UpdateStore {
  getSnapshot: () => UpdateState;
  subscribe: (listener: () => void) => () => void;
  /** Registration events. */
  registering: () => void;
  registered: () => void;
  registrationFailed: () => void;
  unsupported: () => void;
  disabled: () => void;
  offlineReady: () => void;
  needRefresh: (apply: ApplyUpdate) => void;
  /** User choices. */
  reload: () => Promise<void>;
  later: () => void;
}

export function createUpdateStore(): UpdateStore {
  let state: UpdateState = { status: 'registering', offlineReady: false };
  let apply: ApplyUpdate | null = null;
  const listeners = new Set<() => void>();

  const set = (next: Partial<UpdateState>) => {
    const merged = { ...state, ...next };
    if (merged.status === state.status && merged.offlineReady === state.offlineReady) return;
    state = merged;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    registering: () => {
      set({ status: 'registering' });
    },
    registered: () => {
      // An update found during registration wins.
      if (state.status === 'registering') set({ status: 'ready' });
    },
    registrationFailed: () => {
      set({ status: 'failed' });
    },
    unsupported: () => {
      set({ status: 'unsupported' });
    },
    disabled: () => {
      set({ status: 'disabled' });
    },
    offlineReady: () => {
      set({ offlineReady: true });
    },
    needRefresh: (applyUpdate) => {
      apply = applyUpdate;
      if (state.status !== 'reloading') set({ status: 'available' });
    },
    reload: async () => {
      if (state.status !== 'available' || !apply) return;
      set({ status: 'reloading' });
      try {
        await apply();
      } catch {
        // The worker could not be activated: offer the update again rather than hang.
        set({ status: 'available' });
      }
    },
    later: () => {
      if (state.status === 'available') set({ status: 'dismissed' });
    },
  };
}

/** The app's update store; `registerServiceWorker` (main.tsx) feeds it. */
export const updateStore = createUpdateStore();
