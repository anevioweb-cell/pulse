import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CONNECTIVITY } from '../config';
import { exampleReading } from '../model/fixtures';
import { encodeMessage } from '../model/protocol';
import { TelemetryIngestor } from '../service/ingestor';
import { createTelemetryStore, initialTelemetryState } from '../store/telemetry-store';
import { ConnectivityMonitor, deriveConnectivity } from './connectivity';
import { useConnectivity } from './use-connectivity';

import type { ConnectionState } from '../model/connection';
import type { TelemetryMode } from '../store/telemetry-store';
import type { ConnectivitySignals, IntervalHandle } from './connectivity';

const NOW = 1_000_000;
const SILENCE = CONNECTIVITY.LIVE_SILENCE_MS;

const signals = (
  overrides: Partial<Omit<ConnectivitySignals, 'live'>> & {
    mode?: TelemetryMode | null;
    connection?: ConnectionState;
    attempt?: number;
    lastMessageAt?: number | null;
  } = {},
): ConnectivitySignals => ({
  browserOnline:
    overrides.browserOnline === undefined && 'browserOnline' in overrides
      ? undefined
      : (overrides.browserOnline ?? true),
  dataLayerOnline: overrides.dataLayerOnline ?? true,
  live: {
    mode: overrides.mode === undefined ? 'live' : overrides.mode,
    connection: overrides.connection ?? 'open',
    attempt: overrides.attempt ?? 0,
    lastMessageAt: overrides.lastMessageAt === undefined ? NOW : overrides.lastMessageAt,
  },
  now: overrides.now ?? NOW,
});

describe('deriveConnectivity rules', () => {
  it.each([
    [
      'browser offline beats everything',
      signals({ browserOnline: false }),
      'offline',
      'browser_offline',
    ],
    ['data layer offline', signals({ dataLayerOnline: false }), 'offline', 'data_layer_offline'],
    [
      'browser offline in Demo Mode',
      signals({ browserOnline: false, mode: 'demo' }),
      'offline',
      'browser_offline',
    ],
    ['live, open, fresh data', signals(), 'online', null],
    [
      'live, open, silent exactly at the limit',
      signals({ lastMessageAt: NOW - SILENCE }),
      'online',
      null,
    ],
    [
      'live, open, silent past the limit',
      signals({ lastMessageAt: NOW - SILENCE - 1 }),
      'degraded',
      'live_silent',
    ],
    ['live, open, no message yet', signals({ lastMessageAt: null }), 'unknown', 'live_connecting'],
    [
      'live, reconnecting',
      signals({ connection: 'reconnecting', attempt: 2 }),
      'degraded',
      'live_reconnecting',
    ],
    ['live, failed', signals({ connection: 'failed' }), 'degraded', 'live_failed'],
    [
      'live, first connect',
      signals({ connection: 'connecting', lastMessageAt: null }),
      'unknown',
      'live_connecting',
    ],
    [
      'live, connecting after a failure',
      signals({ connection: 'connecting', attempt: 1 }),
      'degraded',
      'live_reconnecting',
    ],
    [
      'live, idle (no session)',
      signals({ connection: 'idle', lastMessageAt: null }),
      'online',
      null,
    ],
    [
      'live, closed (session ended)',
      signals({ connection: 'closed', lastMessageAt: NOW - 10 * SILENCE }),
      'online',
      null,
    ],
    [
      'demo, silent simulator is not a network signal',
      signals({ mode: 'demo', lastMessageAt: NOW - 10 * SILENCE }),
      'online',
      null,
    ],
    [
      'no mode yet',
      signals({ mode: null, connection: 'idle', lastMessageAt: null }),
      'online',
      null,
    ],
    [
      'no navigator, no session',
      signals({ browserOnline: undefined, connection: 'idle', lastMessageAt: null }),
      'unknown',
      'no_signal',
    ],
    ['no navigator, live data flowing', signals({ browserOnline: undefined }), 'online', null],
  ] as const)('%s', (_name, input, state, reason) => {
    expect(deriveConnectivity(input)).toMatchObject({ state, reason });
  });

  it('flags Demo Mode so the UI can say demo data keeps running', () => {
    expect(deriveConnectivity(signals({ mode: 'demo', browserOnline: false })).demo).toBe(true);
    expect(deriveConnectivity(signals()).demo).toBe(false);
  });
});

