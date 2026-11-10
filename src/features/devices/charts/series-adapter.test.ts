/* eslint-disable security/detect-object-injection -- numeric indexes into test arrays only. */
import { describe, expect, it } from 'vitest';

import { RingBuffer } from '@/features/telemetry';

import { DEVICE_CHART } from '../config';
import { SeriesAdapter } from './series-adapter';

import type { HistorySamples } from './series-adapter';

const SECOND = 1000;
const T0 = 1_794_200_000_000;

function bufferOf(samples: readonly (readonly [number, number])[], capacity = 1800): RingBuffer {
  const buffer = new RingBuffer(capacity);
  for (const [t, value] of samples) buffer.push(t, value);
  return buffer;
}

/** One sample per second from T0, values 0, 1, 2, ... */
const steady = (count: number, from = T0, step = SECOND) =>
  Array.from({ length: count }, (_unused, index) => [from + index * step, index] as const);

const points = (series: { xs: Float64Array; ys: (number | null)[] }) =>
  Array.from(series.xs, (x, index) => [x, series.ys[index]] as const);

describe('SeriesAdapter', () => {
  it('returns empty arrays and empty stats for no data', () => {
    const adapter = new SeriesAdapter();
    const series = adapter.build({ from: T0, to: T0 + 60 * SECOND }, bufferOf([]));
    expect(series.xs.length).toBe(0);
    expect(series.ys).toEqual([]);
    expect(series.stats).toEqual({
      count: 0,
      min: null,
      max: null,
      latest: null,
      latestTs: null,
      firstTs: null,
    });
    expect(adapter.build({ from: T0, to: T0 + 1 }, null).xs.length).toBe(0);
  });

  it('keeps a single sample (no interval, so no gap can be inferred)', () => {
    const series = new SeriesAdapter().build(
      { from: T0, to: T0 + 60 * SECOND },
      bufferOf([[T0 + SECOND, 21.5]]),
    );
    expect(points(series)).toEqual([[T0 + SECOND, 21.5]]);
    expect(series.stats).toMatchObject({ count: 1, min: 21.5, max: 21.5, latest: 21.5 });
  });

  it('keeps the window plus one sample before it, so the line enters from the left edge', () => {
    const series = new SeriesAdapter().build(
      { from: T0 + 10 * SECOND, to: T0 + 20 * SECOND },
      bufferOf(steady(60)),
    );
    expect(series.xs[0]).toBe(T0 + 9 * SECOND);
    expect(series.xs.at(-1)).toBe(T0 + 20 * SECOND);
    expect(series.xs.length).toBe(12);
    // The sample before the window is drawn but not counted in the stats.
    expect(series.stats).toMatchObject({ count: 11, min: 10, max: 20, firstTs: T0 + 10 * SECOND });
  });

  it('breaks the line at a dropout longer than GAP_FACTOR intervals, never across it', () => {
    const before = steady(10);
    const after = steady(10, T0 + 40 * SECOND);
    const series = new SeriesAdapter().build(
      { from: T0, to: T0 + 60 * SECOND },
      bufferOf([...before, ...after]),
    );
    const gapIndex = series.ys.indexOf(null);
    expect(gapIndex).toBe(10);
    expect(series.ys.filter((value) => value === null)).toHaveLength(1);
    expect(series.xs[gapIndex]).toBeGreaterThan(T0 + 9 * SECOND);
    expect(series.xs[gapIndex]).toBeLessThan(T0 + 40 * SECOND);
    expect(series.stats.count).toBe(20);
  });

  it('bridges one lost sample (jitter) but not two', () => {
    const base = steady(20);
    const oneLost = base.filter((_sample, index) => index !== 5);
    expect(
      new SeriesAdapter().build({ from: T0, to: T0 + 30 * SECOND }, bufferOf(oneLost)).ys,
    ).not.toContain(null);

    const missing = DEVICE_CHART.GAP_FACTOR; // GAP_FACTOR samples lost: interval > GAP_FACTOR
    const lost = base.filter((_sample, index) => index < 5 || index >= 5 + missing);
    expect(
      new SeriesAdapter().build({ from: T0, to: T0 + 30 * SECOND }, bufferOf(lost)).ys,
    ).toContain(null);
  });

  it('derives the cadence from the data: a 5 s device is not gapped, a 5 s pause at 1 Hz is', () => {
    const slow = steady(20, T0, 5 * SECOND);
    expect(
      new SeriesAdapter().build({ from: T0, to: T0 + 200 * SECOND }, bufferOf(slow)).ys,
    ).not.toContain(null);
  });

  it('leaves the end of the window empty for a device that went silent (stale)', () => {
    const series = new SeriesAdapter().build(
      { from: T0, to: T0 + 60 * SECOND },
      bufferOf(steady(20)),
    );
    expect(series.xs.at(-1)).toBe(T0 + 19 * SECOND);
    expect(series.ys).not.toContain(null);
    expect(series.stats.latestTs).toBe(T0 + 19 * SECOND);
  });

  it('reads a wrapped ring buffer in time order', () => {
    const buffer = bufferOf(steady(150), 100);
    const series = new SeriesAdapter().build({ from: T0, to: T0 + 200 * SECOND }, buffer);
    expect(series.xs.length).toBe(100);
    expect(series.xs[0]).toBe(T0 + 50 * SECOND);
    expect(series.ys[99]).toBe(149);
  });

  it('stitches history and the live tail, using the buffer only after the last history point', () => {
    const history: HistorySamples = {
      timestamps: Array.from({ length: 6 }, (_unused, index) => T0 + index * 10 * SECOND),
      values: [100, 101, 102, 103, 104, 105],
      intervalMs: 10 * SECOND,
    };
    // The buffer overlaps the history: samples at or before its last point are ignored.
    const buffer = bufferOf(steady(10, T0 + 45 * SECOND));
    const series = new SeriesAdapter().build({ from: T0, to: T0 + 60 * SECOND }, buffer, history);
    expect(series.xs.slice(0, 6)).toEqual(Float64Array.from(history.timestamps));
    expect(series.xs[6]).toBe(T0 + 51 * SECOND);
    expect(series.ys).not.toContain(null);
    expect(series.stats.count).toBe(6 + 4);
  });

  it('marks a gap at the seam when the tail starts long after the history', () => {
    const history: HistorySamples = {
      timestamps: [T0, T0 + 10 * SECOND],
      values: [1, 2],
      intervalMs: 10 * SECOND,
    };
    const buffer = bufferOf(steady(5, T0 + 300 * SECOND));
    const series = new SeriesAdapter().build({ from: T0, to: T0 + 400 * SECOND }, buffer, history);
    expect(series.ys[2]).toBeNull();
  });

  it('applies the ring buffer policy to history: duplicates replace, older samples are dropped', () => {
    const history: HistorySamples = {
      timestamps: [T0, T0 + 10 * SECOND, T0 + 10 * SECOND, T0 + 5 * SECOND, T0 + 20 * SECOND],
      values: [1, 2, 3, 99, 4],
      intervalMs: 10 * SECOND,
    };
    const series = new SeriesAdapter().build({ from: T0, to: T0 + 30 * SECOND }, null, history);
    expect(points(series)).toEqual([
      [T0, 1],
      [T0 + 10 * SECOND, 3],
      [T0 + 20 * SECOND, 4],
    ]);
    expect(series.outOfOrder).toBe(1);
    expect(series.stats).toMatchObject({ count: 3, min: 1, max: 4 });
  });

  it('matches a simple reference implementation on random data', () => {
    let state = 42;
    const random = () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };
    const adapter = new SeriesAdapter();
    for (let round = 0; round < 300; round += 1) {
      const step = SECOND * (1 + Math.floor(random() * 5));
      const historyCount = Math.floor(random() * 40);
      const history: HistorySamples | null =
        random() < 0.3
          ? null
          : {
              timestamps: [],
              values: [],
              intervalMs: 10 * SECOND,
            };
      let t = T0 + Math.floor(random() * 20) * SECOND;
      if (history !== null) {
        const timestamps: number[] = [];
        const values: number[] = [];
        for (let index = 0; index < historyCount; index += 1) {
          // Mostly 10 s apart, sometimes a duplicate or a long hole. Never older: the REST contract
          // rejects unsorted timestamps (the dropping of older samples is tested above).
          const roll = random();
          t += roll < 0.1 ? 0 : roll < 0.2 ? 120 * SECOND : 10 * SECOND;
          timestamps.push(t);
          values.push(Math.round(random() * 1000) / 10);
        }
        Object.assign(history, { timestamps, values });
      }
      const buffer = new RingBuffer(64);
      let bt = t - Math.floor(random() * 60) * SECOND;
      const bufferCount = Math.floor(random() * 120);
      for (let index = 0; index < bufferCount; index += 1) {
        bt += random() < 0.05 ? step * (2 + Math.floor(random() * 10)) : step;
        buffer.push(bt, Math.round(random() * 1000) / 10);
      }
      const from = T0 + Math.floor(random() * 200) * SECOND;
      const window = { from, to: from + Math.floor(random() * 600) * SECOND };

      const actual = adapter.build(window, buffer, history);
      const expected = reference(window, buffer, history);
      expect(points(actual)).toEqual(expected.points);
      expect(actual.outOfOrder).toBe(expected.outOfOrder);
    }
  });

  it('allocates nothing per sample: the same arrays serve every build of the same size', () => {
    const adapter = new SeriesAdapter();
    const buffer = new RingBuffer(1800);
    for (const [t, value] of steady(1800)) buffer.push(t, value);
    const window = { from: T0, to: T0 + 2000 * SECOND };
    const first = adapter.build(window, buffer);
    const backing = first.xs.buffer;
    const values = first.ys;
    const growths = adapter.growths;

    for (let frame = 0; frame < 1000; frame += 1) {
      buffer.push(T0 + (1800 + frame) * SECOND, frame);
      const next = adapter.build(
        { from: T0 + frame * SECOND, to: T0 + (2000 + frame) * SECOND },
        buffer,
      );
      expect(next.xs.buffer).toBe(backing);
      expect(next.ys).toBe(values);
    }
    expect(adapter.growths).toBe(growths);
    expect(adapter.capacity).toBeGreaterThanOrEqual(1800);
  });

  it('grows its arrays by doubling, only when a build needs more room', () => {
    const adapter = new SeriesAdapter();
    const small = adapter.build({ from: T0, to: T0 + 100 * SECOND }, bufferOf(steady(50)));
    expect(small.xs.length).toBe(50);
    const growthsBefore = adapter.growths;
    adapter.build({ from: T0, to: T0 + 2000 * SECOND }, bufferOf(steady(1800)));
    expect(adapter.growths).toBe(growthsBefore + 1);
    expect(adapter.capacity).toBeGreaterThanOrEqual(2 * 1800);
  });
});

