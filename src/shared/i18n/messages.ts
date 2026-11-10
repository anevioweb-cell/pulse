// Every user-facing string outside components' props lives here, in English, so Phase 8
// (react-i18next, EN/FR/AR) can move them to translation files in one place. Functions are used
// where a value is inserted, so word order can change per language.

export const messages = {
  app: {
    name: 'Pulse',
    /** Browser tab title for a page. */
    documentTitle: (page: string) => `${page} · Pulse`,
    skipLink: 'Skip to main content',
    loading: 'Loading…',
  },
  nav: {
    label: 'Main',
    overview: 'Overview',
    devices: 'Devices',
    alerts: 'Alerts',
    settings: 'Settings',
  },
  theme: {
    /** Button label; `current` is one of the names below. */
    toggle: (current: string) => `Theme: ${current}. Change theme`,
    system: 'System',
    light: 'Light',
    dark: 'Dark',
  },
  pages: {
    overview: { title: 'Overview', description: 'Live status of every sensor in the fleet.' },
    devices: { title: 'Devices', description: 'Every sensor, its location and latest readings.' },
    device: {
      /** `id` is a validated device id. */
      title: (id: string) => `Device ${id}`,
      back: 'Back to devices',
    },
    alerts: {
      title: 'Alerts',
      comingSoon: 'Alert history and rule editing arrive in a later release.',
    },
    settings: {
      title: 'Settings',
      comingSoon: 'Settings arrive in a later release. The data source is in the header.',
    },
    notFound: {
      title: 'Page not found',
      description: 'This address does not match any page, or the device does not exist.',
      home: 'Go to the overview',
    },
    routeError: {
      title: 'This page could not be shown',
      problem: 'Something went wrong while loading this page.',
      description: 'Try again, or come back later.',
      retry: 'Try again',
    },
  },
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
  common: {
    close: 'Close',
    cancel: 'Cancel',
  },
  dataSource: {
    /** Header button; `mode` is `demo` or `live` below. */
    trigger: (mode: string) => `Data source: ${mode}`,
    demo: 'Demo',
    live: 'Live',
    title: 'Data source',
    description:
      'Demo Mode simulates a fleet of sensors in your browser and needs no server. Live Mode connects to a telemetry server.',
    liveSwitch: 'Live Mode',
    liveSwitchDescription: 'Connect to a telemetry server instead of the simulator.',
    urlLabel: 'Live server URL',
    /** `example` is the default server address. */
    urlHint: (example: string) => `A ws:// or wss:// address, for example ${example}`,
    apply: 'Apply',
    urlProblems: {
      empty: 'Enter the server address.',
      tooLong: 'This address is too long.',
      invalid: 'This is not a valid address.',
      scheme: 'The address must start with ws:// or wss://.',
      credentials: 'Remove the user name and password from the address.',
    },
  },
  devices: {
    status: {
      online: 'Online',
      stale: 'Stale',
      offline: 'Offline',
      unknown: 'No data yet',
    },
    metrics: {
      temperature: 'Temperature',
      humidity: 'Humidity',
      pressure: 'Pressure',
      battery: 'Battery',
      signal: 'Signal',
    },
    units: {
      temperature: '°C',
      humidity: '%',
      pressure: 'hPa',
      battery: '%',
      signal: 'dBm',
    },
    /** `relative` comes from Intl.RelativeTimeFormat ("5 seconds ago", "now"). */
    lastSeen: (relative: string) => `Seen ${relative}`,
    neverSeen: 'Not seen yet',
    noValue: '—',
    table: {
      columns: {
        name: 'Name',
        location: 'Location',
        status: 'Status',
        lastSeen: 'Last seen',
      },
      /** Column header with its unit, e.g. "Temperature (°C)". */
      withUnit: (label: string, unit: string) => `${label} (${unit})`,
      caption: 'Devices',
      /** Screen-reader summary of the sort; `column` is a column name. */
      sortedBy: (column: string, descending: boolean) =>
        `Sorted by ${column}, ${descending ? 'descending' : 'ascending'}.`,
      /** Both are formatted numbers. */
      shown: (shown: string, total: string) => `Showing ${shown} of ${total} devices`,
      searchLabel: 'Search devices',
      searchPlaceholder: 'Name, location or id',
      statusLabel: 'Status',
      statusOptions: {
        all: 'All statuses',
        online: 'Online',
        stale: 'Stale',
        offline: 'Offline',
        unknown: 'No data yet',
      },
      columnsMenu: 'Columns',
      columnsMenuLabel: 'Show or hide columns',
      noMatchTitle: 'No devices match',
      noMatchDescription: 'Try another search or status, or clear the filters.',
      clearFilters: 'Clear filters',
      loading: 'Loading devices',
      errorTitle: 'Could not load devices',
      errorDescription: 'Check the connection to the server, then try again.',
      retry: 'Try again',
      emptyTitle: 'No devices yet',
      emptyDescription: 'Devices appear here once they are registered with the server.',
    },
  },
  overview: {
    summaryHeading: 'At a glance',
    devicesHeading: 'Devices',
    kpi: {
      online: 'Devices online',
      /** `total` is a formatted number. */
      onlineOf: (total: string) => `of ${total}`,
      /** Both are formatted numbers. */
      onlineBreakdown: (stale: string, offline: string) => `Stale: ${stale}, offline: ${offline}`,
      temperature: 'Average temperature',
      temperatureScope: 'Across devices that are online now',
      temperatureNone: 'No online device has reported yet',
      alerts: 'Alerts, last 24 hours',
      /** Shown when the server capped the list; `count` is a formatted number. */
      alertsAtLeast: (count: string) => `${count}+`,
      alertsScope: 'Threshold crossings found by the alert rules',
      alertsNone: 'No threshold crossings',
      alertsError: 'Could not load alerts.',
      retry: 'Try again',
      lastUpdate: 'Last live update',
      lastUpdateNever: 'Waiting for the first reading',
      lastUpdateDemo: 'From the in-browser simulator',
      lastUpdateLive: 'From the live server',
    },
    grid: {
      loading: 'Loading devices',
      emptyTitle: 'No devices yet',
      emptyDescription: 'Devices appear here once they are registered with the server.',
      errorTitle: 'Could not load devices',
      errorDescription: 'Check the connection to the server, then try again.',
      retry: 'Try again',
      waitingTitle: 'Waiting for live data',
      waitingBody: 'Readings appear on each card as soon as the first messages arrive.',
    },
  },
  deviceDetail: {
    /** "Kitchen · Ground floor · firmware 1.4.2" */
    facts: (location: string, firmware: string) => `${location} · firmware ${firmware}`,
    latestHeading: 'Latest values',
    chartsHeading: 'History',
    loading: 'Loading device',
    notFoundTitle: 'Device not found',
    notFoundDescription: 'The server does not know this device. It may have been removed.',
    errorTitle: 'Could not load this device',
    errorDescription: 'Check the connection to the server, then try again.',
    retry: 'Try again',
    offlineTitle: 'This device is offline',
    offlineBody: 'It said it was going offline. The charts keep the data recorded until then.',
    staleTitle: 'No recent data from this device',
    staleBody: 'It stopped reporting without going offline, for example after a Wi-Fi dropout.',
    waitingTitle: 'Waiting for data',
    waitingBody: 'Readings appear here as soon as this device reports.',
    rangeLabel: 'Range',
    ranges: { live: 'Live', '5m': '5 min', '1h': '1 hour', '24h': '24 hours' },
    /** Spoken range, used in chart summaries. */
    rangeNames: {
      live: 'the last minute',
      '5m': 'the last 5 minutes',
      '1h': 'the last hour',
      '24h': 'the last 24 hours',
    },
    pause: 'Pause charts',
    resume: 'Resume charts',
    paused: 'Paused. Data keeps recording; resume to return to now.',
    /** Polite announcements: state changes only, never individual samples. */
    announce: {
      paused: 'Charts paused.',
      resumed: 'Charts resumed at the latest data.',
      offline: 'The device went offline.',
      stale: 'The device stopped reporting.',
      online: 'The device is reporting again.',
    },
    expand: (metric: string) => `Expand ${metric}`,
    collapse: (metric: string) => `Show ${metric} at normal size`,
    /** All parts are formatted already ("21.4", "°C", "the last minute"). */
    summary: (
      metric: string,
      range: string,
      latest: string,
      min: string,
      max: string,
      unit: string,
    ) =>
      `${metric} over ${range}: latest ${latest} ${unit}, lowest ${min} ${unit}, highest ${max} ${unit}.`,
    summaryEmpty: (metric: string, range: string) => `${metric} over ${range}: no data.`,
    /** `time` is a formatted clock time. */
    recordedSince: (time: string) => `Recorded since ${time}: earlier data is not in this view.`,
    historySource: 'History from the server, then live data.',
    noData: 'No data in this range',
    threshold: {
      above: (value: string, unit: string) => `Alert above ${value} ${unit}`,
      below: (value: string, unit: string) => `Alert below ${value} ${unit}`,
    },
    table: {
      show: 'Show data table',
      hide: 'Hide data table',
      /** `count` and `total` are formatted numbers, `time` a formatted clock time. */
      caption: (metric: string, time: string) => `${metric}, values shown at ${time}`,
      capped: (count: string, total: string) => `Newest ${count} of ${total} values.`,
      refresh: 'Refresh table',
      time: 'Time',
      value: (unit: string) => `Value (${unit})`,
      empty: 'No values in this range.',
    },
  },
  simulatedData: {
    badge: 'Simulated data',
    description: 'These values are generated by a simulator, not measured by real devices.',
  },
} as const;
