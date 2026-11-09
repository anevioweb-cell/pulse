import { updateStore } from './update-store';

import type { UpdateStore } from './update-store';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

type RegisterSW = (options: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>;

export interface RegisterOptions {
  store?: UpdateStore;
  /**
   * Register at all. Production builds only by default; `vite` dev, Vitest and Storybook never
   * register (VITE_SW_DEV=1 turns it on in dev, pwa.config.ts).
   */
  enabled?: boolean;
  /** Whether this browser has service workers. */
  supported?: boolean;
  /** vite-plugin-pwa's registerSW (loaded lazily, so workbox-window is a separate chunk). */
  load?: () => Promise<RegisterSW>;
}

const loadRegisterSW = () => import('virtual:pwa-register').then((module) => module.registerSW);

/**
 * Registers the service worker and feeds the update store. Never throws and never blocks the
 * app: without a worker (unsupported, disabled, failed) Pulse simply works online only. Updates
 * wait for the user (ADR 0020): `apply` asks the waiting worker to activate, and vite-plugin-pwa
 * reloads the page once the new worker controls it.
 */
export async function registerServiceWorker({
  store = updateStore,
  enabled = import.meta.env.PROD || import.meta.env.VITE_SW_DEV === '1',
  supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  load = loadRegisterSW,
}: RegisterOptions = {}): Promise<void> {
  if (!enabled) {
    store.disabled();
    return;
  }
  if (!supported) {
    store.unsupported();
    return;
  }
  store.registering();
  try {
    const registerSW = await load();
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        store.needRefresh(() => updateSW(true));
      },
      onOfflineReady: () => {
        store.offlineReady();
      },
      onRegisteredSW: () => {
        store.registered();
      },
      onRegisterError: () => {
        store.registrationFailed();
      },
    });
  } catch {
    store.registrationFailed();
  }
}
