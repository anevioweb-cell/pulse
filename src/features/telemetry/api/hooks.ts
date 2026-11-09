import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTelemetryApi } from './api-context';
import {
  alertHistoryQuery,
  alertRulesQuery,
  deviceListQuery,
  deviceQuery,
  readingsQuery,
} from './query-options';
import {
  createAlertRuleMutation,
  createDeleteAlertRuleMutation,
  createUpdateAlertRuleMutation,
} from './rule-mutations';

import type { AlertsQueryInput } from './contract';
import type { ReadingsRequest } from './telemetry-api';

// Server-state hooks. Each returns TanStack's UseQueryResult with typed data and ApiError errors.
// Live stream data (Zustand, ring buffers) never goes through these hooks or into this cache.

/** The fleet (device list). */
export function useDevices() {
  return useQuery(deviceListQuery(useTelemetryApi()));
}

/** One device's metadata and latest stored reading. */
export function useDevice(id: string) {
  return useQuery(deviceQuery(useTelemetryApi(), id));
}

/** Historical readings of one metric over a range, downsampled to at most `maxPoints`. */
export function useHistoricalReadings(request: ReadingsRequest, { enabled = true } = {}) {
  return useQuery({ ...readingsQuery(useTelemetryApi(), request), enabled });
}

/** Alert events in a range, newest first. */
export function useAlertHistory(query: AlertsQueryInput) {
  return useQuery(alertHistoryQuery(useTelemetryApi(), query));
}

/** Configured alert rules. */
export function useAlertRules() {
  return useQuery(alertRulesQuery(useTelemetryApi()));
}

/**
 * Creates an alert rule. It appears at once with a temporary id, replaced by the server's id;
 * on failure (including `offline`) it disappears again and the typed ApiError is returned.
 * Never retried (ADR 0019).
 */
export function useCreateAlertRule() {
  return useMutation(createAlertRuleMutation(useTelemetryApi(), useQueryClient()));
}

/** Replaces an alert rule optimistically; rolls back exactly on failure (ADR 0019). */
export function useUpdateAlertRule() {
  return useMutation(createUpdateAlertRuleMutation(useTelemetryApi(), useQueryClient()));
}

/** Deletes an alert rule optimistically; it reappears where it was on failure (ADR 0019). */
export function useDeleteAlertRule() {
  return useMutation(createDeleteAlertRuleMutation(useTelemetryApi(), useQueryClient()));
}
