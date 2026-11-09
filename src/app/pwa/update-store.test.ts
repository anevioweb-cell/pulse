import { describe, expect, it, vi } from 'vitest';

import { createUpdateStore } from './update-store';

describe('update store', () => {
  it('goes from registering to ready, and never reloads on its own', () => {
    const store = createUpdateStore();
    const apply = vi.fn(() => Promise.resolve());
    store.registered();
    expect(store.getSnapshot().status).toBe('ready');
    store.needRefresh(apply);
    expect(store.getSnapshot().status).toBe('available');
    expect(apply).not.toHaveBeenCalled();
  });

  it('applies the update only when the user chooses to reload', async () => {
    const store = createUpdateStore();
    let finish: () => void = () => undefined;
    const apply = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    store.needRefresh(apply);
    const reloading = store.reload();
    expect(store.getSnapshot().status).toBe('reloading');
    expect(apply).toHaveBeenCalledTimes(1);
    await store.reload(); // a second click does nothing
    expect(apply).toHaveBeenCalledTimes(1);
    finish();
    await reloading;
  });

  it('offers the update again if activating the worker fails', async () => {
    const store = createUpdateStore();
    store.needRefresh(() => Promise.reject(new Error('activation failed')));
    await store.reload();
    expect(store.getSnapshot().status).toBe('available');
  });

  it('hides the banner on Later until the next version', () => {
    const store = createUpdateStore();
    store.needRefresh(() => Promise.resolve());
    store.later();
    expect(store.getSnapshot().status).toBe('dismissed');
    store.needRefresh(() => Promise.resolve());
    expect(store.getSnapshot().status).toBe('available');
  });

  it('keeps an update found during registration', () => {
    const store = createUpdateStore();
    store.needRefresh(() => Promise.resolve());
    store.registered();
    expect(store.getSnapshot().status).toBe('available');
  });

  it('records failure, unsupported, disabled and offline-ready without breaking anything', () => {
    const store = createUpdateStore();
    store.registrationFailed();
    expect(store.getSnapshot().status).toBe('failed');
    store.unsupported();
    expect(store.getSnapshot().status).toBe('unsupported');
    store.disabled();
    expect(store.getSnapshot().status).toBe('disabled');
    store.offlineReady();
    expect(store.getSnapshot().offlineReady).toBe(true);
  });

  it('notifies subscribers only on changes', () => {
    const store = createUpdateStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.registered();
    store.registered();
    store.later(); // nothing to dismiss
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
