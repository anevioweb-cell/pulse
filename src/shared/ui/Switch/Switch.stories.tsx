import { Switch } from './Switch';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/Switch',
  component: Switch,
  args: { label: 'Live updates', size: 'md' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    onCheckedChange: { action: 'checked changed' },
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};
export const On: Story = { args: { defaultChecked: true } };
export const WithDescription: Story = {
  args: { label: 'Threshold alerts', description: 'Notify me when a reading crosses a limit.' },
};
export const Disabled: Story = { args: { disabled: true } };
export const DisabledOn: Story = { args: { disabled: true, defaultChecked: true } };
export const Small: Story = { args: { size: 'sm' } };
