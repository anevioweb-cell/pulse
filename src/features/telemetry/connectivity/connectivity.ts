import { CONNECTIVITY } from '../config';

import type { ConnectionState } from '../model/connection';
import type { TelemetryMode, TelemetryState } from '../store/telemetry-store';

/**
 * - `online`: the browser and the data layer see a network, and (in Live Mode with a session)
 *   live data is flowing.
 * - `offline`: the browser or the data layer reports no network.
 * - `degraded`: the network is up, but the live connection is reconnecting, failed, or silent.
 * - `unknown`: the signals do not allow a decision yet (no navigator, or a first connection
 *   that has not delivered anything).
 */
export type ConnectivityState = 'online' | 'offline' | 'degraded' | 'unknown';

export type ConnectivityReason =
  | 'browser_offline'
  | 'data_layer_offline'
  | 'live_reconnecting'
  | 'live_failed'
  | 'live_silent'
  | 'live_connecting'
  | 'no_signal';

export interface Connectivity {
  readonly state: ConnectivityState;
  /** Why the state is not `online`; null when it is. */
  readonly reason: ConnectivityReason | null;
  /** Demo Mode: live data comes from the in-browser simulator and keeps flowing offline. */
  readonly demo: boolean;
}

export interface ConnectivitySignals {
  /**
   * `navigator.onLine`: false is reliable (no network interface), true is not (a captive portal
   * or a dead upstream still reports true). undefined where there is no navigator.
   */
  browserOnline: boolean | undefined;
  /** TanStack Query's onlineManager (follows browser events, can be set by the app or tests). */
  dataLayerOnline: boolean;
  live: {
    mode: TelemetryMode | null;
    connection: ConnectionState;
    /** Failed attempts since the last stable connection. */
    attempt: number;
    lastMessageAt: number | null;
  };
  now: number;
}

/**
 * The connectivity rules, in order (the first that applies wins):
 * 1. offline: `navigator.onLine` is false, or the onlineManager is offline.
 * 2. Demo Mode, or no session: the live transport is not a network signal (the simulator runs
 *    in the browser), so: online, or unknown without a navigator.
 * 3. Live Mode:
 *    - `reconnecting` -> degraded (live_reconnecting); `failed` -> degraded (live_failed);
 *    - `connecting` after a failure (attempt > 0) -> degraded (live_reconnecting);
 *      a first `connecting` -> unknown (live_connecting);
 *    - `open` with no message yet -> unknown (live_connecting);
 *    - `open` and the last message older than LIVE_SILENCE_MS -> degraded (live_silent);
 *    - `open` and recent data -> online, even without a navigator: data arriving proves it.
 *    - `idle` or `closed` (no session) -> rule 2.
 */
export function deriveConnectivity(signals: ConnectivitySignals): Connectivity {
  const { browserOnline, dataLayerOnline, live, now } = signals;
  const demo = live.mode === 'demo';
  const result = (state: ConnectivityState, reason: ConnectivityReason | null): Connectivity => ({
    state,
    reason,
    demo,
  });

  if (browserOnline === false) return result('offline', 'browser_offline');
  if (!dataLayerOnline) return result('offline', 'data_layer_offline');

  const session = live.connection !== 'idle' && live.connection !== 'closed';
  if (live.mode === 'live' && session) {
    switch (live.connection) {
      case 'reconnecting':
        return result('degraded', 'live_reconnecting');
      case 'failed':
        return result('degraded', 'live_failed');
      case 'connecting':
        return live.attempt > 0
          ? result('degraded', 'live_reconnecting')
          : result('unknown', 'live_connecting');
      case 'open':
        if (live.lastMessageAt === null) return result('unknown', 'live_connecting');
        return now - live.lastMessageAt > CONNECTIVITY.LIVE_SILENCE_MS
          ? result('degraded', 'live_silent')
          : result('online', null);
    }
  }
  return browserOnline === undefined ? result('unknown', 'no_signal') : result('online', null);
}

const same = (a: Connectivity, b: Connectivity) =>
  a.state === b.state && a.reason === b.reason && a.demo === b.demo;

export type IntervalHandle = ReturnType<typeof globalThis.setInterval>;

/** Where `online`/`offline` events come from (window in browsers; a fake in tests). */
export interface BrowserConnectivitySource {
  isOnline: () => boolean | undefined;
  subscribe: (listener: () => void) => () => void;
}

export interface ConnectivityMonitorOptions {
  browser: BrowserConnectivitySource;
  dataLayer: {
    isOnline: () => boolean;
    subscribe: (listener: (online: boolean) => void) => () => void;
  };
  live: { getState: () => TelemetryState; subscribe: (listener: () => void) => () => void };
  now: () => number;
  setInterval: (callback: () => void, ms: number) => IntervalHandle;
  clearInterval: (handle: IntervalHandle) => void;
}

/**
 * Combines the signals into one Connectivity value and notifies only when it changes. Sources
 * are subscribed while someone listens (useSyncExternalStore-compatible), and a timer re-checks
 * the silence rule every CHECK_INTERVAL_MS, since silence changes nothing in any source.
 */
export class ConnectivityMonitor {
  private readonly options: ConnectivityMonitorOptions;
  private readonly listeners = new Set<() => void>();
  private current: Connectivity;
  private stopSources: (() => void) | null = null;

  constructor(options: ConnectivityMonitorOptions) {
    this.options = options;
    this.current = this.compute();
  }

  getSnapshot = (): Connectivity => {
    // Outside a subscription nothing keeps `current` up to date.
    if (!this.stopSources) this.update(false);
    return this.current;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (!this.stopSources) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  private compute(): Connectivity {
    const { browser, dataLayer, live, now } = this.options;
    const state = live.getState();
    return deriveConnectivity({
      browserOnline: browser.isOnline(),
      dataLayerOnline: dataLayer.isOnline(),
      live: {
        mode: state.mode,
        connection: state.connection.state,
        attempt: state.connection.attempt,
        lastMessageAt: state.lastMessageAt,
      },
      now: now(),
    });
  }

  private update(notify = true): void {
    const next = this.compute();
    if (same(next, this.current)) return;
    this.current = next;
    if (notify) for (const listener of this.listeners) listener();
  }

  private start(): void {
    const { browser, dataLayer, live, setInterval, clearInterval } = this.options;
    const onChange = () => {
      this.update();
    };
    const unsubscribes = [
      browser.subscribe(onChange),
      dataLayer.subscribe(onChange),
      live.subscribe(onChange),
    ];
    const timer = setInterval(onChange, CONNECTIVITY.CHECK_INTERVAL_MS);
    this.stopSources = () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      clearInterval(timer);
    };
    this.update(false);
  }

  private stop(): void {
    this.stopSources?.();
    this.stopSources = null;
  }
}

/** `navigator.onLine` plus window `online`/`offline` events; reports undefined without them. */
export const browserConnectivity: BrowserConnectivitySource = {
  isOnline: () => (typeof navigator === 'undefined' ? undefined : navigator.onLine),
  subscribe: (listener) => {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener('online', listener);
    window.addEventListener('offline', listener);
    return () => {
      window.removeEventListener('online', listener);
      window.removeEventListener('offline', listener);
    };
  },
};
