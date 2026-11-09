import { CLOSE_CODES, PROTOCOL, WEBSOCKET } from '../config';
import { exceedsFrameLimit } from '../model/parse';
import { encodeMessage } from '../model/protocol';
import { backoffDelay } from './backoff';
import { createListenerSet } from './listeners';
import { systemScheduler } from './scheduler';
import { assertTransition } from './state-machine';
import { emptyStats } from './types';
import { WEBSOCKET_READY_STATE_OPEN } from './websocket-like';

import type { ConnectionState, ConnectionStatus } from '../model/connection';
import type { Unsubscribe } from './listeners';
import type { Scheduler, TimerHandle } from './scheduler';
import type { TelemetryTransport, TransportStats } from './types';
import type { WebSocketConstructor, WebSocketLike } from './websocket-like';

type TimerName = 'connect' | 'retry' | 'stable' | 'heartbeat' | 'heartbeatDeadline';

export type UrlValidation = { ok: true; url: string } | { ok: false; reason: string };

/** Accepts only absolute ws: or wss: URLs. Runs before any socket is constructed. */
export function validateWebSocketUrl(input: string): UrlValidation {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (!WEBSOCKET.ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return { ok: false, reason: 'unsupported_scheme' };
  }
  if (url.username || url.password) return { ok: false, reason: 'credentials_in_url' };
  return { ok: true, url: url.href };
}

export interface WebSocketTransportOptions {
  url: string;
  /** WebSocket implementation. Defaults to the global (browser, or Node >= 22). */
  WebSocketImpl?: WebSocketConstructor;
  scheduler?: Scheduler;
  /** Random source in [0, 1) for backoff jitter. */
  random?: () => number;
  /** Limits, defaulting to WEBSOCKET in config.ts (overridable for tests and the probe). */
  limits?: Partial<typeof WEBSOCKET>;
}

/**
 * Live Mode transport: a WebSocket with an explicit connection state machine, exponential backoff
 * with full jitter, an application-level heartbeat, inbound size and rate limits, and a bounded
 * outgoing queue. It delivers raw text frames and never parses them (ADR 0010).
 */
export class WebSocketTransport implements TelemetryTransport {
  private readonly url: string;
  private readonly WebSocketImpl: WebSocketConstructor | undefined;
  private readonly scheduler: Scheduler;
  private readonly random: () => number;
  private readonly limits: typeof WEBSOCKET;

  private readonly messageListeners = createListenerSet<string>();
  private readonly statusListeners = createListenerSet<ConnectionStatus>();

  private status: ConnectionStatus = { state: 'idle', attempt: 0 };
  private stats: TransportStats = emptyStats();
  private socket: WebSocketLike | null = null;
  /** Incremented per socket so events from a replaced socket are ignored. */
  private generation = 0;
  private hasConnectedBefore = false;
  private readonly outgoing: string[] = [];

  private readonly timers = new Map<TimerName, TimerHandle>();

  private rateWindowStart = 0;
  private rateWindowCount = 0;

  constructor({ url, WebSocketImpl, scheduler, random, limits }: WebSocketTransportOptions) {
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.scheduler = scheduler ?? systemScheduler;
    this.random = random ?? Math.random;
    this.limits = { ...WEBSOCKET, ...limits };
  }

  /* ----------------------------------------------- public API ---------------------------------- */

  connect(): void {
    const { state } = this.status;
    if (state === 'connecting' || state === 'open' || state === 'reconnecting') return;

    const validation = validateWebSocketUrl(this.url);
    if (!validation.ok) {
      if (state !== 'failed')
        this.setStatus({ state: 'failed', attempt: 0, reason: validation.reason });
      return;
    }
    this.status = { ...this.status, attempt: 0 };
    this.openSocket(validation.url);
  }

  disconnect(): void {
    const { state } = this.status;
    if (state === 'idle' || state === 'closed' || state === 'failed') return;
    this.teardownSocket(CLOSE_CODES.NORMAL, 'client disconnect');
    this.outgoing.length = 0;
    this.setStatus({ state: 'closed', attempt: 0, reason: 'disconnected' });
  }

  /**
   * Sends a text frame now if open, otherwise queues it (bounded; the oldest frame is dropped and
   * counted when full). Returns false if the frame was dropped.
   */
  send(frame: string): boolean {
    if (this.socket?.readyState === WEBSOCKET_READY_STATE_OPEN) {
      this.socket.send(frame);
      return true;
    }
    this.outgoing.push(frame);
    if (this.outgoing.length > this.limits.MAX_OUTGOING_QUEUE) {
      this.outgoing.shift();
      this.stats.droppedOutgoing += 1;
      return false;
    }
    return true;
  }

  onMessage(listener: (raw: string) => void): Unsubscribe {
    return this.messageListeners.add(listener);
  }

