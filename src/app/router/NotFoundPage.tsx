import { Link } from 'react-router';

import { messages } from '@/shared/i18n';
import { PageHeader } from '@/shared/ui';

import { ROUTES } from './paths';

/** Unknown paths and invalid route parameters (an id that fails the contract's rule). */
export function NotFoundPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={messages.pages.notFound.title}
        description={messages.pages.notFound.description}
      />
      <Link
        to={ROUTES.overview}
        className="w-fit rounded-sm text-accent underline underline-offset-4"
      >
        {messages.pages.notFound.home}
      </Link>
    </div>
  );
}