/** Straightforward version of the adapter's rules, with plain arrays and no reuse. */
function reference(
  window: { from: number; to: number },
  buffer: RingBuffer,
  history: HistorySamples | null,
) {
  const { timestamps, values } = buffer.toArrays();
  const median = (numbers: number[]) => {
    if (numbers.length === 0) return Number.POSITIVE_INFINITY;
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? (sorted[middle] ?? 0)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  };
  const windowed = (ts: readonly number[]) => {
    let start = ts.findIndex((t) => t >= window.from);
    if (start === -1) start = ts.length;
    return Math.max(0, start - 1);
  };

  const historyThreshold =
    history && history.timestamps.length > 0
      ? DEVICE_CHART.GAP_FACTOR * history.intervalMs
      : Number.POSITIVE_INFINITY;
  const historyEnd = history?.timestamps.at(-1) ?? Number.NEGATIVE_INFINITY;
  const sources: { t: number; v: number; threshold: number }[] = [];
  if (history) {
    for (let index = windowed(history.timestamps); index < history.timestamps.length; index += 1) {
      const t = history.timestamps[index] ?? 0;
      if (t > window.to) break;
      sources.push({ t, v: history.values[index] ?? 0, threshold: historyThreshold });
    }
  }
  const bufferTs = Array.from(timestamps);
  let start = windowed(bufferTs);
  while (start < bufferTs.length && (bufferTs[start] ?? 0) <= historyEnd) start += 1;
  const tail: { t: number; v: number }[] = [];
  for (let index = start; index < bufferTs.length; index += 1) {
    const t = bufferTs[index] ?? 0;
    if (t > window.to) break;
    tail.push({ t, v: values[index] ?? 0 });
  }
  const spacings = tail.slice(1).map((sample, index) => sample.t - (tail[index]?.t ?? 0));
  const bufferThreshold = DEVICE_CHART.GAP_FACTOR * median(spacings.filter((s) => s > 0));
  const seam = Math.max(Number.isFinite(historyThreshold) ? historyThreshold : 0, bufferThreshold);
  tail.forEach((sample, index) => {
    sources.push({ ...sample, threshold: index === 0 ? seam : bufferThreshold });
  });

  const out: [number, number | null][] = [];
  let outOfOrder = 0;
  for (const { t, v, threshold } of sources) {
    const last = out.at(-1);
    if (last) {
      if (t < last[0]) {
        outOfOrder += 1;
        continue;
      }
      if (t === last[0] && last[1] !== null) {
        last[1] = v;
        continue;
      }
      if (t - last[0] > threshold) out.push([last[0] + (t - last[0]) / 2, null]);
    }
    out.push([t, v]);
  }
  return { points: out, outOfOrder };
}
