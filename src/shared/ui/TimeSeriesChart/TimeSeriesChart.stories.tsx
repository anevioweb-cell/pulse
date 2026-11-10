import { useEffect, useRef } from 'react';

import { TimeSeriesChart } from './TimeSeriesChart';

import type { ChartWindow, TimeSeriesChartHandle, TimeSeriesData } from './TimeSeriesChart';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';

// Synthetic, deterministic data: a fixed end time and a seeded generator, so screenshots and the
// axe pass see the same chart every time.
const END = Date.UTC(2026, 10, 10, 12, 0, 0);
const SECOND = 1000;

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function series(
  count: number,
  value: (index: number, random: () => number) => number | null,
  stepMs = SECOND,
): { data: TimeSeriesData; window: ChartWindow } {
  const random = seeded(7);
  const xs: number[] = [];
  const ys: (number | null)[] = [];
  for (let index = 0; index < count; index += 1) {
    xs.push(END - (count - 1 - index) * stepMs);
    ys.push(value(index, random));
  }
  return { data: { xs, ys }, window: { from: END - count * stepMs, to: END } };
}

const DATASETS = {
  flat: series(60, () => 21.5),
  noisy: series(60, (index, random) => 21 + Math.sin(index / 8) + (random() - 0.5)),
  // Two dropouts: a null breaks the line (the adapter inserts one per gap).
  gaps: series(60, (index, random) =>
    index === 18 || index === 41 ? null : 21 + Math.sin(index / 8) + (random() - 0.5) * 0.4,
  ),
  empty: { data: { xs: [], ys: [] }, window: { from: END - 60 * SECOND, to: END } },
  // A full ring buffer: 1800 samples.
  many: series(1800, (index, random) => 20 + 3 * Math.sin(index / 120) + (random() - 0.5)),
} satisfies Record<string, { data: TimeSeriesData; window: ChartWindow }>;

type Dataset = keyof typeof DATASETS;

/** Feeds the dataset through the imperative handle, as the device page does. */
function ChartWithData({
  dataset,
  ...props
}: ComponentProps<typeof TimeSeriesChart> & { dataset: Dataset }) {
  const chart = useRef<TimeSeriesChartHandle>(null);
  useEffect(() => {
    const { data, window } = DATASETS[dataset]; // eslint-disable-line security/detect-object-injection -- typed dataset key
    chart.current?.setData(data, window);
  }, [dataset]);
  return <TimeSeriesChart ref={chart} {...props} />;
}

const meta = {
  title: 'Components/TimeSeriesChart',
  component: ChartWithData,
  args: {
    dataset: 'noisy',
    label: 'Temperature, last minute: latest 21.4 °C, between 20.3 and 22.4 °C',
    seriesName: 'Temperature',
    unit: '°C',
    decimals: 1,
    color: 1,
    size: 'md',
  },
  argTypes: {
    dataset: { control: 'inline-radio', options: Object.keys(DATASETS) },
    color: { control: 'inline-radio', options: [1, 2, 3, 4, 5, 6] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
  // The chart fills its container: give it a page-like width instead of the centered layout.
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-3xl max-w-full rounded-xl border border-border bg-surface-raised p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChartWithData>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Noisy: Story = {};
export const Flat: Story = { args: { dataset: 'flat' } };
export const Gaps: Story = { args: { dataset: 'gaps' } };
export const Thresholds: Story = {
  args: {
    thresholds: [
      { value: 22, label: 'Above 22 °C', tone: 'warning' },
      { value: 19, label: 'Below 19 °C', tone: 'danger' },
    ],
  },
};
export const Empty: Story = { args: { dataset: 'empty' } };
export const ManyPoints: Story = { args: { dataset: 'many', color: 3 } };
export const Dark: Story = { args: { dataset: 'gaps' }, globals: { theme: 'dark' } };
export const RightToLeft: Story = {
  args: { dataset: 'gaps', thresholds: [{ value: 22, label: 'Above 22 °C', tone: 'warning' }] },
  globals: { dir: 'rtl' },
};
