// Public API of the alerts feature. Other features and app/ import only from here.

/** Route module for `/alerts` (placeholder until Phase 5C). */
export const loadAlertsRoute = () =>
  import('./pages/AlertsPage').then((module) => ({ Component: module.AlertsPage }));
