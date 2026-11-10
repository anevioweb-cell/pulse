import { z } from 'zod/mini';

import type { ReadingsRequest, SensorMetric } from '@/features/telemetry';

import { DEVICE_CHART } from '../config';

/** Chart ranges, shortest first. Every range ends at "now" and moves with it. */
export const CHART_RANGES = ['live', '5m', '1h', '24h'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
export const chartRangeSchema = z.enum(CHART_RANGES);
export const DEFAULT_CHART_RANGE: ChartRange = 'live';

/**
 * Where a range's samples come from (ADR 0026):
 * - `buffer`: the live ring buffer only. It holds RING_BUFFER_CAPACITY samples (30 minutes at
 *   1 Hz, 3 minutes at the 10 Hz maximum), so it covers `live` and, at up to 6 Hz, `5m`.
 * - `history`: the REST history (downsampled by the server), followed by the ring buffer's
 *   samples newer than the last history point (the live tail).
 */
export type ChartSource = 'buffer' | 'history';

export const chartSourceOf = (range: ChartRange): ChartSource => {
  switch (range) {
    case 'live':
    case '5m':
      return 'buffer';
    case '1h':
    case '24h':
      return 'history';
  }
};

export const rangeSpanMs = (range: ChartRange): number => {
  switch (range) {
    case 'live':
      return DEVICE_CHART.RANGE_SPAN_MS.live;
    case '5m':
      return DEVICE_CHART.RANGE_SPAN_MS['5m'];
    case '1h':
      return DEVICE_CHART.RANGE_SPAN_MS['1h'];
    case '24h':
      return DEVICE_CHART.RANGE_SPAN_MS['24h'];
  }
};

/** The visible time window, both ends included. */
export interface TimeWindow {
  readonly from: number;
  readonly to: number;
}

export const windowAt = (range: ChartRange, now: number): TimeWindow => ({
  from: now - rangeSpanMs(range),
  to: now,
});

/**
 * The REST request for a `history` range, or null for a `buffer` range. The end is rounded up to
 * DEVICE_CHART.HISTORY_ALIGN_MS (as the prefetch does), so every render within one step uses the
 * same query key, and the default 1 h temperature request is the prefetched one. `maxPoints` is
 * left to the API default (500): 250 min/max buckets, about one per 2 to 4 px on common widths.
 */
export function historyRequestFor(
  range: ChartRange,
  deviceId: string,
  metric: SensorMetric,
  now: number,
): ReadingsRequest | null {
  if (chartSourceOf(range) !== 'history') return null;
  const to = Math.ceil(now / DEVICE_CHART.HISTORY_ALIGN_MS) * DEVICE_CHART.HISTORY_ALIGN_MS;
  return { deviceId, metric, from: to - rangeSpanMs(range), to };
}
