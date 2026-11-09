import { SENSOR_RANGES, SIMULATOR } from '../config';
import { SENSOR_METRICS } from '../store/device-series';
import { createDeviceProfile } from './device-profile';
import { TAU } from './prng';

import type { Tunable } from '../config';
import type { DeviceId } from '../model/device';
import type { SensorMetric } from '../model/reading';
import type { DeviceProfile } from './device-profile';

// 32-bit integer hash (splitmix/murmur-style finalizer) for allocation-free value noise.
const MIX_A = 0x9e3779b1;
const MIX_B = 0x85ebca77;
const MIX_C = 0x7feb352d;
const MIX_D = 0x846ca68b;
const SHIFT_16 = 16;
const SHIFT_15 = 15;
const UINT32_RANGE = 0x1_0000_0000;
const HALF = 0.5;
const TWO = 2;
const DECIMAL_BASE = 10;
const FULL_BATTERY = 100;
const METRIC_STREAMS: ReadonlyMap<SensorMetric, number> = new Map(
  SENSOR_METRICS.map((metric, index) => [metric, index]),
);

function hashToUnit(a: number, b: number, c: number): number {
  let h = (a ^ Math.imul(b, MIX_A) ^ Math.imul(c, MIX_B)) >>> 0;
  h ^= h >>> SHIFT_16;
  h = Math.imul(h, MIX_C);
  h ^= h >>> SHIFT_15;
  h = Math.imul(h, MIX_D);
  h ^= h >>> SHIFT_16;
  return (h >>> 0) / UINT32_RANGE;
}

/** Smooth value noise in [-1, 1]: random values at integer knots, cosine-interpolated between. */
function smoothNoise(seed: number, stream: number, x: number): number {
  const knot = Math.floor(x);
  const fraction = x - knot;
  const a = hashToUnit(seed, stream, knot) * TWO - 1;
  const b = hashToUnit(seed, stream, knot + 1) * TWO - 1;
  const weight = (1 - Math.cos(Math.PI * fraction)) * HALF;
  return a + (b - a) * weight;
}

export interface HistoryModelOptions {
  seed?: number;
  deviceCount?: number;
  tuning?: Partial<Tunable<typeof SIMULATOR>>;
}

export interface HistorySeries {
  readonly timestamps: Float64Array;
  readonly values: Float64Array;
}

/**
 * Deterministic, range-independent history for simulated devices: the value of a metric at time
 * t is a pure function of (seed, device, metric, t), built from the same device profiles as the
 * live SimulationEngine (names, baselines, daily-cycle phase) plus smooth hash-based noise. The
 * engine's random walk depends on where it starts, so it could not give the same history for every
 * requested range; this can (ADR 0015). Samples are aligned to multiples of HISTORY_SAMPLE_MS.
 */
export class HistoryModel {
  readonly seed: number;
  readonly sampleIntervalMs: number;
  private readonly tuning: Tunable<typeof SIMULATOR>;
  private readonly profiles: ReadonlyMap<DeviceId, DeviceProfile>;

  constructor({ seed, deviceCount, tuning }: HistoryModelOptions = {}) {
    this.tuning = { ...SIMULATOR, ...tuning };
    this.seed = seed ?? this.tuning.DEFAULT_SEED;
    this.sampleIntervalMs = this.tuning.HISTORY_SAMPLE_MS;
    const count = Math.max(
      1,
      Math.min(this.tuning.MAX_DEVICE_COUNT, deviceCount ?? this.tuning.DEFAULT_DEVICE_COUNT),
    );
    this.profiles = new Map(
      Array.from({ length: count }, (_unused, index) => {
        const profile = createDeviceProfile(this.seed, index, this.tuning);
        return [profile.id, profile] as const;
      }),
    );
  }

  get devices(): readonly DeviceProfile[] {
    return [...this.profiles.values()];
  }

  device(id: DeviceId): DeviceProfile | undefined {
    return this.profiles.get(id);
  }

  /** The value of `metric` for `device` at time `t` (rounded and clamped like a real sensor). */
  sample(device: DeviceProfile, metric: SensorMetric, t: number): number {
    const t2 = this.tuning;
    const stream = device.index * METRIC_STREAMS.size + (METRIC_STREAMS.get(metric) ?? 0);
    const noise = smoothNoise(this.seed, stream, t / t2.HISTORY_NOISE_KNOT_MS);
    const cycle = Math.sin(TAU * (t / t2.DAY_CYCLE_MS + device.phase));
    switch (metric) {
      case 'temperature':
        return this.finish(
          SENSOR_RANGES.temperature,
          device.baseline.temperature +
            t2.TEMPERATURE_CYCLE_AMPLITUDE * cycle +
            t2.HISTORY_TEMPERATURE_NOISE * noise,
        );
      case 'humidity':
        return this.finish(
          SENSOR_RANGES.humidity,
          device.baseline.humidity -
            t2.HUMIDITY_CYCLE_AMPLITUDE * cycle +
            t2.HISTORY_HUMIDITY_NOISE * noise,
        );
      case 'pressure':
        return this.finish(
          SENSOR_RANGES.pressure,
          device.baseline.pressure + t2.HISTORY_PRESSURE_NOISE * noise,
        );
      case 'battery': {
        const position = (t / t2.HISTORY_BATTERY_CYCLE_MS + device.phase) % 1;
        return this.finish(
          SENSOR_RANGES.battery,
          FULL_BATTERY - position * (FULL_BATTERY - t2.HISTORY_BATTERY_FLOOR),
        );
      }
      case 'signal':
        return Math.round(
          this.clamp(
            SENSOR_RANGES.signal,
            device.baseline.signal + t2.HISTORY_SIGNAL_NOISE * noise,
          ),
        );
    }
  }

  /** First sample time at or after `t`. */
  alignUp(t: number): number {
    return Math.ceil(t / this.sampleIntervalMs) * this.sampleIntervalMs;
  }

  /** Number of samples in [from, to]. */
  countSamples(from: number, to: number): number {
    const first = this.alignUp(from);
    return first > to ? 0 : Math.floor((to - first) / this.sampleIntervalMs) + 1;
  }

  /** All samples of one metric in [from, to] (inclusive), oldest first. */
  series(device: DeviceProfile, metric: SensorMetric, from: number, to: number): HistorySeries {
    const count = this.countSamples(from, to);
    const timestamps = new Float64Array(count);
    const values = new Float64Array(count);
    const first = this.alignUp(from);
    for (let index = 0; index < count; index += 1) {
      const t = first + index * this.sampleIntervalMs;
      timestamps[index] = t; // eslint-disable-line security/detect-object-injection -- numeric index
      values[index] = this.sample(device, metric, t); // eslint-disable-line security/detect-object-injection -- numeric index
    }
    return { timestamps, values };
  }

  private clamp(
    { min, max }: { readonly min: number; readonly max: number },
    value: number,
  ): number {
    return Math.min(max, Math.max(min, value));
  }

  private finish(range: { readonly min: number; readonly max: number }, value: number): number {
    const factor = DECIMAL_BASE ** this.tuning.VALUE_DECIMALS;
    return this.clamp(range, Math.round(value * factor) / factor);
  }
}
