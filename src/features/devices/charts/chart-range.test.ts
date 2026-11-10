import { describe, expect, it } from 'vitest';

import { recentReadingsRequest } from '@/features/telemetry';

import { DEVICE_CHART } from '../config';
import {
  CHART_RANGES,
  chartRangeSchema,
  chartSourceOf,
  historyRequestFor,
  rangeSpanMs,
  windowAt,
} from './chart-range';

const NOW = 1_794_200_012_345;

describe('chart ranges', () => {
  it('accepts exactly the four ranges', () => {
    for (const range of CHART_RANGES) expect(chartRangeSchema.safeParse(range).success).toBe(true);
    for (const hostile of ['', '1H', '7d', '__proto__', 'live ', 5, null, undefined, {}]) {
      expect(chartRangeSchema.safeParse(hostile).success).toBe(false);
    }
  });

  it('serves live and 5m from the ring buffer, 1h and 24h from REST history', () => {
    expect(CHART_RANGES.map(chartSourceOf)).toEqual(['buffer', 'buffer', 'history', 'history']);
    expect(historyRequestFor('live', 'esp32-01', 'temperature', NOW)).toBeNull();
    expect(historyRequestFor('5m', 'esp32-01', 'temperature', NOW)).toBeNull();
  });

  it('ends every window now, with the range span', () => {
    for (const range of CHART_RANGES) {
      expect(windowAt(range, NOW)).toEqual({ from: NOW - rangeSpanMs(range), to: NOW });
    }
  });

  it('aligns history requests like the prefetch, so the default 1 h request is the prefetched one', () => {
    expect(historyRequestFor('1h', 'esp32-01', 'temperature', NOW)).toEqual(
      recentReadingsRequest('esp32-01', NOW),
    );
    const request = historyRequestFor('24h', 'esp32-01', 'humidity', NOW);
    expect(request?.to).toBeGreaterThanOrEqual(NOW);
    expect((request?.to ?? 0) % DEVICE_CHART.HISTORY_ALIGN_MS).toBe(0);
    expect((request?.to ?? 0) - (request?.from ?? 0)).toBe(rangeSpanMs('24h'));
    // Every render within one alignment step asks for the same key.
    const later = historyRequestFor('24h', 'esp32-01', 'humidity', NOW + 1);
    expect(later).toEqual(request);
  });
});
