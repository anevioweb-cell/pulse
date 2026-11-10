import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createQueryClient, RETRY } from '@/shared/api';

import { QUERY_POLICY } from '../config';
import { EXAMPLE_TS } from '../model/fixtures';
import { TelemetryApiProvider } from './api-context';
import { DemoTelemetryApi } from './demo-telemetry-api';
import {
  useAlertRules,
  useCreateAlertRule,
  useDeleteAlertRule,
  useDevice,
  useDevices,
  useHistoricalReadings,
  useUpdateAlertRule,
} from './hooks';
import { telemetryKeys } from './query-keys';

import type { TelemetryApi } from './telemetry-api';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const HOUR = 3_600_000;
const NOW = EXAMPLE_TS + 10 * 24 * HOUR;

function setup(api: TelemetryApi) {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <TelemetryApiProvider api={api}>{children}</TelemetryApiProvider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

/** Flushes promises and React updates, advancing fake time by `ms`. */
async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** A TelemetryApi whose methods are all vi.fn() stubs, starting from the demo implementation. */
function stubApi(overrides: Partial<TelemetryApi>): TelemetryApi {
  const demo = new DemoTelemetryApi({ now: () => NOW });
  return {
    mode: 'live',
    requiresNetwork: true,
    listDevices: (options) => demo.listDevices(options),
    getDevice: (id, options) => demo.getDevice(id, options),
    getReadings: (request, options) => demo.getReadings(request, options),
    listAlerts: (query, options) => demo.listAlerts(query, options),
    listAlertRules: (options) => demo.listAlertRules(options),
    createAlertRule: (input, options) => demo.createAlertRule(input, options),
    updateAlertRule: (id, input, options) => demo.updateAlertRule(id, input, options),
    deleteAlertRule: (id, options) => demo.deleteAlertRule(id, options),
    ...overrides,
  };
}

let client: QueryClient | null = null;

afterEach(() => {
  client?.clear();
  client = null;
  vi.useRealTimers();
});

describe('telemetry query hooks', () => {
  it('goes from loading to typed success data', async () => {
    vi.useFakeTimers({ now: NOW });
    const setupResult = setup(new DemoTelemetryApi({ now: () => NOW }));
    client = setupResult.client;
    const { result } = renderHook(() => useDevices(), { wrapper: setupResult.wrapper });
    expect(result.current.isPending).toBe(true);
    await settle();
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toHaveLength(12);
  });

  it('does not retry 4xx errors and exposes them typed', async () => {
    vi.useFakeTimers({ now: NOW });
    const getDevice = vi.fn(() =>
      Promise.reject(new ApiError('http', 'Device not found', { status: 404, code: 'not_found' })),
    );
    const setupResult = setup(stubApi({ getDevice }));
    client = setupResult.client;
    const { result } = renderHook(() => useDevice('esp32-99'), { wrapper: setupResult.wrapper });
    await settle(RETRY.MAX_DELAY_MS * 10);
    expect(getDevice).toHaveBeenCalledTimes(1);
    expect(result.current.error).toMatchObject({ kind: 'http', status: 404, code: 'not_found' });
  });

  it('does not retry validation errors', async () => {
    vi.useFakeTimers({ now: NOW });
    const listAlertRules = vi.fn(() =>
      Promise.reject(new ApiError('validation', 'bad payload', { code: 'schema_violation' })),
    );
    const setupResult = setup(stubApi({ listAlertRules }));
    client = setupResult.client;
    const { result } = renderHook(() => useAlertRules(), { wrapper: setupResult.wrapper });
    await settle(RETRY.MAX_DELAY_MS * 10);
    expect(listAlertRules).toHaveBeenCalledTimes(1);
    expect(result.current.error?.kind).toBe('validation');
  });

  it('retries transient errors with exponential backoff, then succeeds', async () => {
    vi.useFakeTimers({ now: NOW });
    const demo = new DemoTelemetryApi({ now: () => NOW });
    let calls = 0;
    const listDevices = vi.fn((options?: { signal?: AbortSignal | undefined }) => {
      calls += 1;
      return calls <= 3
        ? Promise.reject(new ApiError('http', 'busy', { status: 503 }))
        : demo.listDevices(options);
    });
    const setupResult = setup(stubApi({ listDevices }));
    client = setupResult.client;
    const { result } = renderHook(() => useDevices(), { wrapper: setupResult.wrapper });

    await settle();
    expect(listDevices).toHaveBeenCalledTimes(1);
    await settle(RETRY.BASE_DELAY_MS - 1);
    expect(listDevices).toHaveBeenCalledTimes(1); // still waiting for the first backoff
    await settle(1);
    expect(listDevices).toHaveBeenCalledTimes(2);
    await settle(RETRY.BASE_DELAY_MS * 2);
    expect(listDevices).toHaveBeenCalledTimes(3);
    await settle(RETRY.BASE_DELAY_MS * 4);
    expect(listDevices).toHaveBeenCalledTimes(4);
    await settle(10);
    expect(result.current.isSuccess).toBe(true);
  });

  it('gives up after the bounded number of retries', async () => {
    vi.useFakeTimers({ now: NOW });
    const listDevices = vi.fn(() => Promise.reject(new ApiError('timeout', 'slow')));
    const setupResult = setup(stubApi({ listDevices }));
    client = setupResult.client;
    const { result } = renderHook(() => useDevices(), { wrapper: setupResult.wrapper });
    await settle(RETRY.MAX_DELAY_MS * 10);
    expect(listDevices).toHaveBeenCalledTimes(RETRY.MAX_RETRIES + 1);
    expect(result.current.error?.kind).toBe('timeout');
  });

  it('cancels the request (AbortSignal) when the last observer unmounts', async () => {
    vi.useFakeTimers({ now: NOW });
    let received: AbortSignal | undefined;
    const listDevices = vi.fn((options?: { signal?: AbortSignal | undefined }) => {
      received = options?.signal;
      return new Promise<never>(() => undefined);
    });
    const setupResult = setup(stubApi({ listDevices }));
    client = setupResult.client;
    const { unmount } = renderHook(() => useDevices(), { wrapper: setupResult.wrapper });
    await settle();
    expect(received?.aborted).toBe(false);
    unmount();
    await settle();
    expect(received?.aborted).toBe(true);
  });

  it('goes stale after its staleTime and is garbage-collected after its gcTime', async () => {
    vi.useFakeTimers({ now: NOW });
    const setupResult = setup(new DemoTelemetryApi({ now: () => NOW }));
    client = setupResult.client;
    const { result, unmount, rerender } = renderHook(() => useDevices(), {
      wrapper: setupResult.wrapper,
    });
    await settle();
    expect(result.current.isStale).toBe(false);

    await settle(QUERY_POLICY.DEVICES.STALE_TIME_MS + 1);
    rerender();
    expect(result.current.isStale).toBe(true);

    unmount();
    const key = telemetryKeys.deviceList('demo');
    expect(setupResult.client.getQueryCache().find({ queryKey: key })).toBeDefined();
    await settle(QUERY_POLICY.DEVICES.GC_TIME_MS + 1);
    expect(setupResult.client.getQueryCache().find({ queryKey: key })).toBeUndefined();
  });

  it('keeps past readings ranges fresh forever but lets recent ranges go stale', async () => {
    vi.useFakeTimers({ now: NOW });
    const setupResult = setup(new DemoTelemetryApi({ now: () => NOW }));
    client = setupResult.client;
    const past = {
      deviceId: 'esp32-01',
      metric: 'temperature',
      from: NOW - 2 * HOUR,
      to: NOW - HOUR,
    } as const;
    const recent = { ...past, from: NOW - HOUR, to: NOW + HOUR } as const;
    const { result, rerender } = renderHook(
      () => ({ past: useHistoricalReadings(past), recent: useHistoricalReadings(recent) }),
      { wrapper: setupResult.wrapper },
    );
    await settle();
    expect(result.current.past.isSuccess && result.current.recent.isSuccess).toBe(true);

    await settle(QUERY_POLICY.READINGS.RECENT_STALE_TIME_MS + 1);
    rerender();
    expect(result.current.recent.isStale).toBe(true);
    expect(result.current.past.isStale).toBe(false);
  });

  it('throws a clear error without a TelemetryApiProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const plain = createQueryClient();
    expect(() =>
      renderHook(() => useDevices(), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={plain}>{children}</QueryClientProvider>
        ),
      }),
    ).toThrow(/TelemetryApiProvider/);
  });
});

