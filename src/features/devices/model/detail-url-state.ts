import { z } from 'zod/mini';

import { SENSOR_METRICS } from '@/features/telemetry';
import type { SensorMetric } from '@/features/telemetry';

import { chartRangeSchema, DEFAULT_CHART_RANGE } from '../charts/chart-range';
import { DEVICE_CHART } from '../config';
import { singleParam } from './url-params';

import type { ChartRange } from '../charts/chart-range';

/** Everything about the device page's view that lives in the query string. */
export interface DeviceDetailState {
  range: ChartRange;
  /** The expanded chart, or null when every chart has its normal size. */
  metric: SensorMetric | null;
}

export const DEFAULT_DETAIL_STATE: DeviceDetailState = {
  range: DEFAULT_CHART_RANGE,
  metric: null,
};

/** Query-string keys. Anything else in the URL is ignored and dropped on the next write. */
export const DETAIL_PARAMS = { range: 'range', metric: 'metric' } as const;

const metricSchema = z.enum(SENSOR_METRICS);

const single = (params: URLSearchParams, key: string) =>
  singleParam(params, key, DEVICE_CHART.MAX_PARAM_LENGTH);

/**
 * Reads the device page's view from the query string, as untrusted input (ADR 0021): only the two
 * known keys are read, each must appear once and be short, and each field that fails its schema
 * falls back to its own default. Never throws.
 */
export function parseDetailState(params: URLSearchParams): DeviceDetailState {
  const range = chartRangeSchema.safeParse(single(params, DETAIL_PARAMS.range));
  const metric = metricSchema.safeParse(single(params, DETAIL_PARAMS.metric));
  return {
    range: range.success ? range.data : DEFAULT_DETAIL_STATE.range,
    metric: metric.success ? metric.data : DEFAULT_DETAIL_STATE.metric,
  };
}

/** Writes the view as a query string, omitting defaults (the default view has a clean URL). */
export function serializeDetailState(state: DeviceDetailState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.range !== DEFAULT_DETAIL_STATE.range) params.set(DETAIL_PARAMS.range, state.range);
  if (state.metric !== null) params.set(DETAIL_PARAMS.metric, state.metric);
  return params;
}
