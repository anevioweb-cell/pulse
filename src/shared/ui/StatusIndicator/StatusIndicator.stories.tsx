import { StatusIndicator } from './StatusIndicator';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/StatusIndicator',
  component: StatusIndicator,
  args: { status: 'online', label: 'Online', size: 'md' },
  argTypes: {
    status: { control: 'inline-radio', options: ['online', 'degraded', 'offline', 'unknown'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof StatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Online: Story = {};
export const Degraded: Story = { args: { status: 'degraded', label: 'Connection problems' } };
export const Offline: Story = { args: { status: 'offline', label: 'Offline' } };
export const Unknown: Story = { args: { status: 'unknown', label: 'Checking connection' } };
export const Small: Story = { args: { size: 'sm' } };

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <StatusIndicator status="online" label="Online" />
      <StatusIndicator status="degraded" label="Connection problems" />
      <StatusIndicator status="offline" label="Offline" />
      <StatusIndicator status="unknown" label="Checking connection" />
    </div>
  ),
};

export const RightToLeft: Story = {
  globals: { dir: 'rtl', locale: 'ar' },
  args: { status: 'offline', label: 'غير متصل' },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  args: { status: 'degraded', label: 'Connection problems' },
};
