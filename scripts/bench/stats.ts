// Small statistics helpers shared by the benchmark scripts.

const PERCENT = 100;

/** Nearest-rank percentile of an unsorted sample (p in 0..100). */
export function percentile(sample: readonly number[], p: number): number {
  const sorted = [...sample].sort((a, b) => a - b);
  const rank = Math.ceil((p / PERCENT) * sorted.length);
  return sorted.at(Math.max(0, rank - 1)) ?? Number.NaN;
}

const MEDIAN = 50;
export const median = (sample: readonly number[]) => percentile(sample, MEDIAN);

export const formatInt = (value: number) => Math.round(value).toLocaleString('en-US');
