import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { readingsQuery, useTelemetryApi } from '@/features/telemetry';
import type { HistoricalReadings, SensorMetric } from '@/features/telemetry';

import { DEVICE_CHART } from '../config';
import { historyRequestFor } from './chart-range';

import type { ChartRange } from './chart-range';

/**
 * The clock, rounded down to `stepMs`, re-rendering only when it enters a new step. Disabled, it
 * returns the time of the first render and schedules nothing.
 */
function useSteppedNow(stepMs: number, enabled: boolean, clock: () => number): number {
  const [now, setNow] = useState(() => Math.floor(clock() / stepMs) * stepMs);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const current = clock();
      const next = (Math.floor(current / stepMs) + 1) * stepMs;
      timer = setTimeout(() => {
        setNow(Math.floor(clock() / stepMs) * stepMs);
        schedule();
      }, next - current);
    };
    schedule();
    return () => {
      clearTimeout(timer);
    };
  }, [stepMs, enabled, clock]);
  return now;
}

const systemClock = () => Date.now();

/**
 * REST history for a `history` range (ADR 0026), or nothing for a `buffer` range. The request
 * moves every DEVICE_CHART.HISTORY_ALIGN_MS (a new key), and the previous response stays on
 * screen while the next one loads, as long as it is the same device, metric and span.
 */
export function useChartHistory(
  range: ChartRange,
  deviceId: string,
  metric: SensorMetric,
  clock: () => number = systemClock,
): HistoricalReadings | null {
  const isHistory = historyRequestFor(range, deviceId, metric, 0) !== null;
  const now = useSteppedNow(DEVICE_CHART.HISTORY_ALIGN_MS, isHistory, clock);
  const request =
    historyRequestFor(range, deviceId, metric, now) ??
    // A disabled query still needs a key: the 1 h request, which is never fetched from here.
    historyRequestFor('1h', deviceId, metric, now);
  if (request === null) throw new Error('1h is a history range');
  const span = request.to - request.from;
  const query = useQuery({
    ...readingsQuery(useTelemetryApi(), request),
    enabled: isHistory,
    placeholderData: (previous) =>
      previous?.deviceId === deviceId &&
      previous.metric === metric &&
      previous.to - previous.from === span
        ? previous
        : undefined,
  });
  return isHistory ? (query.data ?? null) : null;
}
