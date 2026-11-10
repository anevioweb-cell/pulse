// Public API of the settings feature. Other features and app/ import only from here.

/** Route module for `/settings` (placeholder until Phase 5C). */
export const loadSettingsRoute = () =>
  import('./pages/SettingsPage').then((module) => ({ Component: module.SettingsPage }));
