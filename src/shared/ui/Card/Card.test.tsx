import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './Card';

describe('Card', () => {
  it('renders composed parts with the chosen heading level', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle as="h2">Temperature</CardTitle>
          <CardDescription>Living room sensor</CardDescription>
        </CardHeader>
        <CardContent>21.4 °C</CardContent>
        <CardFooter>Updated just now</CardFooter>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Temperature' })).toBeInTheDocument();
  });

  it('renders as its child element with asChild', () => {
    render(
      <Card asChild variant="sunken">
        <section aria-label="Summary">Content</section>
      </Card>,
    );
    const region = screen.getByRole('region', { name: 'Summary' });
    expect(region.className).toContain('bg-surface-sunken');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Humidity</CardTitle>
        </CardHeader>
        <CardContent>48 %</CardContent>
      </Card>,
    );
    await expectNoAxeViolations(container);
  });
});
