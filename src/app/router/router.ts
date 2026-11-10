import { createBrowserRouter } from 'react-router';

import { createAppRoutes } from './routes';

/** The app's browser router (history API; the service worker serves index.html for deep links). */
export const router = createBrowserRouter(createAppRoutes());
