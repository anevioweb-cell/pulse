import { STORE } from '../config';
import { PARSE_FAILURE_REASONS, parseTelemetryMessage } from '../model/parse';
import { DeviceSeries } from '../store/device-series';
import { emptyStats } from '../transport/types';

import type { Tunable } from '../config';
import type { ConnectionStatus } from '../model/connection';
import type { Device, DeviceId } from '../model/device';
import type { ParseFailureReason } from '../model/parse';
import type { OfflineReason, TelemetryMessage } from '../model/protocol';
import type { SensorReading } from '../model/reading';
import type { WriteTally } from '../store/device-series';
import type {
  DeviceState,
  DeviceStatus,
  TelemetryCounters,
  TelemetryState,
} from '../store/telemetry-store';
import type { TransportStats } from '../transport/types';

/** Mutable working record of one device, between publishes. */
interface DeviceRecord {
  readonly id: DeviceId;
  info: Device | null;
  explicitlyOffline: boolean;
  offlineReason: OfflineReason | null;
  lastHeardAt: number;
  latest: SensorReading | null;
  latestTs: number | null;
  seq: number | null;
  readonly series: DeviceSeries;
  /** Changed since the last publish. */
  dirty: boolean;
  /** What was last published for this device (reused when nothing changed). */
  published: DeviceState | null;
}

export interface IngestorOptions {
  now: () => number;
  limits?: Partial<Tunable<typeof STORE>>;
}

/**
 * Turns raw frames into store state. Each frame is parsed immediately and readings are written
 * to the ring buffers immediately; what is published to React (latest values, statuses,
 * counters) is accumulated as "pending" and turned into one new immutable state per frame by
 * `publish`. Pending data is bounded: at most one record per device (capped by MAX_DEVICES) and
 * a fixed set of counters, however long publishing is paused (ADR 0014).
 */
export class TelemetryIngestor {
  private readonly now: () => number;
  private readonly limits: Tunable<typeof STORE>;
  /** Device id -> record. A Map: ids are device-provided and must never be object keys. */
  private readonly devices = new Map<DeviceId, DeviceRecord>();
  private readonly parseFailures = new Map<ParseFailureReason, number>();
  private readonly tally: WriteTally = { appended: 0, replaced: 0, outOfOrder: 0, invalid: 0 };
  private framesReceived = 0;
  private messagesAccepted = 0;
  private readings = 0;
  private rejectedDevices = 0;
  private coalescedUpdates = 0;
  private publishes = 0;
  private lastMessageAt: number | null = null;
  private connection: ConnectionStatus = { state: 'idle', attempt: 0 };
  private transportStats: TransportStats = emptyStats();
  private membershipChanged = false;
  private countersChanged = false;
  private connectionChanged = false;

  constructor({ now, limits }: IngestorOptions) {
    this.now = now;
    this.limits = { ...STORE, ...limits };
  }

  /** Parses one raw frame and applies it. Never throws for any input. */
  ingest(raw: string): void {
    this.framesReceived += 1;
    this.countersChanged = true;
    const result = parseTelemetryMessage(raw);
    if (!result.ok) {
      this.parseFailures.set(result.reason, (this.parseFailures.get(result.reason) ?? 0) + 1);
      return;
    }
    this.messagesAccepted += 1;
    this.lastMessageAt = this.now();
    this.apply(result.message);
  }

  setConnection(status: ConnectionStatus): void {
    this.connection = status;
    this.connectionChanged = true;
  }

  setTransportStats(stats: TransportStats): void {
    this.transportStats = stats;
  }

  /** True when a publish would change the state (pending data, or a stale transition). */
  hasPendingChanges(): boolean {
    if (this.countersChanged || this.connectionChanged || this.membershipChanged) return true;
    const now = this.now();
    for (const record of this.devices.values()) {
      if (record.dirty || record.published?.status !== this.statusOf(record, now)) return true;
    }
    return false;
  }

