import { describe, expect, it } from 'vitest';

import { mulberry32 } from '../simulator/prng';
import { RingBuffer } from './ring-buffer';

const BYTES_PER_FLOAT64 = 8;

/** Flattens the buffer's copy-free segments into plain arrays for comparison. */
function contents(buffer: RingBuffer) {
  const timestamps: number[] = [];
  const values: number[] = [];
  for (const segment of buffer.segments()) {
    timestamps.push(...segment.timestamps);
    values.push(...segment.values);
  }
  return { timestamps, values };
}

describe('RingBuffer', () => {
  it('rejects invalid capacities', () => {
    for (const capacity of [0, -1, 1.5, Number.NaN]) {
      expect(() => new RingBuffer(capacity)).toThrow(RangeError);
    }
  });

  it('starts empty', () => {
    const buffer = new RingBuffer(4);
    expect(buffer.size).toBe(0);
    expect(buffer.latestValue).toBeUndefined();
    expect(buffer.latestTimestamp).toBeUndefined();
    expect(buffer.segments()).toEqual([]);
    expect(buffer.range(0, 100).timestamps).toHaveLength(0);
  });

  it('keeps samples oldest to newest below capacity', () => {
    const buffer = new RingBuffer(4);
    buffer.push(1, 10);
    buffer.push(2, 20);
    expect(contents(buffer)).toEqual({ timestamps: [1, 2], values: [10, 20] });
    expect(buffer.segments()).toHaveLength(1);
    expect(buffer.latestValue).toBe(20);
  });

  it('fills exactly to capacity without wrapping', () => {
    const buffer = new RingBuffer(3);
    for (const t of [1, 2, 3]) buffer.push(t, t * 10);
    expect(buffer.size).toBe(3);
    expect(buffer.segments()).toHaveLength(1);
    expect(contents(buffer).timestamps).toEqual([1, 2, 3]);
    expect(buffer.oldestTimestamp).toBe(1);
  });

  it('overwrites the oldest sample when overfilled and wraps into two segments', () => {
    const buffer = new RingBuffer(3);
    for (const t of [1, 2, 3, 4, 5]) buffer.push(t, t * 10);
    expect(buffer.size).toBe(3);
    expect(contents(buffer)).toEqual({ timestamps: [3, 4, 5], values: [30, 40, 50] });
    expect(buffer.segments()).toHaveLength(2);
    expect(buffer.oldestTimestamp).toBe(3);
    expect(buffer.latestTimestamp).toBe(5);
  });

  it('works with capacity 1', () => {
    const buffer = new RingBuffer(1);
    buffer.push(1, 10);
    buffer.push(2, 20);
    expect(contents(buffer)).toEqual({ timestamps: [2], values: [20] });
    expect(buffer.range(2, 2).values).toEqual(new Float64Array([20]));
  });

  it('replaces the value on a duplicate timestamp (last write wins)', () => {
    const buffer = new RingBuffer(4);
    buffer.push(1, 10);
    expect(buffer.push(1, 11)).toBe('replaced');
    expect(contents(buffer)).toEqual({ timestamps: [1], values: [11] });
  });

  it('drops out-of-order samples so time stays sorted', () => {
    const buffer = new RingBuffer(4);
    buffer.push(5, 50);
    const version = buffer.version;
    expect(buffer.push(4, 40)).toBe('out_of_order');
    expect(buffer.version).toBe(version);
    expect(contents(buffer).timestamps).toEqual([5]);
  });

  it('rejects NaN and infinite timestamps or values without changing anything', () => {
    const buffer = new RingBuffer(4);
    for (const [t, v] of [
      [Number.NaN, 1],
      [1, Number.NaN],
      [Number.POSITIVE_INFINITY, 1],
      [1, Number.NEGATIVE_INFINITY],
    ] as const) {
      expect(buffer.push(t, v)).toBe('invalid');
    }
    expect(buffer.size).toBe(0);
    expect(buffer.version).toBe(0);
  });

  it('increments the version on every accepted change only', () => {
    const buffer = new RingBuffer(2);
    buffer.push(1, 1); // 1
    buffer.push(2, 2); // 2
    buffer.push(3, 3); // 3 (wraps)
    buffer.push(3, 4); // 4 (replace)
    buffer.push(2, 9); // rejected
    buffer.push(4, Number.NaN); // rejected
    expect(buffer.version).toBe(4);
    buffer.clear();
    expect(buffer.version).toBe(5);
    expect(buffer.size).toBe(0);
  });

  it('answers inclusive range queries across the wrap point', () => {
    const buffer = new RingBuffer(5);
    for (let t = 1; t <= 8; t += 1) buffer.push(t * 10, t);
    // Holds 40..80, wrapped.
    expect([...buffer.range(45, 70).timestamps]).toEqual([50, 60, 70]);
    expect([...buffer.range(40, 40).values]).toEqual([4]);
    expect([...buffer.range(0, 1000).timestamps]).toEqual([40, 50, 60, 70, 80]);
    expect(buffer.range(81, 90).timestamps).toHaveLength(0);
    expect(buffer.range(70, 50).timestamps).toHaveLength(0);
  });

  it('copies into caller-owned arrays without allocating new ones', () => {
    const buffer = new RingBuffer(3);
    for (const t of [1, 2, 3, 4]) buffer.push(t, t);
    const timestamps = new Float64Array(3);
    const values = new Float64Array(3);
    expect(buffer.copyTo(timestamps, values)).toBe(3);
    expect([...timestamps]).toEqual([2, 3, 4]);
    expect(() => buffer.copyTo(new Float64Array(2), values)).toThrow(RangeError);
    expect([...buffer.toArrays().values]).toEqual([2, 3, 4]);
  });

  it('matches a simple array-based reference model on random input', () => {
    const random = mulberry32(2026);
    for (const capacity of [1, 2, 7, 64]) {
      const buffer = new RingBuffer(capacity);
      let reference: { t: number; v: number }[] = [];
      let time = 0;
      for (let step = 0; step < 5000; step += 1) {
        // Mostly forward in time, sometimes duplicate or backwards.
        const roll = random();
        const t = roll < 0.1 ? time - 1 - Math.floor(random() * 5) : roll < 0.2 ? time : time + 1;
        const v = Math.round(random() * 1000);
        const result = buffer.push(t, v);

        const newest = reference.at(-1);
        if (newest && t < newest.t) {
          expect(result).toBe('out_of_order');
        } else if (newest?.t === t) {
          expect(result).toBe('replaced');
          newest.v = v;
        } else {
          expect(result).toBe('appended');
          reference.push({ t, v });
          if (reference.length > capacity) reference = reference.slice(-capacity);
        }
        time = Math.max(time, t);

        if (step % 97 === 0) {
          expect(contents(buffer)).toEqual({
            timestamps: reference.map((sample) => sample.t),
            values: reference.map((sample) => sample.v),
          });
          const from = time - Math.floor(random() * 20);
          const to = from + Math.floor(random() * 20);
          const expected = reference.filter((sample) => sample.t >= from && sample.t <= to);
          expect([...buffer.range(from, to).timestamps]).toEqual(expected.map((s) => s.t));
        }
      }
    }
  });

  it('keeps memory constant under a very large number of pushes', () => {
    const capacity = 1800;
    const buffer = new RingBuffer(capacity);
    const expectedBytes = 2 * capacity * BYTES_PER_FLOAT64;
    expect(buffer.byteLength).toBe(expectedBytes);
    for (let t = 0; t < 1_000_000; t += 1) buffer.push(t, t % 100);
    expect(buffer.size).toBe(capacity);
    expect(buffer.byteLength).toBe(expectedBytes);
    const [first, second] = buffer.segments();
    expect((first?.timestamps.length ?? 0) + (second?.timestamps.length ?? 0)).toBe(capacity);
    expect(buffer.latestTimestamp).toBe(999_999);
  });
});
