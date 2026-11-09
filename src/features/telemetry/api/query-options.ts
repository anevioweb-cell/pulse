import { queryOptions } from '@tanstack/react-query';

import { QUERY_POLICY } from '../config';
import { telemetryKeys } from './query-keys';

import type { AlertsQueryInput } from './contract';
import type { ReadingsRequest, TelemetryApi } from './telemetry-api';

// Query definitions per resource: key, fetcher (with the AbortSignal passed through, so a
// cancelled query cancels its request) and freshness from QUERY_POLICY (docs/caching.md).

export const deviceListQuery = (api: TelemetryApi) =>
  queryOptions({
    queryKey: telemetryKeys.deviceList(api.mode),
    queryFn: ({ signal }) => api.listDevices({ signal }),
    staleTime: QUERY_POLICY.DEVICES.STALE_TIME_MS,
    gcTime: QUERY_POLICY.DEVICES.GC_TIME_MS,
  });

export const deviceQuery = (api: TelemetryApi, id: string) =>
  queryOptions({
    queryKey: telemetryKeys.device(api.mode, id),
    queryFn: ({ signal }) => api.getDevice(id, { signal }),
    staleTime: QUERY_POLICY.DEVICE.STALE_TIME_MS,
    gcTime: QUERY_POLICY.DEVICE.GC_TIME_MS,
  });

/**
 * A range that ended before "now" can never change, so it is fresh forever; a range reaching "now"
 * grows every sample interval and goes stale after READINGS.RECENT_STALE_TIME_MS. Decided when
 * TanStack checks freshness (staleTime as a function), never during render.
 */
export const readingsQuery = (
  api: TelemetryApi,
  { deviceId, ...range }: ReadingsRequest,
  now: () => number = () => Date.now(),
) =>
  queryOptions({
    queryKey: telemetryKeys.readings(api.mode, deviceId, range),
    queryFn: ({ signal }) => api.getReadings({ deviceId, ...range }, { signal }),
    staleTime: () =>
      range.to < now()
        ? QUERY_POLICY.READINGS.PAST_STALE_TIME_MS
        : QUERY_POLICY.READINGS.RECENT_STALE_TIME_MS,
    gcTime: QUERY_POLICY.READINGS.GC_TIME_MS,
  });

export const alertHistoryQuery = (api: TelemetryApi, query: AlertsQueryInput) =>
  queryOptions({
    queryKey: telemetryKeys.alertHistory(api.mode, query),
    queryFn: ({ signal }) => api.listAlerts(query, { signal }),
    staleTime: QUERY_POLICY.ALERTS.STALE_TIME_MS,
    gcTime: QUERY_POLICY.ALERTS.GC_TIME_MS,
  });

/**
 * Rules are always revalidated when a component mounts, even if fresh: a restored (persisted)
 * list is shown at once, but the repository decides (ADR 0018). staleTime still limits refetches
 * while components stay mounted.
 */
export const alertRulesQuery = (api: TelemetryApi) =>
  queryOptions({
    queryKey: telemetryKeys.alertRules(api.mode),
    queryFn: ({ signal }) => api.listAlertRules({ signal }),
    staleTime: QUERY_POLICY.ALERT_RULES.STALE_TIME_MS,
    gcTime: QUERY_POLICY.ALERT_RULES.GC_TIME_MS,
    refetchOnMount: 'always',
  });
