import { Info } from 'lucide-react';

import { Button } from '../Button/Button';
import { IconButton } from '../IconButton/IconButton';
import { Tooltip } from './Tooltip';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/Tooltip',
  component: Tooltip,
  args: {
    content: 'Readings refresh every 5 seconds',
    side: 'top',
    align: 'center',
    children: <Button variant="secondary">Hover or focus me</Button>,
  },
  argTypes: {
    side: { control: 'inline-radio', options: ['top', 'right', 'bottom', 'left'] },
    align: { control: 'inline-radio', options: ['start', 'center', 'end'] },
    children: { control: false },
  },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="flex min-h-40 items-center justify-center">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { defaultOpen: true } };
export const Bottom: Story = { args: { defaultOpen: true, side: 'bottom' } };
export const OnIconButton: Story = {
  args: {
    content: 'About this metric',
    defaultOpen: true,
    children: (
      <IconButton label="About this metric">
        <Info aria-hidden="true" />
      </IconButton>
    ),
  },
};
