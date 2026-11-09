import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { DEFAULT_TOAST_DURATION_MS, toast } from './toast-store';
import { Toaster } from './Toaster';

afterEach(() => {
  act(() => {
    toast.dismissAll();
  });
  vi.useRealTimers();
});

const region = () => screen.getByRole('region', { name: 'Notifications' });

function liveList(politeness: 'polite' | 'assertive'): HTMLElement {
  const list = region().querySelector<HTMLElement>(`[aria-live="${politeness}"]`);
  if (!list) throw new Error(`No ${politeness} live region`);
  return list;
}

describe('Toaster', () => {
  it('renders live regions before any toast so announcements are not missed', () => {
    render(<Toaster />);
    const lists = within(region()).getAllByRole('list');
    expect(lists.map((list) => list.getAttribute('aria-live'))).toEqual(['assertive', 'polite']);
  });

  it('shows toasts in the right live region, with an icon for status variants', () => {
    render(<Toaster />);
    act(() => {
      toast.success('Device connected', { description: 'ESP32-01 is online.' });
      toast.danger('Device offline');
    });
    expect(within(liveList('polite')).getByText('Device connected')).toBeInTheDocument();
    expect(within(liveList('assertive')).getByText('Device offline')).toBeInTheDocument();
    const item = screen.getByText('Device connected').closest('li');
    expect(item).toHaveAttribute('data-variant', 'success');
    expect(item?.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
  });

  it('dismisses with the button and with Escape', async () => {
    const user = userEvent.setup();
    render(<Toaster />);
    act(() => {
      toast({ title: 'First' });
      toast({ title: 'Second' });
    });

    const [firstDismiss] = screen.getAllByRole('button', { name: 'Dismiss notification' });
    if (!firstDismiss) throw new Error('No dismiss button');
    await user.click(firstDismiss);
    expect(screen.queryByText('First')).not.toBeInTheDocument();

    screen.getByRole('button', { name: 'Dismiss notification' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
  });

  it('auto-dismisses after its duration and pauses while hovered', () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast({ title: 'Saved' });
    });
    const item = screen.getByText('Saved').closest('li') as HTMLElement;

    fireEvent.pointerEnter(item);
    act(() => {
      vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS * 2);
    });
    expect(screen.getByText('Saved')).toBeInTheDocument();

    fireEvent.pointerLeave(item);
    act(() => {
      vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS);
    });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('keeps toasts with an infinite duration', () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast({ title: 'Sticky', duration: Number.POSITIVE_INFINITY });
      vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS * 10);
    });
    expect(screen.getByText('Sticky')).toBeInTheDocument();
  });

  it('has no axe violations with toasts shown', async () => {
    render(<Toaster />);
    act(() => {
      toast.info('Firmware update available');
      toast.warning('Battery low');
    });
    await expectNoAxeViolations();
  });
});
