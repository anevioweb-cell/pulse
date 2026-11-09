import { MutationObserver, onlineManager, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createQueryClient } from '@/shared/api';

import { API } from '../config';
import { EXAMPLE_TS } from '../model/fixtures';
import { DemoTelemetryApi } from './demo-telemetry-api';
import { telemetryKeys } from './query-keys';
import { alertRulesQuery } from './query-options';
import {
  createAlertRuleMutation,
  createDeleteAlertRuleMutation,
  createUpdateAlertRuleMutation,
  OPTIMISTIC_ID_PREFIX,
} from './rule-mutations';

import type { AlertRule, AlertRuleInput } from './contract';
import type { TelemetryApi } from './telemetry-api';
import type { QueryClient } from '@tanstack/react-query';

const NOW = EXAMPLE_TS;
const LATENCY = 100;
const rulesKey = telemetryKeys.alertRules('demo');
const input: AlertRuleInput = {
  name: 'Greenhouse humid',
  deviceId: 'esp32-07',
  metric: 'humidity',
  comparator: 'above',
  threshold: 70,
  enabled: true,
};
const fault = () => new ApiError('http', 'Injected fault', { status: 503, code: 'injected_fault' });

type Method = 'list' | 'create' | 'update' | 'delete';

/**
 * The server: a DemoTelemetryApi behind LATENCY ms of fake-timer latency, with failures injected
 * per call. Counts every call that reached it.
 */
function controlledApi() {
  let next = 0;
  const truth = new DemoTelemetryApi({
    now: () => NOW,
    ruleStorage: null,
    generateId: () => `srv-${String((next += 1))}`,
  });
  /** Per method, the outcome of each next call: an error to throw, or null to succeed. */
  const failures = new Map<Method, (ApiError | null)[]>(
    (['list', 'create', 'update', 'delete'] as const).map((method) => [method, []]),
  );
  const calls: string[] = [];
  const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY));
  const call = async <T>(method: Method, label: string, run: () => Promise<T>): Promise<T> => {
    calls.push(label);
    await delay();
    const failure = failures.get(method)?.shift();
    if (failure) throw failure;
    return run();
  };
  const api: TelemetryApi = {
    mode: 'demo',
    listDevices: (o) => truth.listDevices(o),
    getDevice: (id, o) => truth.getDevice(id, o),
    getReadings: (r, o) => truth.getReadings(r, o),
    listAlerts: (q, o) => truth.listAlerts(q, o),
    listAlertRules: (o) => call('list', 'list', () => truth.listAlertRules(o)),
    createAlertRule: (i, o) =>
      call('create', `create ${i.name}`, () => truth.createAlertRule(i, o)),
    updateAlertRule: (id, i, o) =>
      call('update', `update ${id} ${String(i.threshold)}`, () => truth.updateAlertRule(id, i, o)),
    deleteAlertRule: (id, o) => call('delete', `delete ${id}`, () => truth.deleteAlertRule(id, o)),
  };
  return { api, truth, failures, calls };
}

let client: QueryClient;
let server: ReturnType<typeof controlledApi>;
let stopObserving: () => void;

const failuresOf = (method: Method) => server.failures.get(method) ?? [];

const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const rules = () => client.getQueryData<AlertRule[]>(rulesKey) ?? [];
/** Exactly what the cache holds for the rules query: data and timestamp. */
/** The rules alone, once a refetch has replaced the timestamp. */
const data = () => JSON.stringify(rules());
const snapshot = () =>
  JSON.stringify({ data: rules(), updatedAt: client.getQueryState(rulesKey)?.dataUpdatedAt });

type Outcome<T> = { ok: true; value: T } | { ok: false; error: ApiError };

