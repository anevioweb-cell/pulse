import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from './relative-time';

const NOW = 1_800_000_000_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it.each([
    [0, 'now'],
    [999, 'now'],
    [5 * SECOND, '5 seconds ago'],
    [59 * SECOND, '59 seconds ago'],
    [MINUTE, '1 minute ago'],
    [2 * MINUTE - 1, '1 minute ago'],
    [45 * MINUTE, '45 minutes ago'],
    [HOUR, '1 hour ago'],
    [DAY, 'yesterday'],
    [3 * DAY, '3 days ago'],
  ])('%i ms ago reads "%s" in English', (elapsed, expected) => {
    expect(formatRelativeTime(NOW - elapsed, NOW, 'en')).toBe(expected);
  });

  it('reads a future timestamp (clock skew) as now', () => {
    expect(formatRelativeTime(NOW + MINUTE, NOW, 'en')).toBe('now');
  });

  it('follows the locale, with no strings in code', () => {
    expect(formatRelativeTime(NOW - 5 * MINUTE, NOW, 'fr')).toBe('il y a 5 minutes');
    expect(formatRelativeTime(NOW - 5 * MINUTE, NOW, 'ar')).not.toBe(
      formatRelativeTime(NOW - 5 * MINUTE, NOW, 'en'),
    );
  });
});
