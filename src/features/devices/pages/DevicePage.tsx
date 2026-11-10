import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { messages } from '@/shared/i18n';
import { PageHeader } from '@/shared/ui';

/**
 * Device detail (Phase 5B adds charts). The route guard has already validated `:id` with the REST
 * contract's id rule, so the value is safe to show and to use in query keys.
 */
export function DevicePage() {
  const { id = '' } = useParams();
  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/devices"
        className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-accent underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        {messages.pages.device.back}
      </Link>
      <PageHeader title={messages.pages.device.title(id)} />
      <p className="text-text-muted">{messages.pages.device.comingSoon}</p>
    </div>
  );
}
