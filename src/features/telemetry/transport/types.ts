import type { ConnectionStatus } from '../model/connection';
import type { Unsubscribe } from './listeners';

/** Counters a transport keeps about what it received and dropped. */
export interface TransportStats {
  /** Frames delivered to message listeners. */
  received: number;
  /** Frames dropped because they exceeded PROTOCOL.MAX_FRAME_BYTES. */
  droppedOversized: number;
  /** Frames dropped by the inbound rate limit. */
  droppedRateLimited: number;
  /** Non-text (binary) frames dropped. */
  droppedNonText: number;
  /** Outgoing frames dropped because the send queue was full. */
  droppedOutgoing: number;
  /** Successful (re)connections after the first one. */
  reconnects: number;
}

/**
 * Source of raw telemetry frames: the WebSocket in Live Mode, the simulator worker in Demo Mode.
 * Transports never parse: they deliver raw strings, and the next layer runs every frame through
 * parseTelemetryMessage, so both modes exercise the same validation path (ADR 0010).
 */
export interface TelemetryTransport {
  /** Starts (or restarts after `closed`/`failed`) the connection. Idempotent while active. */
  connect: () => void;
  /** Stops the connection and any retry. The status becomes `closed`. */
  disconnect: () => void;
  /** Subscribes to raw inbound frames. */
  onMessage: (listener: (raw: string) => void) => Unsubscribe;
  /** Subscribes to connection status changes. */
  onStatus: (listener: (status: ConnectionStatus) => void) => Unsubscribe;
  getStatus: () => ConnectionStatus;
  getStats: () => TransportStats;
}

export const emptyStats = (): TransportStats => ({
  received: 0,
  droppedOversized: 0,
  droppedRateLimited: 0,
  droppedNonText: 0,
  droppedOutgoing: 0,
  reconnects: 0,
});
