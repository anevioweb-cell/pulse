// Downsampling throughput: `npm run bench:downsample`.
// Method: synthetic sorted series (1 s spacing, noisy sine), one warm-up pass per case, then RUNS
// timed runs. Each run calls downsampleMinMax enough times to process >= POINTS_PER_RUN input
// points (small inputs would otherwise sit at timer resolution); per-call time = run / calls.
// Throughput = input points / median per-call time.
import { performance } from 'node:perf_hooks';

import { downsampleMinMax } from '../../src/features/telemetry';
import { formatInt, median } from './stats';

const RUNS = 21;
const INPUT_SIZES = [10_000, 100_000, 1_000_000];
const MAX_POINTS = [100, 500, 2000];
const SPACING_MS = 1000;
const START_MS = Date.UTC(2026, 0, 1);
const WAVE_PERIOD = 600;
const NOISE = 0.5;
const MS_PER_S = 1000;
const POINTS_PER_RUN = 1_000_000;

function series(size: number) {
  const timestamps = Float64Array.from({ length: size }, (_, i) => START_MS + i * SPACING_MS);
  const values = Float64Array.from(
    { length: size },
    (_, i) => Math.sin((i / WAVE_PERIOD) * 2 * Math.PI) + (Math.random() - NOISE),
  );
  return { timestamps, values };
}

console.log(
  `node ${process.version}, ${String(RUNS)} timed runs per case (>= ${formatInt(POINTS_PER_RUN)} points each), median reported`,
);
console.log('| input points | maxPoints | median ms | points/s |');
console.log('| ---: | ---: | ---: | ---: |');
for (const size of INPUT_SIZES) {
  const { timestamps, values } = series(size);
  for (const maxPoints of MAX_POINTS) {
    downsampleMinMax(timestamps, values, maxPoints); // warm-up (JIT)
    const calls = Math.max(1, Math.ceil(POINTS_PER_RUN / size));
    const durations: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      let returned = 0;
      const start = performance.now();
      for (let call = 0; call < calls; call += 1) {
        returned = downsampleMinMax(timestamps, values, maxPoints).timestamps.length;
      }
      durations.push((performance.now() - start) / calls);
      if (returned > maxPoints) throw new Error('budget exceeded');
    }
    const ms = median(durations);
    console.log(
      `| ${formatInt(size)} | ${String(maxPoints)} | ${ms.toFixed(3)} | ${formatInt((size / ms) * MS_PER_S)} |`,
    );
  }
}
