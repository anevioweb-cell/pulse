import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Thermometer } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Button } from '../Button/Button';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('is a group named by its label, with value, unit and description', () => {
    render(
      <KpiCard
        label="Average temperature"
        value="21.4"
        unit="°C"
        description="Across 8 online devices"
        icon={<Thermometer />}
      />,
    );
    const group = screen.getByRole('group', { name: 'Average temperature' });
    expect(group).toHaveTextContent('21.4');
    expect(group).toHaveTextContent('°C');
    expect(group).toHaveTextContent('Across 8 online devices');
    expect(group).toHaveAttribute('data-tone', 'neutral');
    expect(group).not.toHaveAttribute('aria-busy');
  });

  it('shows a skeleton and aria-busy while loading, keeping the label', () => {
    render(<KpiCard label="Alerts" value="3" loading />);
    const group = screen.getByRole('group', { name: 'Alerts' });
    expect(group).toHaveAttribute('aria-busy', 'true');
    expect(group).toHaveAttribute('data-loading');
    expect(group).not.toHaveTextContent('3');
  });

  it('applies the tone as a data attribute and renders an action', async () => {
    const onRetry = vi.fn();
    render(
      <KpiCard
        label="Alerts"
        value="—"
        tone="danger"
        description="Could not load alerts"
        action={
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        }
      />,
    );
    expect(screen.getByRole('group', { name: 'Alerts' })).toHaveAttribute('data-tone', 'danger');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('merges className last and has no axe violations', async () => {
    const { container } = render(
      <KpiCard label="Devices online" value="8" unit="of 12" className="col-span-2" />,
    );
    expect(screen.getByRole('group')).toHaveClass('col-span-2');
    await expectNoAxeViolations(container);
  });
});
