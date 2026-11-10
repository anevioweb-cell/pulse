import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import type { DeviceId } from '../model/device';
import type { SensorMetric, SensorReading } from '../model/reading';
import type { DeviceSeries } from './device-series';
import type { DeviceState, DeviceStatus, TelemetryState, TelemetryStore } from './telemetry-store';

// How components must subscribe (see docs/architecture.md):
// 1. Select the narrowest slice: one device (`useDevice(id)`), the id list, the connection, or
//    the counters. Never select the whole state.
// 2. A selector that builds a new object or array must go through `useShallow` (as
//    `useStatusSummary` does); otherwise it re-renders on every publish.
// 3. Ring buffer contents are not React state. Subscribe to `useSeriesVersion(id)` and read the
//    buffers (`device.series.get(metric)`) in an effect or during render when the version changes.

export const selectDevice =
  (id: DeviceId) =>
  (state: TelemetryState): DeviceState | undefined =>
    state.devices.get(id);
export const selectDeviceIds = (state: TelemetryState) => state.deviceIds;
export const selectConnection = (state: TelemetryState) => state.connection;
export const selectMode = (state: TelemetryState) => state.mode;
export const selectLastMessageAt = (state: TelemetryState) => state.lastMessageAt;
export const selectCounters = (state: TelemetryState) => state.counters;
export const selectSeriesVersion =
  (id: DeviceId) =>
  (state: TelemetryState): number =>
    state.devices.get(id)?.seriesVersion ?? 0;

/** A device's ring buffers: null until the device is known, then the same object forever. */
export const selectDeviceSeries =
  (id: DeviceId) =>
  (state: TelemetryState): DeviceSeries | null =>
    state.devices.get(id)?.series ?? null;
/** A device's status alone (null until known): changes only on a status change. */
export const selectDeviceStatus =
  (id: DeviceId) =>
  (state: TelemetryState): DeviceStatus | null =>
    state.devices.get(id)?.status ?? null;

/** One metric of a reading (a switch, not an index: metric names never index objects). */
export function readingValue(reading: SensorReading, metric: SensorMetric): number | undefined {
  switch (metric) {
    case 'temperature':
      return reading.temperature;
    case 'humidity':
      return reading.humidity;
    case 'pressure':
      return reading.pressure;
    case 'battery':
      return reading.battery;
    default:
      return reading.signal;
  }
}

/** Whether any valid message arrived in this session (false until the first one). */
export const selectHasData = (state: TelemetryState) => state.lastMessageAt !== null;

/**
 * Mean of `metric` over online devices with a reading, or null if there is none. A number, so
 * subscribers re-render only when the mean itself changes.
 */
export const selectOnlineAverage =
  (metric: SensorMetric) =>
  (state: TelemetryState): number | null => {
    let sum = 0;
    let count = 0;
    for (const device of state.devices.values()) {
      const value =
        device.status === 'online' && device.latest
          ? readingValue(device.latest, metric)
          : undefined;
      if (value === undefined) continue; // offline, stale, no reading yet, or metric not measured
      sum += value;
      count += 1;
    }
    return count === 0 ? null : sum / count;
  };

/**
 * Every device's status, and whether it has a reading yet, as one string ("a:online:1|b:stale:0").
 * A string, so subscribers re-render only when a device changes status or reports its first
 * reading (rare), never on later readings: views that sort or filter by live values recompute
 * exactly then.
 */
export function selectStatusSignature(state: TelemetryState): string {
  let signature = '';
  for (const id of state.deviceIds) {
    const device = state.devices.get(id);
    signature += `${id}:${device?.status ?? ''}:${device?.latest ? '1' : '0'}|`;
  }
  return signature;
}

export type StatusSummary = Readonly<Record<DeviceStatus, number>>;

export function selectStatusSummary(state: TelemetryState): StatusSummary {
  let online = 0;
  let stale = 0;
  let offline = 0;
  for (const device of state.devices.values()) {
    if (device.status === 'online') online += 1;
    else if (device.status === 'stale') stale += 1;
    else offline += 1;
  }
  return { online, stale, offline };
}

/** React hooks bound to one store (the app uses the default store; tests pass their own). */
export function createTelemetryHooks(store: TelemetryStore) {
  return {
    /** One device. Re-renders only when that device's published state changes. */
    useDevice: (id: DeviceId) => useStore(store, selectDevice(id)),
    /** Sorted device ids. Re-renders only when devices are added or removed. */
    useDeviceIds: () => useStore(store, selectDeviceIds),
    useConnection: () => useStore(store, selectConnection),
    useMode: () => useStore(store, selectMode),
    /** Time of the last accepted live message. Changes on most publishes. */
    useLastMessageAt: () => useStore(store, selectLastMessageAt),
    /** Diagnostics counters. Changes on most publishes: use only in diagnostics views. */
    useCounters: () => useStore(store, selectCounters),
    /** True once the first valid message arrived: a boolean, so it re-renders at most twice. */
    useHasData: () => useStore(store, selectHasData),
    /** Mean of one metric over online devices (null if none). */
    useOnlineAverage: (metric: SensorMetric) => useStore(store, selectOnlineAverage(metric)),
    /** Changes only on a status change or a first reading (see selectStatusSignature). */
    useStatusSignature: () => useStore(store, selectStatusSignature),
    /** Online/stale/offline counts, shallow-compared so it re-renders only when a count changes. */
    useStatusSummary: () => useStore(store, useShallow(selectStatusSummary)),
    /** A device's ring buffers; re-renders once, when the device first appears. */
    useDeviceSeries: (id: DeviceId) => useStore(store, selectDeviceSeries(id)),
    /** A device's status; re-renders only when it changes. */
    useDeviceStatus: (id: DeviceId) => useStore(store, selectDeviceStatus(id)),
    /** Ring buffer version of one device, for charts that read the buffers directly. */
    useSeriesVersion: (id: DeviceId) => useStore(store, selectSeriesVersion(id)),
  };
}

export type TelemetryHooks = ReturnType<typeof createTelemetryHooks>;
