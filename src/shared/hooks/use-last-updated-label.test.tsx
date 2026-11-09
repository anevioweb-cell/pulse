import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  describeLastUpdated,
  LAST_UPDATED_REFRESH_MS,
  useLastUpdatedLabel,
} from './use-last-updated-label';

import type { Clock } from './use-last-updated-label';

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;

function manualClock(start: number) {
  let now = start;
  let tick: (() => void) | null = null;
  const clock: Clock = {
    now: () => now,
    setInterval: (callback) => {
      tick = callback;
      return 0 as unknown as ReturnType<typeof globalThis.setInterval>;
    },
    clearInterval: () => {
      tick = null;
    },
  };
  return {
    clock,
    advance: (ms: number) => {
      now += ms;
      tick?.();
    },
    running: () => tick !== null,
  };
}

describe('last updated', () => {
  it('describes a timestamp, or its absence', () => {
    expect(describeLastUpdated(null, NOW, 'en')).toBe('Not updated yet');
    expect(describeLastUpdated(NOW - 2 * MINUTE, NOW, 'en')).toBe('Updated 2 minutes ago');
  });

  it('keeps the label current with its own timer, and stops it for null', () => {
    const time = manualClock(NOW);
    const { result, rerender } = renderHook<string, { ts: number | null }>(
      ({ ts }) => useLastUpdatedLabel(ts, { locale: 'en', clock: time.clock }),
      { initialProps: { ts: NOW - 30_000 } },
    );
    expect(result.current).toBe('Updated 30 seconds ago');
    act(() => {
      time.advance(2 * LAST_UPDATED_REFRESH_MS);
    });
    expect(result.current).toBe('Updated 1 minute ago');
    rerender({ ts: null });
    expect(result.current).toBe('Not updated yet');
    expect(time.running()).toBe(false);
  });
});
