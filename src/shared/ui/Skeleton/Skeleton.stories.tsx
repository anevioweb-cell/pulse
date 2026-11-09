import { Skeleton } from './Skeleton';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
  args: { shape: 'text' },
  argTypes: { shape: { control: 'inline-radio', options: ['text', 'rect', 'circle'] } },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {};
export const Rect: Story = { args: { shape: 'rect' } };
export const Circle: Story = { args: { shape: 'circle' } };

/** A loading card: the region carries aria-busy and a hidden label; skeletons are decorative. */
export const LoadingCard: Story = {
  render: () => (
    <div
      aria-busy="true"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-6"
    >
      <span className="sr-only">Loading device</span>
      <div className="flex items-center gap-3">
        <Skeleton shape="circle" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="w-1/2" />
          <Skeleton className="w-1/3" />
        </div>
      </div>
      <Skeleton shape="rect" />
    </div>
  ),
};
