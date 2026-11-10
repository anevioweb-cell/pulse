import { useState } from 'react';

import { useLiveDeviceStatus } from '@/features/telemetry';
import type { DeviceStatus } from '@/features/telemetry';
import { messages } from '@/shared/i18n';

import { useChartsPaused } from '../../charts/scheduler-context';

interface Seen {
  status: DeviceStatus | null;
  paused: boolean;
  message: string;
}

/** The message for a change, or null when the change is not news. */
function messageFor(before: Seen, status: DeviceStatus | null, paused: boolean): string | null {
  const text = messages.deviceDetail.announce;
  if (paused !== before.paused) return paused ? text.paused : text.resumed;
  // Only changes of a known status: the first status of a device is not news.
  if (status === before.status || status === null || before.status === null) return null;
  if (status === 'offline') return text.offline;
  if (status === 'stale') return text.stale;
  return text.online;
}

/**
 * One polite live region for meaningful changes only (ADR 0027): the device going offline or
 * stale, coming back, and charts paused or resumed. Samples and values are never announced. The
 * region exists from the first render, so the first message is announced too. It re-renders only
 * when the status or the pause state changes.
 */
export function DeviceAnnouncements({ deviceId }: { deviceId: string }) {
  const status = useLiveDeviceStatus(deviceId);
  const paused = useChartsPaused();
  const [seen, setSeen] = useState<Seen>({ status, paused, message: '' });
  if (seen.status !== status || seen.paused !== paused) {
    // Derived during render (no effect, no extra commit): React re-renders this component at once.
    setSeen({ status, paused, message: messageFor(seen, status, paused) ?? seen.message });
  }
  return (
    <p role="status" className="sr-only">
      {seen.message}
    </p>
  );
}
