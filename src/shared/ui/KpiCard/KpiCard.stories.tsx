import { Activity, Bell, Cpu, Thermometer } from 'lucide-react';

import { Button } from '../Button/Button';
import { KpiCard } from './KpiCard';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/KpiCard',
  component: KpiCard,
  args: {
    label: 'Devices online',
    value: '8',
    unit: 'of 12',
    description: '3 stale, 1 offline',
    icon: <Cpu />,
    tone: 'neutral',
    loading: false,
  },
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['neutral', 'accent', 'success', 'warning', 'danger', 'info'],
    },
  },
} satisfies Meta<typeof KpiCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Success: Story = { args: { tone: 'success' } };
export const Temperature: Story = {
  args: {
    label: 'Average temperature',
    value: '21.4',
    unit: '°C',
    description: 'Across 8 online devices',
    icon: <Thermometer />,
    tone: 'accent',
  },
};
export const Loading: Story = { args: { loading: true } };
export const Empty: Story = {
  args: {
    label: 'Average temperature',
    value: '—',
    unit: undefined,
    description: 'No online devices',
    icon: <Thermometer />,
  },
};
export const Failed: Story = {
  args: {
    label: 'Alerts, last 24 h',
    value: '—',
    unit: undefined,
    description: 'Could not load alerts.',
    icon: <Bell />,
    tone: 'danger',
    action: (
      <Button size="sm" variant="secondary">
        Try again
      </Button>
    ),
  },
};
export const LastUpdate: Story = {
  args: {
    label: 'Last live update',
    value: 'now',
    unit: undefined,
    description: '12 messages per second',
    icon: <Activity />,
    tone: 'info',
  },
};
export const Grid: Story = {
  render: (args) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard {...args} />
      <KpiCard {...args} {...Temperature.args} />
      <KpiCard {...args} {...Failed.args} />
      <KpiCard {...args} {...LastUpdate.args} />
    </div>
  ),
};
