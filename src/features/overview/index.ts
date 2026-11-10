// Public API of the overview feature. Other features and app/ import only from here.

/** Route module for `/` (React Router `lazy`): loaded in its own chunk on first visit. */
export const loadOverviewRoute = () =>
  import('./pages/OverviewPage').then((module) => ({ Component: module.OverviewPage }));
