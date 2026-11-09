import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('is hidden from assistive technology and stops animating under reduced motion', () => {
    const { container } = render(<Skeleton shape="circle" />);
    const skeleton = container.firstElementChild;

    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton).toHaveAttribute('data-shape', 'circle');
    expect(skeleton?.className).toContain('motion-reduce:animate-none');
  });

  it('has no axe violations inside a busy region', async () => {
    const { container } = render(
      <div aria-busy="true">
        <span className="sr-only">Loading devices</span>
        <Skeleton />
        <Skeleton shape="rect" />
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
