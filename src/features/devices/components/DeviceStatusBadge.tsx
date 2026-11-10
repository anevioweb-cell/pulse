import { CircleDashed } from 'lucide-react';

import { Badge } from '@/shared/ui';

import { statusLabel } from '../model/format';

import type { DisplayStatus } from '../model/format';

const VARIANT = {
  online: 'success',
  stale: 'warning',
  offline: 'danger',
  unknown: 'neutral',
} as const;

const variantOf = (status: DisplayStatus) => {
  switch (status) {
    case 'online':
      return VARIANT.online;
    case 'stale':
      return VARIANT.stale;
    case 'offline':
      return VARIANT.offline;
    default:
      return VARIANT.unknown;
  }
};

/**
 * A device's live status as text plus the Badge's status icon, never color alone. "Stale" means
 * the device went silent (no message for 15 s); "Offline" that it said it left.
 */
export function DeviceStatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <Badge
      variant={variantOf(status)}
      data-status={status}
      // The neutral variant has no status icon of its own; "no data yet" gets a dashed circle.
      {...(status === 'unknown' ? { icon: <CircleDashed aria-hidden="true" /> } : {})}
    >
      {statusLabel(status)}
    </Badge>
  );
}
