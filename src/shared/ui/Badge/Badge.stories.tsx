import { Cpu } from 'lucide-react';

import { Badge } from './Badge';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { children: 'Online', variant: 'success', size: 'sm' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['neutral', 'accent', 'success', 'warning', 'danger', 'info'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    icon: { control: false },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = { args: { variant: 'neutral', children: 'Sensor' } };
export const Accent: Story = { args: { variant: 'accent', children: 'New' } };
export const Success: Story = {};
export const Warning: Story = { args: { variant: 'warning', children: 'Degraded' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Offline' } };
export const Info: Story = { args: { variant: 'info', children: 'Updating' } };
export const CustomIcon: Story = {
  args: { variant: 'neutral', children: 'ESP32', icon: <Cpu aria-hidden="true" /> },
};
export const Medium: Story = { args: { size: 'md' } };

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Neutral</Badge>
      <Badge variant="accent">Accent</Badge>
      <Badge variant="success">Online</Badge>
      <Badge variant="warning">Degraded</Badge>
      <Badge variant="danger">Offline</Badge>
      <Badge variant="info">Updating</Badge>
    </div>
  ),
};
