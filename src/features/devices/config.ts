// Display rules for device data. Each value states why.
import { PREFETCH, STORE } from '@/features/telemetry';
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

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/** Device detail charts: ranges, gap rule and redraw cadence (ADR 0026). */
export const DEVICE_CHART = {
  /**
   * Span of each range. `live` is one minute: 60 samples at the default 1 Hz, enough to read the
   * current trend, and about 15 px per sample on a 900 px chart, so single samples stay visible.
   */
  RANGE_SPAN_MS: {
    live: MS_PER_MINUTE,
    '5m': 5 * MS_PER_MINUTE,
    '1h': MINUTES_PER_HOUR * MS_PER_MINUTE,
    '24h': HOURS_PER_DAY * MINUTES_PER_HOUR * MS_PER_MINUTE,
  },
  /**
   * Two consecutive samples further apart than this many sample intervals are drawn as a gap.
   * 3 means at least two consecutive samples are missing: a single lost sample (an interval of
   * 2) is bridged as jitter, while a dropout or an offline period (the store calls a device
   * stale after 15 s, 15 missed samples at 1 Hz) always breaks the line.
   */
  GAP_FACTOR: 3,
  /**
   * History requests end on this step, like the prefetch (PREFETCH.RANGE_ALIGN_MS), so the
   * device page's 1 h temperature chart reuses the prefetched cache entry, and a request key
   * changes only every 30 s.
   */
  HISTORY_ALIGN_MS: PREFETCH.RANGE_ALIGN_MS,
  /**
   * A window that ends "now" moves even when no sample arrives (a silent device): the charts
   * redraw at least this often while the clock passes, so an empty tail grows visibly.
   */
  CLOCK_TICK_MS: MS_PER_SECOND,
  /**
   * Any query-string value of the device page longer than this is ignored before parsing: the
   * longest valid value is a metric name (11 characters).
   */
  MAX_PARAM_LENGTH: 32,
  /**
   * Rows of the data-table alternative to a chart: the newest 300 samples. That is 5 minutes at
   * 1 Hz (the `5m` range in full) and most of a 1 h history (360 raw points). A screen-reader
   * table of thousands of rows is not usable, and a full ring buffer (1800 rows) would take a
   * noticeable time to render; the caption says when rows are left out.
   */
  TABLE_MAX_ROWS: 300,
  /**
   * Chart palette slot per metric (`--color-chart-N`, colorblind-safe Okabe-Ito hues), so each
   * metric keeps its color on every page.
   */
  METRIC_COLORS: new Map<SensorMetric, 1 | 2 | 3 | 4 | 5 | 6>([
    ['temperature', 2],
    ['humidity', 1],
    ['pressure', 4],
    ['battery', 3],
    ['signal', 5],
  ]),
} as const;
