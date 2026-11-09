import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { PREFETCH } from '../config';
import { systemScheduler } from '../transport/scheduler';
import { useTelemetryApi } from './api-context';
import { deviceQuery, readingsQuery } from './query-options';

import type { Scheduler, TimerHandle } from '../transport/scheduler';
import type { ReadingsRequest, TelemetryApi } from './telemetry-api';
import type { QueryClient } from '@tanstack/react-query';

/**
 * The device page's default readings request: the last PREFETCH.RECENT_RANGE_MS of
 * PREFETCH.RECENT_METRIC, with the end rounded up to PREFETCH.RANGE_ALIGN_MS. Rounding makes the
 * query key identical for every call within one step, so a prefetch and the page that follows
 * share one cache entry.
 */
export function recentReadingsRequest(deviceId: string, now: number): ReadingsRequest {
  const to = Math.ceil(now / PREFETCH.RANGE_ALIGN_MS) * PREFETCH.RANGE_ALIGN_MS;
  return { deviceId, metric: PREFETCH.RECENT_METRIC, from: to - PREFETCH.RECENT_RANGE_MS, to };
}

/** Query definition for that default range (also what Phase 5's device page uses). */
export const recentReadingsQuery = (
  api: TelemetryApi,
  deviceId: string,
  now: () => number = () => Date.now(),
) => readingsQuery(api, recentReadingsRequest(deviceId, now()), now);

/**
 * Prefetches a device's detail and default readings range. Skipped offline. `client.query`
 * returns fresh data without fetching (each query's staleTime) and joins a request already in
 * flight, so repeated hovers cost nothing. Never throws (prefetch errors are not shown).
 */
export function prefetchDevice(
  client: QueryClient,
  api: TelemetryApi,
  deviceId: string,
  now: () => number = () => Date.now(),
): Promise<void> {
  if (!onlineManager.isOnline()) return Promise.resolve();
  const ignore = () => undefined; // a failed prefetch is not an error anyone sees
  return Promise.all([
    client.query(deviceQuery(api, deviceId)).catch(ignore),
    client.query(recentReadingsQuery(api, deviceId, now)).catch(ignore),
  ]).then(ignore);
}

export interface PrefetchIntent {
  /** Pointer entered or focus arrived: prefetch after the intent delay. */
  start: () => void;
  /** Pointer left or focus moved away before the delay: do nothing. */
  cancel: () => void;
}

/**
 * Hover/focus intent: runs `prefetch` only if the intent lasts PREFETCH.INTENT_DELAY_MS. A request
 * that already started is not aborted on leave: it is cheap and its result is useful.
 */
export function createPrefetchIntent(
  prefetch: () => void,
  scheduler: Pick<Scheduler, 'setTimeout' | 'clearTimeout'> = systemScheduler,
): PrefetchIntent {
  let timer: TimerHandle | null = null;
  const cancel = () => {
    if (timer !== null) scheduler.clearTimeout(timer);
    timer = null;
  };
  return {
    start: () => {
      if (timer !== null) return;
      timer = scheduler.setTimeout(() => {
        timer = null;
        prefetch();
      }, PREFETCH.INTENT_DELAY_MS);
    },
    cancel,
  };
}

/**
 * Event handlers that prefetch a device's detail and recent readings on hover or keyboard focus,
 * for a link or row that opens the device (Phase 5 wires them). Spread them on the element:
 * `<a {...usePrefetchDevice(id)}>`.
 */
export function usePrefetchDevice(deviceId: string, scheduler: Scheduler = systemScheduler) {
  const client = useQueryClient();
  const api = useTelemetryApi();
  const intent = useMemo(
    () =>
      createPrefetchIntent(() => {
        void prefetchDevice(client, api, deviceId, scheduler.now);
      }, scheduler),
    [client, api, deviceId, scheduler],
  );
  useEffect(() => intent.cancel, [intent]);
  return useMemo(
    () => ({
      onPointerEnter: intent.start,
      onPointerLeave: intent.cancel,
      onFocus: intent.start,
      onBlur: intent.cancel,
    }),
    [intent],
  );
}
