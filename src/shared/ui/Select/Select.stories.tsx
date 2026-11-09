import { Select } from './Select';

import type { Meta, StoryObj } from '@storybook/react-vite';

const UNITS = [
  { value: 'celsius', label: 'Celsius (°C)' },
  { value: 'fahrenheit', label: 'Fahrenheit (°F)' },
  { value: 'kelvin', label: 'Kelvin (K)', disabled: true },
];

const meta = {
  title: 'Components/Select',
  component: Select,
  args: { label: 'Temperature unit', options: UNITS, size: 'md' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    onValueChange: { action: 'value changed' },
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = { args: { defaultValue: 'celsius' } };
export const WithHint: Story = { args: { hint: 'Used for all temperature readings.' } };
export const WithError: Story = { args: { error: 'Choose a unit.', required: true } };
export const Disabled: Story = { args: { disabled: true, defaultValue: 'celsius' } };
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      <Select {...args} size="sm" label="Small" />
      <Select {...args} size="md" label="Medium" />
      <Select {...args} size="lg" label="Large" />
    </div>
  ),
};