  onStatus(listener: (status: ConnectionStatus) => void): Unsubscribe {
    return this.statusListeners.add(listener);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getStats(): TransportStats {
    return { ...this.stats };
  }

  /* ----------------------------------------------- lifecycle ----------------------------------- */

  private openSocket(url: string): void {
    this.setStatus({ state: 'connecting', attempt: this.status.attempt });
    const WebSocketImpl = this.WebSocketImpl ?? globalThis.WebSocket;
    const generation = ++this.generation;
    let socket: WebSocketLike;
    try {
      socket = new WebSocketImpl(url);
    } catch {
      this.handleConnectionLoss('socket_error');
      return;
    }
    this.socket = socket;
    const current = () => generation === this.generation;

    socket.addEventListener('open', () => {
      if (current()) this.handleOpen();
    });
    socket.addEventListener('message', (event) => {
      if (current()) this.handleFrame(event.data);
    });
    socket.addEventListener('close', (event) => {
      if (current()) this.handleConnectionLoss(`closed_${String(event.code)}`);
    });
    socket.addEventListener('error', () => {
      // Browsers fire `close` right after `error`; handling both would double-count the attempt.
    });

    this.startTimer(
      'connect',
      () => {
        if (current()) this.handleConnectionLoss('connect_timeout');
      },
      this.limits.CONNECT_TIMEOUT_MS,
    );
  }

  private handleOpen(): void {
    this.clearTimer('connect');
    if (this.hasConnectedBefore) this.stats.reconnects += 1;
    this.hasConnectedBefore = true;
    this.setStatus({ state: 'open', attempt: this.status.attempt });

    // Only a connection that stays up resets the backoff (a flapping server keeps backing off).
    this.startTimer(
      'stable',
      () => {
        if (this.status.state === 'open') this.status = { ...this.status, attempt: 0 };
      },
      this.limits.STABLE_CONNECTION_MS,
    );

    this.flushOutgoing();
    this.scheduleHeartbeat();
  }

  /** Socket closed, errored or timed out: retry with backoff, or give up. */
  private handleConnectionLoss(reason: string): void {
    const { state } = this.status;
    if (state !== 'connecting' && state !== 'open') return;
    const code =
      reason === 'heartbeat_timeout' ? CLOSE_CODES.HEARTBEAT_TIMEOUT : CLOSE_CODES.NORMAL;
    this.teardownSocket(code, reason);

    const attempt = this.status.attempt;
    if (attempt >= this.limits.RECONNECT_MAX_ATTEMPTS) {
      this.setStatus({ state: 'failed', attempt, reason: 'max_attempts' });
      return;
    }
    const delay = backoffDelay(attempt, this.random, {
      baseMs: this.limits.RECONNECT_BASE_MS,
      capMs: this.limits.RECONNECT_CAP_MS,
    });
    this.setStatus({ state: 'reconnecting', attempt: attempt + 1, retryInMs: delay, reason });
    this.startTimer(
      'retry',
      () => {
        if (this.status.state !== 'reconnecting') return;
        const validation = validateWebSocketUrl(this.url);
        if (validation.ok) this.openSocket(validation.url);
      },
      delay,
    );
  }

  private teardownSocket(code: number, reason: string): void {
    for (const handle of this.timers.values()) this.scheduler.clearTimeout(handle);
    this.timers.clear();
    const socket = this.socket;
    this.socket = null;
    this.generation += 1; // ignore any late events from the old socket
    if (socket) {
      try {
        socket.close(code, reason);
      } catch {
        // Closing a socket that is already closing can throw in some implementations.
      }
    }
  }

  /* ----------------------------------------------- inbound ------------------------------------- */

  private handleFrame(data: unknown): void {
    // Any traffic proves the connection is alive.
    this.clearTimer('heartbeatDeadline');

    if (typeof data !== 'string') {
      this.stats.droppedNonText += 1;
      return;
    }
    if (exceedsFrameLimit(data, PROTOCOL.MAX_FRAME_BYTES)) {
      this.stats.droppedOversized += 1;
      return;
    }
    if (!this.withinRateLimit()) {
      this.stats.droppedRateLimited += 1;
      return;
    }
    this.stats.received += 1;
    this.messageListeners.emit(data);
  }

  /** Fixed-window counter: at most MAX_MESSAGES_PER_SECOND frames per RATE_WINDOW_MS. */
  private withinRateLimit(): boolean {
    const now = this.scheduler.now();
    if (now - this.rateWindowStart >= this.limits.RATE_WINDOW_MS) {
      this.rateWindowStart = now;
      this.rateWindowCount = 0;
    }
    this.rateWindowCount += 1;
    return this.rateWindowCount <= this.limits.MAX_MESSAGES_PER_SECOND;
  }

  /* ----------------------------------------------- heartbeat ----------------------------------- */

  private scheduleHeartbeat(): void {
    this.startTimer(
      'heartbeat',
      () => {
        if (this.status.state !== 'open') return;
        this.send(encodeMessage({ v: PROTOCOL.VERSION, type: 'ping', ts: this.scheduler.now() }));
        this.clearTimer('heartbeatDeadline');
        this.startTimer(
          'heartbeatDeadline',
          () => {
            this.handleConnectionLoss('heartbeat_timeout');
          },
          this.limits.HEARTBEAT_TIMEOUT_MS,
        );
        this.scheduleHeartbeat();
      },
      this.limits.HEARTBEAT_INTERVAL_MS,
    );
  }

  /* ----------------------------------------------- helpers ------------------------------------- */

  private flushOutgoing(): void {
    const socket = this.socket;
    if (!socket) return;
    for (const frame of this.outgoing.splice(0)) socket.send(frame);
  }

  /** Starts a named one-shot timer, replacing any pending timer with the same name. */
  private startTimer(name: TimerName, callback: () => void, ms: number): void {
    this.clearTimer(name);
    this.timers.set(
      name,
      this.scheduler.setTimeout(() => {
        this.timers.delete(name);
        callback();
      }, ms),
    );
  }

  private clearTimer(name: TimerName): void {
    const handle = this.timers.get(name);
    if (handle !== undefined) {
      this.scheduler.clearTimeout(handle);
      this.timers.delete(name);
    }
  }

  private setStatus(next: ConnectionStatus): void {
    assertTransition(this.status.state, next.state);
    this.status = next;
    this.statusListeners.emit(next);
  }

  /** Current state, for tests and diagnostics. */
  get state(): ConnectionState {
    return this.status.state;
  }
}
