import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { messages } from '@/shared/i18n';

import { expectNoAxeViolations } from '../../test/axe';
import { AppSessionProvider } from '../session/session-context';
import { createFakeSession } from '../testing/session-fakes';
import { DataSourceControl } from './DataSourceControl';
import { SimulatedDataBadge } from './SimulatedDataBadge';

import type { SessionController } from '../session/session-controller';

let active: SessionController | null = null;

afterEach(() => {
  active?.dispose();
  active = null;
});

function renderControl(fake = createFakeSession()) {
  active = fake.controller;
  fake.controller.start();
  const view = render(
    <AppSessionProvider controller={fake.controller}>
      <SimulatedDataBadge />
      <DataSourceControl />
    </AppSessionProvider>,
  );
  return { ...view, ...fake, user: userEvent.setup() };
}

const trigger = (mode: string) =>
  screen.getByRole('button', { name: messages.dataSource.trigger(mode) });

describe('DataSourceControl', () => {
  it('names the active mode and shows the simulated-data badge in Demo Mode', () => {
    renderControl();
    expect(trigger(messages.dataSource.demo)).toBeInTheDocument();
    expect(screen.getByText(messages.simulatedData.badge)).toBeInTheDocument();
  });

  it('shows a bad URL inline, focuses the field and changes nothing', async () => {
    const { user, controller, counter } = renderControl();
    await user.click(trigger(messages.dataSource.demo));
    const dialog = screen.getByRole('dialog', { name: messages.dataSource.title });
    await expectNoAxeViolations(dialog);

    await user.click(screen.getByRole('switch', { name: messages.dataSource.liveSwitch }));
    const field = screen.getByLabelText(messages.dataSource.urlLabel);
    await user.clear(field);
    await user.type(field, 'http://127.0.0.1:8787');
    await user.click(screen.getByRole('button', { name: messages.dataSource.apply }));

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining(messages.dataSource.urlProblems.scheme),
    );
    expect(field).toHaveFocus();
    expect(controller.getSnapshot().session.mode).toBe('demo');
    expect(counter.socketsCreated).toBe(0);
    await expectNoAxeViolations(dialog);

    await user.type(field, 'x');
    expect(field).not.toHaveAttribute('aria-invalid');
  });

  it('switches to Live Mode and back, and the badge follows the data source', async () => {
    const { user, controller, counter } = renderControl();
    await user.click(trigger(messages.dataSource.demo));
    await user.click(screen.getByRole('switch', { name: messages.dataSource.liveSwitch }));
    const field = screen.getByLabelText(messages.dataSource.urlLabel);
    await user.clear(field);
    await user.type(field, 'ws://127.0.0.1:9100');
    await user.click(screen.getByRole('button', { name: messages.dataSource.apply }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(controller.getSnapshot().session.mode).toBe('live');
    expect(trigger(messages.dataSource.live)).toBeInTheDocument();
    expect(counter.socketsOpen).toBe(1);
    // The fake server reports no devices, so nothing is simulated in Live Mode.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(messages.simulatedData.badge)).not.toBeInTheDocument();

    await user.click(trigger(messages.dataSource.live));
    await user.click(screen.getByRole('switch', { name: messages.dataSource.liveSwitch }));
    await user.click(screen.getByRole('button', { name: messages.dataSource.apply }));
    expect(controller.getSnapshot().session.mode).toBe('demo');
    expect(counter.socketsOpen).toBe(0);
    expect(screen.getByText(messages.simulatedData.badge)).toBeInTheDocument();
  });

  it('labels Live data simulated when the server says its devices are', async () => {
    const devices = [
      { id: 'esp32-01', name: 'Kitchen', location: 'Home', firmware: '1.0.0', source: 'simulated' },
    ];
    const fake = createFakeSession({
      fetch: () => Promise.resolve(Response.json({ devices })),
    });
    fake.controller.apply({ mode: 'live', liveUrl: 'ws://127.0.0.1:8787' });
    renderControl(fake);
    expect(await screen.findByText(messages.simulatedData.badge)).toBeInTheDocument();
  });
});
