import { Button } from '../Button/Button';
import { Input } from '../Input/Input';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Dialog';

import type { DialogContentProps } from './Dialog';
import type { Meta, StoryObj } from '@storybook/react-vite';

interface DialogStoryArgs {
  size: NonNullable<DialogContentProps['size']>;
  defaultOpen: boolean;
  hideCloseButton: boolean;
}

function ConfirmDialog({ size, defaultOpen, hideCloseButton }: DialogStoryArgs) {
  return (
    <Dialog defaultOpen={defaultOpen}>
      <DialogTrigger asChild>
        <Button variant="danger">Remove device</Button>
      </DialogTrigger>
      <DialogContent size={size} hideCloseButton={hideCloseButton}>
        <DialogHeader>
          <DialogTitle>Remove ESP32-01?</DialogTitle>
          <DialogDescription>
            The device stops streaming and its history is deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="danger">Remove</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const meta = {
  title: 'Components/Dialog',
  component: ConfirmDialog,
  args: { size: 'md', defaultOpen: false, hideCloseButton: false },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Confirm: Story = {};
export const Open: Story = { args: { defaultOpen: true } };
export const Small: Story = { args: { defaultOpen: true, size: 'sm' } };
export const Large: Story = { args: { defaultOpen: true, size: 'lg' } };

export const WithForm: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>Rename device</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename device</DialogTitle>
          <DialogDescription>The new name appears on every chart and alert.</DialogDescription>
        </DialogHeader>
        <Input label="Name" defaultValue="ESP32-01" />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
