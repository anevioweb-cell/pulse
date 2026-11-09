// Valid example messages, shared by tests and docs/telemetry-protocol.md. Not part of the public API.
import type {
  DeviceOfflineMessage,
  DeviceOnlineMessage,
  PingMessage,
  PongMessage,
  ReadingMessage,
} from './protocol';

export const EXAMPLE_TS = 1_794_200_000_000;
/** Round-trip time used in the pong example. */
export const EXAMPLE_ROUND_TRIP_MS = 12;

export const exampleDeviceOnline: DeviceOnlineMessage = {
  v: 1,
  type: 'device_online',
  ts: EXAMPLE_TS,
  device: { id: 'esp32-01', name: 'Living room', location: 'Ground floor', firmware: '1.4.2' },
};

export const exampleReading: ReadingMessage = {
  v: 1,
  type: 'reading',
  ts: EXAMPLE_TS,
  deviceId: 'esp32-01',
  seq: 42,
  values: { temperature: 21.37, humidity: 48.2, pressure: 1013.25, battery: 87.5, signal: -61 },
};

export const exampleDeviceOffline: DeviceOfflineMessage = {
  v: 1,
  type: 'device_offline',
  ts: EXAMPLE_TS,
  deviceId: 'esp32-01',
  reason: 'low_battery',
};

export const examplePing: PingMessage = { v: 1, type: 'ping', ts: EXAMPLE_TS };

export const examplePong: PongMessage = {
  v: 1,
  type: 'pong',
  ts: EXAMPLE_TS + EXAMPLE_ROUND_TRIP_MS,
  pingTs: EXAMPLE_TS,
};
