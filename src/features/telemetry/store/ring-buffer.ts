/* eslint-disable security/detect-object-injection -- every computed access here is a numeric index
   into a Float64Array, which cannot reach object prototypes. */

/** Outcome of a push, so callers can count rejections without exceptions or allocation. */
export type PushResult =
  /** A new sample was appended (overwriting the oldest one when full). */
  | 'appended'
  /** Same timestamp as the newest sample: its value was replaced (last write wins). */
  | 'replaced'
  /** Older than the newest sample: dropped, so the buffer stays sorted by time. */
  | 'out_of_order'
  /** NaN or infinite timestamp or value: dropped. */
  | 'invalid';

export interface SeriesSegment {
  readonly timestamps: Float64Array;
  readonly values: Float64Array;
}

/**
 * Fixed-capacity circular buffer of (timestamp, value) samples, backed by two Float64Arrays
 * allocated once. Pushes are O(1) and allocation-free; when full, the oldest sample is
 * overwritten. Timestamps are kept non-decreasing (see PushResult for the out-of-order and
 * duplicate policy), so range queries use binary search.
 *
 * `version` increases on every accepted change, so consumers (charts) can skip work when it
 * has not moved.
 */
export class RingBuffer {
  readonly capacity: number;
  private readonly timestamps: Float64Array;
  private readonly values: Float64Array;
  /** Physical index of the next write. When full, it is also the index of the oldest sample. */
  private head = 0;
  private count = 0;
  private revision = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('RingBuffer capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.timestamps = new Float64Array(capacity);
    this.values = new Float64Array(capacity);
  }

  /** Number of samples stored (at most `capacity`). */
  get size(): number {
    return this.count;
  }

  /** Increases on every accepted push, replacement or clear. */
  get version(): number {
    return this.revision;
  }

  /** Bytes held by the backing arrays. Constant for the buffer's lifetime. */
  get byteLength(): number {
    return this.timestamps.byteLength + this.values.byteLength;
  }

  get latestTimestamp(): number | undefined {
    return this.count === 0 ? undefined : this.timestamps[this.newestIndex()];
  }

  get latestValue(): number | undefined {
    return this.count === 0 ? undefined : this.values[this.newestIndex()];
  }

  get oldestTimestamp(): number | undefined {
    return this.count === 0 ? undefined : this.timestamps[this.oldestIndex()];
  }

  /** Adds a sample in O(1) without allocating. */
  push(timestamp: number, value: number): PushResult {
    // The parser already rejects NaN/Infinity; this guards the buffer's own invariant.
    if (!Number.isFinite(timestamp) || !Number.isFinite(value)) return 'invalid';

    if (this.count > 0) {
      const newest = this.newestIndex();
      const newestTimestamp = this.timestamps[newest] ?? Number.NEGATIVE_INFINITY;
      if (timestamp < newestTimestamp) return 'out_of_order';
      if (timestamp === newestTimestamp) {
        this.values[newest] = value;
        this.revision += 1;
        return 'replaced';
      }
    }

    this.timestamps[this.head] = timestamp;
    this.values[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
    this.revision += 1;
    return 'appended';
  }

  /**
   * Copy-free views of the samples, oldest to newest: one segment, or two when the data wraps
   * around the end of the backing arrays. Views alias the live buffer and are only valid until
   * the next push.
   */
  segments(): readonly SeriesSegment[] {
    if (this.count === 0) return [];
    const start = this.oldestIndex();
    const end = start + this.count;
    if (end <= this.capacity) {
      return [
        {
          timestamps: this.timestamps.subarray(start, end),
          values: this.values.subarray(start, end),
        },
      ];
    }
    const wrapped = end - this.capacity;
    return [
      { timestamps: this.timestamps.subarray(start), values: this.values.subarray(start) },
      {
        timestamps: this.timestamps.subarray(0, wrapped),
        values: this.values.subarray(0, wrapped),
      },
    ];
  }

  /**
   * Copies all samples, oldest to newest, into caller-owned arrays (for example arrays reused
   * across chart frames), without allocating. Returns the number of samples written.
   */
  copyTo(timestamps: Float64Array, values: Float64Array): number {
    if (timestamps.length < this.count || values.length < this.count) {
      throw new RangeError('Target arrays are smaller than the buffer size');
    }
    let offset = 0;
    for (const segment of this.segments()) {
      timestamps.set(segment.timestamps, offset);
      values.set(segment.values, offset);
      offset += segment.timestamps.length;
    }
    return offset;
  }

  /** A contiguous copy of all samples, oldest to newest. */
  toArrays(): SeriesSegment {
    const timestamps = new Float64Array(this.count);
    const values = new Float64Array(this.count);
    this.copyTo(timestamps, values);
    return { timestamps, values };
  }

  /** Samples with `from <= timestamp <= to`, oldest to newest, as a contiguous copy. */
  range(from: number, to: number): SeriesSegment {
    if (this.count === 0 || to < from) {
      return { timestamps: new Float64Array(0), values: new Float64Array(0) };
    }
    const first = this.lowerBound(from);
    const last = this.lowerBound(to, true);
    const length = Math.max(0, last - first);
    const timestamps = new Float64Array(length);
    const values = new Float64Array(length);
    for (let index = 0; index < length; index += 1) {
      const physical = this.physical(first + index);
      timestamps[index] = this.timestamps[physical] ?? 0;
      values[index] = this.values[physical] ?? 0;
    }
    return { timestamps, values };
  }

  /** Removes every sample (the backing arrays are kept). */
  clear(): void {
    this.head = 0;
    this.count = 0;
    this.revision += 1;
  }

  /**
   * First logical index whose timestamp is >= `time` (or > `time` when `inclusive` is true,
   * which gives the end of an inclusive range).
   */
  private lowerBound(time: number, inclusive = false): number {
    let low = 0;
    let high = this.count;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const value = this.timestamps[this.physical(middle)] ?? 0;
      if (value < time || (inclusive && value === time)) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  private physical(logicalIndex: number): number {
    return (this.oldestIndex() + logicalIndex) % this.capacity;
  }

  private oldestIndex(): number {
    return this.count < this.capacity ? 0 : this.head;
  }

  private newestIndex(): number {
    return (this.head - 1 + this.capacity) % this.capacity;
  }
}
