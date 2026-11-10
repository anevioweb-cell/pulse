import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler, createElement } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DemoTelemetryApi } from '@/features/telemetry';
import type { DeviceSummary, TelemetryApi, FrameScheduler } from '@/features/telemetry';
import { ApiError } from '@/shared/api';
import { messages } from '@/shared/i18n';

import { expectNoAxeViolations } from '../../../test/axe';
import { FakeUPlot } from '../../../test/fake-uplot';
import { createLiveHarness } from '../../../test/live-harness';
import { DevicePage } from './DevicePage';

import type { VisibilitySource } from '../charts/redraw-scheduler';
import type * as ChartControlsModule from '../components/detail/ChartControls';
import type * as DeviceChartModule from '../components/detail/DeviceChart';

vi.mock('uplot', async () => ({ default: (await import('../../../test/fake-uplot')).FakeUPlot }));

// Render counts: every DeviceChart and the chart controls (which render exactly when the page's
// detail view renders, or on pause) are wrapped in a Profiler.
const renders = vi.hoisted(() => new Map<string, number>());
const count = (id: string) => {
  renders.set(id, (renders.get(id) ?? 0) + 1);
};
vi.mock('../components/detail/DeviceChart', async (importOriginal) => {
  const actual = await importOriginal<typeof DeviceChartModule>();
  return {
    ...actual,
    DeviceChart: (props: Parameters<typeof actual.DeviceChart>[0]) =>
      createElement(
        Profiler,
        { id: `chart:${props.metric}`, onRender: count },
        createElement(actual.DeviceChart, props),
      ),
  };
});
vi.mock('../components/detail/ChartControls', async (importOriginal) => {
  const actual = await importOriginal<typeof ChartControlsModule>();
  return {
    ...actual,
    ChartControls: (props: Parameters<typeof actual.ChartControls>[0]) =>
      createElement(
        Profiler,
        { id: 'page', onRender: count },
        createElement(actual.ChartControls, props),
      ),
  };
});

/** The chart scheduler's frames, run by hand after each publish. */
function manualFrames() {
  const pending = new Set<() => void>();
  const frames: FrameScheduler = {
    request: (callback) => {
      pending.add(callback);
      return () => {
        pending.delete(callback);
      };
    },
  };
  return {
    frames,
    run() {
      act(() => {
        const callbacks = [...pending];
        pending.clear();
        for (const callback of callbacks) callback();
      });
    },
  };
}

const visible: VisibilitySource = { isVisible: () => true, subscribe: () => () => undefined };

let harness: ReturnType<typeof createLiveHarness>;
let frames: ReturnType<typeof manualFrames>;
let fleet: DeviceSummary[];

function LocationProbe() {
  const current = useLocation();
  return <span data-testid="location">{`${current.pathname}${current.search}`}</span>;
}

async function renderPage(path: string, api?: TelemetryApi) {
  harness.stop();
  harness = createLiveHarness(api, { initialPath: path });
  harness.start();
  fleet = await harness.api.listDevices();
  render(
    <Routes>
      <Route
        path="/devices/:id"
        element={
          <>
            <DevicePage scheduler={{ frames: frames.frames, visibility: visible }} />
            <LocationProbe />
          </>
        }
      />
    </Routes>,
    { wrapper: harness.wrapper },
  );
}

const chartOf = (metric: string) => {
  const instance = FakeUPlot.instances.findLast(
    (chart) => chart.options.series[1]?.label === metric,
  );
  if (!instance) throw new Error(`no chart for ${metric}`);
  return instance;
};

const first = () => {
  const [device] = fleet;
  if (!device) throw new Error('empty fleet');
  return device;
};

beforeEach(() => {
  FakeUPlot.instances = [];
  renders.clear();
  frames = manualFrames();
  harness = createLiveHarness();
});

afterEach(() => {
  harness.stop();
});