/** Starts a mutation like a component would; resolves with its outcome once settled. */
function mutate<TData, TVariables>(
  options:
    | ReturnType<typeof createUpdateAlertRuleMutation>
    | ReturnType<typeof createAlertRuleMutation>
    | ReturnType<typeof createDeleteAlertRuleMutation>,
  variables: TVariables,
): { observer: MutationObserver<TData, ApiError, TVariables>; done: Promise<Outcome<TData>> } {
  const observer = new MutationObserver(
    client,
    options as unknown as ConstructorParameters<
      typeof MutationObserver<TData, ApiError, TVariables>
    >[1],
  );
  const done = observer.mutate(variables).then(
    (value): Outcome<TData> => ({ ok: true, value }),
    (error: unknown): Outcome<TData> => {
      if (error instanceof ApiError) return { ok: false, error };
      throw error;
    },
  );
  return { observer, done };
}

const create = (i: AlertRuleInput) =>
  mutate<AlertRule, AlertRuleInput>(createAlertRuleMutation(server.api, client), i);
const update = (id: string, threshold: number) =>
  mutate<AlertRule, { id: string; input: AlertRuleInput }>(
    createUpdateAlertRuleMutation(server.api, client),
    {
      id,
      input: { ...input, threshold },
    },
  );
const remove = (id: string) =>
  mutate<null, { id: string }>(createDeleteAlertRuleMutation(server.api, client), { id });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: NOW });
  server = controlledApi();
  client = createQueryClient();
  client.mount(); // focus and reconnect handling, as QueryClientProvider does
  // An active observer, as on a rules screen: invalidation refetches it.
  stopObserving = new QueryObserver(client, alertRulesQuery(server.api)).subscribe(() => undefined);
  await flush(LATENCY);
  server.calls.length = 0;
});

