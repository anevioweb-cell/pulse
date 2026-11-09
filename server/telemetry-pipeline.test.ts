// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTelemetryStore, TelemetryService } from '../src/features/telemetry';
import { startTelemetryServer } from './telemetry-server';

import type { TelemetryServer } from './telemetry-server';

const DEVICES = 4;
const RATE_HZ = 10;
let server: TelemetryServer | null = null;
let service: TelemetryService | null = null;

afterEach(async () => {
  service?.stop();
  await server?.close();
  server = null;
  service = null;
});

describe('Live Mode end to end (mock server -> WebSocketTransport -> service -> store)', () => {
  it('streams, parses, buffers and publishes real server data', async () => {
    server = await startTelemetryServer({
      port: 0,
      seed: 7,
      deviceCount: DEVICES,
      rateHz: RATE_HZ,
    });
    const store = createTelemetryStore();
    // Real transport, real clock; frames use the ~60 Hz timer fallback (no rAF in Node).
    service = new TelemetryService({ store });
    service.start({ mode: 'live', url: server.url });

    await vi.waitFor(
      () => {
        expect(store.getState().counters.readings).toBeGreaterThanOrEqual(DEVICES * RATE_HZ);
      },
      { timeout: 5000, interval: 50 },
    );

    const { devices, counters, connection, mode } = store.getState();
    expect(mode).toBe('live');
    expect(connection.state).toBe('open');
    expect(devices.size).toBe(DEVICES);
    expect(counters.framesReceived).toBe(counters.messagesAccepted);
    expect(Object.values(counters.parseFailures).every((count) => count === 0)).toBe(true);
    expect(counters.transport.droppedRateLimited).toBe(0);
    expect(counters.publishes).toBeLessThan(counters.framesReceived);

    let samples = 0;
    for (const device of devices.values()) {
      const temperature = device.series.get('temperature');
      samples += temperature.size;
      expect(device.status).toBe('online');
      expect(device.latest?.temperature).toBe(temperature.latestValue);
    }
    expect(samples).toBe(counters.readings);

    service.stop();
    expect(store.getState().connection.state).toBe('closed');
    const running = server;
    await vi.waitFor(() => {
      expect(running.clientCount).toBe(0);
    });
  });
});
