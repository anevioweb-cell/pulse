import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Button } from '../Button/Button';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders a heading, description and action', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <EmptyState
        title="No devices yet"
        description="Pair an ESP32 to start streaming."
        headingLevel="h2"
        action={<Button onClick={onAdd}>Add device</Button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'No devices yet' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add device' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('has no axe violations', async () => {
    const { container } = render(<EmptyState title="Nothing here" size="sm" />);
    await expectNoAxeViolations(container);
  });
});
