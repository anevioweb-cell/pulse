import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DANGER_TOAST_DURATION_MS,
  DEFAULT_TOAST_DURATION_MS,
  MAX_VISIBLE_TOASTS,
  getToasts,
  subscribeToToasts,
  toast,
} from './toast-store';

afterEach(() => {
  toast.dismissAll();
});

describe('toast store', () => {
  it('adds toasts with defaults and returns unique ids', () => {
    const first = toast({ title: 'Saved' });
    const second = toast.danger('Offline', { description: 'ESP32-04' });

    expect(first).not.toBe(second);
    expect(getToasts()).toEqual([
      expect.objectContaining({
        id: first,
        title: 'Saved',
        variant: 'neutral',
        duration: DEFAULT_TOAST_DURATION_MS,
      }),
      expect.objectContaining({
        id: second,
        variant: 'danger',
        description: 'ESP32-04',
        duration: DANGER_TOAST_DURATION_MS,
      }),
    ]);
  });

  it('notifies subscribers and replaces the snapshot immutably', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToToasts(listener);
    const before = getToasts();

    const id = toast.success('Connected');
    expect(listener).toHaveBeenCalledOnce();
    expect(getToasts()).not.toBe(before);

    toast.dismiss(id);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    toast.info('Ignored by the old listener');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('ignores dismissing an unknown id without notifying', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToToasts(listener);
    toast.dismiss('missing');
    toast.dismissAll();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it(`keeps at most ${String(MAX_VISIBLE_TOASTS)} toasts, dropping the oldest`, () => {
    for (let index = 0; index < MAX_VISIBLE_TOASTS + 2; index += 1)
      toast({ title: `Toast ${String(index)}` });
    const titles = getToasts().map((item) => item.title);
    expect(titles).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(titles.at(-1)).toBe(`Toast ${String(MAX_VISIBLE_TOASTS + 1)}`);
  });
});
