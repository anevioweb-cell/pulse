import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('is a status with an accessible label', () => {
    render(<Spinner label="Loading readings" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading readings');
  });

  it('can be decorative', () => {
    const { container } = render(<Spinner decorative />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('stops rotating under reduced motion', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain(
      'motion-reduce:animate-none',
    );
  });

  it('has no axe violations', async () => {
    const { container } = render(<Spinner size="lg" />);
    await expectNoAxeViolations(container);
  });
});
