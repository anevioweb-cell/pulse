import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DemoTelemetryApi, PREFETCH, telemetryKeys } from '@/features/telemetry';
import type { DeviceSummary, TelemetryApi } from '@/features/telemetry';
import { ApiError } from '@/shared/api';
import { messages } from '@/shared/i18n';

import { expectNoAxeViolations } from '../../../test/axe';
import { createLiveHarness } from '../../../test/live-harness';
import { DeviceCard } from '../components/DeviceCard';
import { DeviceGrid } from '../components/DeviceGrid';
import { OverviewPage } from './OverviewPage';

let harness: ReturnType<typeof createLiveHarness>;
let fleet: DeviceSummary[];

beforeEach(async () => {
  harness = createLiveHarness();
  fleet = await harness.api.listDevices();
  harness.start();
});

afterEach(() => {
  harness.stop();
});

const renders = new Map<string, number>();
const counted = (Card: typeof DeviceCard) => (device: DeviceSummary) => (
  <Profiler
    id={device.id}
    onRender={(id) => {
      renders.set(id, (renders.get(id) ?? 0) + 1);
    }}
  >
    <Card device={device} />
  </Profiler>
);

const deviceList = () => screen.findAllByRole('article');

describe('OverviewPage states', () => {
  it('shows skeletons, then cards, and an honest waiting state before the first message', async () => {
    render(<OverviewPage />, { wrapper: harness.wrapper });
    expect(screen.getByText(messages.overview.grid.loading)).toBeInTheDocument();

    expect(await deviceList()).toHaveLength(fleet.length);
    expect(screen.getByText(messages.overview.grid.waitingTitle)).toBeInTheDocument();
    const first = fleet[0];
    if (!first) throw new Error('empty fleet');
    const card = screen.getByRole('link', { name: first.name }).closest('article');
    if (!card) throw new Error('no card');
    expect(within(card).getByText(messages.devices.status.unknown)).toBeInTheDocument();
    expect(within(card).getByText(messages.devices.neverSeen)).toBeInTheDocument();

    harness.announce(fleet);
    harness.readings([{ id: first.id, values: { temperature: 23.46 } }]);
    expect(screen.queryByText(messages.overview.grid.waitingTitle)).not.toBeInTheDocument();
    expect(within(card).getByText(messages.devices.status.online)).toBeInTheDocument();
    expect(within(card).getByText('23.5')).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
  });

  it('shows EmptyState when the server has no devices', async () => {
    const demo = new DemoTelemetryApi({ ruleStorage: null });
    const empty: TelemetryApi = Object.assign(Object.create(demo) as TelemetryApi, {
      listDevices: () => Promise.resolve([]),
    });
    harness.stop();
    harness = createLiveHarness(empty);
    harness.start();
    render(<OverviewPage />, { wrapper: harness.wrapper });
    expect(await screen.findByText(messages.overview.grid.emptyTitle)).toBeInTheDocument();
  });

  it('shows ErrorState with a working retry when the device list fails', async () => {
    const demo = new DemoTelemetryApi({ ruleStorage: null });
    let fail = true;
    const flaky: TelemetryApi = Object.assign(Object.create(demo) as TelemetryApi, {
      listDevices: () =>
        fail
          ? Promise.reject(new ApiError('validation', 'bad payload', { code: 'schema_violation' }))
          : demo.listDevices(),
    });
    harness.stop();
    harness = createLiveHarness(flaky);
    harness.start();
    render(<OverviewPage />, { wrapper: harness.wrapper });
    expect(await screen.findByText(messages.overview.grid.errorTitle)).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
    fail = false;
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: messages.overview.grid.retry }));
    expect(await deviceList()).toHaveLength(fleet.length);
  });
});

