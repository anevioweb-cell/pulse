import { Button } from '../Button/Button';
import { toast } from './toast-store';
import { Toaster } from './Toaster';

import type { ToastVariant } from './toast-store';
import type { Meta, StoryObj } from '@storybook/react-vite';

interface ToastDemoProps {
  variant: ToastVariant;
  title: string;
  description: string;
  persistent: boolean;
}

/** Fires a toast. The Toaster itself is mounted once by the Storybook preview, like in the app. */
function ToastDemo({ variant, title, description, persistent }: ToastDemoProps) {
  return (
    <Button
      variant="secondary"
      onClick={() => {
        toast({
          variant,
          title,
          description,
          ...(persistent ? { duration: Number.POSITIVE_INFINITY } : {}),
        });
      }}
    >
      Show {variant} toast
    </Button>
  );
}

const meta = {
  title: 'Components/Toast',
  component: ToastDemo,
  subcomponents: { Toaster },
  args: {
    variant: 'neutral',
    title: 'Settings saved',
    description: 'Your changes apply to all devices.',
    persistent: false,
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['neutral', 'success', 'warning', 'danger', 'info'],
    },
  },
} satisfies Meta<typeof ToastDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Success: Story = {
  args: { variant: 'success', title: 'Device connected', description: 'ESP32-01 is online.' },
};
export const Warning: Story = {
  args: { variant: 'warning', title: 'Battery low', description: 'ESP32-03 is at 12 %.' },
};
export const Danger: Story = {
  args: {
    variant: 'danger',
    title: 'Device offline',
    description: 'ESP32-04 stopped reporting 2 minutes ago.',
  },
};
export const Info: Story = {
  args: { variant: 'info', title: 'Firmware update', description: 'Version 2.3 is available.' },
};
export const Persistent: Story = { args: { persistent: true } };

/** Shows the four status variants at once (the stack holds at most four toasts). */
export const Stack: Story = {
  play: () => {
    toast.dismissAll();
    toast.success('Device connected', { duration: Number.POSITIVE_INFINITY });
    toast.warning('Battery low', { duration: Number.POSITIVE_INFINITY });
    toast.info('Firmware update available', { duration: Number.POSITIVE_INFINITY });
    toast.danger('Device offline', {
      description: 'ESP32-04 stopped reporting.',
      duration: Number.POSITIVE_INFINITY,
    });
  },
};
