import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './Card';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Components/Card',
  component: Card,
  args: { variant: 'raised', padding: 'md' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['raised', 'flat', 'sunken'] },
    padding: { control: 'inline-radio', options: ['none', 'sm', 'md'] },
  },
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Living room</CardTitle>
        <CardDescription>ESP32-01 · BME280</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="numeric text-3xl">21.4 °C</p>
        <Badge variant="success">Online</Badge>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" size="sm">
          Details
        </Button>
      </CardFooter>
    </Card>
  ),
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Raised: Story = {};
export const Flat: Story = { args: { variant: 'flat' } };
export const Sunken: Story = { args: { variant: 'sunken' } };
export const Compact: Story = { args: { padding: 'sm' } };
