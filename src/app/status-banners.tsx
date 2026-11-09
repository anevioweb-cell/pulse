import { useConnectivity } from '@/features/telemetry';
import type { Connectivity } from '@/features/telemetry';
import { messages } from '@/shared/i18n';
import { Banner, Button } from '@/shared/ui';

import { updateStore } from './pwa/update-store';
import { useUpdateState } from './pwa/use-update-state';

import type { UpdateStore } from './pwa/update-store';

const degradedMessage = (reason: Connectivity['reason']) => {
  switch (reason) {
    case 'live_failed':
      return messages.degradedBanner.failed;
    case 'live_silent':
      return messages.degradedBanner.silent;
    default:
      return messages.degradedBanner.reconnecting;
  }
};

/**
 * Shown while offline (and while the live connection is degraded), hidden again as soon as the
 * connectivity model says online. Demo Mode says that demo data keeps running.
 */
export function OfflineBanner({ connectivity }: { connectivity?: Connectivity }) {
  const current = useConnectivity();
  const { state, reason, demo } = connectivity ?? current;
  if (state === 'offline') {
    return (
      <Banner tone="warning" title={messages.offlineBanner.title}>
        {demo ? messages.offlineBanner.demoBody : messages.offlineBanner.liveBody}
      </Banner>
    );
  }
  if (state === 'degraded') {
    return (
      <Banner tone="warning" title={messages.degradedBanner.title}>
        {degradedMessage(reason)}
      </Banner>
    );
  }
  return null;
}

/**
 * Offers a waiting service-worker update. Never reloads by itself: "Reload now" activates the new
 * worker and reloads when it takes control; "Later" hides the banner until the next version.
 */
export function UpdateAvailableBanner({ store = updateStore }: { store?: UpdateStore }) {
  const { status } = useUpdateState(store);
  if (status !== 'available' && status !== 'reloading') return null;
  const reloading = status === 'reloading';
  return (
    <Banner
      tone="info"
      title={messages.updateBanner.title}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={store.later} disabled={reloading}>
            {messages.updateBanner.later}
          </Button>
          <Button
            size="sm"
            loading={reloading}
            onClick={() => {
              void store.reload();
            }}
          >
            {messages.updateBanner.reload}
          </Button>
        </>
      }
    >
      {messages.updateBanner.body}
    </Banner>
  );
}

/** The app-wide status region at the top of the page. */
export function StatusBanners() {
  return (
    <div className="sticky top-0 z-sticky flex flex-col gap-2 empty:hidden">
      <UpdateAvailableBanner />
      <OfflineBanner />
    </div>
  );
}
