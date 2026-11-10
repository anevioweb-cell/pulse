import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import type { DeviceSummary } from '@/features/telemetry';
import { messages } from '@/shared/i18n';

import { expectNoAxeViolations } from '../../../../test/axe';
import { createLiveHarness } from '../../../../test/live-harness';
import { DEVICE_TABLE } from '../../config';
import { DeviceRow } from './DeviceRow';
import { DevicesTable } from './DevicesTable';

import type { DeviceRowProps } from './DeviceRow';

const pad = (n: number) => String(n).padStart(3, '0');
/** Synthetic fleet (the simulator caps at 100 devices); live data comes through the real store. */
const synthetic = (count: number): DeviceSummary[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `dev-${pad(index + 1)}`,
    name: `Sensor ${pad(index + 1)}`,
    location: index % 2 === 0 ? 'Kitchen' : 'Attic',
    firmware: '1.0.0',
    source: 'simulated',
  }));

let harness: ReturnType<typeof createLiveHarness> | null = null;

afterEach(() => {
  harness?.stop();
  harness = null;
});

function LocationProbe() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <span data-testid="location" data-action={type}>
      {location.search}
    </span>
  );
}

function setup(devices: readonly DeviceSummary[], path = '/devices', Row?: DevicesTableRow) {
  harness = createLiveHarness(undefined, { initialPath: path });
  harness.start();
  const view = render(
    <>
      <DevicesTable devices={devices} {...(Row ? { Row } : {})} />
      <LocationProbe />
    </>,
    { wrapper: harness.wrapper },
  );
  return { ...view, harness, user: userEvent.setup() };
}
type DevicesTableRow = (props: DeviceRowProps) => React.JSX.Element;

const search = () => screen.getByTestId('location').textContent;
const bodyRows = () => screen.getAllByRole('row').filter((row) => row.closest('tbody'));
const header = (name: RegExp | string) => screen.getByRole('columnheader', { name });
const temperatureLabel = messages.devices.table.withUnit(
  messages.devices.metrics.temperature,
  messages.devices.units.temperature,
);

