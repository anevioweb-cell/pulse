import { useConnectivity } from '@/features/telemetry';
import type { ConnectivityState } from '@/features/telemetry';
import { messages } from '@/shared/i18n';
import { StatusIndicator } from '@/shared/ui';

const labelOf = (state: ConnectivityState) => {
  switch (state) {
    case 'online':
      return messages.connectivity.online;
    case 'offline':
      return messages.connectivity.offline;
    case 'degraded':
      return messages.connectivity.degraded;
    default:
      return messages.connectivity.unknown;
  }
};

/**
 * The connection state from the connectivity model (browser, data layer and live stream). Not a
 * live region: the status banners announce changes.
 */
export function ConnectionStatus() {
  const { state } = useConnectivity();
  return <StatusIndicator status={state} label={labelOf(state)} size="sm" />;
}