describe('telemetryKeys', () => {
  it('nests keys so each level prefixes the next, namespaced by mode', () => {
    const readings = telemetryKeys.readings('live', 'esp32-01', {
      metric: 'humidity',
      from: 1,
      to: 2,
    });
    expect(readings.slice(0, 5)).toEqual(telemetryKeys.deviceReadings('live', 'esp32-01'));
    expect(telemetryKeys.deviceReadings('live', 'esp32-01').slice(0, 3)).toEqual(
      telemetryKeys.devices('live'),
    );
    expect(telemetryKeys.alertRules('demo').slice(0, 3)).toEqual(telemetryKeys.alerts('demo'));
    expect(telemetryKeys.deviceList('demo')).not.toEqual(telemetryKeys.deviceList('live'));
  });

  it('allows targeted invalidation (one device readings, not the others)', async () => {
    const queryClient = createQueryClient();
    client = queryClient;
    const rangeA = { metric: 'humidity', from: 1, to: 2 } as const;
    const keys = {
      a: telemetryKeys.readings('live', 'a', rangeA),
      b: telemetryKeys.readings('live', 'b', rangeA),
      list: telemetryKeys.deviceList('live'),
      demoA: telemetryKeys.readings('demo', 'a', rangeA),
    };
    for (const key of Object.values(keys)) queryClient.setQueryData(key, []);

    await queryClient.invalidateQueries({ queryKey: telemetryKeys.deviceReadings('live', 'a') });
    const invalidated = (key: readonly unknown[]) =>
      queryClient.getQueryCache().find({ queryKey: key })?.state.isInvalidated;
    expect(invalidated(keys.a)).toBe(true);
    expect(invalidated(keys.b)).toBe(false);
    expect(invalidated(keys.list)).toBe(false);
    expect(invalidated(keys.demoA)).toBe(false);
  });
});

