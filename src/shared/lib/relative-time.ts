// Relative time ("5 minutes ago", "now") through Intl.RelativeTimeFormat, so every locale gets
// its own wording and plural rules (Phase 8) without strings in code.

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/** Largest unit whose size is at most the elapsed time; each limit is the next unit's size. */
const UNITS: readonly { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: 'day', seconds: HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE },
  { unit: 'hour', seconds: MINUTES_PER_HOUR * SECONDS_PER_MINUTE },
  { unit: 'minute', seconds: SECONDS_PER_MINUTE },
  { unit: 'second', seconds: 1 },
];

/**
 * How long ago `timestamp` was, relative to `now`, in `locale` (default: the browser's). Rounded
 * down to whole units ("1 minute ago" until 2 minutes have passed). A timestamp in the future
 * (clock skew) reads as now.
 */
export function formatRelativeTime(timestamp: number, now: number, locale?: string): string {
  const elapsed = Math.max(0, Math.floor((now - timestamp) / MS_PER_SECOND));
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const { unit, seconds } of UNITS) {
    if (elapsed >= seconds) return format.format(-Math.floor(elapsed / seconds), unit);
  }
  return format.format(0, 'second');
}
