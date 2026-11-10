import { useState } from 'react';

import { ChartSchedulerProvider } from '../../charts/scheduler-context';
import { ChartControls } from './ChartControls';

import type { ChartRange } from '../../charts/chart-range';
import type { Meta, StoryObj } from '@storybook/react-vite';

/** The range radios and the pause button, with working state (the URL is the app's store). */
function Controls({ initial }: { initial: ChartRange }) {
  const [range, setRange] = useState<ChartRange>(initial);
  return (
    <ChartSchedulerProvider>
      <ChartControls range={range} onRangeChange={setRange} />
    </ChartSchedulerProvider>
  );
}

const meta = {
  title: 'Devices/ChartControls',
  component: Controls,
  args: { initial: 'live' },
  argTypes: { initial: { control: 'inline-radio', options: ['live', '5m', '1h', '24h'] } },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Controls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};
export const OneHour: Story = { args: { initial: '1h' } };
export const RightToLeft: Story = { globals: { dir: 'rtl' } };
