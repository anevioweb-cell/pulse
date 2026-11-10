import { Link } from 'react-router';

import {
  DeviceStatusBadge,
  formatMetric,
  metricLabel,
  metricUnit,
  useLastSeenLabel,
} from '@/features/devices';
import { readingValue, useLiveDevice, usePrefetchDevice } from '@/features/telemetry';
import type { DeviceSummary, SensorMetric } from '@/features/telemetry';

const CARD_METRICS: readonly SensorMetric[] = ['temperature', 'humidity', 'battery', 'signal'];

/**
 * One device on the overview. Metadata comes from the server-data list (the prop); status, latest
 * values and "last seen" from the live store through `useLiveDevice(id)`, so a reading for another
 * device never re-renders this card. The device name is the card's link (stretched over the card),
 * so the link's accessible name is just the name; hovering or focusing it prefetches the device
 * page's data. Not memoized: the grid re-renders only when the device list itself changes, which
 * the render-count tests show (a refetch with the same data re-renders no card).
 */
export function DeviceCard({ device }: { device: DeviceSummary }) {
  const live = useLiveDevice(device.id);
  const prefetch = usePrefetchDevice(device.id);
  const lastSeen = useLastSeenLabel(live?.lastHeardAt);
  return (
    <article className="relative flex h-full flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm transition-colors duration-fast has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            <Link
              to={`/devices/${encodeURIComponent(device.id)}`}
              className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
              {...prefetch}
            >
              {device.name}
            </Link>
          </h3>
          <p className="truncate text-sm text-text-muted">{device.location}</p>
        </div>
        <DeviceStatusBadge status={live?.status ?? 'unknown'} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {CARD_METRICS.map((metric) => (
          <div key={metric} className="flex flex-col">
            <dt className="text-xs text-text-muted">{metricLabel(metric)}</dt>
            <dd className="font-mono text-base tabular-nums">
              {formatMetric(metric, live?.latest ? readingValue(live.latest, metric) : undefined)}{' '}
              <span className="font-sans text-xs text-text-muted">{metricUnit(metric)}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-auto text-xs text-text-muted">{lastSeen}</p>
    </article>
  );
}
