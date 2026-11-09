import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMemoryStorage, createQueryClient, PERSISTENCE } from '@/shared/api';
import type { KeyValueStorage } from '@/shared/api';

import { EXAMPLE_TS } from '../model/fixtures';
import { TelemetryApiProvider } from './api-context';
import { DemoTelemetryApi } from './demo-telemetry-api';
import { useAlertRules } from './hooks';
import { setupTelemetryPersistence } from './persistence';
import { telemetryKeys } from './query-keys';
import { alertRulesQuery } from './query-options';

import type { AlertRule } from './contract';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ADR 0018: in Demo Mode the DemoTelemetryApi (backed by its own IndexedDB record) is the source
// of truth for alert rules, and the persisted query cache is only a fast first paint. A reload is
// simulated with a new QueryClient and a new API instance over the same two storages.

const NOW = EXAMPLE_TS;
const ruleKey = telemetryKeys.alertRules('demo');
const input = {
  name: 'Greenhouse humid',
  deviceId: 'esp32-07',
  metric: 'humidity',
  comparator: 'above',
  threshold: 70,
  enabled: true,
} as const;

const clients: QueryClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.useRealTimers();
});

/** One "page load": a fresh QueryClient with persistence restored, and a fresh DemoTelemetryApi. */
async function load(storages: { rules: KeyValueStorage | null; cache: KeyValueStorage }) {
  const client = createQueryClient();
  clients.push(client);
  const api = new DemoTelemetryApi({ now: () => NOW, ruleStorage: storages.rules });
  const persistence = await setupTelemetryPersistence({
    client,
    mode: 'demo',
    storage: storages.cache,
    now: () => NOW,
  });
  return { client, api, ...persistence };
}

/** The first session: create, update and delete rules, keeping the cache in sync like the UI. */
async function editRules(session: Awaited<ReturnType<typeof load>>) {
  const { client, api } = session;
  await client.query(alertRulesQuery(api));
  const created = await api.createAlertRule(input);
  await api.createAlertRule({ ...input, name: 'Second', threshold: 80 });
  await api.updateAlertRule(created.id, { ...input, threshold: 75 });
  const [firstDefault] = await api.listAlertRules();
  if (!firstDefault) throw new Error('no default rule');
  await api.deleteAlertRule(firstDefault.id);
  await client.refetchQueries({ queryKey: ruleKey });
  // Let the debounced cache write happen.
  await vi.advanceTimersByTimeAsync(PERSISTENCE.WRITE_DEBOUNCE_MS);
  session.stop();
  return client.getQueryData<AlertRule[]>(ruleKey);
}

describe('Demo alert rules across a reload', () => {
  it('restores the same rules into the cache and the API', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: NOW });
    const storages = { rules: createMemoryStorage(), cache: createMemoryStorage() };
    const before = await editRules(await load(storages));
    expect(before).toHaveLength(3); // 2 defaults - 1 deleted + 2 created

    const after = await load(storages);
    expect(after.report).toMatchObject({ status: 'restored' });
    const cached = after.client.getQueryData<AlertRule[]>(ruleKey);
    expect(cached).toEqual(before);
    expect(await after.api.listAlertRules()).toEqual(cached);
  });

  it('control: without rule persistence the restored cache disagrees with the API', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: NOW });
    const storages = { rules: null, cache: createMemoryStorage() };
    const before = await editRules(await load(storages));
    const after = await load(storages);
    expect(after.client.getQueryData(ruleKey)).toEqual(before);
    expect(await after.api.listAlertRules()).not.toEqual(before);
  });

  it('revalidates restored rules on mount even though they are fresh, so the API wins', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: NOW });
    const storages = { rules: createMemoryStorage(), cache: createMemoryStorage() };
    await editRules(await load(storages));
    const after = await load(storages);
    // Another tab changed the rules after this cache was written.
    const otherTab = new DemoTelemetryApi({ now: () => NOW, ruleStorage: storages.rules });
    const extra = await otherTab.createAlertRule({ ...input, name: 'From another tab' });
    // This page's API instance reads storage once, so give it a fresh instance as a reload would.
    const api = new DemoTelemetryApi({ now: () => NOW, ruleStorage: storages.rules });
    const listSpy = vi.spyOn(api, 'listAlertRules');

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={after.client}>
        <TelemetryApiProvider api={api}>{children}</TelemetryApiProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useAlertRules(), { wrapper });
    expect(result.current.isStale).toBe(false); // restored within staleTime...
    expect(result.current.data).not.toContainEqual(extra); // ...and shown at once
    // waitFor polls with setTimeout, which is faked here: flush with fake time instead.
    for (
      let step = 0;
      step < 5 && !result.current.data?.some((r) => r.id === extra.id);
      step += 1
    ) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    }
    expect(result.current.data).toContainEqual(extra);
    expect(listSpy).toHaveBeenCalledTimes(1); // ...but refetched on mount anyway
    expect(result.current.data).toEqual(await api.listAlertRules());
  });
});
