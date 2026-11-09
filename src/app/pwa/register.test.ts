import { describe, expect, it, vi } from 'vitest';

import { registerServiceWorker } from './register';
import { createUpdateStore } from './update-store';

import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

/** A fake vite-plugin-pwa registerSW: records its callbacks and the update calls. */
function fakeRegisterSW() {
  const calls = {
    options: null as RegisterSWOptions | null,
    updates: [] as (boolean | undefined)[],
  };
  const registerSW = (options: RegisterSWOptions) => {
    calls.options = options;
    return (reloadPage?: boolean) => {
      calls.updates.push(reloadPage);
      return Promise.resolve();
    };
  };
  return { calls, load: () => Promise.resolve(registerSW) };
}

describe('registerServiceWorker', () => {
  it('does nothing unless enabled (development, tests, Storybook)', async () => {
    const store = createUpdateStore();
    const load = vi.fn();
    await registerServiceWorker({ store, enabled: false, supported: true, load });
    expect(store.getSnapshot().status).toBe('disabled');
    expect(load).not.toHaveBeenCalled();
  });

  it('is disabled by default under Vitest (not a production build)', async () => {
    const store = createUpdateStore();
    const load = vi.fn();
    await registerServiceWorker({ store, load });
    expect(store.getSnapshot().status).toBe('disabled');
    expect(load).not.toHaveBeenCalled();
  });

  it('leaves the app working in browsers without service workers', async () => {
    const store = createUpdateStore();
    const load = vi.fn();
    await registerServiceWorker({ store, enabled: true, supported: false, load });
    expect(store.getSnapshot().status).toBe('unsupported');
    expect(load).not.toHaveBeenCalled();
  });

  it('registers immediately and reports ready, offline-ready and updates', async () => {
    const store = createUpdateStore();
    const fake = fakeRegisterSW();
    await registerServiceWorker({ store, enabled: true, supported: true, load: fake.load });
    expect(store.getSnapshot().status).toBe('registering');
    expect(fake.calls.options?.immediate).toBe(true);
    fake.calls.options?.onRegisteredSW?.('/sw.js', undefined);
    fake.calls.options?.onOfflineReady?.();
    expect(store.getSnapshot()).toEqual({ status: 'ready', offlineReady: true });

    fake.calls.options?.onNeedRefresh?.();
    expect(store.getSnapshot().status).toBe('available');
    expect(fake.calls.updates).toEqual([]); // nothing happens until the user chooses
    await store.reload();
    expect(fake.calls.updates).toEqual([true]);
  });

  it('records registration errors, and a failed load, as failed', async () => {
    const store = createUpdateStore();
    const fake = fakeRegisterSW();
    await registerServiceWorker({ store, enabled: true, supported: true, load: fake.load });
    fake.calls.options?.onRegisterError?.(new Error('SecurityError'));
    expect(store.getSnapshot().status).toBe('failed');

    const other = createUpdateStore();
    await registerServiceWorker({
      store: other,
      enabled: true,
      supported: true,
      load: () => Promise.reject(new Error('chunk failed')),
    });
    expect(other.getSnapshot().status).toBe('failed');
  });
});
