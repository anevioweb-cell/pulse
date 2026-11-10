import { describe, expect, it } from 'vitest';

import {
  DemoTelemetryApi,
  RingBuffer,
  SIMULATOR,
  SimulationEngine,
  STORE,
} from '@/features/telemetry';
import type { ReadingMessage } from '@/features/telemetry';

import { historyRequestFor, windowAt } from './chart-range';
import { SeriesAdapter } from './series-adapter';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const T0 = 1_794_200_000_000;
const SESSION_MS = 10 * MINUTE;

/** Bound of the live random walk for temperature (SIMULATOR.DRIFT_LIMIT_STD deviations). */
const keep = 1 - SIMULATOR.DRIFT_REVERSION;
const DRIFT_BOUND =
  (SIMULATOR.DRIFT_LIMIT_STD * SIMULATOR.TEMPERATURE_DRIFT_STEP) / Math.sqrt(1 - keep * keep);
/**
 * History is a smooth function of time: the daily cycle (3 °C over 10 minutes) and the noise
 * (1.5 °C over 5-minute knots) change temperature by well under 0.05 °C per second.
 */
const SLOPE_PER_SECOND = 0.05;
const ROUNDING = 0.005;

describe('Demo Mode: REST history and the live stream agree', () => {
  it('matches live temperature within the drift bound, and stitches without a jump or a gap', async () => {
    // The live stream, as the simulator worker produces it, recorded into a ring buffer. Spikes
    // and dropouts are live-only anomalies that history does not contain (ADR 0026), so they
    // are switched off here; the gap rule for dropouts is tested in series-adapter.test.ts.
    const engine = new SimulationEngine({
      startTime: T0,
      tuning: { SPIKE_PROBABILITY: 0, DROPOUT_PROBABILITY: 0 },
    });
    const buffer = new RingBuffer(STORE.RING_BUFFER_CAPACITY);
    const live: ReadingMessage[] = [];
    for (let t = T0 + SIMULATOR.TICK_MS; t <= T0 + SESSION_MS; t += SIMULATOR.TICK_MS) {
      for (const message of engine.advance(t)) {
        if (message.type !== 'reading' || message.deviceId !== 'esp32-01') continue;
        live.push(message);
        buffer.push(message.ts, message.values.temperature);
      }
    }
    expect(live.length).toBeGreaterThan(SESSION_MS / SECOND / 2);

    // The 1 h chart's REST request, answered by Demo Mode's API a few seconds before the end of
    // the session (a cached response, up to 30 s old), so the chart needs a live tail.
    const now = T0 + SESSION_MS;
    const fetchedAt = now - 7 * SECOND;
    const api = new DemoTelemetryApi({ now: () => fetchedAt, ruleStorage: null });
    const request = historyRequestFor('1h', 'esp32-01', 'temperature', now);
    if (request === null) throw new Error('1h is a history range');
    const history = await api.getReadings(request);
    expect(history.resolution.method).toBe('raw');

    // Every history point during the session is close to the live sample nearest to it.
    let compared = 0;
    for (const [index, t] of history.timestamps.entries()) {
      if (t < T0 + SECOND) continue;
      const nearest = live.reduce((best, message) =>
        Math.abs(message.ts - t) < Math.abs(best.ts - t) ? message : best,
      );
      const distance = Math.abs(nearest.ts - t) / SECOND;
      expect(distance).toBeLessThanOrEqual(1);
      const difference = Math.abs(nearest.values.temperature - (history.values.at(index) ?? 0));
      expect(difference).toBeLessThanOrEqual(DRIFT_BOUND + SLOPE_PER_SECOND * distance + ROUNDING);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(SESSION_MS / (10 * SECOND) - 3);

    // The stitched chart series: history, then the live tail, with no gap at the seam.
    const series = new SeriesAdapter().build(windowAt('1h', now), buffer, {
      timestamps: history.timestamps,
      values: history.values,
      intervalMs: history.resolution.sampleIntervalMs * history.resolution.bucketSize,
    });
    expect(series.ys).not.toContain(null);
    const seam = series.xs.findIndex((x) => x > (history.timestamps.at(-1) ?? 0));
    expect(seam).toBeGreaterThan(0);
    const jump = Math.abs((series.ys.at(seam) ?? 0) - (series.ys.at(seam - 1) ?? 0));
    const seconds = ((series.xs.at(seam) ?? 0) - (series.xs.at(seam - 1) ?? 0)) / SECOND;
    expect(jump).toBeLessThanOrEqual(DRIFT_BOUND + SLOPE_PER_SECOND * seconds + ROUNDING);
  });
});
