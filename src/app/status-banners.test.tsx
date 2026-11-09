import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Connectivity } from '@/features/telemetry';
import { messages } from '@/shared/i18n';

import { expectNoAxeViolations } from '../test/axe';
import { createUpdateStore } from './pwa/update-store';
import { OfflineBanner, UpdateAvailableBanner } from './status-banners';

const connectivity = (overrides: Partial<Connectivity>): Connectivity => ({
  state: 'online',
  reason: null,
  demo: false,
  ...overrides,
});

describe('OfflineBanner', () => {
  it('shows nothing while online or unknown', () => {
    const { container, rerender } = render(<OfflineBanner connectivity={connectivity({})} />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <OfflineBanner connectivity={connectivity({ state: 'unknown', reason: 'no_signal' })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('appears when offline and disappears when back online', () => {
    const { rerender } = render(
      <OfflineBanner
        connectivity={connectivity({ state: 'offline', reason: 'browser_offline' })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(messages.offlineBanner.title);
    expect(screen.getByRole('status')).toHaveTextContent(messages.offlineBanner.liveBody);
    rerender(<OfflineBanner connectivity={connectivity({})} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('tells Demo Mode users that demo data keeps running', () => {
    render(
      <OfflineBanner
        connectivity={connectivity({ state: 'offline', reason: 'browser_offline', demo: true })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(messages.offlineBanner.demoBody);
  });

  it.each([
    ['live_reconnecting', messages.degradedBanner.reconnecting],
    ['live_failed', messages.degradedBanner.failed],
    ['live_silent', messages.degradedBanner.silent],
  ] as const)('explains a degraded connection (%s)', (reason, text) => {
    render(<OfflineBanner connectivity={connectivity({ state: 'degraded', reason })} />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });
});

describe('UpdateAvailableBanner', () => {
  it('appears only when an update is waiting', () => {
    const store = createUpdateStore();
    const { container } = render(<UpdateAvailableBanner store={store} />);
    expect(container).toBeEmptyDOMElement();
    act(() => {
      store.needRefresh(() => Promise.resolve());
    });
    expect(screen.getByRole('status')).toHaveTextContent(messages.updateBanner.title);
  });

  it('reloads only when the user asks, and hides on Later', async () => {
    const store = createUpdateStore();
    const apply = vi.fn(() => new Promise<void>(() => undefined)); // the page reloads instead
    act(() => {
      store.needRefresh(apply);
    });
    const first = render(<UpdateAvailableBanner store={store} />);
    await userEvent.click(screen.getByRole('button', { name: messages.updateBanner.reload }));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: messages.updateBanner.reload })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    const other = createUpdateStore();
    act(() => {
      other.needRefresh(() => Promise.resolve());
    });
    first.unmount();
    const { container } = render(<UpdateAvailableBanner store={other} />);
    await userEvent.click(screen.getByRole('button', { name: messages.updateBanner.later }));
    expect(container).toBeEmptyDOMElement();
  });

  it('has no axe violations', async () => {
    const store = createUpdateStore();
    store.needRefresh(() => Promise.resolve());
    const { container } = render(
      <div>
        <UpdateAvailableBanner store={store} />
        <OfflineBanner
          connectivity={connectivity({ state: 'offline', reason: 'browser_offline' })}
        />
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
