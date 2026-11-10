import { Cpu } from 'lucide-react';

import { useDevices, useLiveHasData } from '@/features/telemetry';
import type { DeviceSummary } from '@/features/telemetry';
import { messages } from '@/shared/i18n';
import { Banner, EmptyState, ErrorState, Skeleton } from '@/shared/ui';

import { OVERVIEW } from '../config';
import { DeviceCard } from './DeviceCard';

import type { ReactNode } from 'react';

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3';
const SKELETON_KEYS = Array.from({ length: OVERVIEW.SKELETON_CARDS }, (_, index) => index);

const defaultCard = (device: DeviceSummary) => <DeviceCard device={device} />;

/** Its own subscriber, so the first live message re-renders this notice, not the grid. */
function WaitingNotice() {
  const hasData = useLiveHasData();
  if (hasData) return null;
  return (
    <Banner tone="info" title={messages.overview.grid.waitingTitle}>
      {messages.overview.grid.waitingBody}
    </Banner>
  );
}

/**
 * Every device as a card. Membership comes from the server-data device list (`useDevices`); the
 * grid subscribes to no live data at all, so a live update re-renders only the affected card.
 * `renderCard` exists for render-count tests.
 */
export function DeviceGrid({
  renderCard = defaultCard,
}: {
  renderCard?: (device: DeviceSummary) => ReactNode;
}) {
  const devices = useDevices();

  if (devices.data) {
    if (devices.data.length === 0) {
      return (
        <EmptyState
          icon={<Cpu />}
          title={messages.overview.grid.emptyTitle}
          description={messages.overview.grid.emptyDescription}
        />
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <WaitingNotice />
        <ul className={GRID}>
          {devices.data.map((device) => (
            <li key={device.id}>{renderCard(device)}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (devices.isError) {
    return (
      <ErrorState
        title={messages.overview.grid.errorTitle}
        description={messages.overview.grid.errorDescription}
        retryLabel={messages.overview.grid.retry}
        retrying={devices.isFetching}
        headingLevel="h3"
        onRetry={() => {
          void devices.refetch();
        }}
      />
    );
  }

  return (
    <div aria-busy="true">
      <p className="sr-only">{messages.overview.grid.loading}</p>
      <ul className={GRID}>
        {SKELETON_KEYS.map((key) => (
          <li key={key}>
            <Skeleton shape="rect" className="h-44" />
          </li>
        ))}
      </ul>
    </div>
  );
}
