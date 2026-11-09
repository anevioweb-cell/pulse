import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLOSE_CODES, PROTOCOL, WEBSOCKET } from '../config';
import { parseTelemetryMessage } from '../model/parse';
import { backoffDelay } from './backoff';
import { assertTransition, canTransition, TRANSITIONS } from './state-machine';
import { validateWebSocketUrl, WebSocketTransport } from './websocket-transport';

import type { ConnectionState, ConnectionStatus } from '../model/connection';
import type { WebSocketLike } from './websocket-like';

type AnyListener = (event: unknown) => void;

/** Controllable stand-in for the WHATWG WebSocket. */
class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  readyState = 0;
  readonly sent: string[] = [];
  closedWith: { code: number | undefined; reason: string | undefined } | null = null;
  private readonly listeners = new Map<string, AnyListener[]>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  static latest(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) throw new Error('No socket was created');
    return socket;
  }

  addEventListener(type: 'open' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(
    type: 'close',
    listener: (event: { code: number; reason: string }) => void,
  ): void;
  addEventListener(type: string, listener: (event: never) => void): void {
    // The overloads above guarantee each listener receives the event shape it declares.
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener as AnyListener]);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
    this.readyState = 3;
  }

  private dispatch(type: string, event?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  serverOpens(): void {
    this.readyState = 1;
    this.dispatch('open');
  }

  serverSends(data: unknown): void {
    this.dispatch('message', { data });
  }

  serverCloses(code = 1006): void {
    this.readyState = 3;
    this.dispatch('error');
    this.dispatch('close', { code, reason: '' });
  }
}

const URL_OK = 'ws://127.0.0.1:8787';
const START_TIME = PROTOCOL.MIN_TIMESTAMP_MS + 1;

