import { createServer } from 'node:http';

import { WebSocketServer } from 'ws';

import {
  CLOSE_CODES,
  encodeMessage,
  MOCK_SERVER,
  parseTelemetryMessage,
  PROTOCOL,
  AlertRuleStore,
  HistoryModel,
  SimulatedTelemetryData,
  SimulationEngine,
  SIMULATOR,
  WEBSOCKET,
} from '../src/features/telemetry';
import { RateLimiter } from './rest/rate-limiter';
import { createRestHandler } from './rest/router';

import type { TelemetryMessage } from '../src/features/telemetry';
import type { FaultConfig } from './rest/faults';
import type { AddressInfo } from 'node:net';
import type { WebSocket } from 'ws';

export interface TelemetryServerOptions {
  /** Interface to bind. Defaults to loopback only. */
  host?: string;
  /** TCP port; 0 picks a free port (tests). */
  port?: number;
  seed?: number;
  deviceCount?: number;
  rateHz?: number;
  /**
   * Relay mode: valid `device_online`, `reading` and `device_offline` frames received from a
   * client (a real ESP32) are re-encoded from the parsed result and forwarded to all other
   * clients. Off by default.
   */
  relay?: boolean;
  /** Browser origins allowed for REST (CORS) and WebSocket upgrades. Defaults to the Vite dev server. */
  allowedOrigins?: readonly string[];
  /** Test-only REST fault injection. Off (null) by default. */
  faults?: FaultConfig | null;
  /** Random source for fault injection. */
  random?: () => number;
  /** Clock for REST data (history never goes past "now"). */
  now?: () => number;
  log?: (line: string) => void;
}

export interface TelemetryServerStats {
  connections: number;
  framesSent: number;
  framesDroppedSlowConsumer: number;
  pingsAnswered: number;
  rejectedInbound: number;
  rateLimitedClients: number;
  relayed: number;
}

export interface TelemetryServer {
  /** WebSocket URL of the telemetry stream. */
  readonly url: string;
  /** Base URL of the REST API (same host and port). */
  readonly httpUrl: string;
  readonly port: number;
  readonly clientCount: number;
  readonly stats: Readonly<TelemetryServerStats>;
  /** Graceful shutdown: close every client (1001), wait up to the grace period, then stop. */
  close: () => Promise<void>;
}

interface ClientState {
  alive: boolean;
  windowStart: number;
  windowCount: number;
}

/**
 * Mock telemetry server for development and tests: streams the same SimulationEngine output that
 * Demo Mode uses, over plain WebSocket, with the protocol's frame size limit, a per-connection
 * inbound rate limit, a slow-consumer guard, protocol-level ping/pong to drop dead connections,
 * and answers to application-level `ping` messages.
 */
