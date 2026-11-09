import { Plus, Router } from 'lucide-react';

import { Button } from '../Button/Button';
import { EmptyState } from './EmptyState';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/EmptyState',
  component: EmptyState,
  args: {
    title: 'No devices yet',
    description: 'Pair an ESP32 to start streaming telemetry.',
    size: 'md',
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    icon: { control: false },
    action: { control: false },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithAction: Story = {
  args: {
    icon: <Router />,
    action: (
      <Button>
        <Plus aria-hidden="true" />
        Add device
      </Button>
    ),
  },
};
export const Small: Story = { args: { size: 'sm', description: undefined } };
