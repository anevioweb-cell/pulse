// Chart draw time per frame in a real browser: `npm run bench:charts`, then open the printed URL
// and keep the tab visible (requestAnimationFrame pauses in hidden tabs).
// Method: 5 TimeSeriesCharts (the device page's chart size and the app's CSS), each fed by its own
// full ring buffer (STORE.RING_BUFFER_CAPACITY = 1800 samples) through the device page's
// SeriesAdapter, all 1800 samples visible. Each animation frame pushes one sample into every
// buffer, rebuilds the 5 series and calls setData, then stops the clock in a microtask queued after
// uPlot's own (uPlot draws in a microtask), so the time covers adapter + uPlot drawing for 5
// charts. WARM_UP frames are discarded, then FRAMES are measured.
import '@/app/index.css';

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { SeriesAdapter } from '@/features/devices/charts/series-adapter';
import { RingBuffer, STORE } from '@/features/telemetry';
import { TimeSeriesChart } from '@/shared/ui/TimeSeriesChart';
import type { TimeSeriesChartHandle } from '@/shared/ui/TimeSeriesChart';

import { median, percentile } from '../stats';

const CHARTS = 5;
const WARM_UP = 60;
const FRAMES = 600;
const P95 = 95;
const P99 = 99;
const SAMPLE_MS = 1000;
const START = Date.UTC(2026, 10, 10, 12, 0, 0);
const NOISE = 0.5;
const PERIOD = 120;
const BASE = 21;
const AMPLITUDE = 3;
const DIGITS = 2;

const output = document.getElementById('output');
const print = (line: string) => {
  if (output)
    output.textContent = `${output.textContent === 'running…' ? '' : output.textContent}${line}\n`;
};

const value = (index: number, chart: number) =>
  BASE + AMPLITUDE * Math.sin((index + chart * PERIOD) / PERIOD) + (Math.random() - 0.5) * NOISE;

const buffers = Array.from({ length: CHARTS }, (_unused, chart) => {
  const buffer = new RingBuffer(STORE.RING_BUFFER_CAPACITY);
  for (let index = 0; index < STORE.RING_BUFFER_CAPACITY; index += 1) {
    buffer.push(START + index * SAMPLE_MS, value(index, chart));
  }
  return buffer;
});
const adapters = buffers.map(() => new SeriesAdapter());
const handles: (TimeSeriesChartHandle | null)[] = buffers.map(() => null);

const container = document.getElementById('charts');
if (!container) throw new Error('missing #charts');
createRoot(container).render(
  createElement(
    'div',
    { className: 'grid grid-cols-2 gap-4 p-4' },
    buffers.map((_buffer, chart) =>
      createElement(TimeSeriesChart, {
        key: chart,
        ref: (handle: TimeSeriesChartHandle | null) => {
          handles[chart] = handle; // eslint-disable-line security/detect-object-injection -- numeric index
        },
        label: `Chart ${String(chart + 1)}`,
        seriesName: 'Value',
        decimals: 1,
        size: 'sm',
        thresholds: [{ value: BASE + AMPLITUDE, label: 'Threshold', tone: 'danger' }],
      }),
    ),
  ),
);

let next = STORE.RING_BUFFER_CAPACITY;
const times: number[] = [];

function frame() {
  const started = performance.now();
  const to = START + next * SAMPLE_MS;
  const window = { from: to - STORE.RING_BUFFER_CAPACITY * SAMPLE_MS, to };
  buffers.forEach((buffer, chart) => {
    buffer.push(to, value(next, chart));
    const series = adapters[chart]?.build(window, buffer); // eslint-disable-line security/detect-object-injection -- numeric index
    if (series) handles[chart]?.setData(series, window); // eslint-disable-line security/detect-object-injection -- numeric index
  });
  next += 1;
  queueMicrotask(() => {
    times.push(performance.now() - started);
    if (times.length < WARM_UP + FRAMES) {
      requestAnimationFrame(frame);
      return;
    }
    const measured = times.slice(WARM_UP);
    const canvas = document.querySelector('canvas');
    print(
      `${String(CHARTS)} charts x ${String(STORE.RING_BUFFER_CAPACITY)} points, ${String(FRAMES)} frames ` +
        `(devicePixelRatio ${String(devicePixelRatio)}, canvas ${String(canvas?.width)}x${String(canvas?.height)} px)`,
    );
    print(
      `per frame: median ${median(measured).toFixed(DIGITS)} ms, p95 ${percentile(measured, P95).toFixed(DIGITS)} ms, ` +
        `p99 ${percentile(measured, P99).toFixed(DIGITS)} ms, max ${Math.max(...measured).toFixed(DIGITS)} ms`,
    );
    print(`userAgent: ${navigator.userAgent}`);
  });
}

// Let the charts mount and size themselves first.
setTimeout(() => requestAnimationFrame(frame), SAMPLE_MS);