afterEach(() => {
  stopObserving();
  client.unmount();
  client.clear();
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe('optimistic alert-rule mutations', () => {
  it('create: shows a temporary rule at once, then the server rule, then refetches', async () => {
    const { done } = create(input);
    await flush();
    expect(rules().at(-1)).toMatchObject(input);
    expect(rules().at(-1)?.id.startsWith(OPTIMISTIC_ID_PREFIX)).toBe(true);
    await flush(LATENCY); // POST
    await flush(LATENCY); // refetch
    const outcome = await done;
    expect(outcome).toMatchObject({ ok: true, value: { ...input, id: 'srv-3' } });
    expect(rules()).toEqual(await server.truth.listAlertRules());
    expect(server.calls).toEqual([`create ${input.name}`, 'list']);
  });

  it('update and delete appear at once and end with the server state', async () => {
    const [first, second] = rules();
    if (!first || !second) throw new Error('defaults missing');
    const updated = update(first.id, 31);
    const removed = remove(second.id);
    await flush();
    expect(rules()).toEqual([{ ...input, threshold: 31, id: first.id }]);
    await flush(3 * LATENCY);
    expect(await updated.done).toMatchObject({ ok: true });
    expect(await removed.done).toMatchObject({ ok: true });
    expect(rules()).toEqual(await server.truth.listAlertRules());
  });

  it('rolls back a create refused at the 50-rule cap (409) byte for byte', async () => {
    for (let count = rules().length; count < API.MAX_ALERT_RULES; count += 1) {
      await server.truth.createAlertRule({ ...input, name: `Rule ${String(count)}` });
    }
    const refetched = client.refetchQueries({ queryKey: rulesKey });
    await flush(LATENCY);
    await refetched;
    const before = snapshot();
    const beforeData = data();
    const { done } = create(input);
    await flush();
    expect(rules()).toHaveLength(API.MAX_ALERT_RULES + 1); // optimistic
    await flush(LATENCY);
    expect(await done).toMatchObject({
      ok: false,
      error: { kind: 'http', status: 409, code: 'limit_reached' },
    });
    expect(snapshot()).toBe(before); // rolled back: data and timestamp
    await flush(LATENCY); // the settle refetch: the server agrees
    expect(data()).toBe(beforeData);
  });

  it('never shows invalid input, and fails with a typed validation error', async () => {
    const before = snapshot();
    const beforeData = data();
    const { done } = create({ ...input, threshold: 1000 });
    await flush();
    expect(snapshot()).toBe(before);
    await flush(LATENCY); // the fake server validates after its latency; the real client before
    expect(await done).toMatchObject({
      ok: false,
      error: { kind: 'validation', code: 'invalid_request' },
    });
    await flush(LATENCY);
    expect(data()).toBe(beforeData); // after the settle refetch
  });

  it('rolls back a failed update byte for byte', async () => {
    const before = snapshot();
    const beforeData = data();
    failuresOf('update').push(fault());
    const [first] = rules();
    if (!first) throw new Error('no rule');
    const { done } = update(first.id, 31);
    await flush();
    expect(rules().at(0)?.threshold).toBe(31);
    await flush(LATENCY);
    expect(await done).toMatchObject({ ok: false, error: { status: 503 } });
    expect(snapshot()).toBe(before);
    await flush(LATENCY);
    expect(data()).toBe(beforeData);
  });

  it('puts a rule whose delete failed back where it was, byte for byte', async () => {
    const before = snapshot();
    const beforeData = data();
    failuresOf('delete').push(fault());
    const [first] = rules();
    if (!first) throw new Error('no rule');
    const { done } = remove(first.id);
    await flush();
    expect(rules().some((rule) => rule.id === first.id)).toBe(false);
    await flush(LATENCY);
    expect((await done).ok).toBe(false);
    expect(snapshot()).toBe(before);
    await flush(LATENCY);
    expect(data()).toBe(beforeData);
  });

  it('fails fast offline with a typed offline error, without pausing or sending anything', async () => {
    onlineManager.setOnline(false);
    const before = snapshot();
    const { observer, done } = create(input);
    await flush();
    expect(observer.getCurrentResult().isPaused).toBe(false);
    expect(await done).toMatchObject({
      ok: false,
      error: { kind: 'offline', code: 'offline', retryable: false },
    });
    expect(snapshot()).toBe(before);
    expect(server.calls).toEqual([]); // the settle refetch waits, paused, until back online
    onlineManager.setOnline(true);
    await flush(LATENCY);
    expect(server.calls).toEqual(['list']);
  });

  it('never retries, so a failed POST cannot create a duplicate', async () => {
    failuresOf('create').push(fault());
    const { done } = create(input);
    await flush(10 * LATENCY);
    expect((await done).ok).toBe(false);
    expect(server.calls.filter((call) => call.startsWith('create'))).toHaveLength(1);
    expect(await server.truth.listAlertRules()).toHaveLength(2);
  });

  describe('concurrent mutations of the same rule', () => {
    it('first fails, second succeeds: the second value stays', async () => {
      const [first] = rules();
      if (!first) throw new Error('no rule');
      failuresOf('update').push(fault());
      const a = update(first.id, 31);
      const b = update(first.id, 32);
      await flush();
      expect(rules().at(0)?.threshold).toBe(32);
      await flush(LATENCY); // A fails: B still owns the rule, nothing visible changes
      expect(rules().at(0)?.threshold).toBe(32);
      await flush(2 * LATENCY);
      expect((await a.done).ok).toBe(false);
      expect((await b.done).ok).toBe(true);
      expect(rules().at(0)?.threshold).toBe(32);
      expect(rules()).toEqual(await server.truth.listAlertRules());
    });

    it('both fail: the original rule is back, byte for byte', async () => {
      const before = snapshot();
      const beforeData = data();
      const [first] = rules();
      if (!first) throw new Error('no rule');
      failuresOf('update').push(fault(), fault());
      const a = update(first.id, 31);
      const b = update(first.id, 32);
      await flush(2 * LATENCY); // A fails, then B fails
      expect((await a.done).ok).toBe(false);
      expect((await b.done).ok).toBe(false);
      expect(snapshot()).toBe(before);
      await flush(LATENCY);
      expect(data()).toBe(beforeData);
    });

    it('first succeeds, second fails: the first (server) value stays', async () => {
      const [first] = rules();
      if (!first) throw new Error('no rule');
      failuresOf('update').push(null, fault());
      const a = update(first.id, 31);
      const b = update(first.id, 32);
      await flush(3 * LATENCY);
      expect((await a.done).ok).toBe(true);
      expect((await b.done).ok).toBe(false);
      expect(rules().at(0)?.threshold).toBe(31);
      expect(rules()).toEqual(await server.truth.listAlertRules());
    });
  });

  it('rolls back in the right order: a failed create does not undo a delete that succeeded', async () => {
    const [first, second] = rules();
    if (!first || !second) throw new Error('defaults missing');
    failuresOf('create').push(fault());
    const created = create(input);
    const removed = remove(second.id);
    await flush();
    expect(rules().map((rule) => rule.id)).toEqual([
      first.id,
      expect.stringMatching(/^optimistic-/) as unknown,
    ]);
    await flush(LATENCY); // create fails: only the temporary rule goes
    expect(rules().map((rule) => rule.id)).toEqual([first.id]);
    await flush(2 * LATENCY);
    expect((await created.done).ok).toBe(false);
    expect((await removed.done).ok).toBe(true);
    expect(rules()).toEqual([first]);
    expect(rules()).toEqual(await server.truth.listAlertRules());
  });

  it('cancels a refetch in flight, so its older result cannot overwrite the change', async () => {
    void client.refetchQueries({ queryKey: rulesKey });
    await flush(LATENCY / 2); // the GET is half-way
    const [first] = rules();
    if (!first) throw new Error('no rule');
    const { done } = update(first.id, 33);
    await flush(LATENCY / 2); // the old GET would have landed here
    expect(rules().at(0)?.threshold).toBe(33);
    await flush(2 * LATENCY);
    expect((await done).ok).toBe(true);
    expect(rules().at(0)?.threshold).toBe(33);
  });

  it('sends requests one at a time, in order, and refetches once after the last', async () => {
    const [first] = rules();
    if (!first) throw new Error('no rule');
    const a = create(input);
    const b = update(first.id, 34);
    const c = create({ ...input, name: 'Third' });
    await flush(LATENCY / 2);
    expect(server.calls).toEqual([`create ${input.name}`]);
    await flush(4 * LATENCY);
    await Promise.all([a.done, b.done, c.done]);
    expect(server.calls).toEqual([
      `create ${input.name}`,
      `update ${first.id} 34`,
      'create Third',
      'list',
    ]);
    expect(rules()).toEqual(await server.truth.listAlertRules());
  });

  it('sends an update of a just-created rule after the create, with the server id', async () => {
    const created = create(input);
    await flush();
    const temporaryId = rules().at(-1)?.id ?? '';
    const updated = update(temporaryId, 71);
    await flush();
    expect(rules().at(-1)).toMatchObject({ id: temporaryId, threshold: 71 });
    await flush(3 * LATENCY);
    expect((await created.done).ok).toBe(true);
    expect(await updated.done).toMatchObject({ ok: true, value: { id: 'srv-3', threshold: 71 } });
    expect(server.calls.slice(0, 2)).toEqual([`create ${input.name}`, 'update srv-3 71']);
    expect(rules()).toEqual(await server.truth.listAlertRules());
  });

  it('fails a queued change of a rule whose create failed, leaving nothing behind', async () => {
    const before = snapshot();
    failuresOf('create').push(fault());
    const created = create(input);
    await flush();
    const temporaryId = rules().at(-1)?.id ?? '';
    const updated = update(temporaryId, 71);
    await flush(LATENCY);
    expect((await created.done).ok).toBe(false);
    expect(await updated.done).toMatchObject({ ok: false, error: { code: 'unsaved_rule' } });
    expect(server.calls.filter((call) => call.startsWith('update'))).toEqual([]);
    expect(snapshot()).toBe(before);
  });
});
