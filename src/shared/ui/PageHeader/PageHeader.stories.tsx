import { Button } from '../Button/Button';
import { PageHeader } from './PageHeader';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/PageHeader',
  component: PageHeader,
  args: { title: 'Devices', description: 'Every sensor, its location and latest readings.' },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const TitleOnly: Story = { args: { description: undefined } };
export const WithActions: Story = {
  args: {
    actions: (
      <>
        <Button variant="secondary" size="sm">
          Columns
        </Button>
        <Button size="sm">Export</Button>
      </>
    ),
  },
};
export const LongTitle: Story = {
  args: { title: 'Greenhouse north, bench 3, ESP32-S3 sensor node with external probe' },
};