/** Fake sources: browser, data layer, a real live store, a manual clock and interval. */
function harness() {
  let browserOnline: boolean | undefined = true;
  let dataLayerOnline = true;
  let now = NOW;
  let intervalCallback: (() => void) | null = null;
  const browserListeners = new Set<() => void>();
  const dataListeners = new Set<(online: boolean) => void>();
  const store = createTelemetryStore();
  const counts = { subscribed: 0 };
  const monitor = new ConnectivityMonitor({
    browser: {
      isOnline: () => browserOnline,
      subscribe: (listener) => {
        counts.subscribed += 1;
        browserListeners.add(listener);
        return () => browserListeners.delete(listener);
      },
    },
    dataLayer: {
      isOnline: () => dataLayerOnline,
      subscribe: (listener) => {
        dataListeners.add(listener);
        return () => dataListeners.delete(listener);
      },
    },
    live: store,
    now: () => now,
    setInterval: (callback) => {
      intervalCallback = callback;
      return 1 as unknown as IntervalHandle;
    },
    clearInterval: () => {
      intervalCallback = null;
    },
  });
  return {
    monitor,
    store,
    counts,
    setBrowser: (online: boolean | undefined) => {
      browserOnline = online;
      for (const listener of browserListeners) listener();
    },
    setDataLayer: (online: boolean) => {
      dataLayerOnline = online;
      for (const listener of dataListeners) listener(online);
    },
    advance: (ms: number) => {
      now += ms;
      intervalCallback?.();
    },
    hasTimer: () => intervalCallback !== null,
    listenerCount: () => browserListeners.size + dataListeners.size,
  };
}

describe('ConnectivityMonitor', () => {
  it('notifies only when the derived state changes, and keeps the same snapshot otherwise', () => {
    const h = harness();
    h.store.setState({
      ...initialTelemetryState(),
      mode: 'live',
      connection: { state: 'open', attempt: 0 },
      lastMessageAt: NOW,
    });
    let notified = 0;
    const unsubscribe = h.monitor.subscribe(() => (notified += 1));
    const first = h.monitor.getSnapshot();
    expect(first).toMatchObject({ state: 'online' });

    h.store.setState({ lastMessageAt: NOW + 10 }); // a new message: still online
    expect(notified).toBe(0);
    expect(h.monitor.getSnapshot()).toBe(first);

    h.setBrowser(false);
    expect(notified).toBe(1);
    expect(h.monitor.getSnapshot()).toMatchObject({ state: 'offline', reason: 'browser_offline' });
    h.setBrowser(true);
    h.setDataLayer(false);
    expect(h.monitor.getSnapshot()).toMatchObject({
      state: 'offline',
      reason: 'data_layer_offline',
    });
    unsubscribe();
  });

  it('turns degraded through silence alone, via its timer', () => {
    const h = harness();
    h.store.setState({
      mode: 'live',
      connection: { state: 'open', attempt: 0 },
      lastMessageAt: NOW,
    });
    const unsubscribe = h.monitor.subscribe(() => undefined);
    h.advance(SILENCE);
    expect(h.monitor.getSnapshot().state).toBe('online');
    h.advance(CONNECTIVITY.CHECK_INTERVAL_MS);
    expect(h.monitor.getSnapshot()).toMatchObject({ state: 'degraded', reason: 'live_silent' });
    unsubscribe();
  });

  it('subscribes to its sources only while someone listens', () => {
    const h = harness();
    expect(h.listenerCount()).toBe(0);
    const a = h.monitor.subscribe(() => undefined);
    const b = h.monitor.subscribe(() => undefined);
    expect(h.counts.subscribed).toBe(1);
    expect(h.hasTimer()).toBe(true);
    a();
    expect(h.hasTimer()).toBe(true);
    b();
    expect(h.listenerCount()).toBe(0);
    expect(h.hasTimer()).toBe(false);
  });

  it('powers useConnectivity, re-rendering on changes', () => {
    const h = harness();
    const { result } = renderHook(() => useConnectivity(h.monitor));
    expect(result.current.state).toBe('online');
    act(() => {
      h.setBrowser(false);
    });
    expect(result.current).toMatchObject({ state: 'offline', reason: 'browser_offline' });
    act(() => {
      h.setBrowser(true);
    });
    expect(result.current.state).toBe('online');
  });
});

describe('live store lastMessageAt', () => {
  it('is set by the ingestor for accepted messages only', () => {
    let now = NOW;
    const ingestor = new TelemetryIngestor({ now: () => now });
    ingestor.ingest('not json');
    expect(ingestor.publish(initialTelemetryState()).lastMessageAt).toBeNull();
    now += 500;
    ingestor.ingest(encodeMessage(exampleReading));
    expect(ingestor.publish(initialTelemetryState()).lastMessageAt).toBe(NOW + 500);
  });
});
