import { DeviceStatusBadge } from './DeviceStatusBadge';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Devices/DeviceStatusBadge',
  component: DeviceStatusBadge,
  args: { status: 'online' },
  argTypes: {
    status: { control: 'inline-radio', options: ['online', 'stale', 'offline', 'unknown'] },
  },
} satisfies Meta<typeof DeviceStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Online: Story = {};
export const Stale: Story = { args: { status: 'stale' } };
export const Offline: Story = { args: { status: 'offline' } };
export const Unknown: Story = { args: { status: 'unknown' } };
export const All: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <DeviceStatusBadge status="online" />
      <DeviceStatusBadge status="stale" />
      <DeviceStatusBadge status="offline" />
      <DeviceStatusBadge status="unknown" />
    </div>
  ),
};
