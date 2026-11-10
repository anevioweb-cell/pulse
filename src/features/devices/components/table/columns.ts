import type { SensorMetric } from '@/features/telemetry';
import { messages } from '@/shared/i18n';

import { metricLabel, metricUnit } from '../../model/format';

import type { DeviceColumnId } from '../../model/table-url-state';

const METRIC_COLUMNS = new Set<string>([
  'temperature',
  'humidity',
  'pressure',
  'battery',
  'signal',
]);

/** The metric a column shows, or null for the text columns. */
export function metricOf(column: DeviceColumnId): SensorMetric | null {
  return METRIC_COLUMNS.has(column) ? (column as SensorMetric) : null;
}

/** Visible header text (metrics carry their unit). */
export function columnLabel(column: DeviceColumnId): string {
  const metric = metricOf(column);
  if (metric) return messages.devices.table.withUnit(metricLabel(metric), metricUnit(metric));
  const { columns } = messages.devices.table;
  switch (column) {
    case 'location':
      return columns.location;
    case 'status':
      return columns.status;
    case 'lastSeen':
      return columns.lastSeen;
    default:
      return columns.name;
  }
}
