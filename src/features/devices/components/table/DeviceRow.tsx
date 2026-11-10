import { Link } from 'react-router';

import { readingValue, useLiveDevice, usePrefetchDevice } from '@/features/telemetry';
import type { DeviceSummary } from '@/features/telemetry';

import { formatMetric } from '../../model/format';
import { DeviceStatusBadge } from '../DeviceStatusBadge';
import { useLastSeenLabel } from '../use-last-seen';
import { metricOf } from './columns';

import type { DeviceColumnId } from '../../model/table-url-state';

export interface DeviceRowProps {
  device: DeviceSummary;
  /** Visible columns, in order. */
  columns: readonly DeviceColumnId[];
  /** 1-based position among all rows including the header (`aria-rowindex`). */
  rowIndex: number;
}

const CELL = 'h-12 px-3 whitespace-nowrap border-b border-border';

/**
 * One table row. It subscribes to its own device in the live store (`useLiveDevice`), so a
 * reading re-renders this row only; the table above it never subscribes to readings.
 */
export function DeviceRow({ device, columns, rowIndex }: DeviceRowProps) {
  const live = useLiveDevice(device.id);
  const prefetch = usePrefetchDevice(device.id);
  const lastSeen = useLastSeenLabel(live?.lastHeardAt);
  return (
    <tr aria-rowindex={rowIndex} className="hover:bg-surface-sunken">
      {columns.map((column) => {
        if (column === 'name') {
          return (
            <th key={column} scope="row" className={`${CELL} text-start font-medium`}>
              <Link
                to={`/devices/${encodeURIComponent(device.id)}`}
                className="rounded-sm text-accent underline-offset-4 hover:underline"
                {...prefetch}
              >
                {device.name}
              </Link>
            </th>
          );
        }
        if (column === 'location') {
          return (
            <td key={column} className={`${CELL} text-text-muted`}>
              {device.location}
            </td>
          );
        }
        if (column === 'status') {
          return (
            <td key={column} className={CELL}>
              <DeviceStatusBadge status={live?.status ?? 'unknown'} />
            </td>
          );
        }
        if (column === 'lastSeen') {
          return (
            <td key={column} className={`${CELL} text-text-muted`}>
              {lastSeen}
            </td>
          );
        }
        const metric = metricOf(column);
        const value = metric && live?.latest ? readingValue(live.latest, metric) : undefined;
        return (
          <td key={column} className={`${CELL} text-end font-mono tabular-nums`}>
            {metric ? formatMetric(metric, value) : null}
          </td>
        );
      })}
    </tr>
  );
}
