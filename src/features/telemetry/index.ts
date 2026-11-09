// Public API of the telemetry feature. Other features, app/, the mock server and scripts import
// only from here.

export { PROTOCOL, SENSOR_RANGES, WEBSOCKET, SIMULATOR, MOCK_SERVER, CLOSE_CODES } from './config';
export type { Tunable } from './config';

export { deviceSchema, deviceIdSchema } from './model/device';
export type { Device, DeviceId } from './model/device';
export { sensorReadingSchema } from './model/reading';
export type { SensorMetric, SensorReading } from './model/reading';
export { connectionStateSchema, connectionStatusSchema } from './model/connection';
export type { ConnectionState, ConnectionStatus } from './model/connection';
export { encodeMessage, MESSAGE_TYPES, telemetryMessageSchema } from './model/protocol';
export type {
  DeviceOfflineMessage,
  DeviceOnlineMessage,
  MessageType,
  OfflineReason,
  PingMessage,
  PongMessage,
  ReadingMessage,
  TelemetryMessage,
} from './model/protocol';
export { exceedsFrameLimit, PARSE_FAILURE_REASONS, parseTelemetryMessage } from './model/parse';
export type { ParseFailureReason, ParseResult } from './model/parse';
export { FORBIDDEN_KEYS, stripUnsafeCharacters } from './model/untrusted';

export type { TelemetryTransport, TransportStats } from './transport/types';
export type { Unsubscribe } from './transport/listeners';
export type { Scheduler } from './transport/scheduler';
export type { WebSocketConstructor, WebSocketLike } from './transport/websocket-like';
export { validateWebSocketUrl, WebSocketTransport } from './transport/websocket-transport';
export type { WebSocketTransportOptions } from './transport/websocket-transport';

export { SimulationEngine } from './simulator/simulation-engine';
export type {
  SimulationOptions,
  SimulatorFault,
  SimulatorFaultKind,
} from './simulator/simulation-engine';
export { SimulatorTransport } from './simulator/simulator-transport';
export type { SimulatorTransportOptions, WorkerLike } from './simulator/simulator-transport';
export { simulatorControlSchema } from './simulator/control';
export type { SimulatorControl } from './simulator/control';

// Live store, ring buffers and the service that wires transports to them (Phase 3B).
export { RingBuffer } from './store/ring-buffer';
export type { PushResult, SeriesSegment } from './store/ring-buffer';
export { DeviceSeries, SENSOR_METRICS } from './store/device-series';
export { createTelemetryStore } from './store/telemetry-store';
export type {
  DeviceState,
  DeviceStatus,
  TelemetryCounters,
  TelemetryMode,
  TelemetryState,
  TelemetryStore,
} from './store/telemetry-store';
export {
  createTelemetryHooks,
  selectConnection,
  selectCounters,
  selectDevice,
  selectDeviceIds,
  selectMode,
  selectSeriesVersion,
  selectStatusSummary,
} from './store/selectors';
export type { StatusSummary, TelemetryHooks } from './store/selectors';
export { TelemetryService } from './service/telemetry-service';
export type { TelemetryServiceOptions, TelemetryStartOptions } from './service/telemetry-service';
export { defaultFrameScheduler } from './service/frame-scheduler';
export type { CancelFrame, FrameScheduler } from './service/frame-scheduler';
export {
  telemetryService,
  telemetryStore,
  useConnection,
  useCounters,
  useDevice,
  useDeviceIds,
  useMode,
  useSeriesVersion,
  useStatusSummary,
} from './live';
