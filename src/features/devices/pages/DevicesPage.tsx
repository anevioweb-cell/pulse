import { messages } from '@/shared/i18n';
import { PageHeader } from '@/shared/ui';

export function DevicesPage() {
  return (
    <PageHeader
      title={messages.pages.devices.title}
      description={messages.pages.devices.description}
    />
  );
}