describe('DevicePage: states', () => {
  it('shows a loading state, then the device header, latest values and one chart per metric', async () => {
    await renderPage('/devices/esp32-01');
    expect(screen.getByText(messages.deviceDetail.loading)).toBeInTheDocument();
    const device = first();
    expect(await screen.findByRole('heading', { level: 1, name: device.name })).toBeInTheDocument();
    expect(
      screen.getByText(messages.deviceDetail.facts(device.location, device.firmware)),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.pages.device.back })).toHaveAttribute(
      'href',
      '/devices',
    );
    // Before any live data: "no data yet" status, the waiting note, and empty chart summaries.
    expect(screen.getByText(messages.devices.status.unknown)).toBeInTheDocument();
    expect(screen.getByText(messages.deviceDetail.waitingBody)).toBeInTheDocument();
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(5);
    expect(images[0]).toHaveAccessibleName(
      messages.deviceDetail.summaryEmpty('Temperature', 'the last minute'),
    );
    await expectNoAxeViolations(document.body);
  });

  it('shows live values, a status badge and chart summaries once readings arrive', async () => {
    await renderPage('/devices/esp32-01');
    const device = first();
    await screen.findByRole('heading', { level: 1, name: device.name });
    harness.announce([device]);
    harness.readings([{ id: device.id, values: { temperature: 21.04 } }]);
    harness.readings([{ id: device.id, values: { temperature: 23.46 } }]);
    frames.run();
    expect(screen.getByText(messages.devices.status.online)).toBeInTheDocument();
    const latest = screen.getByRole('heading', {
      name: messages.deviceDetail.latestHeading,
    }).parentElement;
    expect(within(latest ?? document.body).getByText('23.5')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: messages.deviceDetail.summary(
          'Temperature',
          'the last minute',
          '23.5',
          '21.0',
          '23.5',
          '°C',
        ),
      }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
  });

  it('shows a not-found state when the API says 404', async () => {
    await renderPage('/devices/esp32-99');
    expect(
      await screen.findByRole('heading', { level: 2, name: messages.deviceDetail.notFoundTitle }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: messages.pages.device.back })).toHaveLength(2);
    await expectNoAxeViolations(document.body);
  });

  it('shows an error with a working retry', async () => {
    const demo = new DemoTelemetryApi({ ruleStorage: null });
    let fail = true;
    const flaky: TelemetryApi = Object.assign(Object.create(demo) as TelemetryApi, {
      getDevice: (id: string) =>
        fail
          ? Promise.reject(new ApiError('validation', 'bad payload', { code: 'schema_violation' }))
          : demo.getDevice(id),
    });
    await renderPage('/devices/esp32-01', flaky);
    expect(await screen.findByText(messages.deviceDetail.errorTitle)).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
    fail = false;
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: messages.deviceDetail.retry }));
    expect(
      await screen.findByRole('heading', { level: 1, name: first().name }),
    ).toBeInTheDocument();
  });

  it('explains an offline device and announces the change politely', async () => {
    await renderPage('/devices/esp32-01');
    const device = first();
    await screen.findByRole('heading', { level: 1, name: device.name });
    harness.announce([device]);
    harness.readings([{ id: device.id }]);
    const region = screen
      .getAllByRole('status')
      .find((element) => element.classList.contains('sr-only'));
    expect(region).toHaveTextContent('');

    harness.offline([device.id]);
    expect(screen.getByText(messages.deviceDetail.offlineTitle)).toBeInTheDocument();
    expect(region).toHaveTextContent(messages.deviceDetail.announce.offline);
  });
});

describe('DevicePage: view state in the URL', () => {
  it('writes the range to the URL with replace, and reads it back', async () => {
    await renderPage('/devices/esp32-01');
    await screen.findByRole('heading', { level: 1, name: first().name });
    const user = userEvent.setup();
    expect(screen.getByRole('radio', { name: messages.deviceDetail.ranges.live })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: messages.deviceDetail.ranges['1h'] }));
    expect(screen.getByTestId('location')).toHaveTextContent('/devices/esp32-01?range=1h');
    expect(screen.getByRole('radio', { name: messages.deviceDetail.ranges['1h'] })).toBeChecked();
    expect(screen.getAllByText(messages.deviceDetail.historySource)).toHaveLength(5);
  });

  it('falls back to defaults for hostile values, keeping valid ones', async () => {
    await renderPage('/devices/esp32-01?range=__proto__&metric=battery&evil=1');
    await screen.findByRole('heading', { level: 1, name: first().name });
    expect(screen.getByRole('radio', { name: messages.deviceDetail.ranges.live })).toBeChecked();
    expect(
      screen.getByRole('button', { name: messages.deviceDetail.collapse('Battery') }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('expands and collapses one chart through the URL', async () => {
    await renderPage('/devices/esp32-01');
    await screen.findByRole('heading', { level: 1, name: first().name });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: messages.deviceDetail.expand('Humidity') }),
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/devices/esp32-01?metric=humidity');
    await user.click(
      screen.getByRole('button', { name: messages.deviceDetail.collapse('Humidity') }),
    );
    expect(screen.getByTestId('location').textContent).toBe('/devices/esp32-01');
  });
});

