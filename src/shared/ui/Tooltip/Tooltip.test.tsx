import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Button } from '../Button/Button';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('opens on keyboard focus, describes the trigger, and closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Refreshes every 5 seconds">
        <Button>Refresh</Button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Refresh' });

    await user.tab();
    expect(trigger).toHaveFocus();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Refreshes every 5 seconds');
    expect(trigger).toHaveAccessibleDescription('Refreshes every 5 seconds');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('opens on hover', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Help text" delayDuration={0}>
        <Button>Help</Button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button', { name: 'Help' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Help text');
  });

  it('has no axe violations when open', async () => {
    render(
      <Tooltip content="Help text" defaultOpen>
        <Button>Help</Button>
      </Tooltip>,
    );
    await screen.findByRole('tooltip');
    await expectNoAxeViolations();
  });
});
