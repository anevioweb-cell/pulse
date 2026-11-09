import { STORE } from '../config';
import { SimulatorTransport } from '../simulator/simulator-transport';
import { initialTelemetryState } from '../store/telemetry-store';
import { systemScheduler } from '../transport/scheduler';
import { validateWebSocketUrl, WebSocketTransport } from '../transport/websocket-transport';
import { defaultFrameScheduler } from './frame-scheduler';
import { TelemetryIngestor } from './ingestor';

import type { Tunable } from '../config';
import type { SimulatorTransportOptions } from '../simulator/simulator-transport';
import type { TelemetryStore } from '../store/telemetry-store';
import type { Unsubscribe } from '../transport/listeners';
import type { Scheduler, TimerHandle } from '../transport/scheduler';
import type { TelemetryTransport } from '../transport/types';
import type { WebSocketTransportOptions } from '../transport/websocket-transport';
import type { CancelFrame, FrameScheduler } from './frame-scheduler';

export type TelemetryStartOptions =
  | {
      mode: 'demo';
      seed?: number;
      deviceCount?: number;
      rateHz?: number;
    }
  | {
      mode: 'live';
      /** ws:// or wss:// URL; anything else ends in a `failed` connection state, not an exception. */
      url: string;
      /** Raises the transport's inbound rate limit (stress testing, Phase 6). */
      maxMessagesPerSecond?: number;
    };

export interface TelemetryServiceOptions {
  /** The store to write to. */
  store: TelemetryStore;
  /** Clock and timers (stale checks). */
  scheduler?: Scheduler;
  /** Publish scheduling: requestAnimationFrame by default. */
  frames?: FrameScheduler;
  /** Transport factories, replaced by fakes in tests. */
  createDemoTransport?: (options: SimulatorTransportOptions) => TelemetryTransport;
  createLiveTransport?: (options: WebSocketTransportOptions) => TelemetryTransport;
  limits?: Partial<Tunable<typeof STORE>>;
}

/**
 * Wires a transport to the live store: every raw frame (demo or live) goes through the same
 * parser in TelemetryIngestor, readings are written to ring buffers on arrival, and the store is
 * published at most once per frame. The service is the store's only writer.
 */
export class TelemetryService {
  private readonly store: TelemetryStore;
  private readonly scheduler: Scheduler;
  private readonly frames: FrameScheduler;
  private readonly createDemoTransport: (options: SimulatorTransportOptions) => TelemetryTransport;
  private readonly createLiveTransport: (options: WebSocketTransportOptions) => TelemetryTransport;
  private readonly limits: Tunable<typeof STORE>;

  private activeTransport: TelemetryTransport | null = null;
  private ingestor: TelemetryIngestor | null = null;
  private unsubscribers: Unsubscribe[] = [];
  private cancelFrame: CancelFrame | null = null;
  private staleTimer: TimerHandle | null = null;

  constructor({
    store,
    scheduler = systemScheduler,
    frames = defaultFrameScheduler,
    createDemoTransport = (options) => new SimulatorTransport(options),
    createLiveTransport = (options) => new WebSocketTransport(options),
    limits,
  }: TelemetryServiceOptions) {
    this.store = store;
    this.scheduler = scheduler;
    this.frames = frames;
    this.createDemoTransport = createDemoTransport;
    this.createLiveTransport = createLiveTransport;
    this.limits = { ...STORE, ...limits };
  }

  /** The active transport, if any (for example to send demo controls). */
  get transport(): TelemetryTransport | null {
    return this.activeTransport;
  }

  get running(): boolean {
    return this.ingestor !== null;
  }

  /**
   * Starts a session. Any previous session is stopped first, and the store is reset (devices and
   * buffers belong to one source).
   */
  start(options: TelemetryStartOptions): void {
    this.stop();
    const ingestor = new TelemetryIngestor({ now: this.scheduler.now, limits: this.limits });
    this.ingestor = ingestor;
    this.store.setState({ ...initialTelemetryState(), mode: options.mode });

    const transport = this.createTransport(options);
    if (!transport) return; // invalid URL: the failure is already published
    this.activeTransport = transport;

    this.unsubscribers.push(
      transport.onMessage((raw) => {
        ingestor.ingest(raw);
        this.requestPublish();
      }),
      transport.onStatus((status) => {
        ingestor.setConnection(status);
        this.requestPublish();
      }),
    );
    this.scheduleStaleCheck();
    transport.connect();
  }

  /** Stops the session: disconnects, removes every listener, timer and pending frame. */
  stop(): void {
    const transport = this.activeTransport;
    const ingestor = this.ingestor;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.cancelFrame?.();
    this.cancelFrame = null;
    if (this.staleTimer !== null) this.scheduler.clearTimeout(this.staleTimer);
    this.staleTimer = null;
    this.activeTransport = null;
    this.ingestor = null;

    if (transport) {
      transport.disconnect();
      // Publish the final state synchronously so the store does not show a live connection.
      if (ingestor) {
        ingestor.setConnection(transport.getStatus());
        ingestor.setTransportStats(transport.getStats());
        this.store.setState(ingestor.publish(this.store.getState()));
      }
    }
  }

  /** Publishes pending changes now instead of waiting for the next frame (tests, benchmarks). */
  flush(): void {
    this.cancelFrame?.();
    this.cancelFrame = null;
    this.publish();
  }

  /* ----------------------------------------------- internals ----------------------------------- */

  private createTransport(options: TelemetryStartOptions): TelemetryTransport | null {
    if (options.mode === 'demo') {
      return this.createDemoTransport({
        ...(options.seed === undefined ? {} : { seed: options.seed }),
        ...(options.deviceCount === undefined ? {} : { deviceCount: options.deviceCount }),
        ...(options.rateHz === undefined ? {} : { rateHz: options.rateHz }),
      });
    }
    const validation = validateWebSocketUrl(options.url);
    if (!validation.ok) {
      this.ingestor?.setConnection({ state: 'failed', attempt: 0, reason: validation.reason });
      this.publish();
      return null;
    }
    return this.createLiveTransport({
      url: validation.url,
      ...(options.maxMessagesPerSecond === undefined
        ? {}
        : { maxMessagesPerSecond: options.maxMessagesPerSecond }),
    });
  }

  /**
   * At most one pending frame at a time: many messages in one frame cause one publish. While the
   * tab is hidden the frame does not run, and nothing else accumulates (ADR 0014).
   */
  private requestPublish(): void {
    if (this.cancelFrame) return;
    this.cancelFrame = this.frames.request(() => {
      this.cancelFrame = null;
      this.publish();
    });
  }

  private publish(): void {
    const ingestor = this.ingestor;
    if (!ingestor) return;
    if (this.activeTransport) ingestor.setTransportStats(this.activeTransport.getStats());
    this.store.setState(ingestor.publish(this.store.getState()));
  }

  /** Stale status changes with time alone, so it is re-checked even when no message arrives. */
  private scheduleStaleCheck(): void {
    this.staleTimer = this.scheduler.setTimeout(() => {
      this.staleTimer = null;
      if (this.ingestor?.hasPendingChanges()) this.requestPublish();
      if (this.ingestor) this.scheduleStaleCheck();
    }, this.limits.STALE_CHECK_INTERVAL_MS);
  }
}
