import { describe, expect, it } from 'vitest';

import { SENSOR_RANGES, SIMULATOR } from '../config';
import { EXAMPLE_TS } from '../model/fixtures';
import { parseTelemetryMessage } from '../model/parse';
import { encodeMessage } from '../model/protocol';
import { SimulationEngine } from './simulation-engine';

import type {
  DeviceOfflineMessage,
  DeviceOnlineMessage,
  ReadingMessage,
  TelemetryMessage,
} from '../model/protocol';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Advances in worker-sized ticks, as the worker and server do. */
function run(engine: SimulationEngine, durationMs: number): TelemetryMessage[] {
  const messages: TelemetryMessage[] = [];
  for (
    let t = engine.now + SIMULATOR.TICK_MS;
    t <= EXAMPLE_TS + durationMs;
    t += SIMULATOR.TICK_MS
  ) {
    messages.push(...engine.advance(t));
  }
  return messages;
}

const readings = (messages: TelemetryMessage[]) =>
  messages.filter((message): message is ReadingMessage => message.type === 'reading');
const onlines = (messages: TelemetryMessage[]) =>
  messages.filter((message): message is DeviceOnlineMessage => message.type === 'device_online');
const offlines = (messages: TelemetryMessage[]) =>
  messages.filter((message): message is DeviceOfflineMessage => message.type === 'device_offline');

function first<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error('Expected at least one item');
  return item;
}

/** No random events: every device reports at exactly the configured rate. */
const QUIET = {
  DROPOUT_PROBABILITY: 0,
  SPIKE_PROBABILITY: 0,
  BATTERY_DRAIN_MIN: 0,
  BATTERY_DRAIN_MAX: 0,
};

