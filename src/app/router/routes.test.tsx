import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadDevicesRoute } from '@/features/devices';
import { messages } from '@/shared/i18n';

import { expectNoAxeViolations } from '../../test/axe';
import { MAIN_CONTENT_ID } from '../shell/AppLayout';
import { renderApp } from '../testing/render-app';

import type { SessionController } from '../session/session-controller';

let controller: SessionController | null = null;

afterEach(() => {
  controller?.dispose();
  controller = null;
});

function setup(...args: Parameters<typeof renderApp>) {
  const result = renderApp(...args);
  controller = result.controller;
  return result;
}

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('routes', () => {
  it.each([
    ['/', messages.pages.overview.title],
    ['/devices', messages.pages.devices.title],
    ['/devices/esp32-01', messages.pages.device.title('esp32-01')],
    ['/alerts', messages.pages.alerts.title],
    ['/settings', messages.pages.settings.title],
    ['/no/such/page', messages.pages.notFound.title],
  ])(
    '%s renders its page inside the shell, titled from the messages module',
    async (path, title) => {
      setup(path);
      expect(await heading(title)).toBeInTheDocument();
      await waitFor(() => {
        expect(document.title).toBe(messages.app.documentTitle(title));
      });
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: messages.nav.label })).toBeInTheDocument();
      expect(screen.getByRole('main')).toHaveAttribute('id', MAIN_CONTENT_ID);
      await expectNoAxeViolations(document.body);
    },
  );

  it.each([
    '/devices/__proto__',
    '/devices/constructor',
    '/devices/a%20b',
    '/devices/..%2F..%2Fapi',
    '/devices/%3Cscript%3E',
    `/devices/${'x'.repeat(65)}`,
  ])('an invalid device id (%s) shows the 404 page, never a crash', async (path) => {
    setup(path);
    expect(await heading(messages.pages.notFound.title)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: messages.nav.label })).toBeInTheDocument();
  });

  it('the device page has a back link to the table', async () => {
    const { user } = setup('/devices/esp32-01');
    await heading(messages.pages.device.title('esp32-01'));
    await user.click(screen.getByRole('link', { name: messages.pages.device.back }));
    expect(await heading(messages.pages.devices.title)).toBeInTheDocument();
  });
});

describe('route error boundary', () => {
  it('shows ErrorState inside the layout when a page fails to load, and retries', async () => {
    let attempts = 0;
    const flakyDevices = () => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error('chunk failed')) : loadDevicesRoute();
    };
    const { user } = setup('/devices', { modules: { devices: flakyDevices } });

    expect(await heading(messages.pages.routeError.title)).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(messages.pages.routeError.problem)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: messages.nav.label })).toBeInTheDocument();
    await expectNoAxeViolations(document.body);

    await user.click(screen.getByRole('button', { name: messages.pages.routeError.retry }));
    expect(await heading(messages.pages.devices.title)).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});

describe('route error boundary for render errors', () => {
  it('catches a page that throws while rendering, and retries', async () => {
    let broken = true;
    function Broken() {
      if (broken) throw new Error('render failed');
      return <h1>{messages.pages.alerts.title}</h1>;
    }
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { user } = setup('/alerts', {
      modules: { alerts: () => Promise.resolve({ Component: Broken }) },
    });
    expect(await heading(messages.pages.routeError.title)).toBeInTheDocument();
    broken = false;
    await user.click(screen.getByRole('button', { name: messages.pages.routeError.retry }));
    expect(await heading(messages.pages.alerts.title)).toBeInTheDocument();
    silence.mockRestore();
  });
});

describe('route accessibility', () => {
  it('moves focus to the new page heading and updates the title on navigation', async () => {
    const { user } = setup('/');
    const overview = await heading(messages.pages.overview.title);
    expect(overview).not.toHaveFocus(); // not on the first load

    const nav = screen.getByRole('navigation', { name: messages.nav.label });
    const devicesLink = within(nav).getByRole('link', { name: messages.nav.devices });
    await user.click(devicesLink);

    const devices = await heading(messages.pages.devices.title);
    await waitFor(() => {
      expect(devices).toHaveFocus();
    });
    expect(document.title).toBe(messages.app.documentTitle(messages.pages.devices.title));
    expect(devicesLink).toHaveAttribute('aria-current', 'page');
    expect(devices).toHaveAttribute('tabindex', '-1'); // focusable by script, not in the tab order
  });

  it('keeps focus on the device page heading when the device finishes loading', async () => {
    const { user } = setup('/devices');
    await heading(messages.pages.devices.title);
    const table = await screen.findByRole('table');
    const [link] = within(table).getAllByRole('link');
    if (!link) throw new Error('no device link');
    const name = link.textContent;
    await user.click(link);
    // The loading header is the same element as the loaded one: only its text changes.
    const loaded = await screen.findByRole('heading', { level: 1, name });
    await waitFor(() => {
      expect(loaded).toHaveFocus();
    });
  });

  it('does not move focus when only the query string changes', async () => {
    const { router } = setup('/devices');
    const devices = await heading(messages.pages.devices.title);
    const nav = screen.getByRole('navigation', { name: messages.nav.label });
    const link = within(nav).getByRole('link', { name: messages.nav.devices });
    link.focus();
    await act(() => router.navigate('/devices?q=kitchen', { replace: true }));
    expect(link).toHaveFocus();
    expect(devices).not.toHaveFocus();
  });

  it('is keyboard operable: skip link first, then the controls and the navigation', async () => {
    const { user } = setup('/');
    await heading(messages.pages.overview.title);

    await user.tab();
    const skip = screen.getByRole('link', { name: messages.app.skipLink });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', `#${MAIN_CONTENT_ID}`);
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');

    // Tab through the header to the navigation, then open Alerts with Enter.
    const nav = screen.getByRole('navigation', { name: messages.nav.label });
    const alertsLink = within(nav).getByRole('link', { name: messages.nav.alerts });
    for (let step = 0; step < 10 && document.activeElement !== alertsLink; step += 1) {
      await user.tab();
    }
    expect(alertsLink).toHaveFocus();
    await user.keyboard('{Enter}');
    const alerts = await heading(messages.pages.alerts.title);
    await waitFor(() => {
      expect(alerts).toHaveFocus();
    });
  });

  it('cycles the theme through the existing ThemeProvider', async () => {
    const { user } = setup('/');
    await heading(messages.pages.overview.title);
    const toggle = screen.getByRole('button', {
      name: messages.theme.toggle(messages.theme.system),
    });
    await user.click(toggle);
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(
      screen.getByRole('button', { name: messages.theme.toggle(messages.theme.light) }),
    ).toBeInTheDocument();
  });
});
