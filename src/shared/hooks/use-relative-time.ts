import { useEffect, useState } from 'react';

import { formatRelativeTime } from '../lib/relative-time';

import type { Clock } from './use-last-updated-label';

const systemClock: Clock = {
  now: () => Date.now(),
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) => {
    globalThis.clearInterval(handle);
  },
};

/**
 * "5 seconds ago" for a timestamp (null for null), re-rendering every `refreshMs` while a
 * timestamp is shown, so the text stays current when nothing else changes.
 */
export function useRelativeTime(
  timestamp: number | null,
  refreshMs: number,
  { locale, clock = systemClock }: { locale?: string; clock?: Clock } = {},
): string | null {
  const [now, setNow] = useState(clock.now);
  useEffect(() => {
    if (timestamp === null) return undefined;
    const handle = clock.setInterval(() => {
      setNow(clock.now());
    }, refreshMs);
    return () => {
      clock.clearInterval(handle);
    };
  }, [timestamp, refreshMs, clock]);
  if (timestamp === null) return null;
  // A timestamp newer than the last tick reads as "now" (formatRelativeTime clamps at zero).
  return formatRelativeTime(timestamp, Math.max(now, timestamp), locale);
}
