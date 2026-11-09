import { describe, expect, it } from 'vitest';

import { mulberry32 } from '../simulator/prng';
import { downsampleMinMax } from './downsample';

function randomSeries(length: number, seed: number) {
  const random = mulberry32(seed);
  const timestamps = Array.from({ length }, (_unused, index) => index * 10);
  const values = Array.from({ length }, () => Math.round(random() * 1000) / 10);
  return { timestamps, values };
}

describe('downsampleMinMax', () => {
  it('returns the data unchanged when it already fits', () => {
    const { timestamps, values } = randomSeries(10, 1);
    expect(downsampleMinMax(timestamps, values, 10)).toEqual({ timestamps, values, bucketSize: 1 });
    expect(downsampleMinMax([], [], 2)).toEqual({ timestamps: [], values: [], bucketSize: 1 });
  });

  it.each([2, 3, 10, 101, 500, 2000])(
    'never exceeds maxPoints=%i and keeps the global extremes in time order',
    (maxPoints) => {
      const { timestamps, values } = randomSeries(60_480, maxPoints);
      const result = downsampleMinMax(
        new Float64Array(timestamps),
        new Float64Array(values),
        maxPoints,
      );

      expect(result.timestamps.length).toBeLessThanOrEqual(maxPoints);
      expect(result.timestamps.length).toBe(result.values.length);
      expect(result.bucketSize).toBeGreaterThan(1);
      expect(Math.min(...result.values)).toBe(Math.min(...values));
      expect(Math.max(...result.values)).toBe(Math.max(...values));
      expect(result.timestamps).toEqual([...result.timestamps].sort((a, b) => a - b));
      // Every output point is a real input sample.
      const byTime = new Map(timestamps.map((t, index) => [t, values.at(index)]));
      for (const [index, t] of result.timestamps.entries()) {
        expect(byTime.get(t)).toBe(result.values.at(index));
      }
    },
  );

  it('keeps a single spike that a mean would flatten', () => {
    const values = Array.from({ length: 10_000 }, () => 20);
    values[4321] = 80;
    const timestamps = values.map((_value, index) => index);
    const result = downsampleMinMax(timestamps, values, 100);
    expect(result.values).toContain(80);
    expect(result.timestamps).toContain(4321);
  });

  it('emits one point for a flat bucket', () => {
    const result = downsampleMinMax([1, 2, 3, 4], [5, 5, 5, 5], 2);
    expect(result).toEqual({ timestamps: [1], values: [5], bucketSize: 4 });
  });

  it('rejects invalid arguments', () => {
    expect(() => downsampleMinMax([1], [1], 1)).toThrow(RangeError);
    expect(() => downsampleMinMax([1], [1], 2.5)).toThrow(RangeError);
    expect(() => downsampleMinMax([1, 2], [1], 2)).toThrow(RangeError);
  });
});
