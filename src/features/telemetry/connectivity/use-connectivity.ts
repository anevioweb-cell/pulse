import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { telemetryStore } from '../live';
import { browserConnectivity, ConnectivityMonitor } from './connectivity';

import type { Connectivity } from './connectivity';

/** The app-wide monitor: the browser, TanStack's onlineManager and the live telemetry store. */
export const connectivityMonitor = /* @__PURE__ */ new ConnectivityMonitor({
  browser: browserConnectivity,
  dataLayer: onlineManager,
  live: telemetryStore,
  now: () => Date.now(),
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) => {
    globalThis.clearInterval(handle);
  },
});

/**
 * Online, offline, degraded or unknown, with the reason (rules in `deriveConnectivity`).
 * Re-renders only when the derived state changes, not on every live message.
 */
export function useConnectivity(monitor: ConnectivityMonitor = connectivityMonitor): Connectivity {
  return useSyncExternalStore(monitor.subscribe, monitor.getSnapshot, monitor.getSnapshot);
}
