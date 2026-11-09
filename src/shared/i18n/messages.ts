// Every user-facing string outside components' props lives here, in English, so Phase 8
// (react-i18next, EN/FR/AR) can move them to translation files in one place. Functions are used
// where a value is inserted, so word order can change per language.

export const messages = {
  lastUpdated: {
    /** No successful refresh yet. */
    never: 'Not updated yet',
    /** `relative` comes from Intl.RelativeTimeFormat, e.g. "5 minutes ago" or "now". */
    at: (relative: string) => `Updated ${relative}`,
  },
  connectivity: {
    online: 'Online',
    offline: 'Offline',
    degraded: 'Connection problems',
    unknown: 'Checking connection',
  },
  offlineBanner: {
    title: 'You are offline',
    liveBody: 'Live data has stopped. Data shown may be out of date, and changes cannot be saved.',
    demoBody:
      'Demo data keeps running. Saved data may be out of date, and changes cannot be saved.',
  },
  degradedBanner: {
    title: 'Connection problems',
    reconnecting: 'Reconnecting to live data…',
    failed: 'Could not connect to live data.',
    silent: 'No live data received recently.',
  },
  updateBanner: {
    title: 'A new version is available',
    body: 'Reload to update. Live data shown now will be cleared.',
    reload: 'Reload now',
    later: 'Later',
  },
} as const;
