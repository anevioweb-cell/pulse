import { describe, expect, it } from 'vitest';

import { SENSOR_RANGES, SIMULATOR } from '../config';
import { EXAMPLE_TS } from '../model/fixtures';
import { SENSOR_METRICS } from '../store/device-series';
import { HistoryModel } from './history-model';
import { SimulationEngine } from './simulation-engine';

const HOUR = 3_600_000;

describe('HistoryModel', () => {
  it('uses the same device profiles as the live SimulationEngine', () => {
    const model = new HistoryModel({ seed: 4, deviceCount: 5 });
    const engine = new SimulationEngine({ startTime: EXAMPLE_TS, seed: 4, deviceCount: 5 });
    expect(
      model.devices.map(({ id, name, location, firmware }) => ({ id, name, location, firmware })),
    ).toEqual(engine.announce().map((message) => message.device));
  });

  it('is deterministic per seed and independent of the requested range', () => {
    const a = new HistoryModel({ seed: 1 });
    const b = new HistoryModel({ seed: 1 });
    const c = new HistoryModel({ seed: 2 });
    const device = a.device('esp32-03');
    const other = b.device('esp32-03');
    if (!device || !other) throw new Error('missing device');

    const wide = a.series(device, 'temperature', EXAMPLE_TS, EXAMPLE_TS + 6 * HOUR);
    const narrow = b.series(other, 'temperature', EXAMPLE_TS + 2 * HOUR, EXAMPLE_TS + 3 * HOUR);
    const offset = (2 * HOUR) / SIMULATOR.HISTORY_SAMPLE_MS;
    expect([...narrow.values]).toEqual([
      ...wide.values.subarray(offset, offset + narrow.values.length),
    ]);
    expect([...narrow.timestamps]).toEqual([
      ...wide.timestamps.subarray(offset, offset + narrow.timestamps.length),
    ]);

    const different = c.device('esp32-03');
    if (!different) throw new Error('missing device');
    expect([
      ...c.series(different, 'temperature', EXAMPLE_TS, EXAMPLE_TS + HOUR).values,
    ]).not.toEqual([...wide.values.subarray(0, wide.values.length / 6 + 1)]);
  });

  it('aligns samples to the history interval and counts them exactly', () => {
    const model = new HistoryModel();
    const device = model.devices[0];
    if (!device) throw new Error('missing device');
    const from = EXAMPLE_TS + 1234;
    const series = model.series(device, 'humidity', from, from + HOUR);
    expect((series.timestamps[0] ?? Number.NaN) % SIMULATOR.HISTORY_SAMPLE_MS).toBe(0);
    expect(series.timestamps[0]).toBeGreaterThanOrEqual(from);
    expect(series.timestamps.length).toBe(model.countSamples(from, from + HOUR));
    expect(model.countSamples(from, from)).toBe(0);
  });

  it('keeps every metric inside its physical range over a week', () => {
    const model = new HistoryModel({ seed: 7, deviceCount: 3 });
    for (const device of model.devices) {
      for (const metric of SENSOR_METRICS) {
        const { values } = model.series(device, metric, EXAMPLE_TS, EXAMPLE_TS + 7 * 24 * HOUR);
        const range = new Map(Object.entries(SENSOR_RANGES)).get(metric);
        expect(Math.min(...values)).toBeGreaterThanOrEqual(range?.min ?? Number.NaN);
        expect(Math.max(...values)).toBeLessThanOrEqual(range?.max ?? Number.NaN);
      }
    }
  });

  it('varies smoothly between neighbouring samples', () => {
    const model = new HistoryModel();
    const device = model.devices[0];
    if (!device) throw new Error('missing device');
    const { values } = model.series(device, 'temperature', EXAMPLE_TS, EXAMPLE_TS + 6 * HOUR);
    const steps = [...values.subarray(1)].map((value, index) =>
      Math.abs(value - (values.at(index) ?? value)),
    );
    expect(Math.max(...steps)).toBeLessThan(0.5);
  });
});
