import { Button } from '../Button';
import { Banner } from './Banner';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/Banner',
  component: Banner,
  args: {
    tone: 'info',
    title: 'A new version is available',
    children: 'Reload to update. Live data shown now will be cleared.',
    live: true,
  },
  argTypes: {
    tone: { control: 'inline-radio', options: ['info', 'success', 'warning', 'danger'] },
    actions: { control: false },
  },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};
export const Success: Story = {
  args: { tone: 'success', title: 'Back online', children: undefined },
};
export const Warning: Story = {
  args: {
    tone: 'warning',
    title: 'You are offline',
    children: 'Live data has stopped. Data shown may be out of date, and changes cannot be saved.',
  },
};
export const Danger: Story = {
  args: { tone: 'danger', title: 'Could not connect to live data.', children: undefined },
};
export const WithActions: Story = {
  args: {
    actions: (
      <>
        <Button size="sm" variant="ghost">
          Later
        </Button>
        <Button size="sm">Reload now</Button>
      </>
    ),
  },
};
export const NotLive: Story = { args: { live: false, title: 'Static notice' } };

export const AllTones: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Banner tone="info" title="A new version is available" live={false} />
      <Banner tone="success" title="Back online" live={false} />
      <Banner tone="warning" title="You are offline" live={false}>
        Data may be out of date.
      </Banner>
      <Banner tone="danger" title="Could not connect" live={false} />
    </div>
  ),
};

/** Arabic, right to left: icon and actions swap sides, the accent border stays at the start. */
export const RightToLeft: Story = {
  globals: { dir: 'rtl', locale: 'ar' },
  args: {
    title: 'يتوفر إصدار جديد',
    children: 'أعد التحميل للتحديث.',
    actions: <Button size="sm">إعادة التحميل</Button>,
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  args: { tone: 'warning', title: 'You are offline' },
};
