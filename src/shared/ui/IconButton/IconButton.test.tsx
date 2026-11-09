import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('uses the label as its accessible name', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton label="Settings" onClick={onClick}>
        <Settings aria-hidden="true" />
      </IconButton>,
    );
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('replaces the icon with a spinner while loading and stays named', () => {
    const { container } = render(
      <IconButton label="Refresh" loading>
        <Settings aria-hidden="true" data-testid="icon" />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <div>
        <IconButton label="Settings">
          <Settings aria-hidden="true" />
        </IconButton>
        <IconButton label="Settings" variant="secondary" disabled>
          <Settings aria-hidden="true" />
        </IconButton>
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
