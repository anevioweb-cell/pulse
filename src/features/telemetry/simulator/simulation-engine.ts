import { PROTOCOL, SENSOR_RANGES, SIMULATOR } from '../config';
import { createDeviceProfile } from './device-profile';
import { deriveSeed, gaussian, mulberry32, TAU, uniform } from './prng';

import type { Tunable } from '../config';
import type { DeviceId } from '../model/device';
import type {
  DeviceOfflineMessage,
  DeviceOnlineMessage,
  ReadingMessage,
  TelemetryMessage,
} from '../model/protocol';
import type { SensorReading } from '../model/reading';
import type { Random } from './prng';

export type SimulatorFaultKind = 'dropout' | 'spike' | 'low_battery';

export interface SimulatorFault {
  kind: SimulatorFaultKind;
  /** Target device; a random online device when omitted. */
  deviceId?: DeviceId | undefined;
}

export interface SimulationOptions {
  /** Simulation start time (epoch ms). Messages carry timestamps from here on. */
  startTime: number;
  seed?: number;
  deviceCount?: number;
  /** Readings per device per second. */
  rateHz?: number;
  /** Behavior parameters, defaulting to SIMULATOR in config.ts (tests override them). */
  tuning?: Partial<Tunable<typeof SIMULATOR>>;
}

type DeviceStatus = 'online' | 'silent' | 'depleted';

interface SimulatedDevice {
  readonly id: DeviceId;
  readonly name: string;
  readonly location: string;
  readonly firmware: string;
  readonly random: Random;
  /** Phase offset of the daily cycle, in [0, 1). */
  readonly phase: number;
  readonly baseline: { temperature: number; humidity: number; pressure: number; signal: number };
  readonly drainPerReading: number;
  drift: { temperature: number; humidity: number; pressure: number; signal: number };
  battery: number;
  seq: number;
  nextDueAt: number;
  status: DeviceStatus;
  /** When a silent device reconnects or a depleted one is recharged. */
  resumeAt: number;
  spikeNext: boolean;
}

const FULL_BATTERY = 100;
const MS_PER_SECOND = 1000;
const HALF = 0.5;
const DECIMAL_BASE = 10;

type Range = Readonly<{ min: number; max: number }>;

/**
 * Pure, framework-free telemetry generator. Given a seed it is fully deterministic: it has no
 * timers and no clock; callers advance it to a time with `advance(now)` and get the wire
 * messages that were due. Each device has its own PRNG stream, so device N behaves the same
 * regardless of fleet size or rate changes.
 *
 * Behaviors: smooth drift (mean-reverting random walk), a compressed daily cycle, rare spikes,
 * dropouts (silence, then `device_online` again), battery drain with low battery, depletion
 * (`device_offline` with reason `low_battery`) and later recharge.
 */
export class SimulationEngine {
  private readonly seed: number;
  private readonly tuning: Tunable<typeof SIMULATOR>;
  private readonly devices: SimulatedDevice[] = [];
  /** Engine-level randomness (fault targeting), separate from per-device streams. */
  private readonly random: Random;
  private intervalMs: number;
  private time: number;

  constructor({ startTime, seed, deviceCount, rateHz, tuning }: SimulationOptions) {
    this.tuning = { ...SIMULATOR, ...tuning };
    this.seed = seed ?? this.tuning.DEFAULT_SEED;
    this.random = mulberry32(deriveSeed(this.seed, -1));
    this.time = startTime;
    this.intervalMs = MS_PER_SECOND / this.clampRate(rateHz ?? this.tuning.DEFAULT_RATE_HZ);
    this.setDeviceCount(deviceCount ?? this.tuning.DEFAULT_DEVICE_COUNT);
  }

  /** Current simulation time (the last `advance` target). */
  get now(): number {
    return this.time;
  }

  get deviceCount(): number {
    return this.devices.length;
  }

  get rateHz(): number {
    return MS_PER_SECOND / this.intervalMs;
  }

