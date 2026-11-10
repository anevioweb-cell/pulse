import type { DeviceStatus, SensorMetric } from '@/features/telemetry';
import { messages } from '@/shared/i18n';

import { DEVICE_DISPLAY } from '../config';

import type { ChartRange } from '../charts/chart-range';

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(metric: SensorMetric, locale: string | undefined): Intl.NumberFormat {
  const key = `${locale ?? ''}:${metric}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    const digits = DEVICE_DISPLAY.DECIMALS.get(metric) ?? 0;
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/** A metric value in the locale, at the sensor's resolution; "—" when there is none. */
export function formatMetric(
  metric: SensorMetric,
  value: number | undefined | null,
  locale?: string,
): string {
  if (value === undefined || value === null) return messages.devices.noValue;
  return formatterFor(metric, locale).format(value);
}

export function metricLabel(metric: SensorMetric): string {
  const { metrics } = messages.devices;
  switch (metric) {
    case 'temperature':
      return metrics.temperature;
    case 'humidity':
      return metrics.humidity;
    case 'pressure':
      return metrics.pressure;
    case 'battery':
      return metrics.battery;
    default:
      return metrics.signal;
  }
}

export function metricUnit(metric: SensorMetric): string {
  const { units } = messages.devices;
  switch (metric) {
    case 'temperature':
      return units.temperature;
    case 'humidity':
      return units.humidity;
    case 'pressure':
      return units.pressure;
    case 'battery':
      return units.battery;
    default:
      return units.signal;
  }
}

/** A device's status before its first live message is "unknown". */
export type DisplayStatus = DeviceStatus | 'unknown';

export function statusLabel(status: DisplayStatus): string {
  const labels = messages.devices.status;
  switch (status) {
    case 'online':
      return labels.online;
    case 'stale':
      return labels.stale;
    case 'offline':
      return labels.offline;
    default:
      return labels.unknown;
  }
}

/** Short range label for the range control ("1 hour"). */
export function rangeLabel(range: ChartRange): string {
  const { ranges } = messages.deviceDetail;
  switch (range) {
    case 'live':
      return ranges.live;
    case '5m':
      return ranges['5m'];
    case '1h':
      return ranges['1h'];
    case '24h':
      return ranges['24h'];
  }
}

/** Spoken range for chart summaries ("the last hour"). */
export function rangeName(range: ChartRange): string {
  const { rangeNames } = messages.deviceDetail;
  switch (range) {
    case 'live':
      return rangeNames.live;
    case '5m':
      return rangeNames['5m'];
    case '1h':
      return rangeNames['1h'];
    case '24h':
      return rangeNames['24h'];
  }
}
