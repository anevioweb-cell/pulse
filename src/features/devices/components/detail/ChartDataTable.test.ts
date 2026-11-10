import { describe, expect, it } from 'vitest';

import { snapshotOf } from './ChartDataTable';

import type { AlignedSeries } from '../../charts/series-adapter';

const series = (points: readonly [number, number | null][]): AlignedSeries => ({
  xs: Float64Array.from(points.map(([x]) => x)),
  ys: points.map(([, y]) => y),
  stats: { count: 0, min: null, max: null, latest: null, latestTs: null, firstTs: null },
  outOfOrder: 0,
});

describe('snapshotOf', () => {
  it('lists the window’s samples newest first, without gap markers or the lead-in sample', () => {
    // 900 is drawn only so the line enters from the window's edge (from = 1000).
    const drawn = series([
      [900, 1],
      [1000, 2],
      [1500, null],
      [2000, 3],
    ]);
    expect(snapshotOf(drawn, 1000, 5000, 10)).toEqual({
      rows: [
        { t: 2000, value: 3 },
        { t: 1000, value: 2 },
      ],
      total: 2,
      at: 5000,
    });
  });

  it('keeps the newest rows up to the cap and reports the total', () => {
    const drawn = series(Array.from({ length: 10 }, (_unused, index) => [index, index] as const));
    const snapshot = snapshotOf(drawn, 0, 99, 3);
    expect(snapshot.rows.map((row) => row.value)).toEqual([9, 8, 7]);
    expect(snapshot.total).toBe(10);
  });
});