  /** Builds the next immutable state from `previous`, reusing every unchanged object. */
  publish(previous: TelemetryState): TelemetryState {
    const now = this.now();
    let devicesChanged = this.membershipChanged;
    const devices = new Map<DeviceId, DeviceState>();
    for (const record of this.devices.values()) {
      const status = this.statusOf(record, now);
      let state = record.published;
      if (!state || record.dirty || state.status !== status) {
        state = {
          id: record.id,
          info: record.info,
          status,
          offlineReason: record.offlineReason,
          lastHeardAt: record.lastHeardAt,
          latest: record.latest,
          latestTs: record.latestTs,
          seq: record.seq,
          seriesVersion: record.series.version,
          series: record.series,
        };
        record.published = state;
        record.dirty = false;
        devicesChanged = true;
      }
      devices.set(record.id, state);
    }

    this.publishes += 1;
    const next: TelemetryState = {
      mode: previous.mode,
      connection: this.connectionChanged ? this.connection : previous.connection,
      devices: devicesChanged ? devices : previous.devices,
      deviceIds: this.membershipChanged
        ? [...this.devices.keys()].sort((a, b) => a.localeCompare(b))
        : previous.deviceIds,
      counters: this.snapshotCounters(),
      publishedAt: now,
      lastMessageAt: this.lastMessageAt,
    };
    this.membershipChanged = false;
    this.countersChanged = false;
    this.connectionChanged = false;
    return next;
  }

  /** Total bytes held by all ring buffers (constant per device). */
  get bufferBytes(): number {
    let total = 0;
    for (const record of this.devices.values()) total += record.series.byteLength;
    return total;
  }

  get deviceCount(): number {
    return this.devices.size;
  }

  /* ----------------------------------------------- messages ------------------------------------ */

  private apply(message: TelemetryMessage): void {
    switch (message.type) {
      case 'device_online': {
        const record = this.record(message.device.id);
        if (!record) return;
        record.info = message.device;
        record.explicitlyOffline = false;
        record.offlineReason = null;
        this.touch(record);
        return;
      }
      case 'reading': {
        const record = this.record(message.deviceId);
        if (!record) return;
        this.readings += 1;
        const { outOfOrder, replaced } = this.tally;
        record.series.write(message.ts, message.values, this.tally);
        // A reading older than the latest one is history: it does not become "latest".
        if (record.latestTs === null || message.ts >= record.latestTs) {
          if (record.dirty && record.latest !== null) this.coalescedUpdates += 1;
          record.latest = message.values;
          record.latestTs = message.ts;
          record.seq = message.seq;
        }
        record.explicitlyOffline = false;
        record.offlineReason = null;
        this.touch(record);
        if (this.tally.outOfOrder !== outOfOrder || this.tally.replaced !== replaced) {
          this.countersChanged = true;
        }
        return;
      }
      case 'device_offline': {
        const record = this.devices.get(message.deviceId);
        if (!record) return;
        record.explicitlyOffline = true;
        record.offlineReason = message.reason;
        this.touch(record);
        return;
      }
      case 'ping':
      case 'pong':
        return;
    }
  }

  /** Existing record, or a new one if the device cap allows it (null when rejected). */
  private record(id: DeviceId): DeviceRecord | null {
    const existing = this.devices.get(id);
    if (existing) return existing;
    if (this.devices.size >= this.limits.MAX_DEVICES) {
      this.rejectedDevices += 1;
      return null;
    }
    const record: DeviceRecord = {
      id,
      info: null,
      explicitlyOffline: false,
      offlineReason: null,
      lastHeardAt: this.now(),
      latest: null,
      latestTs: null,
      seq: null,
      series: new DeviceSeries(this.limits.RING_BUFFER_CAPACITY),
      dirty: true,
      published: null,
    };
    this.devices.set(id, record);
    this.membershipChanged = true;
    return record;
  }

  private touch(record: DeviceRecord): void {
    record.lastHeardAt = this.now();
    record.dirty = true;
  }

  private statusOf(record: DeviceRecord, now: number): DeviceStatus {
    if (record.explicitlyOffline) return 'offline';
    return now - record.lastHeardAt > this.limits.STALE_AFTER_MS ? 'stale' : 'online';
  }

  private snapshotCounters(): TelemetryCounters {
    return {
      framesReceived: this.framesReceived,
      messagesAccepted: this.messagesAccepted,
      readings: this.readings,
      parseFailures: Object.fromEntries(
        PARSE_FAILURE_REASONS.map((reason) => [reason, this.parseFailures.get(reason) ?? 0]),
      ) as Record<ParseFailureReason, number>,
      outOfOrderSamples: this.tally.outOfOrder,
      duplicateSamples: this.tally.replaced,
      rejectedDevices: this.rejectedDevices,
      coalescedUpdates: this.coalescedUpdates,
      publishes: this.publishes,
      transport: this.transportStats,
    };
  }
}
