import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Badge } from './Badge';

describe('Badge', () => {
  it('pairs status variants with an icon so color is not the only signal', () => {
    const { container } = render(
      <div>
        <Badge variant="success">Online</Badge>
        <Badge variant="warning">Degraded</Badge>
        <Badge variant="danger">Offline</Badge>
        <Badge variant="info">Updating</Badge>
        <Badge>Sensor</Badge>
      </div>,
    );
    const badges = [...container.querySelectorAll('[data-variant]')];
    const iconCount = (variant: string) =>
      badges
        .find((badge) => badge.getAttribute('data-variant') === variant)
        ?.querySelectorAll('svg').length;

    expect(iconCount('success')).toBe(1);
    expect(iconCount('danger')).toBe(1);
    expect(iconCount('neutral')).toBe(0);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('accepts a custom icon or none', () => {
    const { container } = render(
      <div>
        <Badge variant="success" icon={false}>
          Online
        </Badge>
      </div>,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <div>
        <Badge variant="accent">New</Badge>
        <Badge variant="danger" size="md">
          Offline
        </Badge>
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
