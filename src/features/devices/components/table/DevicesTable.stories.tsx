import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

import {
  createTelemetryQueryClient,
  DemoTelemetryApi,
  TelemetryApiProvider,
} from '@/features/telemetry';
import type { DeviceSummary } from '@/features/telemetry';

import { DevicesTable } from './DevicesTable';

import type { Meta, StoryObj } from '@storybook/react-vite';

const api = new DemoTelemetryApi({ ruleStorage: null });
const client = createTelemetryQueryClient(api);

const fleet = (count: number): DeviceSummary[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `dev-${String(index + 1).padStart(3, '0')}`,
    name: `Sensor ${String(index + 1).padStart(3, '0')}`,
    location: ['Kitchen', 'Attic', 'Greenhouse', 'Garage'][index % 4] ?? 'Kitchen',
    firmware: '1.0.0',
    source: 'simulated',
  }));

/**
 * The table without a live session: every status reads "No data yet" and values are "—". In the
 * app, rows fill in from the live store.
 */
const meta = {
  title: 'Devices/DevicesTable',
  component: DevicesTable,
  args: { devices: fleet(12) },
  decorators: [
    (Story, { parameters }) => (
      <MemoryRouter initialEntries={[String(parameters.path ?? '/devices')]}>
        <QueryClientProvider client={client}>
          <TelemetryApiProvider api={api}>
            <Story />
          </TelemetryApiProvider>
        </QueryClientProvider>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof DevicesTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const TwoHundredRows: Story = { args: { devices: fleet(200) } };
export const SortedAndFiltered: Story = {
  parameters: { path: '/devices?sort=-name&q=attic&hide=pressure,signal' },
};
export const NoMatch: Story = { parameters: { path: '/devices?q=nothing-matches' } };
