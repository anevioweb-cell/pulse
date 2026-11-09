import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createIdbStorage,
  createMemoryStorage,
  createQueryClient,
  migrateRecord,
  PERSISTENCE,
  persistQueryCache,
  restoreQueryCache,
  serializeQueryCache,
} from '@/shared/api';
import type { KeyValueStorage } from '@/shared/api';

import { API } from '../config';
import { EXAMPLE_TS } from '../model/fixtures';
import { DemoTelemetryApi } from './demo-telemetry-api';
import { setupTelemetryPersistence, telemetryPersistPolicy } from './persistence';
import { telemetryKeys } from './query-keys';

import type { QueryClient } from '@tanstack/react-query';

const HOUR = 3_600_000;
const NOW = EXAMPLE_TS + 10 * 24 * HOUR;
const NAMESPACE = 'telemetry.demo';
const STORAGE_KEY = `pulse.query-cache.${NAMESPACE}`;

const demo = new DemoTelemetryApi({ now: () => NOW, generateId: () => 'rule-1' });
const readingsRange = { metric: 'temperature', from: NOW - HOUR, to: NOW } as const;

async function populatedClient(updatedAt = NOW - 1000): Promise<QueryClient> {
  const client = createQueryClient();
  client.setQueryData(telemetryKeys.deviceList('demo'), await demo.listDevices(), { updatedAt });
  client.setQueryData(
    telemetryKeys.readings('demo', 'esp32-01', readingsRange),
    await demo.getReadings({ deviceId: 'esp32-01', ...readingsRange }),
    { updatedAt },
  );
  client.setQueryData(telemetryKeys.alertRules('demo'), await demo.listAlertRules(), { updatedAt });
  // Not persistable: detail (superseded by live data) and alert history (time-sensitive).
  client.setQueryData(telemetryKeys.device('demo', 'esp32-01'), await demo.getDevice('esp32-01'), {
    updatedAt,
  });
  client.setQueryData(
    telemetryKeys.alertHistory('demo', { from: NOW - HOUR, to: NOW }),
    { alerts: [], truncated: false },
    { updatedAt },
  );
  return client;
}

const options = (client: QueryClient, storage: KeyValueStorage | null, overrides = {}) => ({
  client,
  storage,
  namespace: NAMESPACE,
  buster: API.PERSISTED_CACHE_BUSTER,
  policy: telemetryPersistPolicy('demo'),
  now: () => NOW,
  ...overrides,
});

