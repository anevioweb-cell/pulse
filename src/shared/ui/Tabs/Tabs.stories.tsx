import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
  args: { variant: 'underline', defaultValue: 'live' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['underline', 'pill'] },
    onValueChange: { action: 'value changed' },
  },
  render: (args) => (
    <Tabs {...args} className="w-96">
      <TabsList aria-label="Telemetry views">
        <TabsTrigger value="live">Live</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="raw" disabled>
          Raw
        </TabsTrigger>
        <TabsTrigger value="alerts">Alerts</TabsTrigger>
      </TabsList>
      <TabsContent value="live">Streaming readings from 12 sensors.</TabsContent>
      <TabsContent value="history">Last 24 hours of readings.</TabsContent>
      <TabsContent value="raw">Raw frames.</TabsContent>
      <TabsContent value="alerts">No active alerts.</TabsContent>
    </Tabs>
  ),
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Underline: Story = {};
export const Pill: Story = { args: { variant: 'pill' } };
export const SecondTabActive: Story = { args: { defaultValue: 'history' } };
