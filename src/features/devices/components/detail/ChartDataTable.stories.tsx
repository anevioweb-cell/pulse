import { ChartDataTable } from './ChartDataTable';

import type { TableSnapshot } from './ChartDataTable';
import type { Meta, StoryObj } from '@storybook/react-vite';

const AT = Date.UTC(2026, 10, 10, 12, 0, 0);
const SECOND = 1000;

const snapshot = (count: number, total = count): TableSnapshot => ({
  at: AT,
  total,
  rows: Array.from({ length: count }, (_unused, index) => ({
    t: AT - index * SECOND,
    value: 21 + Math.sin(index / 5),
  })),
});

const meta = {
  title: 'Devices/ChartDataTable',
  component: ChartDataTable,
  args: { metric: 'temperature', snapshot: snapshot(12), onRefresh: () => undefined },
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-xl max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChartDataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Capped: Story = { args: { snapshot: snapshot(300, 1800) } };
export const Empty: Story = { args: { snapshot: snapshot(0) } };
export const RightToLeft: Story = { globals: { dir: 'rtl' } };
