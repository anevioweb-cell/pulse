import { FlaskConical } from 'lucide-react';

import { useDevices } from '@/features/telemetry';
import { messages } from '@/shared/i18n';
import { Badge } from '@/shared/ui';

import { useAppSession } from '../session/session-context';

/**
 * Persistent "Simulated data" label. Shown in Demo Mode, and also in Live Mode when the server says
 * any device is simulated (`source: 'simulated'`, as the mock server's fleet is), so generated
 * values never look like real measurements.
 */
export function SimulatedDataBadge() {
  const { session } = useAppSession();
  const { data } = useDevices();
  const simulated =
    session.mode === 'demo' || (data ?? []).some((device) => device.source === 'simulated');
  if (!simulated) return null;
  return (
    <Badge
      variant="info"
      size="md"
      icon={<FlaskConical aria-hidden="true" />}
      title={messages.simulatedData.description}
    >
      {messages.simulatedData.badge}
    </Badge>
  );
}
