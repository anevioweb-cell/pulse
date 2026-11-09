import { ChevronRight, RefreshCw, Settings, Trash2 } from 'lucide-react';

import { directionalIcon } from '../internal/styles';
import { Tooltip } from '../Tooltip/Tooltip';
import { IconButton } from './IconButton';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/IconButton',
  component: IconButton,
  args: {
    label: 'Settings',
    variant: 'ghost',
    size: 'md',
    children: <Settings aria-hidden="true" />,
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    children: { control: false },
    onClick: { action: 'clicked' },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ghost: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Primary: Story = {
  args: { variant: 'primary', label: 'Refresh', children: <RefreshCw aria-hidden="true" /> },
};
export const Danger: Story = {
  args: { variant: 'danger', label: 'Delete', children: <Trash2 aria-hidden="true" /> },
};
export const Loading: Story = { args: { loading: true, label: 'Refresh' } };
export const Disabled: Story = { args: { disabled: true } };

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <IconButton {...args} size="sm" />
      <IconButton {...args} size="md" />
      <IconButton {...args} size="lg" />
    </div>
  ),
};

/** Directional icons mirror in RTL (switch the Direction toolbar item). */
export const DirectionalIcon: Story = {
  args: {
    label: 'Next page',
    variant: 'secondary',
    children: <ChevronRight aria-hidden="true" className={directionalIcon} />,
  },
};

export const WithTooltip: Story = {
  render: (args) => (
    <Tooltip content={args.label}>
      <IconButton {...args} />
    </Tooltip>
  ),
};