describe('SimulationEngine', () => {
  it('is deterministic for a given seed', () => {
    const a = new SimulationEngine({ startTime: EXAMPLE_TS, seed: 7 });
    const b = new SimulationEngine({ startTime: EXAMPLE_TS, seed: 7 });
    const c = new SimulationEngine({ startTime: EXAMPLE_TS, seed: 8 });
    const first = run(a, 5 * MINUTE);
    expect(run(b, 5 * MINUTE)).toEqual(first);
    expect(run(c, 5 * MINUTE)).not.toEqual(first);
  });

  it('keeps each device stream independent of fleet size', () => {
    const small = new SimulationEngine({ startTime: EXAMPLE_TS, seed: 3, deviceCount: 2 });
    const large = new SimulationEngine({ startTime: EXAMPLE_TS, seed: 3, deviceCount: 20 });
    const ofFirst = (messages: TelemetryMessage[]) =>
      readings(messages).filter((message) => message.deviceId === 'esp32-01');
    expect(ofFirst(run(large, MINUTE))).toEqual(ofFirst(run(small, MINUTE)));
  });

  it('announces the default fleet of 12 devices with unique ids', () => {
    const engine = new SimulationEngine({ startTime: EXAMPLE_TS });
    const announced = engine.announce();
    expect(announced).toHaveLength(SIMULATOR.DEFAULT_DEVICE_COUNT);
    expect(new Set(announced.map((message) => message.device.id)).size).toBe(
      SIMULATOR.DEFAULT_DEVICE_COUNT,
    );
  });

  it('emits wire messages that pass the real parser, with values inside physical ranges', () => {
    const engine = new SimulationEngine({ startTime: EXAMPLE_TS, seed: 11 });
    const messages = [...engine.announce(), ...run(engine, 30 * MINUTE)];
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      const result = parseTelemetryMessage(encodeMessage(message));
      expect(result).toEqual({ ok: true, message });
    }
    const ranges = new Map(Object.entries(SENSOR_RANGES));
    for (const { values } of readings(messages)) {
      for (const [metric, value] of Object.entries(values)) {
        const range = ranges.get(metric);
        expect(range).toBeDefined();
        expect(value).toBeGreaterThanOrEqual(range?.min ?? Number.NaN);
        expect(value).toBeLessThanOrEqual(range?.max ?? Number.NaN);
      }
    }
  });

  it('emits exactly devices x rate x duration readings when nothing random happens', () => {
    const deviceCount = 12;
    const rateHz = 2;
    const seconds = 30;
    const engine = new SimulationEngine({
      startTime: EXAMPLE_TS,
      deviceCount,
      rateHz,
      tuning: QUIET,
    });
    // Every device's first reading lands in the first interval, so the count is exact.
    expect(readings(run(engine, seconds * SECOND))).toHaveLength(deviceCount * rateHz * seconds);
  });

  it('orders messages by timestamp and increments seq per device', () => {
    const engine = new SimulationEngine({ startTime: EXAMPLE_TS, tuning: QUIET });
    const messages = run(engine, MINUTE);
    const timestamps = messages.map((message) => message.ts);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    const seqs = readings(messages)
      .filter((message) => message.deviceId === 'esp32-05')
      .map((message) => message.seq);
    expect(seqs).toEqual(seqs.map((_seq, index) => index));
  });

  it('drifts smoothly: consecutive temperatures differ by little', () => {
    const engine = new SimulationEngine({ startTime: EXAMPLE_TS, tuning: QUIET });
    const temps = readings(run(engine, 10 * MINUTE))
      .filter((message) => message.deviceId === 'esp32-01')
      .map((message) => message.values.temperature);
    const steps = temps
      .slice(1)
      .map((value, index) => Math.abs(value - (temps.at(index) ?? value)));
    const maxStep = Math.max(...steps);
    expect(maxStep).toBeLessThan(1);
  });

  it('produces dropouts: devices go silent and come back with device_online', () => {
    const engine = new SimulationEngine({ startTime: EXAMPLE_TS, seed: 5 });
    const messages = run(engine, 60 * MINUTE);
    const rejoin = first(onlines(messages));

    // A rejoining device was silent for at least DROPOUT_MIN_MS before announcing itself.
    const before = readings(messages).filter(
      (message) => message.deviceId === rejoin.device.id && message.ts < rejoin.ts,
    );
    expect(rejoin.ts - (before.at(-1)?.ts ?? 0)).toBeGreaterThanOrEqual(SIMULATOR.DROPOUT_MIN_MS);
  });

  it('produces low battery, depletion (device_offline) and recharge', () => {
    const engine = new SimulationEngine({
      startTime: EXAMPLE_TS,
      deviceCount: 3,
      rateHz: 10,
      tuning: {
        DROPOUT_PROBABILITY: 0,
        BATTERY_INITIAL_MIN: 25,
        BATTERY_INITIAL_MAX: 30,
        BATTERY_DRAIN_MIN: 0.05,
        BATTERY_DRAIN_MAX: 0.05,
      },
    });
    const messages = run(engine, 2 * MINUTE);
    const low = readings(messages).filter(
      (message) =>
        (message.values.battery ?? SENSOR_RANGES.battery.max) < SIMULATOR.LOW_BATTERY_THRESHOLD,
    );
    expect(low.length).toBeGreaterThan(0);
    const depleted = first(
      offlines(messages).filter((message) => message.reason === 'low_battery'),
    );

    const later = run(engine, 2 * MINUTE + SIMULATOR.RECHARGE_DELAY_MS);
    const recharged = readings(later).find((message) => message.deviceId === depleted.deviceId);
    expect(recharged?.values.battery).toBeGreaterThan(SIMULATOR.LOW_BATTERY_THRESHOLD);
  });

  it('supports runtime control: device count, rate and injected faults', () => {
    const engine = new SimulationEngine({ startTime: EXAMPLE_TS, deviceCount: 2, tuning: QUIET });
    const added = engine.setDeviceCount(4);
    expect(added.map((message) => message.type)).toEqual(['device_online', 'device_online']);
    const removed = engine.setDeviceCount(3);
    expect(removed).toMatchObject([
      { type: 'device_offline', reason: 'shutdown', deviceId: 'esp32-04' },
    ]);

    engine.setRate(SIMULATOR.MAX_RATE_HZ * 10);
    expect(engine.rateHz).toBe(SIMULATOR.MAX_RATE_HZ);

    engine.injectFault({ kind: 'dropout', deviceId: 'esp32-01' });
    engine.injectFault({ kind: 'low_battery', deviceId: 'esp32-02' });
    engine.injectFault({ kind: 'spike', deviceId: 'esp32-03' });
    const next = run(engine, 2 * SECOND);
    expect(readings(next).some((message) => message.deviceId === 'esp32-01')).toBe(false);
    expect(readings(next).find((m) => m.deviceId === 'esp32-02')?.values.battery).toBeLessThan(
      SIMULATOR.LOW_BATTERY_THRESHOLD,
    );
    expect(engine.injectFault({ kind: 'spike', deviceId: 'unknown' })).toEqual([]);
  });
});