function createTransport(options: { random?: () => number; url?: string } = {}) {
  const transport = new WebSocketTransport({
    url: options.url ?? URL_OK,
    WebSocketImpl: FakeWebSocket,
    random: options.random ?? (() => 0.5),
  });
  const statuses: ConnectionStatus[] = [];
  transport.onStatus((status) => statuses.push(status));
  const messages: string[] = [];
  transport.onMessage((raw) => messages.push(raw));
  return { transport, statuses, messages, states: () => statuses.map((s) => s.state) };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers({ now: START_TIME });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('connection state machine', () => {
  const ALL: ConnectionState[] = ['idle', 'connecting', 'open', 'reconnecting', 'closed', 'failed'];

  it('allows exactly the documented transitions', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        expect(canTransition(from, to)).toBe(TRANSITIONS.get(from)?.includes(to) ?? false);
      }
    }
  });

  it.each([
    ['idle', 'open'],
    ['open', 'connecting'],
    ['failed', 'open'],
    ['closed', 'open'],
    ['reconnecting', 'open'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(() => {
      assertTransition(from, to);
    }).toThrow(/Illegal/);
  });

  it('goes idle -> connecting -> open', () => {
    const { transport, states } = createTransport();
    expect(transport.getStatus().state).toBe('idle');
    transport.connect();
    FakeWebSocket.latest().serverOpens();
    expect(states()).toEqual(['connecting', 'open']);
  });

  it('is idempotent while active', () => {
    const { transport } = createTransport();
    transport.connect();
    transport.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe('URL validation', () => {
  it.each([
    ['http://example.com', 'unsupported_scheme'],
    ['https://example.com/socket', 'unsupported_scheme'],
    ['javascript:alert(1)', 'unsupported_scheme'],
    ['file:///etc/passwd', 'unsupported_scheme'],
    ['/relative/path', 'invalid_url'],
    ['not a url', 'invalid_url'],
    ['wss://user:secret@example.com', 'credentials_in_url'],
  ])('rejects %s before constructing a socket', (url, reason) => {
    expect(validateWebSocketUrl(url)).toEqual({ ok: false, reason });
    const { transport } = createTransport({ url });
    transport.connect();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(transport.getStatus()).toMatchObject({ state: 'failed', reason });
  });

  it.each(['ws://localhost:8787', 'wss://telemetry.example.com/v1'])('accepts %s', (url) => {
    expect(validateWebSocketUrl(url).ok).toBe(true);
  });
});

describe('reconnect with exponential backoff and full jitter', () => {
  it('keeps delays within [0, min(cap, base * 2^attempt))', () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const ceiling = Math.min(
        WEBSOCKET.RECONNECT_CAP_MS,
        WEBSOCKET.RECONNECT_BASE_MS * 2 ** attempt,
      );
      expect(backoffDelay(attempt, () => 0)).toBe(0);
      const high = backoffDelay(attempt, () => 0.999_999);
      expect(high).toBeLessThan(ceiling);
      expect(high).toBeGreaterThanOrEqual(ceiling - 1);
    }
  });

  it('schedules the jittered delay and reconnects when it elapses', () => {
    const { transport, statuses } = createTransport({ random: () => 0.5 });
    transport.connect();
    FakeWebSocket.latest().serverCloses();

    const expected = Math.floor(0.5 * WEBSOCKET.RECONNECT_BASE_MS);
    expect(statuses.at(-1)).toMatchObject({
      state: 'reconnecting',
      attempt: 1,
      retryInMs: expected,
    });
    vi.advanceTimersByTime(expected - 1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(transport.getStatus().state).toBe('connecting');
  });

  it('doubles the ceiling per failed attempt and gives up after the maximum', () => {
    const { transport, statuses } = createTransport({ random: () => 0.999 });
    transport.connect();
    for (let attempt = 0; attempt < WEBSOCKET.RECONNECT_MAX_ATTEMPTS; attempt += 1) {
      FakeWebSocket.latest().serverCloses();
      const status = statuses.at(-1);
      const ceiling = Math.min(
        WEBSOCKET.RECONNECT_CAP_MS,
        WEBSOCKET.RECONNECT_BASE_MS * 2 ** attempt,
      );
      expect(status).toMatchObject({ state: 'reconnecting', attempt: attempt + 1 });
      expect(status?.retryInMs).toBe(Math.floor(0.999 * ceiling));
      vi.advanceTimersByTime(status?.retryInMs ?? 0);
    }
    FakeWebSocket.latest().serverCloses();
    expect(transport.getStatus()).toMatchObject({ state: 'failed', reason: 'max_attempts' });
  });

  it('resets the attempt counter only after a stable connection', () => {
    const { transport, statuses } = createTransport({ random: () => 0.999 });
    const waitForRetry = () => {
      vi.advanceTimersByTime(statuses.at(-1)?.retryInMs ?? 0);
    };
    transport.connect();
    FakeWebSocket.latest().serverCloses(); // attempt 1
    waitForRetry();
    FakeWebSocket.latest().serverCloses(); // attempt 2
    waitForRetry();

    // Flapping: opens, then drops before it is stable -> backoff keeps growing.
    FakeWebSocket.latest().serverOpens();
    vi.advanceTimersByTime(WEBSOCKET.STABLE_CONNECTION_MS - 1);
    FakeWebSocket.latest().serverCloses();
    expect(statuses.at(-1)).toMatchObject({ state: 'reconnecting', attempt: 3 });
    waitForRetry();

    // Stable: stays open long enough -> next drop starts again from attempt 0.
    FakeWebSocket.latest().serverOpens();
    vi.advanceTimersByTime(WEBSOCKET.STABLE_CONNECTION_MS);
    FakeWebSocket.latest().serverCloses();
    expect(statuses.at(-1)).toMatchObject({
      state: 'reconnecting',
      attempt: 1,
      retryInMs: Math.floor(0.999 * WEBSOCKET.RECONNECT_BASE_MS),
    });
    expect(transport.getStats().reconnects).toBe(1);
  });

  it('treats a socket that never opens as failed after the connect timeout', () => {
    const { transport } = createTransport();
    transport.connect();
    vi.advanceTimersByTime(WEBSOCKET.CONNECT_TIMEOUT_MS);
    expect(transport.getStatus()).toMatchObject({
      state: 'reconnecting',
      reason: 'connect_timeout',
    });
    expect(FakeWebSocket.latest().closedWith).not.toBeNull();
  });

  it('stops retrying when disconnected during a reconnect', () => {
    const { transport, states } = createTransport();
    transport.connect();
    FakeWebSocket.latest().serverCloses();
    transport.disconnect();
    vi.advanceTimersByTime(WEBSOCKET.RECONNECT_CAP_MS * 2);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(states()).toEqual(['connecting', 'reconnecting', 'closed']);
  });

  it('ignores late events from a replaced socket', () => {
    const { transport, messages } = createTransport({ random: () => 0 });
    transport.connect();
    const first = FakeWebSocket.latest();
    first.serverCloses();
    vi.advanceTimersByTime(0);
    FakeWebSocket.latest().serverOpens();

    first.serverSends('{"late":true}');
    first.serverCloses();
    expect(messages).toEqual([]);
    expect(transport.getStatus().state).toBe('open');
  });

  it('can connect again after disconnect and after failure', () => {
    const { transport } = createTransport();
    transport.connect();
    transport.disconnect();
    transport.connect();
    expect(transport.getStatus().state).toBe('connecting');
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});

describe('heartbeat', () => {
  function openTransport() {
    const context = createTransport({ random: () => 0 });
    context.transport.connect();
    FakeWebSocket.latest().serverOpens();
    return context;
  }

  it('sends a valid ping message every interval', () => {
    openTransport();
    vi.advanceTimersByTime(WEBSOCKET.HEARTBEAT_INTERVAL_MS);
    const [ping] = FakeWebSocket.latest().sent;
    expect(parseTelemetryMessage(ping)).toMatchObject({ ok: true, message: { type: 'ping' } });
  });

  it('reconnects when neither a pong nor any other traffic arrives in time', () => {
    const { transport } = openTransport();
    const socket = FakeWebSocket.latest();
    vi.advanceTimersByTime(WEBSOCKET.HEARTBEAT_INTERVAL_MS + WEBSOCKET.HEARTBEAT_TIMEOUT_MS);

    expect(transport.getStatus()).toMatchObject({
      state: 'reconnecting',
      reason: 'heartbeat_timeout',
    });
    expect(socket.closedWith?.code).toBe(CLOSE_CODES.HEARTBEAT_TIMEOUT);
  });

  it('stays open when any traffic arrives before the deadline', () => {
    const { transport } = openTransport();
    vi.advanceTimersByTime(WEBSOCKET.HEARTBEAT_INTERVAL_MS + WEBSOCKET.HEARTBEAT_TIMEOUT_MS - 1);
    FakeWebSocket.latest().serverSends('{"v":1,"type":"pong"}');
    vi.advanceTimersByTime(WEBSOCKET.HEARTBEAT_TIMEOUT_MS);
    expect(transport.getStatus().state).toBe('open');
  });
});

describe('safety limits', () => {
  function openTransport() {
    const context = createTransport();
    context.transport.connect();
    FakeWebSocket.latest().serverOpens();
    return context;
  }

  it('drops and counts oversized frames', () => {
    const { transport, messages } = openTransport();
    FakeWebSocket.latest().serverSends('x'.repeat(PROTOCOL.MAX_FRAME_BYTES + 1));
    FakeWebSocket.latest().serverSends('ok');
    expect(messages).toEqual(['ok']);
    expect(transport.getStats()).toMatchObject({ droppedOversized: 1, received: 1 });
  });

  it('drops and counts binary frames', () => {
    const { transport, messages } = openTransport();
    FakeWebSocket.latest().serverSends(new ArrayBuffer(4));
    expect(messages).toEqual([]);
    expect(transport.getStats().droppedNonText).toBe(1);
  });

  it('rate-limits inbound frames per window and recovers in the next window', () => {
    const { transport, messages } = openTransport();
    const socket = FakeWebSocket.latest();
    const excess = 5;
    for (let index = 0; index < WEBSOCKET.MAX_MESSAGES_PER_SECOND + excess; index += 1) {
      socket.serverSends(`m${String(index)}`);
    }
    expect(messages).toHaveLength(WEBSOCKET.MAX_MESSAGES_PER_SECOND);
    expect(transport.getStats().droppedRateLimited).toBe(excess);

    vi.advanceTimersByTime(WEBSOCKET.RATE_WINDOW_MS);
    socket.serverSends('next window');
    expect(messages.at(-1)).toBe('next window');
  });

  it('accepts a per-instance rate limit and keeps the default otherwise', () => {
    const raised = WEBSOCKET.MAX_MESSAGES_PER_SECOND * 5;
    const transport = new WebSocketTransport({
      url: URL_OK,
      WebSocketImpl: FakeWebSocket,
      maxMessagesPerSecond: raised,
    });
    const received: string[] = [];
    transport.onMessage((raw) => received.push(raw));
    transport.connect();
    const socket = FakeWebSocket.latest();
    socket.serverOpens();
    for (let index = 0; index < raised + 1; index += 1) socket.serverSends('m');

    expect(received).toHaveLength(raised);
    expect(transport.getStats().droppedRateLimited).toBe(1);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid per-instance rate limit (%s)',
    (maxMessagesPerSecond) => {
      expect(
        () =>
          new WebSocketTransport({
            url: URL_OK,
            WebSocketImpl: FakeWebSocket,
            maxMessagesPerSecond,
          }),
      ).toThrow(RangeError);
    },
  );

  it('queues outgoing frames while connecting, bounded, and flushes them on open', () => {
    const { transport } = createTransport();
    transport.connect();
    const extra = 3;
    for (let index = 0; index < WEBSOCKET.MAX_OUTGOING_QUEUE + extra; index += 1) {
      transport.send(`frame ${String(index)}`);
    }
    expect(transport.getStats().droppedOutgoing).toBe(extra);

    FakeWebSocket.latest().serverOpens();
    const { sent } = FakeWebSocket.latest();
    expect(sent).toHaveLength(WEBSOCKET.MAX_OUTGOING_QUEUE);
    expect(sent[0]).toBe(`frame ${String(extra)}`); // the oldest were dropped
  });
});
