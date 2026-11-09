import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Button } from './Button';

describe('Button', () => {
  it('is a type="button" button that fires onClick from mouse and keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });

    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('is reachable with Tab and shows the offset focus ring classes', async () => {
    const user = userEvent.setup();
    render(<Button>Save</Button>);
    await user.tab();
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveFocus();
    expect(button.className).toContain('focus-visible:outline-offset-2');
  });

  it('blocks interaction and exposes aria-busy while loading, keeping its name', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('data-loading');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not fire when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders its child with button styles when asChild is set', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/devices">Devices</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Devices' });
    expect(link.className).toContain('bg-surface-raised');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('forwards ref as a regular prop', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Save</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('has no axe violations across variants and states', async () => {
    const { container } = render(
      <div>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Delete</Button>
        <Button loading>Saving</Button>
        <Button disabled>Disabled</Button>
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
