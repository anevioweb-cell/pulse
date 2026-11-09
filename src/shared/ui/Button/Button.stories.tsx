import { ArrowRight, Plus } from 'lucide-react';

import { directionalIcon } from '../internal/styles';
import { Button } from './Button';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: {
    children: 'Save changes',
    variant: 'primary',
    size: 'md',
    loading: false,
    disabled: false,
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    onClick: { action: 'clicked' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Remove device' } };

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="md">
        Medium
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args}>
        <Plus aria-hidden="true" />
        Add device
      </Button>
      <Button {...args} variant="secondary">
        Next
        <ArrowRight aria-hidden="true" className={directionalIcon} />
      </Button>
    </div>
  ),
};

export const Loading: Story = { args: { loading: true, children: 'Saving' } };
export const Disabled: Story = { args: { disabled: true } };

export const AsLink: Story = {
  args: { asChild: true, variant: 'secondary' },
  render: (args) => (
    <Button {...args}>
      <a href="#devices">View devices</a>
    </Button>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-4 gap-3">
      {(['primary', 'secondary', 'ghost', 'danger'] as const).flatMap((variant) => [
        <Button key={`${variant}-default`} variant={variant}>
          {variant}
        </Button>,
        <Button key={`${variant}-loading`} variant={variant} loading>
          Loading
        </Button>,
        <Button key={`${variant}-disabled`} variant={variant} disabled>
          Disabled
        </Button>,
        <Button key={`${variant}-small`} variant={variant} size="sm">
          Small
        </Button>,
      ])}
    </div>
  ),
};
