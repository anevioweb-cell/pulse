// @vitest-environment node
import { MutationObserver, onlineManager, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  alertRulesQuery,
  createAlertRuleMutation,
  createDeleteAlertRuleMutation,
  createUpdateAlertRuleMutation,
  HttpTelemetryApi,
  OPTIMISTIC_ID_PREFIX,
  telemetryKeys,
} from '@/features/telemetry';
import type { AlertRule, AlertRuleInput } from '@/features/telemetry';
import { ApiError, createQueryClient } from '@/shared/api';

import { startTelemetryServer } from './telemetry-server';

import type { TelemetryServer } from './telemetry-server';
import type { QueryClient } from '@tanstack/react-query';

// Optimistic rollback over real HTTP against the real mock server (ADR 0019). Every request gets
// LATENCY_MS of injected latency, so the optimistic state is observable while a request is in
// flight; `failNext` makes the next N requests fail with the server's injected 503.

const LATENCY_MS = 150;
const POLL_MS = 5;
const rulesKey = telemetryKeys.alertRules('live');
const input: AlertRuleInput = {
  name: 'Greenhouse humid',
  deviceId: 'esp32-07',
  metric: 'humidity',
  comparator: 'above',
  threshold: 70,
  enabled: true,
};

let server: TelemetryServer;
let client: QueryClient;
let api: HttpTelemetryApi;
let failNext = 0;
let requests = 0;
let posts = 0;
let stopObserving: () => void;

const rules = () => client.getQueryData<AlertRule[]>(rulesKey) ?? [];
const snapshot = () =>
  JSON.stringify({ data: rules(), updatedAt: client.getQueryState(rulesKey)?.dataUpdatedAt });

async function until(condition: () => boolean): Promise<void> {
  while (!condition()) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

/** What the server has, read with a separate client (never through the cache under test). */
const serverRules = () => new HttpTelemetryApi({ baseUrl: server.httpUrl }).listAlertRules();

function run(options: unknown, variables: unknown) {
  const observer = new MutationObserver(
    client,
    options as ConstructorParameters<typeof MutationObserver<unknown, ApiError, unknown>>[1],
  );
  return observer.mutate(variables).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => {
      if (error instanceof ApiError) return { ok: false as const, error };
      throw error;
    },
  );
}

beforeEach(async () => {
  failNext = 0;
  requests = 0;
  posts = 0;
  server = await startTelemetryServer({
    port: 0,
    faults: { latencyMs: LATENCY_MS, failureRate: 0.5, status: 503 },
    // random() < failureRate injects a fault: 0 fails, 1 passes.
    random: () => (failNext > 0 ? ((failNext -= 1), 0) : 1),
  });
  const counting: typeof fetch = (target, init) => {
    requests += 1;
    if (init?.method === 'POST') posts += 1;
    return fetch(target, init);
  };
  api = new HttpTelemetryApi({ baseUrl: server.httpUrl, fetch: counting });
  client = createQueryClient();
  client.mount();
  stopObserving = new QueryObserver(client, alertRulesQuery(api)).subscribe(() => undefined);
  await until(() => rules().length > 0);
});

afterEach(async () => {
  stopObserving();
  client.unmount();
  client.clear();
  onlineManager.setOnline(true);
  await server.close();
});

describe('optimistic rule mutations over HTTP with injected faults', () => {
  it('shows a create during the request, then the server rule', async () => {
    const done = run(createAlertRuleMutation(api, client), input);
    await until(() => rules().length === 3);
    expect(rules().at(-1)?.id.startsWith(OPTIMISTIC_ID_PREFIX)).toBe(true);
    const outcome = await done;
    expect(outcome.ok).toBe(true);
    await until(() => !client.isFetching());
    expect(rules()).toEqual(await serverRules());
    expect(rules().at(-1)?.id.startsWith(OPTIMISTIC_ID_PREFIX)).toBe(false);
  });

  it.each([
    ['create', () => run(createAlertRuleMutation(api, client), input)],
    [
      'update',
      () =>
        run(createUpdateAlertRuleMutation(api, client), {
          id: rules()[0]?.id ?? '',
          input: { ...input, threshold: 31 },
        }),
    ],
    ['delete', () => run(createDeleteAlertRuleMutation(api, client), { id: rules()[0]?.id ?? '' })],
  ])('rolls back a failed %s byte for byte, and the server is unchanged', async (_name, start) => {
    const before = snapshot();
    const onServer = await serverRules();
    failNext = 1;
    const done = start();
    await until(() => snapshot() !== before); // the optimistic change is visible
    const outcome = await done;
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: 'http', status: 503, code: 'injected_fault' },
    });
    expect(snapshot()).toBe(before);
    expect(await serverRules()).toEqual(onServer);
  });

  it('sends a failed POST exactly once (no retry, no duplicate)', async () => {
    failNext = 1;
    const outcome = await run(createAlertRuleMutation(api, client), input);
    expect(outcome.ok).toBe(false);
    await until(() => !client.isFetching());
    expect(posts).toBe(1);
    expect(await serverRules()).toHaveLength(2);
  });

  it('fails fast offline without sending a request, and rolls back', async () => {
    onlineManager.setOnline(false);
    const before = snapshot();
    const sent = requests;
    const outcome = await run(createAlertRuleMutation(api, client), input);
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'offline' } });
    expect(snapshot()).toBe(before);
    expect(requests).toBe(sent);
  });
});
