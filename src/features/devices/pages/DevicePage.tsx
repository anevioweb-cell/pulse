import { ArrowLeft, SearchX } from 'lucide-react';
import { useId } from 'react';
import { Link, useParams } from 'react-router';

import { useAlertRules, useDevice } from '@/features/telemetry';
import type { DeviceDetail } from '@/features/telemetry';
import { isApiError } from '@/shared/api';
import { messages } from '@/shared/i18n';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '@/shared/ui';

import { ChartSchedulerProvider } from '../charts/scheduler-context';
import { ChartControls } from '../components/detail/ChartControls';
import { DeviceAnnouncements } from '../components/detail/DeviceAnnouncements';
import { DeviceChart } from '../components/detail/DeviceChart';
import {
  DeviceStatus,
  DeviceStatusBanner,
  LatestValues,
  metricsOf,
} from '../components/detail/DeviceLiveStatus';
import { useDetailUrlState } from '../components/detail/use-detail-url-state';

import type { RedrawSchedulerOptions } from '../charts/redraw-scheduler';

const HTTP_NOT_FOUND = 404;

function BackLink() {
  return (
    <Link
      to="/devices"
      className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-accent underline-offset-4 hover:underline"
    >
      <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
      {messages.pages.device.back}
    </Link>
  );
}

function DeviceDetailView({ device, clock }: { device: DeviceDetail; clock?: () => number }) {
  const { state, update } = useDetailUrlState();
  const rules = useAlertRules();
  const metrics = metricsOf(device.latest);
  const latestId = useId();
  const chartsId = useId();
  const text = messages.deviceDetail;
  return (
    <>
      <PageHeader
        title={device.name}
        description={text.facts(device.location, device.firmware)}
        actions={<DeviceStatus deviceId={device.id} />}
      />
      <DeviceStatusBanner deviceId={device.id} />
      <section aria-labelledby={latestId} className="flex flex-col gap-3">
        <h2 id={latestId} className="text-lg font-semibold">
          {text.latestHeading}
        </h2>
        <LatestValues deviceId={device.id} metrics={metrics} stored={device.latest} />
      </section>
      <section aria-labelledby={chartsId} className="flex flex-col gap-3">
        <h2 id={chartsId} className="text-lg font-semibold">
          {text.chartsHeading}
        </h2>
        <ChartControls
          range={state.range}
          onRangeChange={(range) => {
            update({ range });
          }}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {metrics.map((metric) => (
            <DeviceChart
              key={metric}
              deviceId={device.id}
              metric={metric}
              range={state.range}
              rules={rules.data}
              expanded={state.metric === metric}
              onToggleExpanded={() => {
                update({ metric: state.metric === metric ? null : metric });
              }}
              {...(clock ? { clock } : {})}
            />
          ))}
        </div>
      </section>
      <DeviceAnnouncements deviceId={device.id} />
    </>
  );
}

function DeviceContent({ id, clock }: { id: string; clock?: () => number }) {
  const device = useDevice(id);
  const text = messages.deviceDetail;
  if (device.data) return <DeviceDetailView device={device.data} {...(clock ? { clock } : {})} />;
  if (device.isError) {
    if (isApiError(device.error) && device.error.status === HTTP_NOT_FOUND) {
      return (
        <>
          <PageHeader title={text.notFoundTitle} />
          <EmptyState
            icon={<SearchX />}
            title={text.notFoundTitle}
            description={text.notFoundDescription}
            headingLevel="h2"
            action={
              <Button asChild variant="secondary">
                <Link to="/devices">{messages.pages.device.back}</Link>
              </Button>
            }
          />
        </>
      );
    }
    return (
      <>
        <PageHeader title={messages.pages.device.title(id)} />
        <ErrorState
          title={text.errorTitle}
          description={text.errorDescription}
          retryLabel={text.retry}
          retrying={device.isFetching}
          headingLevel="h2"
          onRetry={() => {
            void device.refetch();
          }}
        />
      </>
    );
  }
  return (
    <>
      <PageHeader title={messages.pages.device.title(id)} />
      <div aria-busy="true" className="flex flex-col gap-4">
        <p className="sr-only">{text.loading}</p>
        <Skeleton className="h-20" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton shape="rect" className="h-56" />
          <Skeleton shape="rect" className="h-56" />
        </div>
      </div>
    </>
  );
}

/**
 * Device detail: header, latest values, and one live chart per metric (ADR 0025 to 0027). The
 * route guard has already validated `:id` with the REST contract's id rule, so it is safe to use
 * in query keys. The page subscribes to no live data itself: live values, status and charts each
 * subscribe to their own slice, and chart data bypasses React entirely.
 */
export function DevicePage({
  scheduler,
  clock,
}: {
  /** Injected frame scheduler and clock (tests). */
  scheduler?: RedrawSchedulerOptions;
  clock?: () => number;
} = {}) {
  const { id = '' } = useParams();
  return (
    <ChartSchedulerProvider {...(scheduler ? { options: scheduler } : {})}>
      <div className="flex flex-col gap-6">
        <BackLink />
        <DeviceContent key={id} id={id} {...(clock ? { clock } : {})} />
      </div>
    </ChartSchedulerProvider>
  );
}
