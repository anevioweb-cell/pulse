import { messages } from '@/shared/i18n';
import { PageHeader } from '@/shared/ui';

export function OverviewPage() {
  return (
    <PageHeader
      title={messages.pages.overview.title}
      description={messages.pages.overview.description}
    />
  );
}
