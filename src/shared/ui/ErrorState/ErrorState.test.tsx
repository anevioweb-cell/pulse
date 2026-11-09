import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('announces itself and retries', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Could not load devices"
        description="Check your connection."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load devices');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows a busy retry button while retrying', () => {
    render(<ErrorState title="Failed" onRetry={vi.fn()} retrying />);
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveAttribute('aria-busy', 'true');
  });

  it('can render without announcing', () => {
    render(<ErrorState title="Failed" announce={false} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ErrorState title="Failed" onRetry={vi.fn()} />);
    await expectNoAxeViolations(container);
  });
});
