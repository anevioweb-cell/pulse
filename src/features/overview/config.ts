// Overview page settings. Each value states why.
import { API, QUERY_POLICY } from '@/features/telemetry';

export const OVERVIEW = {
  /** Placeholder cards while the device list loads: two rows of the widest grid (3 columns). */
  SKELETON_CARDS: 6,
  /** The alert KPI covers the longest range the REST contract allows: the last 24 hours. */
  ALERT_WINDOW_MS: API.MAX_ALERT_RANGE_MS,
  /**
   * The window's end is rounded down to this step, so every render within it uses one query key
   * (and never asks for the future). Equal to the alert history's staleTime: a key is reused
   * exactly as long as its data is fresh.
   */
  ALERT_ALIGN_MS: QUERY_POLICY.ALERTS.STALE_TIME_MS,
  /** The "last live update" figure refreshes this often between messages. */
  LAST_UPDATE_REFRESH_MS: QUERY_POLICY.ALERTS.STALE_TIME_MS / 3,
} as const;
