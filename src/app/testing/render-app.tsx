// Renders the real route table in a memory router, inside the real providers, with a fake session.
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { ThemeProvider } from '@/shared/theme';

import { installMatchMedia } from '../../test/match-media';
import { AppProviders } from '../providers';
import { createAppRoutes } from '../router/routes';
import { createFakeSession } from './session-fakes';

import type { RouteModules } from '../router/routes';
import type { FakeSessionOptions } from './session-fakes';

export function renderApp(
  path = '/',
  { modules, session }: { modules?: Partial<RouteModules>; session?: FakeSessionOptions } = {},
) {
  installMatchMedia();
  const fake = createFakeSession(session);
  fake.controller.start();
  const router = createMemoryRouter(createAppRoutes(modules), { initialEntries: [path] });
  const view = render(
    <ThemeProvider>
      <AppProviders controller={fake.controller}>
        <RouterProvider router={router} />
      </AppProviders>
    </ThemeProvider>,
  );
  return { ...view, ...fake, router, user: userEvent.setup() };
}
