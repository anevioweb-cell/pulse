import { Input } from './Input';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/Input',
  component: Input,
  args: { label: 'Device name', placeholder: 'ESP32-01', size: 'md' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithHint: Story = { args: { hint: 'Shown on the dashboard and in alerts.' } };
export const WithError: Story = {
  args: { hint: 'Between 1 and 3600.', error: 'Must be at least 1 second.', label: 'Interval' },
};
export const Required: Story = { args: { required: true } };
export const Disabled: Story = { args: { disabled: true, defaultValue: 'ESP32-01' } };
export const HiddenLabel: Story = {
  args: { label: 'Search devices', hideLabel: true, type: 'search', placeholder: 'Search…' },
};
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      <Input {...args} size="sm" label="Small" />
      <Input {...args} size="md" label="Medium" />
      <Input {...args} size="lg" label="Large" />
    </div>
  ),
};
