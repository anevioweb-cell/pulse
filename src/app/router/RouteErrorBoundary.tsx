import { useState } from 'react';
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router';

import { messages } from '@/shared/i18n';
import { ErrorState, PageHeader } from '@/shared/ui';

import { HTTP_STATUS } from '../config';
import { NotFoundPage } from './NotFoundPage';
import { RouteModuleError } from './resilient-lazy';

/**
 * Error boundary of every route: a 404 (unknown path or invalid parameter) shows the not-found
 * page, anything else (a chunk that failed to load, a render error) the shared ErrorState inside
 * the layout, so navigation keeps working. "Try again" imports a failed page module again (see
 * resilientLazy), then navigates to the same location, which resets the boundary and reruns the
 * route's loader.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const location = useLocation();
  const [retrying, setRetrying] = useState(false);
  if (isRouteErrorResponse(error) && error.status === HTTP_STATUS.NOT_FOUND) {
    return <NotFoundPage />;
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={messages.pages.routeError.title} />
      <ErrorState
        title={messages.pages.routeError.problem}
        description={messages.pages.routeError.description}
        retryLabel={messages.pages.routeError.retry}
        headingLevel="h2"
        retrying={retrying}
        onRetry={() => {
          setRetrying(true);
          const reload = error instanceof RouteModuleError ? error.retry() : Promise.resolve();
          void reload
            .then(() => navigate(location, { replace: true }))
            .finally(() => {
              setRetrying(false);
            });
        }}
      />
    </div>
  );
}
