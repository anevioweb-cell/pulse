import { DirectionProvider } from '@radix-ui/react-direction';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

function Example({ onValueChange }: { onValueChange?: (value: string) => void }) {
  return (
    <Tabs defaultValue="live" {...(onValueChange ? { onValueChange } : {})}>
      <TabsList aria-label="Telemetry views">
        <TabsTrigger value="live">Live</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="raw" disabled>
          Raw
        </TabsTrigger>
        <TabsTrigger value="alerts">Alerts</TabsTrigger>
      </TabsList>
      <TabsContent value="live">Live panel</TabsContent>
      <TabsContent value="history">History panel</TabsContent>
      <TabsContent value="raw">Raw panel</TabsContent>
      <TabsContent value="alerts">Alerts panel</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('moves and activates with arrow keys, skipping disabled tabs', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Example onValueChange={onValueChange} />);

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Live' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('History panel');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Alerts' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Live' })).toHaveFocus();
    expect(onValueChange).toHaveBeenLastCalledWith('live');
  });

  it('mirrors arrow keys in RTL', async () => {
    const user = userEvent.setup();
    render(
      <DirectionProvider dir="rtl">
        <Example />
      </DirectionProvider>,
    );
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'History' })).toHaveFocus();
  });

  it('activates a tab on click and links tabs to panels', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const tab = screen.getByRole('tab', { name: 'Alerts' });
    await user.click(tab);

    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Alerts' })).toHaveTextContent('Alerts panel');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Example />);
    await expectNoAxeViolations(container);
  });
});
