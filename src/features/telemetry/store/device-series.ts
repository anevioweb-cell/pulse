import { RingBuffer } from './ring-buffer';

import type { SensorMetric, SensorReading } from '../model/reading';

/** Every metric a reading can carry, in display order. */
export const SENSOR_METRICS = [
  'temperature',
  'humidity',
  'pressure',
  'battery',
  'signal',
] as const satisfies readonly SensorMetric[];

/** Per-push outcome counts, accumulated in place by `write` (no allocation per reading). */
export interface WriteTally {
  appended: number;
  replaced: number;
  outOfOrder: number;
  invalid: number;
}

/**
 * The time series of one device: one RingBuffer per metric, all allocated up front with the same
 * capacity. Keys are the fixed metric names (never device-provided), held in a Map.
 */
export class DeviceSeries {
  private readonly buffers: ReadonlyMap<SensorMetric, RingBuffer>;

  constructor(capacity: number) {
    this.buffers = new Map(SENSOR_METRICS.map((metric) => [metric, new RingBuffer(capacity)]));
  }

  /** The ring buffer of one metric (read API for charts: segments, range, latest, version). */
  get(metric: SensorMetric): RingBuffer {
    const buffer = this.buffers.get(metric);
    if (!buffer) throw new Error(`Unknown metric ${metric}`);
    return buffer;
  }

  /** Sum of all buffer versions: changes whenever any metric changes. */
  get version(): number {
    let total = 0;
    for (const buffer of this.buffers.values()) total += buffer.version;
    return total;
  }

  /** Total bytes of all backing arrays. Constant for the lifetime of the series. */
  get byteLength(): number {
    let total = 0;
    for (const buffer of this.buffers.values()) total += buffer.byteLength;
    return total;
  }

  /** Writes every metric present in the reading at `timestamp` and tallies the outcomes. */
  write(timestamp: number, reading: SensorReading, tally: WriteTally): void {
    for (const metric of SENSOR_METRICS) {
      const value = reading[metric]; // eslint-disable-line security/detect-object-injection -- fixed metric names
      if (value === undefined) continue;
      switch (this.get(metric).push(timestamp, value)) {
        case 'appended':
          tally.appended += 1;
          break;
        case 'replaced':
          tally.replaced += 1;
          break;
        case 'out_of_order':
          tally.outOfOrder += 1;
          break;
        case 'invalid':
          tally.invalid += 1;
          break;
      }
    }
  }
}
