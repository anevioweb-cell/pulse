import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import type { DeviceId } from '../model/device';
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
    /** Online/stale/offline counts, shallow-compared so it re-renders only when a count changes. */
    useStatusSummary: () => useStore(store, useShallow(selectStatusSummary)),
    /** Ring buffer version of one device, for charts that read the buffers directly. */
    useSeriesVersion: (id: DeviceId) => useStore(store, selectSeriesVersion(id)),
  };
}

export type TelemetryHooks = ReturnType<typeof createTelemetryHooks>;
