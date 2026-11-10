import { useState } from 'react';

import { ColumnMenu } from './ColumnMenu';

import type { DeviceColumnId } from '../../model/table-url-state';
import type { Meta, StoryObj } from '@storybook/react-vite';

function StatefulMenu({ initial }: { initial: DeviceColumnId[] }) {
  const [hidden, setHidden] = useState<DeviceColumnId[]>(initial);
  return (
    <div className="flex flex-col items-start gap-2">
      <ColumnMenu hidden={hidden} onChange={setHidden} />
      <p className="text-sm text-text-muted">Hidden: {hidden.join(', ') || 'none'}</p>
    </div>
  );
}

const meta = {
  title: 'Devices/ColumnMenu',
  component: StatefulMenu,
  args: { initial: [] },
} satisfies Meta<typeof StatefulMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllVisible: Story = {};
export const SomeHidden: Story = { args: { initial: ['pressure', 'signal'] } };
