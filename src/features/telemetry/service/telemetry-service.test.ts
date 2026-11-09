import { beforeEach, describe, expect, it } from 'vitest';

import { STORE } from '../config';
import { EXAMPLE_TS, exampleDeviceOnline, exampleReading } from '../model/fixtures';
import { encodeMessage } from '../model/protocol';
import { createTelemetryStore } from '../store/telemetry-store';
import { FakeTransport, ManualClock, ManualFrames } from '../testing/fakes';
import { TelemetryService } from './telemetry-service';

import type { ReadingMessage } from '../model/protocol';
import type { TelemetryStore } from '../store/telemetry-store';

const announce = (id: string) =>
  encodeMessage({ ...exampleDeviceOnline, device: { ...exampleDeviceOnline.device, id } });
const reading = (id: string, ts: number, temperature = 21, seq = 0) =>
  encodeMessage({
    ...exampleReading,
    deviceId: id,
    ts,
    seq,
    values: { ...exampleReading.values, temperature },
  } satisfies ReadingMessage);

let store: TelemetryStore;
let frames: ManualFrames;
let clock: ManualClock;
let service: TelemetryService;
let publishes: number;

function current(): FakeTransport {
  const transport = FakeTransport.instances.at(-1);
  if (!transport) throw new Error('No transport created');
  return transport;
}

beforeEach(() => {
  FakeTransport.instances = [];
  store = createTelemetryStore();
  frames = new ManualFrames();
  clock = new ManualClock(EXAMPLE_TS);
  service = new TelemetryService({
    store,
    frames,
    scheduler: clock,
    createDemoTransport: (options) => new FakeTransport('demo', options),
    createLiveTransport: (options) => new FakeTransport('live', options),
  });
  publishes = 0;
  store.subscribe(() => {
    publishes += 1;
  });
});

describe('TelemetryService batching', () => {
  it('writes buffers immediately but publishes many messages once per frame', () => {
    service.start({ mode: 'demo' });
    frames.runFrame();
    const before = publishes;

    const transport = current();
    transport.emit(announce('esp32-01'));
    for (let index = 0; index < 500; index += 1) {
      transport.emit(reading('esp32-01', EXAMPLE_TS + index, 20 + index / 100, index));
    }
    // Not published yet, but already recorded in the ring buffer.
    expect(store.getState().devices.size).toBe(0);
    expect(frames.pendingCount).toBe(1);

    frames.runFrame();
    expect(publishes - before).toBe(1);
    const device = store.getState().devices.get('esp32-01');
    expect(device?.series.get('temperature').size).toBe(500);
    expect(device?.latest?.temperature).toBeCloseTo(24.99, 10);
    expect(device?.seq).toBe(499);
    expect(store.getState().counters).toMatchObject({
      framesReceived: 501,
      messagesAccepted: 501,
      readings: 500,
      coalescedUpdates: 499,
      publishes: 2,
    });
  });

  it('keeps recording while frames are paused (hidden tab) with bounded pending state', () => {
    service.start({ mode: 'demo' });
    const transport = current();
    transport.emit(announce('esp32-01'));
    const bytesPerDevice = 2 * STORE.RING_BUFFER_CAPACITY * 8 * 5;

    // Hidden tab: no frame runs while 50,000 readings arrive.
    for (let index = 0; index < 50_000; index += 1) {
      transport.emit(reading('esp32-01', EXAMPLE_TS + index, 20, index));
    }
    expect(frames.pendingCount).toBe(1); // one pending frame, not one per message
    expect(publishes).toBe(1); // only the reset at start

    // Tab visible again: a single publish with the newest state.
    frames.runFrame();
    const device = store.getState().devices.get('esp32-01');
    expect(device?.latestTs).toBe(EXAMPLE_TS + 49_999);
    expect(device?.series.get('temperature').size).toBe(STORE.RING_BUFFER_CAPACITY);
    expect(device?.series.byteLength).toBe(bytesPerDevice);
    expect(store.getState().counters.coalescedUpdates).toBe(49_999);
  });

  it('counts parse failures by reason, duplicates and out-of-order samples', () => {
    service.start({ mode: 'demo' });
    const transport = current();
    transport.emit('not json');
    transport.emit('{"__proto__":{}}');
    transport.emit(encodeMessage({ ...exampleReading, v: 1 }).replace('"v":1', '"v":9'));
    transport.emit(reading('esp32-01', EXAMPLE_TS + 10, 21));
    transport.emit(reading('esp32-01', EXAMPLE_TS + 10, 22)); // duplicate timestamp
    transport.emit(reading('esp32-01', EXAMPLE_TS + 5, 19)); // older than newest
    frames.runFrame();

    const { counters, devices } = store.getState();
    expect(counters.parseFailures).toMatchObject({
      invalid_json: 1,
      forbidden_key: 1,
      unknown_version: 1,
      too_large: 0,
    });
    // pressure, battery and signal are also present: 5 metrics per reading.
    expect(counters.duplicateSamples).toBe(5);
    expect(counters.outOfOrderSamples).toBe(5);
    // Duplicates replace the value; an older reading never becomes "latest".
    expect(devices.get('esp32-01')?.latest?.temperature).toBe(22);
    expect(devices.get('esp32-01')?.series.get('temperature').latestValue).toBe(22);
  });

  it('caps the number of tracked devices and counts rejected ones', () => {
    service = new TelemetryService({
      store,
      frames,
      scheduler: clock,
      createDemoTransport: (options) => new FakeTransport('demo', options),
      limits: { MAX_DEVICES: 3 },
    });
    service.start({ mode: 'demo' });
    for (let index = 0; index < 10; index += 1) current().emit(announce(`device-${String(index)}`));
    frames.runFrame();
    expect(store.getState().deviceIds).toEqual(['device-0', 'device-1', 'device-2']);
    expect(store.getState().counters.rejectedDevices).toBe(7);
  });

  it('reuses unchanged objects so per-device selectors stay stable', () => {
    service.start({ mode: 'demo' });
    const transport = current();
    transport.emit(announce('a'));
    transport.emit(announce('b'));
    frames.runFrame();
    const first = store.getState();

    transport.emit(reading('a', EXAMPLE_TS + 1));
    frames.runFrame();
    const second = store.getState();
    expect(second.devices.get('a')).not.toBe(first.devices.get('a'));
    expect(second.devices.get('b')).toBe(first.devices.get('b'));
    expect(second.deviceIds).toBe(first.deviceIds);
    expect(second.connection).toBe(first.connection);
  });
});

