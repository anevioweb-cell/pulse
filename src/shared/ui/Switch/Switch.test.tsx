import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Switch } from './Switch';

describe('Switch', () => {
  it('toggles with Space, click, and its label, exposing state', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch label="Live updates" onCheckedChange={onCheckedChange} />);
    const control = screen.getByRole('switch', { name: 'Live updates' });

    expect(control).not.toBeChecked();
    expect(control).toHaveAttribute('data-state', 'unchecked');

    control.focus();
    await user.keyboard(' ');
    expect(control).toBeChecked();
    expect(control).toHaveAttribute('data-state', 'checked');

    await user.click(control);
    expect(control).not.toBeChecked();

    await user.click(screen.getByText('Live updates'));
    expect(control).toBeChecked();
    expect(onCheckedChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('links the description', () => {
    render(<Switch label="Alerts" description="Notify when a threshold is crossed" />);
    expect(screen.getByRole('switch', { name: 'Alerts' })).toHaveAccessibleDescription(
      'Notify when a threshold is crossed',
    );
  });

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup();
    render(<Switch label="Alerts" disabled />);
    const control = screen.getByRole('switch', { name: 'Alerts' });
    expect(control).toHaveAttribute('data-disabled');
    await user.click(control);
    expect(control).not.toBeChecked();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <div>
        <Switch label="Off" />
        <Switch label="On" defaultChecked description="With description" />
        <Switch label="Disabled" disabled />
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
