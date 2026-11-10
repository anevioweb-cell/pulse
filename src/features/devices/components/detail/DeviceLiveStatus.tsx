import {
  readingValue,
  SENSOR_METRICS,
  useLiveDevice,
  useLiveDeviceStatus,
} from '@/features/telemetry';
import type { DeviceDetail, SensorMetric } from '@/features/telemetry';
import { messages } from '@/shared/i18n';
import { Banner } from '@/shared/ui';

import { formatMetric, metricLabel, metricUnit } from '../../model/format';
import { DeviceStatusBadge } from '../DeviceStatusBadge';
import { useLastSeenLabel } from '../use-last-seen';

/** Status badge: re-renders only when the device's status changes. */
export function DeviceStatus({ deviceId }: { deviceId: string }) {
  const status = useLiveDeviceStatus(deviceId);
  return <DeviceStatusBadge status={status ?? 'unknown'} />;
}

/** Offline or stale explanation (the announcement region speaks the change). */
export function DeviceStatusBanner({ deviceId }: { deviceId: string }) {
  const status = useLiveDeviceStatus(deviceId);
  const text = messages.deviceDetail;
  if (status === 'offline') {
    return (
      <Banner tone="danger" title={text.offlineTitle} live={false}>
        {text.offlineBody}
      </Banner>
    );
  }
  if (status === 'stale') {
    return (
      <Banner tone="warning" title={text.staleTitle} live={false}>
        {text.staleBody}
      </Banner>
    );
  }
  return null;
}

/**
 * Last seen and the latest value of each metric: the live reading when there is one, the server's
 * latest stored reading before that. This is the only part of the page that renders per reading.
 */
export function LatestValues({
  deviceId,
  metrics,
  stored,
}: {
  deviceId: string;
  metrics: readonly SensorMetric[];
  stored: DeviceDetail['latest'];
}) {
  const device = useLiveDevice(deviceId);
  const lastSeen = useLastSeenLabel(device?.lastHeardAt);
  const values = device?.latest ?? stored?.values ?? null;
  const text = messages.deviceDetail;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-muted">{device ? lastSeen : text.waitingBody}</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((metric) => (
          <div
            key={metric}
            className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-raised p-3"
          >
            <dt className="text-xs text-text-muted">{metricLabel(metric)}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatMetric(metric, values ? readingValue(values, metric) : null)}{' '}
              <span className="text-sm font-normal text-text-muted">{metricUnit(metric)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Metrics this device reports: those in its latest stored reading, or all of them. */
export function metricsOf(latest: DeviceDetail['latest']): readonly SensorMetric[] {
  if (!latest) return SENSOR_METRICS;
  const present = SENSOR_METRICS.filter(
    (metric) => readingValue(latest.values, metric) !== undefined,
  );
  return present.length > 0 ? present : SENSOR_METRICS;
}
