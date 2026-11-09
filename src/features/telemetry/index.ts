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
export { exceedsFrameLimit, parseTelemetryMessage } from './model/parse';
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