export async function startTelemetryServer({
  host = MOCK_SERVER.DEFAULT_HOST,
  port = MOCK_SERVER.DEFAULT_PORT,
  seed = SIMULATOR.DEFAULT_SEED,
  deviceCount = SIMULATOR.DEFAULT_DEVICE_COUNT,
  rateHz = SIMULATOR.DEFAULT_RATE_HZ,
  relay = false,
  allowedOrigins = MOCK_SERVER.ALLOWED_ORIGINS,
  faults = null,
  random = Math.random,
  now = () => Date.now(),
  log = () => undefined,
}: TelemetryServerOptions = {}): Promise<TelemetryServer> {
  const engine = new SimulationEngine({ startTime: Date.now(), seed, deviceCount, rateHz });
  const clients = new Map<WebSocket, ClientState>();
  const stats: TelemetryServerStats = {
    connections: 0,
    framesSent: 0,
    framesDroppedSlowConsumer: 0,
    pingsAnswered: 0,
    rejectedInbound: 0,
    rateLimitedClients: 0,
    relayed: 0,
  };

  const origins = new Set(allowedOrigins);
  const rules = new AlertRuleStore();
  const rest = createRestHandler({
    data: new SimulatedTelemetryData({
      model: new HistoryModel({ seed, deviceCount }),
      rules,
      now,
    }),
    rules,
    allowedOrigins: origins,
    limiter: new RateLimiter(),
    faults,
    random,
    log,
  });
  if (faults) log(`REST fault injection ENABLED: ${JSON.stringify(faults)}`);

  // One HTTP server: REST under /api/, WebSocket upgrades on the same port.
  const httpServer = createServer((request, response) => {
    void rest(request, response);
  });
  const wss = new WebSocketServer({
    server: httpServer,
    // Frames above the protocol limit are refused by ws itself (close 1009).
    maxPayload: PROTOCOL.MAX_FRAME_BYTES,
    // No compression: avoids decompression bombs and CPU cost; telemetry frames are tiny.
    perMessageDeflate: false,
    // Browsers do not apply CORS to WebSockets: check Origin to stop cross-site WebSocket
    // hijacking. Clients without an Origin (devices, Node tools) are not browsers.
    verifyClient: ({ origin }: { origin?: string }) => !origin || origins.has(origin),
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.once('error', reject);
    httpServer.listen(port, host);
  });
  const address = httpServer.address() as AddressInfo;

  const sendFrames = (socket: WebSocket, frames: readonly string[]) => {
    for (const frame of frames) {
      if (socket.readyState !== socket.OPEN) return;
      if (socket.bufferedAmount > MOCK_SERVER.MAX_CLIENT_BUFFERED_BYTES) {
        stats.framesDroppedSlowConsumer += 1;
        continue;
      }
      socket.send(frame);
      stats.framesSent += 1;
    }
  };

  const encodeAll = (messages: readonly TelemetryMessage[]) => messages.map(encodeMessage);

  wss.on('connection', (socket, request) => {
    stats.connections += 1;
    const state: ClientState = { alive: true, windowStart: Date.now(), windowCount: 0 };
    clients.set(socket, state);
    log(
      `client connected from ${request.socket.remoteAddress ?? 'unknown'} (${String(clients.size)} total)`,
    );

    // A new client first learns which devices exist.
    sendFrames(socket, encodeAll(engine.announce()));

    socket.on('pong', () => {
      state.alive = true;
    });

    socket.on('message', (data, isBinary) => {
      const now = Date.now();
      if (now - state.windowStart >= WEBSOCKET.RATE_WINDOW_MS) {
        state.windowStart = now;
        state.windowCount = 0;
      }
      state.windowCount += 1;
      if (state.windowCount > MOCK_SERVER.MAX_CLIENT_MESSAGES_PER_SECOND) {
        stats.rateLimitedClients += 1;
        socket.close(CLOSE_CODES.POLICY_VIOLATION, 'rate limit exceeded');
        return;
      }
      if (isBinary) {
        stats.rejectedInbound += 1;
        return;
      }
      // Inbound frames go through the same parser as everything else.
      const result = parseTelemetryMessage(Buffer.from(data as Buffer).toString('utf8'));
      if (!result.ok) {
        stats.rejectedInbound += 1;
        return;
      }
      const message = result.message;
      if (message.type === 'ping') {
        stats.pingsAnswered += 1;
        sendFrames(socket, [
          encodeMessage({ v: PROTOCOL.VERSION, type: 'pong', ts: now, pingTs: message.ts }),
        ]);
        return;
      }
      if (relay && message.type !== 'pong') {
        // Forward the sanitized, re-encoded message, never the raw bytes.
        const frame = encodeMessage(message);
        for (const other of clients.keys()) {
          if (other !== socket) sendFrames(other, [frame]);
        }
        stats.relayed += 1;
      }
    });

    socket.on('error', (error) => {
      log(`client error: ${error.message}`);
    });

    socket.on('close', (code) => {
      clients.delete(socket);
      log(`client disconnected (${String(code)}, ${String(clients.size)} left)`);
    });
  });

  const ticker = setInterval(() => {
    const frames = encodeAll(engine.advance(Date.now()));
    if (frames.length === 0) return;
    for (const socket of clients.keys()) sendFrames(socket, frames);
  }, SIMULATOR.TICK_MS);

  // Protocol-level ping: a client that has not answered the previous ping is gone.
  const reaper = setInterval(() => {
    for (const [socket, state] of clients) {
      if (!state.alive) {
        socket.terminate();
        continue;
      }
      state.alive = false;
      socket.ping();
    }
  }, MOCK_SERVER.PROTOCOL_PING_INTERVAL_MS);

  let closing: Promise<void> | null = null;
  const close = () => {
    closing ??= (async () => {
      clearInterval(ticker);
      clearInterval(reaper);
      // Stop accepting connections first, so reconnecting clients cannot prolong the shutdown.
      const stopped = new Promise<void>((resolve) => {
        httpServer.close(() => {
          resolve();
        });
      });
      wss.close();
      for (const socket of clients.keys()) socket.close(CLOSE_CODES.GOING_AWAY, 'server shutdown');
      const deadline = Date.now() + MOCK_SERVER.SHUTDOWN_GRACE_MS;
      while (clients.size > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, SIMULATOR.TICK_MS));
      }
      for (const socket of clients.keys()) socket.terminate();
      httpServer.closeAllConnections();
      await stopped;
    })();
    return closing;
  };

  const hostPart = address.address.includes(':') ? `[${address.address}]` : address.address;
  const authority = `${hostPart}:${String(address.port)}`;
  const url = `ws://${authority}`;
  return {
    url,
    httpUrl: `http://${authority}`,
    port: address.port,
    get clientCount() {
      return clients.size;
    },
    stats,
    close,
  };
}
