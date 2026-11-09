import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { StatusIndicator } from './StatusIndicator';

const statuses = ['online', 'degraded', 'offline', 'unknown'] as const;

describe('StatusIndicator', () => {
  it.each(statuses)('always shows the label for %s, with a decorative dot', (status) => {
    const { container } = render(<StatusIndicator status={status} label={`Label ${status}`} />);
    expect(screen.getByText(`Label ${status}`)).toBeVisible();
    expect(container.querySelector('[data-status]')).toHaveAttribute('data-status', status);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('gives each status a different dot shape, not only a color', () => {
    const { container } = render(
      <div>
        {statuses.map((status) => (
          <StatusIndicator key={status} status={status} label={status} />
        ))}
      </div>,
    );
    const dots = [...container.querySelectorAll('[aria-hidden="true"]')].map(
      (dot) => dot.className,
    );
    expect(new Set(dots).size).toBe(statuses.length);
  });

  it('is not a live region unless asked', () => {
    render(<StatusIndicator status="online" label="Online" />);
    expect(screen.queryByRole('status')).toBeNull();
    render(<StatusIndicator status="offline" label="Offline" role="status" />);
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <div>
        {statuses.map((status) => (
          <StatusIndicator key={status} status={status} label={status} size="sm" />
        ))}
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
