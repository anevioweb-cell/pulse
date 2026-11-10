import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { messages } from '@/shared/i18n';

import { expectNoAxeViolations } from '../../../test/axe';
import { Button } from '../Button/Button';
import { PAGE_HEADING_ATTRIBUTE, PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the page h1, focusable by script but not in the tab order', () => {
    render(<PageHeader title="Devices" description="Every sensor" />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Devices' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading).toHaveAttribute(PAGE_HEADING_ATTRIBUTE);
    expect(screen.getByText('Every sensor')).toBeInTheDocument();
    heading.focus();
    expect(heading).toHaveFocus();
  });

  it('sets the document title through the messages module', () => {
    const { rerender } = render(<PageHeader title="Devices" />);
    expect(document.title).toBe(messages.app.documentTitle('Devices'));
    rerender(<PageHeader title="Alerts" />);
    expect(document.title).toBe(messages.app.documentTitle('Alerts'));
  });

  it('renders actions and has no axe violations', async () => {
    const { container } = render(
      <PageHeader title="Devices" actions={<Button size="sm">Export</Button>} />,
    );
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
