import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { messages } from '@/shared/i18n';

import { expectNoAxeViolations } from '../../../test/axe';
import { DeviceStatusBadge } from './DeviceStatusBadge';

describe('DeviceStatusBadge', () => {
  it.each([
    ['online', messages.devices.status.online, 'success'],
    ['stale', messages.devices.status.stale, 'warning'],
    ['offline', messages.devices.status.offline, 'danger'],
    ['unknown', messages.devices.status.unknown, 'neutral'],
  ] as const)('%s reads "%s" with an icon, not color alone', async (status, text, variant) => {
    const { container } = render(<DeviceStatusBadge status={status} />);
    const badge = screen.getByText(text);
    expect(badge).toHaveAttribute('data-variant', variant);
    expect(badge.querySelector('svg')).not.toBeNull();
    await expectNoAxeViolations(container);
  });
});
