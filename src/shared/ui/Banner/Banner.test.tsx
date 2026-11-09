import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Button } from '../Button';
import { Banner } from './Banner';

describe('Banner', () => {
  it.each([
    ['info', 'status'],
    ['success', 'status'],
    ['warning', 'status'],
    ['danger', 'alert'],
  ] as const)('%s is announced as %s (assertive only for errors)', (tone, role) => {
    render(<Banner tone={tone} title="Title" />);
    expect(screen.getByRole(role)).toHaveTextContent('Title');
  });

  it('is not a live region when it is part of the page from the start', () => {
    render(<Banner tone="danger" title="Title" live={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows an icon and a title for every tone, so color is never the only signal', () => {
    const { container } = render(
      <div>
        {(['info', 'success', 'warning', 'danger'] as const).map((tone) => (
          <Banner key={tone} tone={tone} title={tone} />
        ))}
      </div>,
    );
    for (const banner of container.querySelectorAll('[data-variant]')) {
      expect(banner.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(banner.textContent).not.toBe('');
    }
  });

  it('renders details and working actions', async () => {
    const onReload = vi.fn();
    render(
      <Banner
        tone="info"
        title="A new version is available"
        actions={
          <Button size="sm" onClick={onReload}>
            Reload now
          </Button>
        }
      >
        Reload to update.
      </Banner>,
    );
    expect(screen.getByText('Reload to update.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload now' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('passes native props through and merges classes', () => {
    render(<Banner title="T" id="b" data-testid="banner" className="mt-4" />);
    const banner = screen.getByTestId('banner');
    expect(banner).toHaveAttribute('id', 'b');
    expect(banner.className).toContain('mt-4');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <div>
        <Banner tone="warning" title="You are offline" actions={<Button size="sm">Retry</Button>}>
          Data may be out of date.
        </Banner>
        <Banner tone="danger" title="Could not connect" />
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