describe('DevicePage: thresholds, pause and the data table', () => {
  it('draws threshold lines only from rules for this device and metric', async () => {
    await renderPage('/devices/esp32-01');
    await screen.findByRole('heading', { level: 1, name: first().name });
    // Default Demo rules: temperature above 26 and battery below 20, for every device.
    await waitFor(() => {
      expect(chartOf('Temperature').drawnLabels()).toEqual(['Alert above 26.0 °C']);
    });
    expect(chartOf('Battery').drawnLabels()).toEqual(['Alert below 20 %']);
    expect(chartOf('Humidity').drawnLabels()).toEqual([]);
    expect(chartOf('Signal').drawnLabels()).toEqual([]);
  });

  it('pauses drawing while data keeps recording, and resumes at the live edge', async () => {
    await renderPage('/devices/esp32-01');
    const device = first();
    await screen.findByRole('heading', { level: 1, name: device.name });
    harness.announce([device]);
    harness.readings([{ id: device.id }]);
    frames.run();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: messages.deviceDetail.pause }));
    expect(screen.getByText(messages.deviceDetail.announce.paused)).toBeInTheDocument();
    const drawn = chartOf('Temperature').setData.mock.calls.length;

    for (let index = 0; index < 10; index += 1) {
      harness.readings([{ id: device.id, values: { temperature: 30 + index } }]);
      frames.run();
    }
    expect(chartOf('Temperature').setData).toHaveBeenCalledTimes(drawn);

    await user.click(screen.getByRole('button', { name: messages.deviceDetail.resume }));
    frames.run();
    expect(chartOf('Temperature').setData).toHaveBeenCalledTimes(drawn + 1);
    const [, values] = chartOf('Temperature').data;
    expect(values?.at(-1)).toBe(39);
    expect(screen.getByText(messages.deviceDetail.announce.resumed)).toBeInTheDocument();
  });

  it('shows the drawn values in a data table, newest first', async () => {
    await renderPage('/devices/esp32-01');
    const device = first();
    await screen.findByRole('heading', { level: 1, name: device.name });
    harness.announce([device]);
    for (const temperature of [20.04, 21.56, 22.01]) {
      harness.readings([{ id: device.id, values: { temperature } }]);
    }
    frames.run();
    const user = userEvent.setup();
    const [toggle] = screen.getAllByRole('button', { name: messages.deviceDetail.table.show });
    if (!toggle) throw new Error('no table toggle');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const table = screen.getByRole('table');
    const cells = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell').at(1)?.textContent);
    expect(cells).toEqual(['22.0', '21.6', '20.0']);
    await expectNoAxeViolations(document.body);
  });
});

describe('DevicePage: re-render discipline (render counts from React Profiler)', () => {
  it('100 samples re-render neither the page nor any chart wrapper, and draw each chart 100 times', async () => {
    await renderPage('/devices/esp32-01');
    const device = first();
    await screen.findByRole('heading', { level: 1, name: device.name });
    await waitFor(() => {
      expect(chartOf('Temperature').drawnLabels()).toHaveLength(1); // rules loaded
    });
    harness.announce(fleet);
    // The first reading makes the device's series known: each chart renders once for it.
    harness.readings([{ id: device.id }]);
    frames.run();
    const before = new Map(renders);
    const drawsBefore = chartOf('Humidity').setData.mock.calls.length;

    for (let index = 0; index < 100; index += 1) {
      harness.readings([{ id: device.id, values: { temperature: 20 + index / 10 } }]);
      frames.run();
    }

    expect(chartOf('Humidity').setData.mock.calls.length - drawsBefore).toBe(100);
    for (const [id, value] of before) expect(renders.get(id)).toBe(value);
    console.info(
      `[render counts] 100 samples: page ${String(before.get('page'))} -> ${String(renders.get('page'))}, ` +
        `temperature chart ${String(before.get('chart:temperature'))} -> ${String(renders.get('chart:temperature'))}`,
    );

    // Another device's readings: no render and no draw here.
    const other = fleet.at(1);
    if (!other) throw new Error('fleet too small');
    const drawsOther = chartOf('Humidity').setData.mock.calls.length;
    for (let index = 0; index < 20; index += 1) {
      harness.readings([{ id: other.id }]);
      frames.run();
    }
    for (const [id, value] of before) expect(renders.get(id)).toBe(value);
    expect(chartOf('Humidity').setData).toHaveBeenCalledTimes(drawsOther);
  });

  it('renders the page and each chart a small, bounded number of times overall', async () => {
    await renderPage('/devices/esp32-01');
    const device = first();
    await screen.findByRole('heading', { level: 1, name: device.name });
    harness.announce(fleet);
    for (let index = 0; index < 100; index += 1) {
      harness.readings([{ id: device.id }]);
      frames.run();
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const page = renders.get('page') ?? 0;
    const charts = ['temperature', 'humidity', 'pressure', 'battery', 'signal'].map(
      (metric) => renders.get(`chart:${metric}`) ?? 0,
    );
    console.info(
      `[render counts] whole session: page ${String(page)}, charts ${charts.join(', ')}`,
    );
    expect(page).toBeLessThanOrEqual(5);
    for (const value of charts) expect(value).toBeLessThanOrEqual(6);
  });
});

vi.setConfig({ testTimeout: 20_000 });
