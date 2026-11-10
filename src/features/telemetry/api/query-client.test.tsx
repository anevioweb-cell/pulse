import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EXAMPLE_TS } from '../model/fixtures';
import { TelemetryApiProvider } from './api-context';
import { DemoTelemetryApi } from './demo-telemetry-api';
import { useAlertHistory, useDevice, useDevices } from './hooks';
import { HttpTelemetryApi } from './http-telemetry-api';
import { createTelemetryQueryClient } from './query-client';

import type { TelemetryApi } from './telemetry-api';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const HOUR = 3_600_000;
const NOW = EXAMPLE_TS + 10 * 24 * HOUR;
const BASE_URL = 'http://127.0.0.1:8787';

let client: QueryClient | null = null;

afterEach(() => {
  client?.clear();
  client = null;
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

function setup(api: TelemetryApi) {
  const created = createTelemetryQueryClient(api);
  client = created;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={created}>
      <TelemetryApiProvider api={api}>{children}</TelemetryApiProvider>
    </QueryClientProvider>
  );
  return { client: created, wrapper };
}

const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe('createTelemetryQueryClient network mode', () => {
  it('lets Demo Mode queries resolve while the browser reports offline', async () => {
    vi.useFakeTimers({ now: NOW });
    onlineManager.setOnline(false);
    const { wrapper, client: created } = setup(
      new DemoTelemetryApi({ now: () => NOW, ruleStorage: null }),
    );
    expect(created.getDefaultOptions().queries?.networkMode).toBe('always');

    const { result } = renderHook(
      () => ({
        devices: useDevices(),
        device: useDevice('esp32-01'),
        alerts: useAlertHistory({ from: NOW - HOUR, to: NOW }),
      }),
      { wrapper },
    );
    await settle();

    expect(result.current.devices.isSuccess).toBe(true);
    expect(result.current.devices.fetchStatus).toBe('idle');
    expect(result.current.devices.data?.length).toBeGreaterThan(0);
    expect(result.current.device.isSuccess).toBe(true);
    expect(result.current.alerts.isSuccess).toBe(true);
  });

  it('pauses Live Mode queries while offline and fetches once back online', async () => {
    vi.useFakeTimers({ now: NOW });
    onlineManager.setOnline(false);
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(Response.json({ devices: [] })),
    );
    const { wrapper, client: created } = setup(new HttpTelemetryApi({ baseUrl: BASE_URL, fetch }));
    expect(created.getDefaultOptions().queries?.networkMode).toBe('online');

    const { result } = renderHook(() => useDevices(), { wrapper });
    await settle();

    expect(result.current.fetchStatus).toBe('paused');
    expect(result.current.isPending).toBe(true);
    expect(fetch).not.toHaveBeenCalled();

    act(() => {
      onlineManager.setOnline(true);
    });
    await settle();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual([]);
  });
});