describe('DevicesTable semantics', () => {
  it('is a captioned table with row counts, row indexes and aria-sort', async () => {
    const devices = synthetic(12);
    const { container } = setup(devices);
    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('aria-rowcount', '13');
    expect(table).toHaveAccessibleName(); // caption
    expect(within(table).getByText(/Sorted by Name, ascending/)).toBeInTheDocument();
    expect(header(/^Name/)).toHaveAttribute('aria-sort', 'ascending');
    expect(header(temperatureLabel)).not.toHaveAttribute('aria-sort');
    const rows = screen.getAllByRole('row');
    expect(rows[0]).toHaveAttribute('aria-rowindex', '1');
    expect(rows[1]).toHaveAttribute('aria-rowindex', '2');
    expect(screen.getByRole('rowheader', { name: 'Sensor 001' })).toBeInTheDocument();
    // Status has a text alternative (no data has arrived yet).
    expect(
      within(screen.getByRole('row', { name: /Sensor 001/ })).getByText(
        messages.devices.status.unknown,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(messages.devices.table.shown('12', '12'));
    await expectNoAxeViolations(container);
  });

  it('virtualizes: 200 devices render only the rows near the viewport', () => {
    setup(synthetic(200));
    const bound =
      Math.ceil(DEVICE_TABLE.INITIAL_VIEWPORT_PX / DEVICE_TABLE.ROW_HEIGHT_PX) +
      2 * DEVICE_TABLE.OVERSCAN_ROWS;
    const rendered = bodyRows().filter((row) => row.getAttribute('aria-hidden') !== 'true');
    expect(rendered.length).toBeLessThanOrEqual(bound);
    expect(rendered.length).toBeGreaterThan(0);
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '201');
    expect(rendered.at(-1)).toHaveAttribute('aria-rowindex', String(rendered.length + 1));
  });
});

describe('URL as the source of truth', () => {
  it('sorts by a live column from the header button, with the keyboard, into the URL', async () => {
    const devices = synthetic(3);
    const { user, harness: live } = setup(devices);
    live.announce(devices);
    live.readings([
      { id: 'dev-001', values: { temperature: 25 } },
      { id: 'dev-002', values: { temperature: 19 } },
      { id: 'dev-003', values: { temperature: 22 } },
    ]);
    const button = within(header(temperatureLabel)).getByRole('button');
    button.focus();
    await user.keyboard('{Enter}');
    expect(search()).toBe('?sort=temperature');
    expect(screen.getByTestId('location')).toHaveAttribute('data-action', 'REPLACE');
    expect(header(temperatureLabel)).toHaveAttribute('aria-sort', 'ascending');
    const names = () => bodyRows().map((row) => within(row).getByRole('rowheader').textContent);
    expect(names()).toEqual(['Sensor 002', 'Sensor 003', 'Sensor 001']);
    await user.keyboard('{Enter}');
    expect(search()).toBe('?sort=-temperature');
    expect(names()).toEqual(['Sensor 001', 'Sensor 003', 'Sensor 002']);
  });

  it('debounces the search into the URL with replace, and filters', async () => {
    const { user } = setup(synthetic(4));
    const box = screen.getByRole('searchbox', { name: messages.devices.table.searchLabel });
    await user.type(box, 'att');
    expect(search()).toBe(''); // not yet: debounced
    await waitFor(() => {
      expect(search()).toBe('?q=att');
    });
    expect(screen.getByTestId('location')).toHaveAttribute('data-action', 'REPLACE');
    expect(bodyRows().map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'Sensor 002',
      'Sensor 004',
    ]);
    expect(box).toHaveFocus(); // the URL change does not steal focus
  });

  it('restores sort, search, filter and hidden columns from the URL (reload)', () => {
    const devices = synthetic(6);
    harness = createLiveHarness(undefined, {
      initialPath: '/devices?sort=-name&q=kitchen&status=offline&hide=pressure,signal',
    });
    harness.start();
    harness.announce(devices);
    harness.offline(['dev-001', 'dev-003']);
    render(<DevicesTable devices={devices} />, { wrapper: harness.wrapper });
    expect(screen.getByRole('searchbox')).toHaveValue('kitchen');
    expect(header(/^Name/)).toHaveAttribute('aria-sort', 'descending');
    expect(screen.queryByRole('columnheader', { name: /Pressure/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Signal/ })).not.toBeInTheDocument();
    expect(bodyRows().map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'Sensor 003',
      'Sensor 001',
    ]);
  });

  it('re-filters when a device changes status', () => {
    const devices = synthetic(3);
    const { harness: live } = setup(devices, '/devices?status=offline');
    live.announce(devices);
    expect(screen.queryAllByRole('rowheader')).toHaveLength(0);
    live.offline(['dev-002']);
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([
      'Sensor 002',
    ]);
  });

  it('filters online devices from a URL loaded after they came online', () => {
    const devices = synthetic(3);
    harness = createLiveHarness(undefined, { initialPath: '/devices?status=online' });
    harness.start();
    harness.announce(devices);
    harness.offline(['dev-002']);
    render(<DevicesTable devices={devices} />, { wrapper: harness.wrapper });
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([
      'Sensor 001',
      'Sensor 003',
    ]);
  });

  it('shows online devices when they come online after the table mounted', () => {
    const devices = synthetic(3);
    const { harness: live } = setup(devices, '/devices?status=online');
    expect(screen.queryAllByRole('rowheader')).toHaveLength(0);
    live.announce(devices);
    expect(screen.getAllByRole('rowheader')).toHaveLength(3);
  });

  it('applies a sort from the URL once the first readings arrive', () => {
    const devices = synthetic(3);
    const { harness: live } = setup(devices, '/devices?sort=battery');
    live.announce(devices); // online, but no readings yet: order unchanged
    live.readings([
      { id: 'dev-001', values: { battery: 90 } },
      { id: 'dev-002', values: { battery: 10 } },
      { id: 'dev-003', values: { battery: 50 } },
    ]);
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([
      'Sensor 002',
      'Sensor 003',
      'Sensor 001',
    ]);
  });

  it('falls back to defaults for a hostile URL and never crashes', () => {
    setup(
      synthetic(3),
      `/devices?sort=__proto__&hide=name,__proto__&status=admin&q=${'x'.repeat(5000)}&__proto__=1`,
    );
    expect(header(/^Name/)).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(bodyRows()).toHaveLength(3);
  });

  it('hides a column from the keyboard-operable column menu', async () => {
    const { user } = setup(synthetic(2));
    const trigger = screen.getByRole('button', { name: messages.devices.table.columnsMenu });
    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu', { name: messages.devices.table.columnsMenu });
    const location = within(menu).getByRole('menuitemcheckbox', { name: 'Location' });
    expect(location).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => {
      expect(location).toHaveFocus(); // opening with the keyboard focuses the first item
    });
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Status' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{Enter}');
    expect(search()).toBe('?hide=location');
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Location' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.queryByRole('columnheader', { name: /^Location/ })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('offers to clear the filters when nothing matches', async () => {
    const { user } = setup(synthetic(2), '/devices?q=nothing-matches');
    expect(screen.getByText(messages.devices.table.noMatchTitle)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: messages.devices.table.clearFilters }));
    expect(search()).toBe('');
    expect(bodyRows()).toHaveLength(2);
  });
});

describe('live updates re-render only the affected rows (200 devices)', () => {
  it('counts row renders with React Profiler', () => {
    const renders = new Map<string, number>();
    const CountedRow = (props: DeviceRowProps) => (
      <Profiler
        id={props.device.id}
        onRender={(id) => {
          renders.set(id, (renders.get(id) ?? 0) + 1);
        }}
      >
        <DeviceRow {...props} />
      </Profiler>
    );
    const devices = synthetic(200);
    const { harness: live } = setup(devices, '/devices', CountedRow);
    live.announce(devices);
    // Each device's first reading re-sorts once (status signature); measure the steady state after.
    live.readings(devices.map(({ id }) => ({ id })));
    const rendered = [...renders.keys()];
    const total = () => [...renders.values()].reduce((sum, n) => sum + n, 0);

    const before = new Map(renders);
    live.readings([{ id: 'dev-001', values: { temperature: 30 } }]);
    expect(renders.get('dev-001')).toBe((before.get('dev-001') ?? 0) + 1);
    for (const id of rendered.filter((id) => id !== 'dev-001')) {
      expect(renders.get(id)).toBe(before.get(id));
    }

    const beforeOffscreen = total();
    live.readings([{ id: 'dev-150', values: { temperature: 30 } }]);
    expect(renders.has('dev-150')).toBe(false); // not rendered: virtualized away
    expect(total()).toBe(beforeOffscreen);

    const beforeBatch = total();
    live.readings(rendered.slice(0, 5).map((id) => ({ id, values: { humidity: 50 } })));
    expect(total() - beforeBatch).toBe(5);

    console.info(
      `[render counts] table: ${String(rendered.length)} of 200 rows rendered; ` +
        `1 visible update -> 1 row render; 1 off-screen update -> 0; 5 visible -> ${String(total() - beforeBatch)}`,
    );
  });
});

act(() => undefined);