async function stored(client: QueryClient, overrides = {}) {
  const storage = createMemoryStorage();
  await storage.set(STORAGE_KEY, serializeQueryCache(options(client, storage, overrides)));
  return storage;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('persisted query cache', () => {
  it('round-trips only the allowed resources', async () => {
    const storage = await stored(await populatedClient());
    const target = createQueryClient();
    const report = await restoreQueryCache(options(target, storage));

    expect(report).toEqual({ status: 'restored', restored: 3, skipped: 0 });
    expect(target.getQueryData(telemetryKeys.deviceList('demo'))).toEqual(await demo.listDevices());
    expect(target.getQueryData(telemetryKeys.alertRules('demo'))).toEqual(
      await demo.listAlertRules(),
    );
    expect(target.getQueryData(telemetryKeys.device('demo', 'esp32-01'))).toBeUndefined();
    expect(
      target.getQueryData(telemetryKeys.alertHistory('demo', { from: NOW - HOUR, to: NOW })),
    ).toBeUndefined();
    // Restored data keeps its original timestamp, so freshness rules still apply.
    expect(target.getQueryState(telemetryKeys.deviceList('demo'))?.dataUpdatedAt).toBe(NOW - 1000);
  });

  it('writes after a debounce and stops when asked', async () => {
    vi.useFakeTimers({ now: NOW });
    const client = await populatedClient();
    const storage = createMemoryStorage();
    const stop = persistQueryCache(options(client, storage));
    client.setQueryData(telemetryKeys.alertRules('demo'), [], { updatedAt: NOW });
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
    await vi.advanceTimersByTimeAsync(PERSISTENCE.WRITE_DEBOUNCE_MS);
    expect(storage.data.has(STORAGE_KEY)).toBe(true);

    stop();
    storage.data.clear();
    client.setQueryData(telemetryKeys.alertRules('demo'), [], { updatedAt: NOW + 1 });
    await vi.advanceTimersByTimeAsync(PERSISTENCE.WRITE_DEBOUNCE_MS * 2);
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
  });

  it('migrates a v1 record to the current version', async () => {
    const devices = await demo.listDevices();
    const v1 = {
      version: 1,
      buster: API.PERSISTED_CACHE_BUSTER,
      entries: [
        {
          queryHash: 'hash',
          key: telemetryKeys.deviceList('demo'),
          updatedAt: NOW - 5,
          data: devices,
        },
      ],
    };
    expect(migrateRecord(v1)).toEqual({
      version: PERSISTENCE.SCHEMA_VERSION,
      buster: API.PERSISTED_CACHE_BUSTER,
      savedAt: NOW - 5,
      entries: [{ key: telemetryKeys.deviceList('demo'), updatedAt: NOW - 5, data: devices }],
    });

    const storage = createMemoryStorage();
    await storage.set(STORAGE_KEY, JSON.stringify(v1));
    const target = createQueryClient();
    expect(await restoreQueryCache(options(target, storage))).toEqual({
      status: 'restored',
      restored: 1,
      skipped: 0,
    });
    expect(target.getQueryData(telemetryKeys.deviceList('demo'))).toEqual(devices);
  });

  it.each([
    [
      'future version',
      { version: 99, buster: API.PERSISTED_CACHE_BUSTER, savedAt: NOW, entries: [] },
      'version',
    ],
    [
      'unknown old version',
      { version: 0, buster: API.PERSISTED_CACHE_BUSTER, entries: [] },
      'version',
    ],
    ['broken v1', { version: 1, entries: 'nope' }, 'version'],
    [
      'other buster',
      { version: PERSISTENCE.SCHEMA_VERSION, buster: 'old-build', savedAt: NOW, entries: [] },
      'buster',
    ],
    [
      'extra field',
      {
        version: PERSISTENCE.SCHEMA_VERSION,
        buster: API.PERSISTED_CACHE_BUSTER,
        savedAt: NOW,
        entries: [],
        x: 1,
      },
      'invalid',
    ],
  ])('discards and deletes a record with a %s', async (_name, record, reason) => {
    const storage = createMemoryStorage();
    await storage.set(STORAGE_KEY, JSON.stringify(record));
    expect(await restoreQueryCache(options(createQueryClient(), storage))).toEqual({
      status: 'discarded',
      reason,
    });
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
  });

  it.each([
    ['not a string', { an: 'object' }],
    ['invalid JSON', '{"version":'],
    ['prototype pollution', '{"__proto__":{"polluted":true},"version":2}'],
  ])('discards corrupt data (%s) without throwing', async (_name, value) => {
    const storage = createMemoryStorage();
    storage.data.set(STORAGE_KEY, value);
    expect(await restoreQueryCache(options(createQueryClient(), storage))).toEqual({
      status: 'discarded',
      reason: 'invalid',
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('skips invalid, hostile, too old, future or other-mode entries and keeps the rest', async () => {
    const devices = await demo.listDevices();
    const record = {
      version: PERSISTENCE.SCHEMA_VERSION,
      buster: API.PERSISTED_CACHE_BUSTER,
      savedAt: NOW,
      entries: [
        { key: telemetryKeys.deviceList('demo'), updatedAt: NOW - 1, data: devices },
        {
          key: telemetryKeys.alertRules('demo'),
          updatedAt: NOW - 1,
          data: [{ id: 'x', admin: true }],
        },
        {
          key: telemetryKeys.deviceList('demo'),
          updatedAt: NOW - 1,
          data: [{ ...devices[0], id: '<img src=x onerror=alert(1)>' }],
        },
        {
          key: telemetryKeys.alertRules('demo'),
          updatedAt: NOW - PERSISTENCE.MAX_AGE_MS - 1,
          data: [],
        },
        { key: telemetryKeys.alertRules('demo'), updatedAt: NOW + HOUR, data: [] },
        { key: telemetryKeys.deviceList('live'), updatedAt: NOW - 1, data: devices },
        {
          key: telemetryKeys.device('demo', 'esp32-01'),
          updatedAt: NOW - 1,
          data: await demo.getDevice('esp32-01'),
        },
      ],
    };
    const storage = createMemoryStorage();
    await storage.set(STORAGE_KEY, JSON.stringify(record));
    const target = createQueryClient();
    expect(await restoreQueryCache(options(target, storage))).toEqual({
      status: 'restored',
      restored: 1,
      skipped: 6,
    });
    expect(target.getQueryData(telemetryKeys.deviceList('live'))).toBeUndefined();
  });

  it('discards oversized records and evicts the oldest entries when writing', async () => {
    const storage = createMemoryStorage();
    storage.data.set(STORAGE_KEY, 'x'.repeat(PERSISTENCE.MAX_BYTES + 1));
    expect(await restoreQueryCache(options(createQueryClient(), storage))).toEqual({
      status: 'discarded',
      reason: 'too_large',
    });

    const client = createQueryClient();
    for (let index = 0; index < 20; index += 1) {
      const range = { metric: 'humidity', from: NOW - HOUR - index, to: NOW } as const;
      client.setQueryData(
        telemetryKeys.readings('demo', 'esp32-01', range),
        await demo.getReadings({ deviceId: 'esp32-01', ...range }),
        { updatedAt: NOW - 1000 + index },
      );
    }
    const maxBytes = 40_000;
    const text = serializeQueryCache(options(client, storage, { limits: { maxBytes } }));
    const record = JSON.parse(text) as { entries: { updatedAt: number }[] };
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(maxBytes);
    expect(record.entries.length).toBeGreaterThan(0);
    expect(record.entries.length).toBeLessThan(20);
    expect(record.entries[0]?.updatedAt).toBe(NOW - 1000 + 19); // newest kept first

    const capped = JSON.parse(
      serializeQueryCache(options(client, storage, { limits: { maxEntries: 3 } })),
    ) as {
      entries: unknown[];
    };
    expect(capped.entries).toHaveLength(3);
  });

  it('degrades to memory-only when storage is unavailable, failing or hanging', async () => {
    expect(createIdbStorage()).toBeNull(); // jsdom has no IndexedDB
    expect(await restoreQueryCache(options(createQueryClient(), null))).toEqual({
      status: 'unavailable',
    });

    const failing: KeyValueStorage = {
      get: () => Promise.reject(new DOMException('blocked', 'InvalidStateError')),
      set: () => Promise.reject(new DOMException('full', 'QuotaExceededError')),
      del: () => Promise.reject(new Error('no')),
    };
    expect(await restoreQueryCache(options(createQueryClient(), failing))).toEqual({
      status: 'discarded',
      reason: 'storage_error',
    });

    vi.useFakeTimers({ now: NOW });
    const hanging: KeyValueStorage = {
      get: () => new Promise(() => undefined),
      set: () => Promise.resolve(),
      del: () => Promise.resolve(),
    };
    const pending = restoreQueryCache(options(createQueryClient(), hanging));
    await vi.advanceTimersByTimeAsync(PERSISTENCE.IO_TIMEOUT_MS);
    expect(await pending).toEqual({ status: 'discarded', reason: 'storage_error' });
  });

  it('stops writing after a quota error, silently', async () => {
    vi.useFakeTimers({ now: NOW });
    const set = vi.fn(() => Promise.reject(new DOMException('full', 'QuotaExceededError')));
    const client = await populatedClient();
    persistQueryCache(
      options(client, { get: () => Promise.resolve(undefined), set, del: () => Promise.resolve() }),
    );
    client.setQueryData(telemetryKeys.alertRules('demo'), [], { updatedAt: NOW });
    await vi.advanceTimersByTimeAsync(PERSISTENCE.WRITE_DEBOUNCE_MS);
    client.setQueryData(telemetryKeys.alertRules('demo'), [], { updatedAt: NOW + 1 });
    await vi.advanceTimersByTimeAsync(PERSISTENCE.WRITE_DEBOUNCE_MS);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('keeps demo and live records apart', async () => {
    const storage = createMemoryStorage();
    const client = await populatedClient();
    const demoSession = await setupTelemetryPersistence({
      client,
      mode: 'demo',
      storage,
      now: () => NOW,
    });
    demoSession.stop();
    await storage.set(STORAGE_KEY, serializeQueryCache(options(client, storage)));

    const live = createQueryClient();
    const liveSession = await setupTelemetryPersistence({
      client: live,
      mode: 'live',
      storage,
      now: () => NOW,
    });
    liveSession.stop();
    expect(liveSession.report).toEqual({ status: 'empty' });
    expect(live.getQueryCache().getAll()).toHaveLength(0);
    expect([...storage.data.keys()]).toEqual([STORAGE_KEY]);
  });
});
