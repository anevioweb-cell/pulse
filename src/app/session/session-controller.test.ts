import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deviceListQuery } from '@/features/telemetry';

import { PREFERENCES } from '../config';
import { createFakeSession, MemoryStorage } from '../testing/session-fakes';
import { DEFAULT_PREFERENCES, readPreferences } from './preferences';
import { restBaseUrlFor } from './session-controller';

import type { PreferenceStorage } from './preferences';

const LIVE_URL = 'ws://127.0.0.1:9000/stream?x=1';

function storedWith(record: unknown): MemoryStorage {
  const storage = new MemoryStorage();
  storage.setItem(
    PREFERENCES.STORAGE_KEY,
    typeof record === 'string' ? record : JSON.stringify(record),
  );
  return storage;
}

const liveRecord = { version: PREFERENCES.SCHEMA_VERSION, mode: 'live', liveUrl: LIVE_URL };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  onlineManager.setOnline(true);
});

describe('SessionController bootstrap', () => {
  it('starts in Demo Mode by default: one simulator worker, no socket', () => {
    const { controller, counter, store } = createFakeSession();
    const { session, preferences, preferenceIssue } = controller.getSnapshot();
    expect(preferences).toEqual(DEFAULT_PREFERENCES);
    expect(preferenceIssue).toBeNull();
    expect(session.mode).toBe('demo');
    expect(session.api.mode).toBe('demo');
    expect(session.client.getDefaultOptions().queries?.networkMode).toBe('always');
    expect(counter.workersCreated).toBe(0); // nothing runs before start()

    controller.start();
    controller.start(); // idempotent
    expect(counter.workersAlive).toBe(1);
    expect(counter.socketsCreated).toBe(0);
    expect(counter.persistenceActive).toBe(1);
    expect(store.getState().mode).toBe('demo');
    controller.dispose();
  });

  it('starts in Live Mode from a stored preference: one socket, REST on the same origin', () => {
    const { controller, counter, store } = createFakeSession({ storage: storedWith(liveRecord) });
    controller.start();
    const { session } = controller.getSnapshot();
    expect(session.mode).toBe('live');
    expect(session.client.getDefaultOptions().queries?.networkMode).toBe('online');
    expect(counter.socketUrls).toEqual([LIVE_URL]);
    expect(counter.liveBaseUrls).toEqual(['http://127.0.0.1:9000']);
    expect(counter.workersCreated).toBe(0);
    expect(store.getState().mode).toBe('live');
    controller.dispose();
  });

  it('derives the REST origin from ws: and wss: URLs', () => {
    expect(restBaseUrlFor('ws://localhost:8787')).toBe('http://localhost:8787');
    expect(restBaseUrlFor('wss://pulse.example/ws?token=no')).toBe('https://pulse.example');
  });
});

