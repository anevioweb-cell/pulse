import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/shared/api';

import { PREFETCH } from '../config';
import { EXAMPLE_TS } from '../model/fixtures';
import { systemScheduler } from '../transport/scheduler';
import { TelemetryApiProvider } from './api-context';
import { DemoTelemetryApi } from './demo-telemetry-api';
import { recentReadingsRequest, usePrefetchDevice } from './prefetch';
import { createTelemetryQueryClient } from './query-client';
import { telemetryKeys } from './query-keys';

import type { TelemetryApi } from './telemetry-api';
import type { QueryClient } from '@tanstack/react-query';

const NOW = EXAMPLE_TS;
const DELAY = PREFETCH.INTENT_DELAY_MS;

let client: QueryClient;
let api: TelemetryApi;
let calls: string[];

function DeviceLink({ id }: { id: string }) {
  return (
    <a href={`#/devices/${id}`} {...usePrefetchDevice(id, systemScheduler)}>
      {id}
    </a>
  );
}

function renderLinks(...ids: string[]) {
  return render(
    <QueryClientProvider client={client}>
      <TelemetryApiProvider api={api}>
        {ids.map((id) => (
          <DeviceLink key={id} id={id} />
        ))}
      </TelemetryApiProvider>
    </QueryClientProvider>,
  );
}

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  client = createQueryClient();
  calls = [];
  const demo = new DemoTelemetryApi({ now: () => Date.now(), ruleStorage: null });
  api = {
    mode: 'demo',
    requiresNetwork: false,
    listDevices: (o) => demo.listDevices(o),
    getDevice: (id, o) => {
      calls.push(`detail ${id}`);
      return demo.getDevice(id, o);
    },
    getReadings: (request, o) => {
      calls.push(`readings ${request.deviceId}`);
      return demo.getReadings(request, o);
    },
    listAlerts: (q, o) => demo.listAlerts(q, o),
    listAlertRules: (o) => demo.listAlertRules(o),
    createAlertRule: (i, o) => demo.createAlertRule(i, o),
    updateAlertRule: (id, i, o) => demo.updateAlertRule(id, i, o),
    deleteAlertRule: (id, o) => demo.deleteAlertRule(id, o),
  };
});

afterEach(() => {
  client.clear();
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe('usePrefetchDevice', () => {
  it('prefetches detail and the recent range after the intent delay on hover', async () => {
    renderLinks('esp32-01');
    fireEvent.pointerEnter(screen.getByRole('link'));
    await flush(DELAY - 1);
    expect(calls).toEqual([]);
    await flush(1);
    expect(calls).toEqual(['detail esp32-01', 'readings esp32-01']);
    expect(client.getQueryData(telemetryKeys.device('demo', 'esp32-01'))).toBeDefined();
    const { deviceId, ...range } = recentReadingsRequest('esp32-01', Date.now());
    expect(client.getQueryData(telemetryKeys.readings('demo', deviceId, range))).toBeDefined();
  });

  it('prefetches on keyboard focus too', async () => {
    renderLinks('esp32-02');
    fireEvent.focus(screen.getByRole('link'));
    await flush(DELAY);
    expect(calls).toEqual(['detail esp32-02', 'readings esp32-02']);
  });

  it('does nothing if the pointer leaves (or focus moves) before the delay', async () => {
    renderLinks('esp32-01');
    const link = screen.getByRole('link');
    fireEvent.pointerEnter(link);
    await flush(DELAY / 2);
    fireEvent.pointerLeave(link);
    fireEvent.focus(link);
    await flush(DELAY / 2);
    fireEvent.blur(link);
    await flush(DELAY * 2);
    expect(calls).toEqual([]);
  });

  it('cancels a pending prefetch on unmount', async () => {
    const view = renderLinks('esp32-01');
    fireEvent.pointerEnter(screen.getByRole('link'));
    view.unmount();
    await flush(DELAY * 2);
    expect(calls).toEqual([]);
  });

  it('deduplicates: fresh data is not fetched again, and repeated hovers cost nothing', async () => {
    renderLinks('esp32-01');
    const link = screen.getByRole('link');
    for (let i = 0; i < 3; i += 1) {
      fireEvent.pointerEnter(link);
      await flush(DELAY);
      fireEvent.pointerLeave(link);
    }
    expect(calls).toEqual(['detail esp32-01', 'readings esp32-01']);
  });

  it('fetches again once the data is stale', async () => {
    renderLinks('esp32-01');
    const link = screen.getByRole('link');
    fireEvent.pointerEnter(link);
    await flush(DELAY);
    fireEvent.pointerLeave(link);
    await flush(PREFETCH.RANGE_ALIGN_MS + 1); // past both staleTimes (30 s)
    fireEvent.pointerEnter(link);
    await flush(DELAY);
    expect(calls.filter((call) => call === 'detail esp32-01')).toHaveLength(2);
  });

  it('does not prefetch while offline when the API needs the network (Live Mode)', async () => {
    api = { ...api, mode: 'live', requiresNetwork: true };
    onlineManager.setOnline(false);
    renderLinks('esp32-01');
    fireEvent.pointerEnter(screen.getByRole('link'));
    await flush(DELAY * 2);
    expect(calls).toEqual([]);
  });

  it('still prefetches while offline in Demo Mode, which needs no network', async () => {
    client = createTelemetryQueryClient(api);
    onlineManager.setOnline(false);
    renderLinks('esp32-01');
    fireEvent.pointerEnter(screen.getByRole('link'));
    await flush(DELAY * 2);
    expect(calls).toEqual(['detail esp32-01', 'readings esp32-01']);
  });
});

describe('recentReadingsRequest', () => {
  it('uses the same range (query key) for every call within one alignment step', () => {
    const step = PREFETCH.RANGE_ALIGN_MS;
    const base = Math.ceil(NOW / step) * step;
    const first = recentReadingsRequest('esp32-01', base - step + 1);
    expect(recentReadingsRequest('esp32-01', base)).toEqual(first);
    expect(recentReadingsRequest('esp32-01', base + 1)).not.toEqual(first);
    expect(first).toEqual({
      deviceId: 'esp32-01',
      metric: PREFETCH.RECENT_METRIC,
      from: base - PREFETCH.RECENT_RANGE_MS,
      to: base,
    });
  });
});
