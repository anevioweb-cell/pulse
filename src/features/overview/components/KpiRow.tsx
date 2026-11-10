import { Activity, Bell, Cpu, Thermometer } from 'lucide-react';
import { useState } from 'react';

import { formatMetric, metricUnit } from '@/features/devices';
import {
  useAlertHistory,
  useDevices,
  useLiveLastMessageAt,
  useLiveMode,
  useLiveOnlineAverage,
  useLiveStatusSummary,
} from '@/features/telemetry';
import type { AlertsQueryInput } from '@/features/telemetry';
import { useRelativeTime } from '@/shared/hooks';
import { messages } from '@/shared/i18n';
import { Button, KpiCard } from '@/shared/ui';

import { OVERVIEW } from '../config';

const count = new Intl.NumberFormat();

function OnlineKpi() {
  const summary = useLiveStatusSummary();
  const devices = useDevices();
  const total = devices.data?.length;
  return (
    <KpiCard
      label={messages.overview.kpi.online}
      icon={<Cpu />}
      tone="success"
      value={count.format(summary.online)}
      {...(total === undefined
        ? {}
        : { unit: messages.overview.kpi.onlineOf(count.format(total)) })}
      description={messages.overview.kpi.onlineBreakdown(
        count.format(summary.stale),
        count.format(summary.offline),
      )}
      loading={devices.isPending}
    />
  );
}

function TemperatureKpi() {
  const average = useLiveOnlineAverage('temperature');
  return (
    <KpiCard
      label={messages.overview.kpi.temperature}
      icon={<Thermometer />}
      tone="accent"
      value={formatMetric('temperature', average)}
      {...(average === null ? {} : { unit: metricUnit('temperature') })}
      description={
        average === null
          ? messages.overview.kpi.temperatureNone
          : messages.overview.kpi.temperatureScope
      }
    />
  );
}

/** The last 24 h, ending at the most recent alignment step (one query key per step). */
export function alertWindow(now: number): AlertsQueryInput {
  const to = Math.floor(now / OVERVIEW.ALERT_ALIGN_MS) * OVERVIEW.ALERT_ALIGN_MS;
  return { from: to - OVERVIEW.ALERT_WINDOW_MS, to };
}

function AlertsKpi() {
  // Fixed for the page visit: one query key, refetched when stale (on focus or revisit).
  const [range] = useState(() => alertWindow(Date.now()));
  const alerts = useAlertHistory(range);
  const { kpi } = messages.overview;
  if (alerts.isError && !alerts.data) {
    return (
      <KpiCard
        label={kpi.alerts}
        icon={<Bell />}
        tone="danger"
        value={messages.devices.noValue}
        description={kpi.alertsError}
        action={
          <Button
            size="sm"
            variant="secondary"
            loading={alerts.isFetching}
            onClick={() => {
              void alerts.refetch();
            }}
          >
            {kpi.retry}
          </Button>
        }
      />
    );
  }
  const events = alerts.data?.alerts.length ?? 0;
  const value = alerts.data?.truncated
    ? kpi.alertsAtLeast(count.format(events))
    : count.format(events);
  return (
    <KpiCard
      label={kpi.alerts}
      icon={<Bell />}
      tone={events > 0 ? 'warning' : 'neutral'}
      value={value}
      description={events > 0 ? kpi.alertsScope : kpi.alertsNone}
      loading={alerts.isPending}
    />
  );
}

function LastUpdateKpi() {
  const lastMessageAt = useLiveLastMessageAt();
  const mode = useLiveMode();
  const relative = useRelativeTime(lastMessageAt, OVERVIEW.LAST_UPDATE_REFRESH_MS);
  const { kpi } = messages.overview;
  return (
    <KpiCard
      label={kpi.lastUpdate}
      icon={<Activity />}
      tone="info"
      value={relative ?? messages.devices.noValue}
      description={
        relative === null
          ? kpi.lastUpdateNever
          : mode === 'live'
            ? kpi.lastUpdateLive
            : kpi.lastUpdateDemo
      }
    />
  );
}

/** The four key figures. Each card subscribes to its own slice, so they update independently. */
export function KpiRow() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <OnlineKpi />
      <TemperatureKpi />
      <AlertsKpi />
      <LastUpdateKpi />
    </div>
  );
}
