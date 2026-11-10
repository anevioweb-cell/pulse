/* eslint-disable security/detect-object-injection -- every computed access here is a numeric index
   into a typed array or the reused values array, which cannot reach object prototypes. */
import type { SeriesSegment } from '@/features/telemetry';

import { DEVICE_CHART } from '../config';

import type { TimeWindow } from './chart-range';

/** What the adapter reads from a ring buffer: its copy-free views, oldest to newest. */
export interface SampleSource {
  segments: () => readonly SeriesSegment[];
}

/** REST history of one metric, oldest first (the HistoricalReadings arrays). */
export interface HistorySamples {
  readonly timestamps: readonly number[];
  readonly values: readonly number[];
  /**
   * Time covered by one returned point pair: the stored sample interval times the bucket size
   * (min/max downsampling emits up to two points per bucket).
   */
  readonly intervalMs: number;
}

/** Summary of the real samples in the window (gaps excluded), for labels and announcements. */
export interface SeriesStats {
  readonly count: number;
  readonly min: number | null;
  readonly max: number | null;
  readonly latest: number | null;
  readonly latestTs: number | null;
  /** Timestamp of the first sample at or after the window start, or null. */
  readonly firstTs: number | null;
}

/**
 * uPlot's aligned data for one series: `xs` ascending timestamps (ms), `ys` the values with
 * `null` where the line must break. Both are owned by the adapter and reused by the next build:
 * read them before building again.
 */
export interface AlignedSeries {
  readonly xs: Float64Array;
  readonly ys: (number | null)[];
  readonly stats: SeriesStats;
  /** Samples dropped because they were older than the previous one (counted, not drawn). */
  readonly outOfOrder: number;
}

const INITIAL_CAPACITY = 256;
const HALF = 0.5;
const GROWTH = 2;

/** Mutable counterpart of SeriesStats, reset per build (no allocation). */
interface MutableStats {
  count: number;
  min: number | null;
  max: number | null;
  latest: number | null;
  latestTs: number | null;
  firstTs: number | null;
}

/**
 * Converts ring-buffer samples, optionally preceded by REST history, into uPlot's aligned arrays
 * for one time window (ADR 0026). Rules, applied in time order:
 * - samples with `from <= t <= to` are kept, plus the last one before `from`, so the line enters
 *   the chart from its left edge;
 * - an equal timestamp replaces the previous value (last write wins), an older one is dropped
 *   and counted: the ring buffer's own policy (ADR 0012), applied again to the stitched series.
 *   Both inputs are sorted already (the buffer by construction, history by the REST contract),
 *   so this is a guard, and the window start is found by binary search;
 * - two samples further apart than DEVICE_CHART.GAP_FACTOR sample intervals get a `null` point
 *   between them, so uPlot breaks the line: a dropout or an offline period is a gap, never an
 *   interpolated line. The buffer's interval is the median spacing of its samples in the window
 *   (robust against the gaps themselves), the history's is given by its resolution;
 * - history is used up to its last point, then only buffer samples newer than it (the live tail).
 *
 * Allocation: the output arrays, a scratch array for the median and the stats object are kept
 * and reused; a build allocates nothing per sample. The arrays grow (doubling) only when a build
 * needs more room than any before it.
 */
export class SeriesAdapter {
  private xs = new Float64Array(INITIAL_CAPACITY);
  private readonly ys: (number | null)[] = [];
  private scratch = new Float64Array(INITIAL_CAPACITY);
  private readonly stats: MutableStats = {
    count: 0,
    min: null,
    max: null,
    latest: null,
    latestTs: null,
    firstTs: null,
  };
  private length = 0;
  private outOfOrder = 0;
  private window: TimeWindow = { from: 0, to: 0 };
  /** Times the backing arrays were replaced by bigger ones (for tests and diagnostics). */
  growths = 0;

  /** Current room of the backing arrays, in points. */
  get capacity(): number {
    return this.xs.length;
  }

  build(
    window: TimeWindow,
    buffer: SampleSource | null,
    history: HistorySamples | null = null,
  ): AlignedSeries {
    this.window = window;
    this.length = 0;
    this.outOfOrder = 0;

    const segments = buffer?.segments() ?? [];
    let historyEnd = Number.NEGATIVE_INFINITY;
    let historyThreshold = Number.POSITIVE_INFINITY;
    if (history !== null && history.timestamps.length > 0) {
      historyThreshold = DEVICE_CHART.GAP_FACTOR * history.intervalMs;
      historyEnd = history.timestamps.at(-1) ?? historyEnd;
    }

    // Worst case, every sample is followed by a gap point.
    const bufferCount = segments.reduce((total, segment) => total + segment.timestamps.length, 0);
    this.ensureCapacity(GROWTH * (bufferCount + (history?.timestamps.length ?? 0)));

    if (history !== null) {
      this.appendHistory(history, historyThreshold);
    }
    const bufferThreshold = DEVICE_CHART.GAP_FACTOR * this.medianSpacing(segments, historyEnd);
    // At the seam, the coarser of the two cadences decides.
    const seamThreshold = Math.max(
      Number.isFinite(historyThreshold) ? historyThreshold : 0,
      bufferThreshold,
    );
    this.appendBuffer(segments, historyEnd, bufferThreshold, seamThreshold);

    this.ys.length = this.length;
    this.computeStats();
    return {
      xs: this.xs.subarray(0, this.length),
      ys: this.ys,
      stats: this.stats,
      outOfOrder: this.outOfOrder,
    };
  }

