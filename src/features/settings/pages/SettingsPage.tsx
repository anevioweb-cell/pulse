import { messages } from '@/shared/i18n';
import { PageHeader } from '@/shared/ui';

/** Placeholder until Phase 5C. */
export function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={messages.pages.settings.title} />
      <p className="text-text-muted">{messages.pages.settings.comingSoon}</p>
    </div>
  );
}