  /** `device_online` for every device currently online: what a newly connected client needs. */
  announce(): DeviceOnlineMessage[] {
    return this.devices
      .filter((device) => device.status === 'online')
      .map((device) => this.onlineMessage(device, this.time));
  }

  /** Grows or shrinks the fleet. New devices announce themselves; removed ones shut down. */
  setDeviceCount(count: number): TelemetryMessage[] {
    const target = Math.max(1, Math.min(this.tuning.MAX_DEVICE_COUNT, Math.round(count)));
    const messages: TelemetryMessage[] = [];
    while (this.devices.length < target) {
      const device = this.createDevice(this.devices.length);
      this.devices.push(device);
      messages.push(this.onlineMessage(device, this.time));
    }
    while (this.devices.length > target) {
      const device = this.devices.pop();
      if (device?.status === 'online') {
        messages.push(this.offlineMessage(device, this.time, 'shutdown'));
      }
    }
    return messages;
  }

  /** Changes the per-device reading rate (clamped to MIN_RATE_HZ..MAX_RATE_HZ). */
  setRate(rateHz: number): void {
    this.intervalMs = MS_PER_SECOND / this.clampRate(rateHz);
  }

  /** Injects a fault for demos and tests. Returns any messages it causes immediately. */
  injectFault({ kind, deviceId }: SimulatorFault): TelemetryMessage[] {
    const online = this.devices.filter((device) => device.status === 'online');
    const device =
      deviceId === undefined
        ? online[Math.floor(this.random() * online.length)]
        : this.devices.find((candidate) => candidate.id === deviceId);
    if (device?.status !== 'online') return [];

    switch (kind) {
      case 'spike':
        device.spikeNext = true;
        return [];
      case 'low_battery':
        device.battery = Math.min(device.battery, this.tuning.LOW_BATTERY_THRESHOLD - 1);
        return [];
      case 'dropout':
        this.startDropout(device, this.time);
        return [];
    }
  }

  /**
   * Advances the simulation to `to` and returns every message due in (now, to], ordered by
   * timestamp. Calling with a time in the past returns nothing.
   */
  advance(to: number): TelemetryMessage[] {
    if (to <= this.time) return [];
    const messages: TelemetryMessage[] = [];
    for (const device of this.devices) this.advanceDevice(device, to, messages);
    this.time = to;
    return messages.sort((a, b) => a.ts - b.ts);
  }

  /* ----------------------------------------------- devices ------------------------------------- */

  private createDevice(index: number): SimulatedDevice {
    const profile = createDeviceProfile(this.seed, index, this.tuning);
    return {
      id: profile.id,
      name: profile.name,
      location: profile.location,
      firmware: profile.firmware,
      random: profile.random,
      phase: profile.phase,
      baseline: profile.baseline,
      drainPerReading: profile.drainPerReading,
      drift: { temperature: 0, humidity: 0, pressure: 0, signal: 0 },
      battery: profile.initialBattery,
      seq: 0,
      // Spread devices across the first interval so readings do not arrive in bursts.
      nextDueAt: this.time + profile.random() * this.intervalMs,
      status: 'online',
      resumeAt: 0,
      spikeNext: false,
    };
  }

  private advanceDevice(device: SimulatedDevice, to: number, out: TelemetryMessage[]): void {
    while (device.nextDueAt <= to) {
      const at = Math.round(device.nextDueAt);
      device.nextDueAt += this.intervalMs;

      if (device.status !== 'online') {
        if (at < device.resumeAt) continue;
        if (device.status === 'depleted') device.battery = FULL_BATTERY;
        device.status = 'online';
        out.push(this.onlineMessage(device, at));
      }

      if (device.random() < this.tuning.DROPOUT_PROBABILITY) {
        this.startDropout(device, at);
        continue;
      }

      device.battery = Math.max(0, device.battery - device.drainPerReading);
      if (device.battery <= 0) {
        device.status = 'depleted';
        device.resumeAt = at + this.tuning.RECHARGE_DELAY_MS;
        out.push(this.offlineMessage(device, at, 'low_battery'));
        continue;
      }

      out.push(this.readingMessage(device, at));
    }
  }