  private appendHistory(history: HistorySamples, threshold: number): void {
    const { timestamps, values } = history;
    const start = this.firstIndexFrom(timestamps.length, (index) => timestamps[index] ?? 0);
    for (let index = start; index < timestamps.length; index += 1) {
      const t = timestamps[index] ?? 0;
      if (t > this.window.to) break;
      this.emit(t, values[index] ?? 0, threshold);
    }
  }

  private appendBuffer(
    segments: readonly SeriesSegment[],
    after: number,
    threshold: number,
    seamThreshold: number,
  ): void {
    const total = this.countOf(segments);
    const timeAt = (index: number) => this.segmentValue(segments, index, true);
    // The first sample newer than the history, and at most one before the window start.
    let start = this.firstIndexFrom(total, timeAt);
    while (start < total && timeAt(start) <= after) start += 1;
    let first = true;
    for (let index = start; index < total; index += 1) {
      const t = timeAt(index);
      if (t > this.window.to) break;
      this.emit(t, this.segmentValue(segments, index, false), first ? seamThreshold : threshold);
      first = false;
    }
  }

  private emit(t: number, value: number, threshold: number): void {
    if (this.length > 0) {
      const lastIndex = this.length - 1;
      const lastT = this.xs[lastIndex] ?? 0;
      if (t < lastT) {
        this.outOfOrder += 1;
        return;
      }
      if (t === lastT && this.ys[lastIndex] !== null) {
        this.ys[lastIndex] = value;
        return;
      }
      if (t - lastT > threshold) {
        this.xs[this.length] = lastT + (t - lastT) * HALF;
        this.ys[this.length] = null;
        this.length += 1;
      }
    }
    this.xs[this.length] = t;
    this.ys[this.length] = value;
    this.length += 1;
  }

  /** One pass over the output: the real samples inside the window (gap points excluded). */
  private computeStats(): void {
    const stats = this.stats;
    stats.count = 0;
    stats.min = null;
    stats.max = null;
    stats.latest = null;
    stats.latestTs = null;
    stats.firstTs = null;
    for (let index = 0; index < this.length; index += 1) {
      const value = this.ys[index];
      const t = this.xs[index] ?? 0;
      if (value === null || value === undefined || t < this.window.from) continue;
      stats.count += 1;
      stats.min = stats.min === null ? value : Math.min(stats.min, value);
      stats.max = stats.max === null ? value : Math.max(stats.max, value);
      stats.latest = value;
      stats.latestTs = t;
      stats.firstTs ??= t;
    }
  }

  /**
   * Median spacing of the buffer samples that will be drawn (in the window, after the history),
   * or +Infinity with fewer than two of them, so no gap can be inferred from a single interval.
   */
  private medianSpacing(segments: readonly SeriesSegment[], after: number): number {
    const total = this.countOf(segments);
    const timeAt = (index: number) => this.segmentValue(segments, index, true);
    let index = this.firstIndexFrom(total, timeAt);
    while (index < total && timeAt(index) <= after) index += 1;
    let count = 0;
    for (index += 1; index < total; index += 1) {
      const t = timeAt(index);
      if (t > this.window.to) break;
      const spacing = t - timeAt(index - 1);
      if (spacing > 0) {
        this.scratch[count] = spacing;
        count += 1;
      }
    }
    if (count === 0) return Number.POSITIVE_INFINITY;
    const sorted = this.scratch.subarray(0, count).sort();
    const middle = count >>> 1;
    return count % GROWTH === 1
      ? (sorted[middle] ?? 0)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) * HALF;
  }

  /** First index with a timestamp >= window.from, minus one when there is an earlier sample. */
  private firstIndexFrom(count: number, timeAt: (index: number) => number): number {
    let low = 0;
    let high = count;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (timeAt(middle) < this.window.from) low = middle + 1;
      else high = middle;
    }
    return Math.max(0, low - 1);
  }

  private countOf(segments: readonly SeriesSegment[]): number {
    let total = 0;
    for (const segment of segments) total += segment.timestamps.length;
    return total;
  }

  /** Logical index across the one or two segments of a ring buffer. */
  private segmentValue(
    segments: readonly SeriesSegment[],
    index: number,
    timestamp: boolean,
  ): number {
    let offset = index;
    for (const segment of segments) {
      if (offset < segment.timestamps.length) {
        return (timestamp ? segment.timestamps[offset] : segment.values[offset]) ?? 0;
      }
      offset -= segment.timestamps.length;
    }
    return 0;
  }

  private ensureCapacity(points: number): void {
    if (points <= this.xs.length) return;
    let capacity = this.xs.length;
    while (capacity < points) capacity *= GROWTH;
    this.xs = new Float64Array(capacity);
    this.scratch = new Float64Array(capacity);
    this.growths += 1;
  }
}
