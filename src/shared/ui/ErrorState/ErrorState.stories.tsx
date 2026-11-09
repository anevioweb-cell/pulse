import { ErrorState } from './ErrorState';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/ErrorState',
  component: ErrorState,
  args: {
    title: 'Could not load devices',
    description: 'The server did not respond. Check your connection and try again.',
    size: 'md',
    announce: false,
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    onRetry: { action: 'retry' },
  },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithoutRetry: Story = {};
export const WithRetry: Story = { args: { onRetry: () => undefined } };
export const Retrying: Story = { args: { onRetry: () => undefined, retrying: true } };
export const Small: Story = { args: { size: 'sm', onRetry: () => undefined } };