describe('stale and offline detection', () => {
  it('marks a silent device stale after the timeout, without any new message', () => {
    service.start({ mode: 'demo' });
    current().emit(reading('esp32-01', EXAMPLE_TS));
    frames.runFrame();
    expect(store.getState().devices.get('esp32-01')?.status).toBe('online');

    clock.advance(STORE.STALE_AFTER_MS - 1);
    frames.runFrame();
    expect(store.getState().devices.get('esp32-01')?.status).toBe('online');

    clock.advance(STORE.STALE_CHECK_INTERVAL_MS + 1);
    expect(frames.pendingCount).toBe(1); // the stale check requested a publish
    frames.runFrame();
    expect(store.getState().devices.get('esp32-01')?.status).toBe('stale');

    current().emit(reading('esp32-01', EXAMPLE_TS + STORE.STALE_AFTER_MS + 5));
    frames.runFrame();
    expect(store.getState().devices.get('esp32-01')?.status).toBe('online');
  });

  it('distinguishes an explicit device_offline from stale', () => {
    service.start({ mode: 'demo' });
    const transport = current();
    transport.emit(announce('esp32-01'));
    transport.emit(
      encodeMessage({
        v: 1,
        type: 'device_offline',
        ts: EXAMPLE_TS,
        deviceId: 'esp32-01',
        reason: 'low_battery',
      }),
    );
    frames.runFrame();
    expect(store.getState().devices.get('esp32-01')).toMatchObject({
      status: 'offline',
      offlineReason: 'low_battery',
    });

    clock.advance(STORE.STALE_AFTER_MS * 2);
    frames.runFrame();
    expect(store.getState().devices.get('esp32-01')?.status).toBe('offline');
  });

  it('does not request frames for stale checks when nothing changes', () => {
    service.start({ mode: 'demo' });
    frames.runFrame();
    const requested = frames.requested;
    clock.advance(STORE.STALE_CHECK_INTERVAL_MS * 10);
    expect(frames.requested).toBe(requested);
  });
});

describe('modes, URL validation and cleanup', () => {
  it('publishes connection status and the mode', () => {
    service.start({ mode: 'live', url: 'ws://127.0.0.1:8787' });
    frames.runFrame();
    expect(store.getState()).toMatchObject({ mode: 'live', connection: { state: 'connecting' } });
    current().setStatus({ state: 'open', attempt: 0 });
    frames.runFrame();
    expect(store.getState().connection.state).toBe('open');
  });

  it.each(['http://example.com', 'not a url', 'javascript:alert(1)'])(
    'surfaces an invalid live URL (%s) as store state, without a transport or exception',
    (url) => {
      expect(() => {
        service.start({ mode: 'live', url });
      }).not.toThrow();
      expect(FakeTransport.instances).toHaveLength(0);
      expect(store.getState()).toMatchObject({ mode: 'live', connection: { state: 'failed' } });
      expect(clock.activeTimers).toBe(0);
    },
  );

  it('passes the live URL and an explicit rate limit to the transport', () => {
    service.start({ mode: 'live', url: 'wss://example.com/telemetry', maxMessagesPerSecond: 1000 });
    expect(current().options).toEqual({
      url: 'wss://example.com/telemetry',
      maxMessagesPerSecond: 1000,
    });
  });

  it('leaves no listeners, timers, frames or open transports after switching modes', () => {
    service.start({ mode: 'demo', deviceCount: 3 });
    current().emit(reading('esp32-01', EXAMPLE_TS)); // leaves a frame pending
    service.start({ mode: 'live', url: 'ws://127.0.0.1:8787' });
    current().emit(reading('esp32-02', EXAMPLE_TS));
    service.start({ mode: 'demo' });
    service.start({ mode: 'live', url: 'http://bad' }); // invalid: no transport
    service.start({ mode: 'demo' });
    service.stop();

    expect(FakeTransport.instances).toHaveLength(4);
    for (const transport of FakeTransport.instances) {
      expect(transport.listenerCount).toBe(0);
      expect(transport.connects).toBe(1);
      expect(transport.disconnects).toBe(1);
    }
    expect(clock.activeTimers).toBe(0);
    expect(frames.pendingCount).toBe(0);
    expect(service.transport).toBeNull();
    expect(service.running).toBe(false);
    expect(store.getState().connection.state).toBe('closed');
  });

  it('resets devices and buffers when a new session starts', () => {
    service.start({ mode: 'demo' });
    current().emit(reading('esp32-01', EXAMPLE_TS));
    frames.runFrame();
    service.start({ mode: 'live', url: 'ws://127.0.0.1:8787' });
    expect(store.getState().devices.size).toBe(0);
    expect(store.getState().counters.framesReceived).toBe(0);
  });
});
