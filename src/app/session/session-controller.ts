import {
  createTelemetryQueryClient,
  DemoTelemetryApi,
  HttpTelemetryApi,
  setupTelemetryPersistence,
  telemetryService,
} from '@/features/telemetry';
import type { TelemetryApi, TelemetryMode, TelemetryService } from '@/features/telemetry';

import {
  browserPreferenceStorage,
  readPreferences,
  validateLiveUrl,
  writePreferences,
} from './preferences';

import type {
  LiveUrlProblem,
  PreferenceIssue,
  Preferences,
  PreferenceStorage,
} from './preferences';
import type { QueryClient } from '@tanstack/react-query';

/** One mode's running pieces. A new session (new id) is built for every mode or URL change. */
export interface AppSession {
  readonly id: number;
  readonly mode: TelemetryMode;
  readonly api: TelemetryApi;
  readonly client: QueryClient;
}

export interface SessionSnapshot {
  readonly session: AppSession;
  readonly preferences: Preferences;
  /** Why the stored preference was not used at startup, if it was not. */
  readonly preferenceIssue: PreferenceIssue | null;
}

export type ApplyResult = { ok: true } | { ok: false; problem: LiveUrlProblem };

/** Everything the controller creates or drives, injectable so tests can count it. */
export interface SessionDependencies {
  service: Pick<TelemetryService, 'start' | 'stop'>;
  createDemoApi: () => TelemetryApi;
  /** `restBaseUrl` is the http(s) origin of the Live WebSocket URL. */
  createLiveApi: (restBaseUrl: string) => TelemetryApi;
  setupPersistence: (client: QueryClient, mode: TelemetryMode) => Promise<{ stop: () => void }>;
  storage: PreferenceStorage | null;
}

export const defaultSessionDependencies = (): SessionDependencies => ({
  service: telemetryService,
  createDemoApi: () => new DemoTelemetryApi(),
  createLiveApi: (baseUrl) => new HttpTelemetryApi({ baseUrl }),
  setupPersistence: (client, mode) => setupTelemetryPersistence({ client, mode }),
  storage: browserPreferenceStorage(),
});

const REST_PROTOCOL_FOR = new Map([
  ['ws:', 'http:'],
  ['wss:', 'https:'],
]);

/**
 * The REST API lives on the same host and port as the WebSocket (the mock server serves both), so
 * Live Mode derives it: ws://host:port → http://host:port, wss → https. Path and query are dropped.
 */
export function restBaseUrlFor(liveUrl: string): string {
  const url = new URL(liveUrl);
  url.protocol = REST_PROTOCOL_FOR.get(url.protocol) ?? url.protocol;
  return url.origin;
}

type Listener = () => void;

/**
 * The single place that composes the app for a mode: it builds the active TelemetryApi, the
 * QueryClient for it (network mode from the API), starts the live session and the query-cache
 * persistence, and tears all of it down before the next mode starts. React reads it with
 * `useSyncExternalStore`; nothing here depends on React, so StrictMode's double effects cannot
 * start anything twice.
 */
export class SessionController {
  private readonly deps: SessionDependencies;
  private readonly listeners = new Set<Listener>();
  private snapshot: SessionSnapshot;
  private nextId = 1;
  private started = false;
  /** Stops the active session's persistence; replaced on every start. */
  private stopPersistence: (() => void) | null = null;

  constructor(deps: SessionDependencies = defaultSessionDependencies()) {
    this.deps = deps;
    const { preferences, issue } = readPreferences(deps.storage);
    this.snapshot = {
      session: this.build(preferences),
      preferences,
      preferenceIssue: issue,
    };
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SessionSnapshot => this.snapshot;

  /** Starts the current session (idempotent). */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.run(this.snapshot.session, this.snapshot.preferences);
  }

  /**
   * Applies a new mode and URL. In Live Mode an invalid URL is returned as a problem (never thrown)
   * and changes nothing. Only a change of mode, or of URL while in Live Mode, replaces the session.
   */
  apply(next: Preferences): ApplyResult {
    const url = validateLiveUrl(next.liveUrl);
    if (!url.ok && next.mode === 'live') return url;
    // Demo Mode does not use the URL: an invalid one keeps the stored Live URL.
    const liveUrl = url.ok ? url.url : this.snapshot.preferences.liveUrl;
    const preferences: Preferences = { mode: next.mode, liveUrl };
    writePreferences(this.deps.storage, preferences);
    const current = this.snapshot;
    const restart =
      preferences.mode !== current.session.mode ||
      (preferences.mode === 'live' && preferences.liveUrl !== current.preferences.liveUrl);
    if (!restart) {
      this.publish({ ...current, preferences });
      return { ok: true };
    }
    this.teardown(current.session);
    const session = this.build(preferences);
    if (this.started) this.run(session, preferences);
    this.publish({ session, preferences, preferenceIssue: null });
    return { ok: true };
  }

  /** Stops everything (tests, hot module replacement). */
  dispose(): void {
    this.teardown(this.snapshot.session);
    this.started = false;
  }

  /* ----------------------------------------------- internals ----------------------------------- */

  private build(preferences: Preferences): AppSession {
    const api =
      preferences.mode === 'demo'
        ? this.deps.createDemoApi()
        : this.deps.createLiveApi(restBaseUrlFor(preferences.liveUrl));
    const id = this.nextId;
    this.nextId += 1;
    return { id, mode: preferences.mode, api, client: createTelemetryQueryClient(api) };
  }

  private run(session: AppSession, preferences: Preferences): void {
    this.deps.service.start(
      session.mode === 'demo' ? { mode: 'demo' } : { mode: 'live', url: preferences.liveUrl },
    );
    let stopped = false;
    let stop: (() => void) | null = null;
    this.stopPersistence = () => {
      stopped = true;
      stop?.();
    };
    void this.deps.setupPersistence(session.client, session.mode).then((handle) => {
      // The session may have ended while the cache was being restored.
      if (stopped) handle.stop();
      else stop = handle.stop;
    });
  }

  private teardown(session: AppSession): void {
    this.stopPersistence?.();
    this.stopPersistence = null;
    this.deps.service.stop();
    void session.client.cancelQueries();
    session.client.clear();
  }

  private publish(snapshot: SessionSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