describe('SessionController teardown on mode switch', () => {
  it('leaves no worker, socket, subscription, timer, frame or query data from the previous mode', async () => {
    const { controller, counter } = createFakeSession();
    controller.start();
    const demo = controller.getSnapshot().session;
    await demo.client.query(deviceListQuery(demo.api));
    expect(demo.client.getQueryCache().getAll()).toHaveLength(1);
    expect(counter.activeSubscriptions).toBe(2); // onMessage + onStatus

    expect(controller.apply({ mode: 'live', liveUrl: LIVE_URL })).toEqual({ ok: true });
    const live = controller.getSnapshot().session;
    expect(live.id).not.toBe(demo.id);
    expect(live.client).not.toBe(demo.client);
    expect(demo.client.getQueryCache().getAll()).toHaveLength(0);
    expect(counter.workersAlive).toBe(0);
    expect(counter.socketsOpen).toBe(1);
    expect(counter.activeSubscriptions).toBe(2);
    expect(counter.persistenceActive).toBe(1);

    expect(controller.apply({ mode: 'demo', liveUrl: LIVE_URL })).toEqual({ ok: true });
    expect(counter.socketsOpen).toBe(0);
    expect(counter.workersAlive).toBe(1);
    expect(counter.workersCreated).toBe(2);
    expect(counter.activeSubscriptions).toBe(2);
    // The live persistence handle arrives a microtask later and is stopped on arrival.
    await vi.advanceTimersByTimeAsync(0);
    expect(counter.persistenceActive).toBe(1);

    controller.dispose();
    expect(counter.workersAlive).toBe(0);
    expect(counter.socketsOpen).toBe(0);
    expect(counter.activeSubscriptions).toBe(0);
    expect(counter.persistenceActive).toBe(0);
    expect(counter.pendingFrames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the session when nothing that matters changed', () => {
    const { controller, counter } = createFakeSession();
    controller.start();
    const before = controller.getSnapshot().session;
    controller.apply({ mode: 'demo', liveUrl: 'ws://elsewhere:1' });
    expect(controller.getSnapshot().session).toBe(before);
    expect(controller.getSnapshot().preferences.liveUrl).toBe('ws://elsewhere:1/');
    expect(counter.workersCreated).toBe(1);
    controller.dispose();
  });

  it('restarts Live Mode when only the URL changes', () => {
    const { controller, counter } = createFakeSession({ storage: storedWith(liveRecord) });
    controller.start();
    controller.apply({ mode: 'live', liveUrl: 'wss://other.example' });
    expect(counter.socketsCreated).toBe(2);
    expect(counter.socketsOpen).toBe(1);
    expect(counter.liveBaseUrls.at(-1)).toBe('https://other.example');
    controller.dispose();
  });

  it('stops persistence that finishes restoring after its session ended', async () => {
    const fake = createFakeSession({ holdPersistence: true });
    fake.controller.start();
    fake.controller.apply({ mode: 'live', liveUrl: LIVE_URL });
    expect(fake.counter.persistenceStopped).toBe(0);
    fake.resolvePersistence();
    await vi.advanceTimersByTimeAsync(0);
    // The demo handle arrived after its session ended and was stopped at once; live keeps going.
    expect(fake.counter.persistenceStopped).toBe(1);
    fake.controller.dispose();
    expect(fake.counter.persistenceActive).toBe(0);
  });

  it('notifies subscribers once per change', () => {
    const { controller } = createFakeSession();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.apply({ mode: 'live', liveUrl: LIVE_URL });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    controller.apply({ mode: 'demo', liveUrl: LIVE_URL });
    expect(listener).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
});

describe('invalid Live URLs surface as problems, never as exceptions', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['not a url', 'invalid_url'],
    ['http://127.0.0.1:8787', 'unsupported_scheme'],
    ['javascript:alert(1)', 'unsupported_scheme'],
    ['ws://user:secret@127.0.0.1:8787', 'credentials_in_url'],
    [`ws://${'a'.repeat(PREFERENCES.MAX_URL_LENGTH)}`, 'too_long'],
  ])('%j → %s, and nothing changes', (liveUrl, problem) => {
    const { controller, counter, storage } = createFakeSession();
    controller.start();
    const before = controller.getSnapshot();
    expect(() => controller.apply({ mode: 'live', liveUrl })).not.toThrow();
    expect(controller.apply({ mode: 'live', liveUrl })).toEqual({ ok: false, problem });
    expect(controller.getSnapshot()).toBe(before);
    expect(counter.socketsCreated).toBe(0);
    expect(storage?.getItem(PREFERENCES.STORAGE_KEY)).toBeNull();
    controller.dispose();
  });
});

describe('stored preference', () => {
  it('is written on apply and read back', () => {
    const storage = new MemoryStorage();
    const { controller } = createFakeSession({ storage });
    controller.apply({ mode: 'live', liveUrl: ' wss://pulse.example/ ' });
    expect(readPreferences(storage)).toEqual({
      preferences: { mode: 'live', liveUrl: 'wss://pulse.example/' },
      issue: null,
    });
    controller.dispose();
  });

  it.each<[string, unknown]>([
    ['not JSON', '{mode: live'],
    ['an array', '[]'],
    [
      'a prototype key',
      `{"__proto__":{"mode":"live"},"version":1,"mode":"live","liveUrl":"ws://a"}`,
    ],
    ['an unknown version', { ...liveRecord, version: 2 }],
    ['an unknown mode', { ...liveRecord, mode: 'admin' }],
    ['an extra key', { ...liveRecord, isAdmin: true }],
    ['a wrong type', { ...liveRecord, liveUrl: 42 }],
    ['an http URL', { ...liveRecord, liveUrl: 'http://127.0.0.1:8787' }],
    ['credentials in the URL', { ...liveRecord, liveUrl: 'ws://u:p@127.0.0.1:8787' }],
    ['an oversized record', 'x'.repeat(PREFERENCES.MAX_RECORD_LENGTH + 1)],
  ])('falls back to Demo Mode for %s', (_name, record) => {
    const { controller, counter } = createFakeSession({ storage: storedWith(record) });
    controller.start();
    const snapshot = controller.getSnapshot();
    expect(snapshot.session.mode).toBe('demo');
    expect(snapshot.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(snapshot.preferenceIssue).toBe('invalid');
    expect(counter.socketsCreated).toBe(0);
    controller.dispose();
  });

  it('falls back to Demo Mode when storage throws or is missing, and keeps working', () => {
    const throwing: PreferenceStorage = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    for (const storage of [throwing, null]) {
      const { controller } = createFakeSession({ storage });
      controller.start();
      expect(controller.getSnapshot().session.mode).toBe('demo');
      expect(controller.getSnapshot().preferenceIssue).toBe('unavailable');
      expect(controller.apply({ mode: 'live', liveUrl: LIVE_URL })).toEqual({ ok: true });
      expect(controller.getSnapshot().session.mode).toBe('live');
      controller.dispose();
    }
  });
});
