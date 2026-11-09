import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Button } from '../Button/Button';
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

function Example({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <Dialog {...(onOpenChange ? { onOpenChange } : {})}>
      <DialogTrigger asChild>
        <Button>Remove device</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove ESP32-01?</DialogTitle>
          <DialogDescription>Its history will be deleted.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button variant="danger">Remove</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('opens as a labelled, described modal and moves focus inside', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Remove device' }));

    const dialog = screen.getByRole('dialog', { name: 'Remove ESP32-01?' });
    expect(dialog).toHaveAccessibleDescription('Its history will be deleted.');
    expect(dialog).toHaveAttribute('data-state', 'open');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('traps Tab focus inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Remove device' }));
    const dialog = screen.getByRole('dialog');

    for (let step = 0; step < 5; step += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', { name: 'Remove device' });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('closes from the built-in close button and from DialogClose', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Remove device' });

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no axe violations when open', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Remove device' }));
    await expectNoAxeViolations();
  });
});
