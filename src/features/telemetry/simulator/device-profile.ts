import { SIMULATOR } from '../config';
import { deriveSeed, mulberry32, uniform } from './prng';

import type { Tunable } from '../config';
import type { DeviceId } from '../model/device';
import type { Random } from './prng';

const ROOMS = [
  'Living room',
  'Kitchen',
  'Bedroom',
  'Office',
  'Bathroom',
  'Garage',
  'Greenhouse',
  'Cellar',
  'Attic',
  'Hallway',
  'Nursery',
  'Workshop',
] as const;
const FLOORS = ['Ground floor', 'First floor', 'Outside', 'Basement'] as const;
const FIRMWARE_VERSIONS = ['1.4.2', '1.4.2', '1.5.0', '1.3.9'] as const;
const DEVICE_ID_DIGITS = 2;

const pick = <T>(items: readonly T[], index: number): T => {
  const item = items[index % items.length];
  if (item === undefined) throw new Error('pick() on an empty list');
  return item;
};

/** Everything that defines a simulated device, derived from (seed, index) only. */
export interface DeviceProfile {
  readonly index: number;
  readonly id: DeviceId;
  readonly name: string;
  readonly location: string;
  readonly firmware: string;
  /** The device's PRNG stream, positioned just after the profile values. */
  readonly random: Random;
  /** Phase offset of the daily cycle, in [0, 1). */
  readonly phase: number;
  readonly baseline: {
    readonly temperature: number;
    readonly humidity: number;
    readonly pressure: number;
    readonly signal: number;
  };
  readonly drainPerReading: number;
  readonly initialBattery: number;
}

/**
 * Creates device `index` of a fleet seeded with `seed`. Both the live SimulationEngine and the
 * HistoryModel use this, so a device has the same name, baselines and cycle phase in live data
 * and in history. The draw order is part of the contract: changing it changes every simulation.
 */
export function createDeviceProfile(
  seed: number,
  index: number,
  tuning: Tunable<typeof SIMULATOR> = SIMULATOR,
): DeviceProfile {
  const random = mulberry32(deriveSeed(seed, index));
  const round = Math.floor(index / ROOMS.length);
  const room = pick(ROOMS, index);
  const phase = random();
  const baseline = {
    temperature: uniform(random, tuning.TEMPERATURE_BASELINE.min, tuning.TEMPERATURE_BASELINE.max),
    humidity: uniform(random, tuning.HUMIDITY_BASELINE.min, tuning.HUMIDITY_BASELINE.max),
    pressure: uniform(random, tuning.PRESSURE_BASELINE.min, tuning.PRESSURE_BASELINE.max),
    signal: uniform(random, tuning.SIGNAL_BASELINE.min, tuning.SIGNAL_BASELINE.max),
  };
  const drainPerReading = uniform(random, tuning.BATTERY_DRAIN_MIN, tuning.BATTERY_DRAIN_MAX);
  const initialBattery = uniform(random, tuning.BATTERY_INITIAL_MIN, tuning.BATTERY_INITIAL_MAX);
  return {
    index,
    id: `esp32-${String(index + 1).padStart(DEVICE_ID_DIGITS, '0')}`,
    name: round === 0 ? room : `${room} ${String(round + 1)}`,
    location: pick(FLOORS, index),
    firmware: pick(FIRMWARE_VERSIONS, index),
    random,
    phase,
    baseline,
    drainPerReading,
    initialBattery,
  };
}
