import { useRelativeTime } from '@/shared/hooks';
import { messages } from '@/shared/i18n';

import { DEVICE_DISPLAY } from '../config';

/** "Seen 5 seconds ago" from the live store's local receive time, or "Not seen yet". */
export function useLastSeenLabel(lastHeardAt: number | null | undefined): string {
  const relative = useRelativeTime(lastHeardAt ?? null, DEVICE_DISPLAY.LAST_SEEN_REFRESH_MS);
  return relative === null ? messages.devices.neverSeen : messages.devices.lastSeen(relative);
}