  private startDropout(device: SimulatedDevice, at: number): void {
    device.status = 'silent';
    device.resumeAt =
      at + uniform(device.random, this.tuning.DROPOUT_MIN_MS, this.tuning.DROPOUT_MAX_MS);
  }

  /* ----------------------------------------------- values -------------------------------------- */

  private nextValues(device: SimulatedDevice, at: number): SensorReading {
    const t = this.tuning;
    const walk = (current: number, step: number) =>
      current * (1 - t.DRIFT_REVERSION) + gaussian(device.random) * step;
    device.drift = {
      temperature: walk(device.drift.temperature, t.TEMPERATURE_DRIFT_STEP),
      humidity: walk(device.drift.humidity, t.HUMIDITY_DRIFT_STEP),
      pressure: walk(device.drift.pressure, t.PRESSURE_DRIFT_STEP),
      signal: walk(device.drift.signal, t.SIGNAL_DRIFT_STEP),
    };

    // Daily cycle: warmer and drier in the "afternoon", per-device phase.
    const cycle = Math.sin(TAU * (at / t.DAY_CYCLE_MS + device.phase));
    let temperature =
      device.baseline.temperature +
      device.drift.temperature +
      t.TEMPERATURE_CYCLE_AMPLITUDE * cycle;
    if (device.spikeNext || device.random() < t.SPIKE_PROBABILITY) {
      device.spikeNext = false;
      temperature += (device.random() < HALF ? -1 : 1) * t.SPIKE_MAGNITUDE;
    }

    return {
      temperature: this.clampRound(SENSOR_RANGES.temperature, temperature),
      humidity: this.clampRound(
        SENSOR_RANGES.humidity,
        device.baseline.humidity + device.drift.humidity - t.HUMIDITY_CYCLE_AMPLITUDE * cycle,
      ),
      pressure: this.clampRound(
        SENSOR_RANGES.pressure,
        device.baseline.pressure + device.drift.pressure,
      ),
      battery: this.clampRound(SENSOR_RANGES.battery, device.battery),
      signal: Math.round(
        this.clamp(SENSOR_RANGES.signal, device.baseline.signal + device.drift.signal),
      ),
    };
  }

  private clamp({ min, max }: Range, value: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private clampRound(range: Range, value: number): number {
    const factor = DECIMAL_BASE ** this.tuning.VALUE_DECIMALS;
    return this.clamp(range, Math.round(value * factor) / factor);
  }

  private clampRate(rateHz: number): number {
    return Math.min(this.tuning.MAX_RATE_HZ, Math.max(this.tuning.MIN_RATE_HZ, rateHz));
  }

  /* ----------------------------------------------- messages ------------------------------------ */

  private readingMessage(device: SimulatedDevice, at: number): ReadingMessage {
    const message: ReadingMessage = {
      v: PROTOCOL.VERSION,
      type: 'reading',
      ts: at,
      deviceId: device.id,
      seq: device.seq,
      values: this.nextValues(device, at),
    };
    device.seq += 1;
    return message;
  }

  private onlineMessage(device: SimulatedDevice, at: number): DeviceOnlineMessage {
    return {
      v: PROTOCOL.VERSION,
      type: 'device_online',
      ts: Math.round(at),
      device: {
        id: device.id,
        name: device.name,
        location: device.location,
        firmware: device.firmware,
      },
    };
  }

  private offlineMessage(
    device: SimulatedDevice,
    at: number,
    reason: DeviceOfflineMessage['reason'],
  ): DeviceOfflineMessage {
    return {
      v: PROTOCOL.VERSION,
      type: 'device_offline',
      ts: Math.round(at),
      deviceId: device.id,
      reason,
    };
  }
}
