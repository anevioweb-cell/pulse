import { useEffect, useState } from 'react';

import { messages } from '../i18n/messages';
import { formatRelativeTime } from '../lib/relative-time';

/** The label refreshes this often, so "1 minute ago" turns into "2 minutes ago" on time. */
export const LAST_UPDATED_REFRESH_MS = 15_000;

export interface Clock {
  now: () => number;
  setInterval: (callback: () => void, ms: number) => ReturnType<typeof globalThis.setInterval>;
  clearInterval: (handle: ReturnType<typeof globalThis.setInterval>) => void;
}

const systemClock: Clock = {
  now: () => Date.now(),
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) => {
    globalThis.clearInterval(handle);
  },
};

/** "Updated 5 minutes ago" for a timestamp, or "Not updated yet" for null. Pure, for tests and SSR. */
export function describeLastUpdated(
  timestamp: number | null,
  now: number,
  locale?: string,
): string {
  if (timestamp === null) return messages.lastUpdated.never;
  return messages.lastUpdated.at(formatRelativeTime(timestamp, now, locale));
}

/**
 * A "last updated" label that stays current: re-renders every LAST_UPDATED_REFRESH_MS while a
 * timestamp is shown. Pass the server data's `dataUpdatedAt` (useQueryUpdatedAt) or the live
 * stream's last message time (useLiveLastMessageAt).
 */
export function useLastUpdatedLabel(
  timestamp: number | null,
  { locale, clock = systemClock }: { locale?: string; clock?: Clock } = {},
): string {
  const [now, setNow] = useState(clock.now);
  useEffect(() => {
    // No immediate update: a timestamp newer than `now` already reads as "now".
    if (timestamp === null) return undefined;
    const handle = clock.setInterval(() => {
      setNow(clock.now());
    }, LAST_UPDATED_REFRESH_MS);
    return () => {
      clock.clearInterval(handle);
    };
  }, [timestamp, clock]);
  return describeLastUpdated(timestamp, now, locale);
}
