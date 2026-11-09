/* eslint-disable security/detect-object-injection -- numeric indices into number arrays only */

/** Points per bucket in min/max downsampling: the bucket's minimum and its maximum. */
const POINTS_PER_BUCKET = 2;

export interface DownsampleResult {
  readonly timestamps: number[];
  readonly values: number[];
  /** Raw samples per bucket; 1 means the data was returned as-is. */
  readonly bucketSize: number;
}

/**
 * Min/max downsampling: splits the samples into equal-count buckets and keeps each bucket's
 * minimum and maximum, in time order. Output never exceeds `maxPoints` and always contains the
 * global minimum and maximum, so spikes (what telemetry alerts are about) survive any zoom level.
 * O(n), single pass, no allocation besides the output, and it works on typed arrays, so Phase 6
 * can run it directly on ring buffers (ADR 0015 explains the choice over LTTB).
 *
 * `timestamps` must be sorted; `maxPoints` must be an integer >= 2.
 */
export function downsampleMinMax(
  timestamps: ArrayLike<number>,
  values: ArrayLike<number>,
  maxPoints: number,
): DownsampleResult {
  if (!Number.isInteger(maxPoints) || maxPoints < POINTS_PER_BUCKET) {
    throw new RangeError('maxPoints must be an integer >= 2');
  }
  if (timestamps.length !== values.length) {
    throw new RangeError('timestamps and values must have the same length');
  }
  const length = timestamps.length;
  if (length <= maxPoints) {
    return { timestamps: Array.from(timestamps), values: Array.from(values), bucketSize: 1 };
  }

  const buckets = Math.floor(maxPoints / POINTS_PER_BUCKET);
  const bucketSize = Math.ceil(length / buckets);
  const outTimestamps: number[] = [];
  const outValues: number[] = [];

  for (let start = 0; start < length; start += bucketSize) {
    const end = Math.min(length, start + bucketSize);
    let minIndex = start;
    let maxIndex = start;
    for (let index = start + 1; index < end; index += 1) {
      const value = values[index] ?? 0;
      if (value < (values[minIndex] ?? 0)) minIndex = index;
      if (value > (values[maxIndex] ?? 0)) maxIndex = index;
    }
    const first = Math.min(minIndex, maxIndex);
    const second = Math.max(minIndex, maxIndex);
    outTimestamps.push(timestamps[first] ?? 0);
    outValues.push(values[first] ?? 0);
    if (second !== first) {
      outTimestamps.push(timestamps[second] ?? 0);
      outValues.push(values[second] ?? 0);
    }
  }
  return { timestamps: outTimestamps, values: outValues, bucketSize };
}
