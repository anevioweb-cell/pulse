import { messages } from '@/shared/i18n';
import { PageHeader } from '@/shared/ui';

/** Placeholder until Phase 5C. */
export function AlertsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={messages.pages.alerts.title} />
      <p className="text-text-muted">{messages.pages.alerts.comingSoon}</p>
    </div>
  );
}
