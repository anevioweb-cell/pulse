import { data } from 'react-router';

import { loadAlertsRoute } from '@/features/alerts';
import { isDeviceId, loadDeviceRoute, loadDevicesRoute } from '@/features/devices';
import { loadOverviewRoute } from '@/features/overview';
import { loadSettingsRoute } from '@/features/settings';
import { messages } from '@/shared/i18n';
import { Spinner } from '@/shared/ui';

import { HTTP_STATUS } from '../config';
import { AppLayout } from '../shell/AppLayout';
import { NotFoundPage } from './NotFoundPage';
import { ROUTES } from './paths';
import { resilientLazy } from './resilient-lazy';
import { RouteErrorBoundary } from './RouteErrorBoundary';

import type { RouteModuleLoader } from './resilient-lazy';
import type { LoaderFunctionArgs, RouteObject } from 'react-router';

type RouteModule = RouteModuleLoader;

/** Route modules, replaceable in tests (for example with one that fails to load). */
export interface RouteModules {
  overview: RouteModule;
  devices: RouteModule;
  device: RouteModule;
  alerts: RouteModule;
  settings: RouteModule;
}

const defaultModules: RouteModules = {
  overview: loadOverviewRoute,
  devices: loadDevicesRoute,
  device: loadDeviceRoute,
  alerts: loadAlertsRoute,
  settings: loadSettingsRoute,
};

/**
 * Guard for `/devices/:id`: the id must pass the REST contract's rule (letters, digits, `._:-`, at
 * most 64 characters, never a prototype key). Anything else is a 404, never a crash or a request.
 */
export function deviceIdGuard({ params }: LoaderFunctionArgs): null {
  // React Router's documented way to raise an HTTP-style error from a loader (an ErrorResponse).
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  if (!isDeviceId(params.id)) throw data(null, { status: HTTP_STATUS.NOT_FOUND });
  return null;
}

/** Shown while the first route module loads. */
function RouteFallback() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner label={messages.app.loading} />
    </div>
  );
}

/**
 * The route table. Every page is a lazy route (its own chunk), with its own error boundary inside
 * the layout, so a failed page never takes the navigation down.
 */
export function createAppRoutes(modules: Partial<RouteModules> = {}): RouteObject[] {
  const load = { ...defaultModules, ...modules };
  const page = (route: RouteObject): RouteObject => ({
    ...route,
    ErrorBoundary: RouteErrorBoundary,
  });
  return [
    {
      Component: AppLayout,
      HydrateFallback: RouteFallback,
      ErrorBoundary: RouteErrorBoundary,
      children: [
        page({ index: true, lazy: resilientLazy(load.overview) }),
        page({ path: ROUTES.devices, lazy: resilientLazy(load.devices) }),
        page({ path: ROUTES.device, loader: deviceIdGuard, lazy: resilientLazy(load.device) }),
        page({ path: ROUTES.alerts, lazy: resilientLazy(load.alerts) }),
        page({ path: ROUTES.settings, lazy: resilientLazy(load.settings) }),
        page({ path: '*', Component: NotFoundPage }),
      ],
    },
  ];
}
