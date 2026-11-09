import { createStore } from 'zustand/vanilla';

import { PARSE_FAILURE_REASONS } from '../model/parse';
import { emptyStats } from '../transport/types';

import type { ConnectionStatus } from '../model/connection';
import type { Device, DeviceId } from '../model/device';
import type { ParseFailureReason } from '../model/parse';
import type { OfflineReason } from '../model/protocol';
import type { SensorReading } from '../model/reading';
import type { TransportStats } from '../transport/types';
import type { DeviceSeries } from './device-series';
import type { StoreApi } from 'zustand/vanilla';

export type TelemetryMode = 'demo' | 'live';

/**
 * - `online`: heard from within STORE.STALE_AFTER_MS.
 * - `stale`: silent for longer than that (derived from the injected clock; the device never said
 *   it left, it just stopped talking, e.g. a Wi-Fi dropout).
 * - `offline`: the device (or server) sent `device_offline`.
 */
export type DeviceStatus = 'online' | 'stale' | 'offline';

/** Published, immutable per-device state. A new object only when that device changed. */
export interface DeviceState {
  readonly id: DeviceId;
  /** Metadata from `device_online`; null if readings arrived before any announcement. */
  readonly info: Device | null;
  readonly status: DeviceStatus;
  readonly offlineReason: OfflineReason | null;
  /** Local receive time (injected clock) of the last message from this device. */
  readonly lastHeardAt: number;
  /** Most recent reading (by device timestamp) and its metadata. */
  readonly latest: SensorReading | null;
  readonly latestTs: number | null;
  readonly seq: number | null;
  /**
   * Version of the device's ring buffers. The buffers themselves are NOT React state: read them
   * through `series` when this number changes (ADR 0012).
   */
  readonly seriesVersion: number;
  /** Stable reference to the device's ring buffers (identity never changes). */
  readonly series: DeviceSeries;
}

export interface TelemetryCounters {
  /** Raw frames delivered by the transport to the service. */
  readonly framesReceived: number;
  /** Frames that parsed into valid messages. */
  readonly messagesAccepted: number;
  readonly readings: number;
  readonly parseFailures: Readonly<Record<ParseFailureReason, number>>;
  /** Samples rejected by the ring buffer policy (older than the newest sample). */
  readonly outOfOrderSamples: number;
  /** Samples that replaced a value at the same timestamp. */
  readonly duplicateSamples: number;
  /** Messages ignored because the device cap (STORE.MAX_DEVICES) was reached. */
  readonly rejectedDevices: number;
  /**
   * Device updates that were superseded before being published: messages arrived faster than
   * frames, so intermediate `latest` values were never React state (they are still in the ring
   * buffers). Shows coalescing honestly instead of hiding it.
   */
  readonly coalescedUpdates: number;
  /** Store publishes (at most one per animation frame). */
  readonly publishes: number;
  /** Counters from the active transport (drops by size, rate, type; reconnects). */
  readonly transport: Readonly<TransportStats>;
}

export interface TelemetryState {
  readonly mode: TelemetryMode | null;
  readonly connection: ConnectionStatus;
  /** Device id -> state. A Map, never a plain object: ids are device-provided. */
  readonly devices: ReadonlyMap<DeviceId, DeviceState>;
  /** Sorted ids. A new array only when devices are added or removed. */
  readonly deviceIds: readonly DeviceId[];
  readonly counters: TelemetryCounters;
  /** Clock time of the last publish. */
  readonly publishedAt: number | null;
}

export type TelemetryStore = StoreApi<TelemetryState>;

export const emptyParseFailures = (): Record<ParseFailureReason, number> =>
  Object.fromEntries(PARSE_FAILURE_REASONS.map((reason) => [reason, 0])) as Record<
    ParseFailureReason,
    number
  >;

export const emptyCounters = (): TelemetryCounters => ({
  framesReceived: 0,
  messagesAccepted: 0,
  readings: 0,
  parseFailures: emptyParseFailures(),
  outOfOrderSamples: 0,
  duplicateSamples: 0,
  rejectedDevices: 0,
  coalescedUpdates: 0,
  publishes: 0,
  transport: emptyStats(),
});

export const initialTelemetryState = (): TelemetryState => ({
  mode: null,
  connection: { state: 'idle', attempt: 0 },
  devices: new Map(),
  deviceIds: [],
  counters: emptyCounters(),
  publishedAt: null,
});

/**
 * Creates a live telemetry store. Components only read it (through selectors); the
 * TelemetryService is its only writer.
 */
export function createTelemetryStore(): TelemetryStore {
  return createStore<TelemetryState>()(() => initialTelemetryState());
}
