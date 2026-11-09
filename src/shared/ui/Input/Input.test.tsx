import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Input } from './Input';

describe('Input', () => {
  it('is labelled and accepts typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input label="Device name" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Device name' });

    await user.type(input, 'ESP32-01');
    expect(input).toHaveValue('ESP32-01');
    expect(onChange).toHaveBeenCalledTimes('ESP32-01'.length);
  });

  it('links the hint through aria-describedby', () => {
    render(<Input label="Interval" hint="In seconds" />);
    expect(screen.getByRole('textbox', { name: 'Interval' })).toHaveAccessibleDescription(
      'In seconds',
    );
  });

  it('marks errors with aria-invalid, data-invalid and a described message', () => {
    render(<Input label="Interval" hint="In seconds" error="Must be at least 1" />);
    const input = screen.getByRole('textbox', { name: 'Interval' });

    expect(input).toBeInvalid();
    expect(input).toHaveAttribute('data-invalid');
    expect(input).toHaveAccessibleDescription('In seconds Must be at least 1');
  });

  it('marks required fields natively and hides the asterisk from assistive tech', () => {
    render(<Input label="Name" required />);
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeRequired();
  });

  it('supports a visually hidden label', () => {
    render(<Input label="Search" hideLabel type="search" />);
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
  });

  it('cannot be edited when disabled', async () => {
    const user = userEvent.setup();
    render(<Input label="Name" disabled />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.type(input, 'x');
    expect(input).toHaveValue('');
  });

  it('has no axe violations in default, hint, error and disabled states', async () => {
    const { container } = render(
      <div>
        <Input label="Default" />
        <Input label="With hint" hint="Helpful text" />
        <Input label="With error" error="Something is wrong" />
        <Input label="Disabled" disabled />
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