describe('alert rule mutation hooks', () => {
  it('create, update and delete through the hooks, ending with the repository state', async () => {
    vi.useFakeTimers();
    const api = new DemoTelemetryApi({
      now: () => NOW,
      ruleStorage: null,
      generateId: () => 'rule-new',
    });
    const setupResult = setup(api);
    client = setupResult.client;
    const { result } = renderHook(
      () => ({
        rules: useAlertRules(),
        create: useCreateAlertRule(),
        update: useUpdateAlertRule(),
        remove: useDeleteAlertRule(),
      }),
      { wrapper: setupResult.wrapper },
    );
    await settle();
    const input = {
      name: 'Humid',
      deviceId: null,
      metric: 'humidity',
      comparator: 'above',
      threshold: 70,
      enabled: true,
    } as const;
    act(() => {
      result.current.create.mutate(input);
    });
    await settle();
    expect(result.current.rules.data).toContainEqual({ ...input, id: 'rule-new' });
    act(() => {
      result.current.update.mutate({ id: 'rule-new', input: { ...input, threshold: 75 } });
    });
    await settle();
    expect(result.current.rules.data).toContainEqual({ ...input, threshold: 75, id: 'rule-new' });
    act(() => {
      result.current.remove.mutate({ id: 'rule-new' });
    });
    await settle();
    expect(result.current.remove.isSuccess).toBe(true);
    expect(result.current.rules.data).toEqual(await api.listAlertRules());
  });
});
