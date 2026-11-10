// Test doubles for the app session: they count every worker, socket, transport subscription and
// persistence handle the SessionController creates, using the real TelemetryService and transports.
import {
  createTelemetryStore,
  DemoTelemetryApi,
  HttpTelemetryApi,
  SimulatorTransport,
  TelemetryService,
  WebSocketTransport,
} from '@/features/telemetry';
import type {
  FrameScheduler,
  TelemetryTransport,
  WebSocketLike,
  WorkerLike,
} from '@/features/telemetry';

import { SessionController } from '../session/session-controller';

import type { PreferenceStorage } from '../session/preferences';
import type { SessionDependencies } from '../session/session-controller';

export class MemoryStorage implements PreferenceStorage {
  readonly values = new Map<string, string>();
  getItem = (key: string) => this.values.get(key) ?? null;
  setItem = (key: string, value: string) => {
    this.values.set(key, value);
  };
}

/** Counts live resources; every create must be matched by a release after teardown. */
export class ResourceCounter {
  workersCreated = 0;
  workersTerminated = 0;
  socketsCreated = 0;
  socketsClosed = 0;
  socketUrls: string[] = [];
  activeSubscriptions = 0;
  persistenceStarted = 0;
  persistenceStopped = 0;
  pendingFrames = new Set<() => void>();
  liveBaseUrls: string[] = [];

  get workersAlive() {
    return this.workersCreated - this.workersTerminated;
  }

  get socketsOpen() {
    return this.socketsCreated - this.socketsClosed;
  }

  get persistenceActive() {
    return this.persistenceStarted - this.persistenceStopped;
  }
}

function countingWorker(counter: ResourceCounter): WorkerLike {
  counter.workersCreated += 1;
  let terminated = false;
  return {
    postMessage: () => undefined,
    addEventListener: () => undefined,
    terminate: () => {
      if (terminated) return;
      terminated = true;
      counter.workersTerminated += 1;
    },
  };
}

function countingSocketClass(counter: ResourceCounter) {
  return class CountingSocket implements WebSocketLike {
    readyState = 0;
    private closed = false;
    constructor(url: string) {
      counter.socketsCreated += 1;
      counter.socketUrls.push(url);
    }
    send() {
      return undefined;
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.readyState = 3;
      counter.socketsClosed += 1;
    }
    addEventListener() {
      return undefined;
    }
  };
}

/** Wraps a transport so its listener subscriptions are counted. */
function countingTransport(
  inner: TelemetryTransport,
  counter: ResourceCounter,
): TelemetryTransport {
  const counted =
    <T>(subscribe: (listener: (value: T) => void) => () => void) =>
    (listener: (value: T) => void) => {
      counter.activeSubscriptions += 1;
      const unsubscribe = subscribe(listener);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        counter.activeSubscriptions -= 1;
        unsubscribe();
      };
    };
  return {
    connect: () => {
      inner.connect();
    },
    disconnect: () => {
      inner.disconnect();
    },
    getStatus: () => inner.getStatus(),
    getStats: () => inner.getStats(),
    onMessage: counted((listener) => inner.onMessage(listener)),
    onStatus: counted((listener) => inner.onStatus(listener)),
  };
}

export interface FakeSessionOptions {
  storage?: PreferenceStorage | null;
  fetch?: typeof globalThis.fetch;
  /** Persistence setup resolves only when the test calls `resolvePersistence`. */
  holdPersistence?: boolean;
}

export function createFakeSession({
  storage = new MemoryStorage(),
  fetch = () => Promise.resolve(Response.json({ devices: [] })),
  holdPersistence = false,
}: FakeSessionOptions = {}) {
  const counter = new ResourceCounter();
  const frames: FrameScheduler = {
    request: (callback) => {
      counter.pendingFrames.add(callback);
      return () => {
        counter.pendingFrames.delete(callback);
      };
    },
  };
  const store = createTelemetryStore();
  const service = new TelemetryService({
    store,
    frames,
    createDemoTransport: (options) =>
      countingTransport(
        new SimulatorTransport({ ...options, createWorker: () => countingWorker(counter) }),
        counter,
      ),
    createLiveTransport: (options) =>
      countingTransport(
        new WebSocketTransport({ ...options, WebSocketImpl: countingSocketClass(counter) }),
        counter,
      ),
  });
  const held: (() => void)[] = [];
  const deps: SessionDependencies = {
    service,
    createDemoApi: () => new DemoTelemetryApi({ ruleStorage: null }),
    createLiveApi: (baseUrl) => {
      counter.liveBaseUrls.push(baseUrl);
      return new HttpTelemetryApi({ baseUrl, fetch });
    },
    setupPersistence: () => {
      counter.persistenceStarted += 1;
      const handle = {
        stop: () => {
          counter.persistenceStopped += 1;
        },
      };
      if (!holdPersistence) return Promise.resolve(handle);
      return new Promise((resolve) => {
        held.push(() => {
          resolve(handle);
        });
      });
    },
    storage,
  };
  const controller = new SessionController(deps);
  return {
    controller,
    counter,
    store,
    storage,
    resolvePersistence: () => {
      for (const resolve of held.splice(0)) resolve();
    },
  };
}
