// Display rules for device data. Each value states why.
import { STORE } from '@/features/telemetry';
import type { SensorMetric } from '@/features/telemetry';

export const DEVICE_DISPLAY = {
  /**
   * Fraction digits per metric: the sensors' useful resolution (BME280 temperature ±0.5 °C, so one
   * decimal; humidity ±3 %RH, pressure ±1 hPa, battery and RSSI are whole numbers).
   */
  DECIMALS: new Map<SensorMetric, number>([
    ['temperature', 1],
    ['humidity', 0],
    ['pressure', 0],
    ['battery', 0],
    ['signal', 0],
  ]),
  /**
   * "Seen 20 seconds ago" refreshes this often for a silent device: a third of the stale threshold
   * (15 s), so the label moves at least twice before a device turns stale.
   */
  LAST_SEEN_REFRESH_MS: STORE.STALE_AFTER_MS / 3,
} as const;

/** Devices table: URL state limits, debounce and virtualization geometry. */
export const DEVICE_TABLE = {
  /**
   * Longest search text kept in the URL: a device name or location is at most 64 characters
   * (PROTOCOL.NAME_MAX_LENGTH), so a longer query can never match and is treated as hostile.
   */
  SEARCH_MAX_LENGTH: 64,
  /**
   * Any single query-string value longer than this is ignored before parsing: the longest valid
   * value is the hidden-column list (8 ids, ~80 characters).
   */
  MAX_PARAM_LENGTH: 256,
  /** The search box writes the URL this long after the last keystroke (replace, not push). */
  SEARCH_DEBOUNCE_MS: 250,
  /** Fixed row height in px (Tailwind `h-12`), so the virtualizer never has to measure rows. */
  ROW_HEIGHT_PX: 48,
  /** Rows rendered above and below the viewport, so fast scrolling does not show blank rows. */
  OVERSCAN_ROWS: 8,
  /**
   * Viewport height assumed before the first measurement (and in jsdom, which has no layout):
   * about 12 rows, the default demo fleet.
   */
  INITIAL_VIEWPORT_PX: 600,
} as const;