describe('KPI cards', () => {
  it('count online devices, average online temperatures and load the alert history', async () => {
    render(<OverviewPage />, { wrapper: harness.wrapper });
    await deviceList();
    const [a, b] = fleet;
    if (!a || !b) throw new Error('fleet too small');
    harness.announce([a, b]);
    harness.readings([
      { id: a.id, values: { temperature: 20 } },
      { id: b.id, values: { temperature: 23 } },
    ]);
    const online = screen.getByRole('group', { name: messages.overview.kpi.online });
    expect(online).toHaveTextContent('2');
    expect(online).toHaveTextContent(messages.overview.kpi.onlineOf(String(fleet.length)));
    const temperature = screen.getByRole('group', { name: messages.overview.kpi.temperature });
    expect(temperature).toHaveTextContent('21.5');
    const alerts = screen.getByRole('group', { name: messages.overview.kpi.alerts });
    await waitFor(() => {
      expect(alerts).not.toHaveAttribute('aria-busy');
    });
    const lastUpdate = screen.getByRole('group', { name: messages.overview.kpi.lastUpdate });
    expect(lastUpdate).toHaveTextContent(messages.overview.kpi.lastUpdateDemo);
  });

  it('shows an alert-history error with a retry', async () => {
    const demo = new DemoTelemetryApi({ ruleStorage: null });
    let fail = true;
    const flaky: TelemetryApi = Object.assign(Object.create(demo) as TelemetryApi, {
      listAlerts: (...args: Parameters<TelemetryApi['listAlerts']>) =>
        fail
          ? Promise.reject(new ApiError('validation', 'bad', { code: 'schema_violation' }))
          : demo.listAlerts(...args),
    });
    harness.stop();
    harness = createLiveHarness(flaky);
    harness.start();
    render(<OverviewPage />, { wrapper: harness.wrapper });
    const alerts = await screen.findByRole('group', { name: messages.overview.kpi.alerts });
    await waitFor(() => {
      expect(alerts).toHaveTextContent(messages.overview.kpi.alertsError);
    });
    fail = false;
    await userEvent.setup().click(within(alerts).getByRole('button'));
    await waitFor(() => {
      expect(alerts).not.toHaveTextContent(messages.overview.kpi.alertsError);
    });
  });
});

describe('re-render discipline (render counts from React Profiler)', () => {
  beforeEach(() => {
    renders.clear();
  });

  it('an update to device A re-renders only device A’s card', async () => {
    render(<DeviceGrid renderCard={counted(DeviceCard)} />, { wrapper: harness.wrapper });
    await deviceList();
    harness.announce(fleet);
    const before = new Map(renders);
    const [a, b] = fleet;
    if (!a || !b) throw new Error('fleet too small');

    harness.readings([{ id: a.id, values: { temperature: 30 } }]);
    harness.readings([{ id: a.id, values: { temperature: 31 } }]);

    expect(renders.get(a.id)).toBe((before.get(a.id) ?? 0) + 2);
    for (const device of fleet.slice(1)) {
      expect(renders.get(device.id)).toBe(before.get(device.id));
    }
    console.info(
      `[render counts] A: ${String(before.get(a.id))} -> ${String(renders.get(a.id))}, ` +
        `B: ${String(before.get(b.id))} -> ${String(renders.get(b.id))}`,
    );
  });

  it('a device-list refetch re-renders no card (no memo needed: TanStack tracks used props)', async () => {
    render(<DeviceGrid renderCard={counted(DeviceCard)} />, { wrapper: harness.wrapper });
    await deviceList();
    const total = () => [...renders.values()].reduce((sum, n) => sum + n, 0);
    const before = total();
    await act(() => harness.client.refetchQueries({ queryKey: telemetryKeys.deviceList('demo') }));
    expect(total()).toBe(before);
    console.info(`[render counts] device-list refetch: ${String(total() - before)} card renders`);
  });

  it('the first live message hides the waiting notice without re-rendering the cards', async () => {
    render(<DeviceGrid renderCard={counted(DeviceCard)} />, { wrapper: harness.wrapper });
    await deviceList();
    expect(screen.getByText(messages.overview.grid.waitingTitle)).toBeInTheDocument();
    const before = new Map(renders);
    const [a] = fleet;
    if (!a) throw new Error('empty fleet');
    harness.readings([{ id: a.id }]);
    expect(screen.queryByText(messages.overview.grid.waitingTitle)).not.toBeInTheDocument();
    for (const device of fleet.slice(1)) {
      expect(renders.get(device.id)).toBe(before.get(device.id));
    }
  });
});

describe('keyboard and prefetch', () => {
  it('tabs through the card links in order and prefetches on focus', async () => {
    const user = userEvent.setup();
    render(<DeviceGrid />, { wrapper: harness.wrapper });
    await deviceList();
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(fleet.map((device) => device.name));
    const [first, second] = fleet;
    if (!first || !second) throw new Error('fleet too small');

    await user.tab();
    expect(screen.getByRole('link', { name: first.name })).toHaveFocus();
    expect(screen.getByRole('link', { name: first.name })).toHaveAttribute(
      'href',
      `/devices/${first.id}`,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, PREFETCH.INTENT_DELAY_MS + 50));
    });
    await waitFor(() => {
      expect(harness.client.getQueryData(telemetryKeys.device('demo', first.id))).toBeDefined();
    });
    await user.tab();
    expect(screen.getByRole('link', { name: second.name })).toHaveFocus();
  });
});

vi.setConfig({ testTimeout: 15_000 });
