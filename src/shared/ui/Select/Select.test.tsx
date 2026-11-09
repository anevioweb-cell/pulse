import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Select } from './Select';

const OPTIONS = [
  { value: 'celsius', label: 'Celsius' },
  { value: 'fahrenheit', label: 'Fahrenheit' },
  { value: 'kelvin', label: 'Kelvin', disabled: true },
];

describe('Select', () => {
  it('opens with the keyboard, moves with arrows, and selects with Enter', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Select label="Unit" options={OPTIONS} onValueChange={onValueChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Unit' });

    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{ArrowDown}{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('fahrenheit');
    expect(trigger).toHaveTextContent('Fahrenheit');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selects with the pointer and skips disabled options', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Select label="Unit" options={OPTIONS} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Unit' }));
    expect(screen.getByRole('option', { name: 'Kelvin' })).toHaveAttribute('data-disabled');
    await user.click(screen.getByRole('option', { name: 'Celsius' }));
    expect(onValueChange).toHaveBeenCalledWith('celsius');
  });

  it('closes on Escape without changing the value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select
        label="Unit"
        options={OPTIONS}
        defaultValue="celsius"
        onValueChange={onValueChange}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Unit' });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Celsius');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('shows the placeholder and wires hint and error', () => {
    render(<Select label="Unit" options={OPTIONS} placeholder="Pick a unit" error="Required" />);
    const trigger = screen.getByRole('combobox', { name: 'Unit' });
    expect(trigger).toHaveTextContent('Pick a unit');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAccessibleDescription('Required');
  });

  it('cannot open when disabled', async () => {
    const user = userEvent.setup();
    render(<Select label="Unit" options={OPTIONS} disabled />);
    const trigger = screen.getByRole('combobox', { name: 'Unit' });
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('has no axe violations closed and open', async () => {
    const user = userEvent.setup();
    render(<Select label="Unit" options={OPTIONS} hint="Display unit" />);
    await expectNoAxeViolations();
    await user.click(screen.getByRole('combobox', { name: 'Unit' }));
    await expectNoAxeViolations();
  });
});
