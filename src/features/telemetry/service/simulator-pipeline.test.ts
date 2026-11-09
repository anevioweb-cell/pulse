import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXAMPLE_TS } from '../model/fixtures';
import { SimulatorTransport } from '../simulator/simulator-transport';
import { createTelemetryStore } from '../store/telemetry-store';
import { FakeWorker } from '../testing/fake-worker';
import { ManualFrames } from '../testing/fakes';
import { TelemetryService } from './telemetry-service';

beforeEach(() => {
  vi.useFakeTimers({ now: EXAMPLE_TS });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Demo Mode end to end (simulator -> transport -> parser -> buffers -> store)', () => {
  it('ingests simulator frames through the shared parser with consistent counts and values', async () => {
    const workers: FakeWorker[] = [];
    const store = createTelemetryStore();
    const frames = new ManualFrames();
    const service = new TelemetryService({
      store,
      frames,
      createDemoTransport: (options) =>
        new SimulatorTransport({
          ...options,
          createWorker: () => {
            const worker = new FakeWorker();
            workers.push(worker);
            return worker;
          },
        }),
    });

    service.start({ mode: 'demo', seed: 9, deviceCount: 4, rateHz: 5 });
    await vi.advanceTimersByTimeAsync(10_000);
    frames.runFrame();

    const { devices, counters, connection, deviceIds } = store.getState();
    expect(connection.state).toBe('open');
    expect(deviceIds).toEqual(['esp32-01', 'esp32-02', 'esp32-03', 'esp32-04']);
    expect(Object.values(counters.parseFailures).every((count) => count === 0)).toBe(true);
    expect(counters.framesReceived).toBe(counters.messagesAccepted);
    // ~4 devices x 5 Hz x 10 s, minus the occasional simulated dropout.
    expect(counters.readings).toBeGreaterThan(150);
    expect(counters.readings).toBeLessThanOrEqual(200);

    let samples = 0;
    for (const device of devices.values()) {
      const temperature = device.series.get('temperature');
      samples += temperature.size;
      expect(device.latest?.temperature).toBe(temperature.latestValue);
      expect(device.latestTs).toBe(temperature.latestTimestamp);
      expect(device.info?.name).toBeTruthy();
    }
    expect(samples).toBe(counters.readings);

    service.stop();
    expect(workers.every((worker) => worker.terminated && !worker.running)).toBe(true);
    expect(store.getState().connection.state).toBe('closed');
  });
});
