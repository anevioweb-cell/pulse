// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';

import { API, DEFAULT_ALERT_RULES, DemoTelemetryApi, HttpTelemetryApi } from '@/features/telemetry';
import type { ReadingsRequest, TelemetryApi } from '@/features/telemetry';
import { ApiError } from '@/shared/api';

import { startTelemetryServer } from './telemetry-server';

// One contract, two implementations. Every scenario below runs against DemoTelemetryApi (in the
// browser, no network) and HttpTelemetryApi talking to the real mock server on an ephemeral port,
// both built from the same seed and clock. `describeTelemetryApiContract` checks each
// implementation on its own; the parity block then requires identical outcomes, values and
// errors alike. The only deliberate difference is `mode` ('demo' vs 'live'); transport failures
// (network, timeout, 413/414/415/429, injected faults) exist only over HTTP and are covered in
// rest-api.test.ts and http-telemetry-api.test.ts.

const SEED = 11;
const DEVICE_COUNT = 12;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);

/** Deterministic rule ids, so alert ids and their tie-break order are comparable. */
const sequentialIds = () => {
  let next = 0;
  return () => {
    next += 1;
    return `rule-${String(next)}`;
  };
};

interface Instance {
  api: TelemetryApi;
  close: () => Promise<void>;
}
type ApiFactory = () => Promise<Instance>;

const demoFactory: ApiFactory = () =>
  Promise.resolve({
    api: new DemoTelemetryApi({ seed: SEED, now: () => NOW, generateId: sequentialIds() }),
    close: () => Promise.resolve(),
  });

const httpFactory: ApiFactory = async () => {
  const server = await startTelemetryServer({
    port: 0,
    seed: SEED,
    deviceCount: DEVICE_COUNT,
    now: () => NOW,
    generateId: sequentialIds(),
  });
  return { api: new HttpTelemetryApi({ baseUrl: server.httpUrl }), close: () => server.close() };
};

type Outcome =
  | { ok: true; value: unknown }
  | {
      ok: false;
      error: {
        kind: string;
        status: number | undefined;
        code: string | undefined;
        message: string;
        issues: readonly { path: string; code: string }[];
      };
    };

async function settle(promise: Promise<unknown>): Promise<Outcome> {
  try {
    // `undefined` (DELETE's 204) and absent values compare equal either way.
    return { ok: true, value: (await promise) ?? null };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const { kind, status, code, message, issues } = error;
    return { ok: false, error: { kind, status, code, message, issues } };
  }
}

const value = (outcome: Outcome | undefined) => {
  if (!outcome?.ok) throw new Error(`Expected success, got ${JSON.stringify(outcome)}`);
  return outcome.value;
};
const failure = (outcome: Outcome | undefined) => {
  if (!outcome || outcome.ok) throw new Error(`Expected failure, got ${JSON.stringify(outcome)}`);
  return outcome.error;
};

const rule = {
  name: 'Greenhouse humid',
  deviceId: 'esp32-07',
  metric: 'humidity',
  comparator: 'above',
  threshold: 60,
  enabled: true,
} as const;

interface Scenario {
  name: string;
  /** Each step's outcome, in order. */
  run: (api: TelemetryApi) => Promise<Outcome[]>;
  /** Implementation-independent expectations. */
  check: (outcomes: Outcome[]) => void;
}

const readingsCases: [string, Omit<ReadingsRequest, 'deviceId'>][] = [
  [
    'raw: 10 minutes at the default budget',
    { metric: 'temperature', from: NOW - 10 * MINUTE, to: NOW },
  ],
  [
    'min-max: 24 h into 2 points',
    { metric: 'humidity', from: NOW - API.MAX_RANGE_MS, to: NOW, maxPoints: 2 },
  ],
  [
    'min-max: 6 h into 100 points',
    { metric: 'pressure', from: NOW - 6 * HOUR, to: NOW, maxPoints: 100 },
  ],
  [
    'min-max: 24 h at the maximum budget',
    { metric: 'battery', from: NOW - API.MAX_RANGE_MS, to: NOW, maxPoints: API.MAX_POINTS },
  ],
  ['partly in the future', { metric: 'signal', from: NOW - HOUR, to: NOW + HOUR, maxPoints: 50 }],
  ['entirely in the future', { metric: 'temperature', from: NOW + HOUR, to: NOW + 2 * HOUR }],
];

const invalidCalls: [string, (api: TelemetryApi) => Promise<unknown>][] = [
  ['malformed device id', (api) => api.getDevice('../etc/passwd')],
  ['prototype key as device id', (api) => api.getDevice('__proto__')],
  [
    'readings: to before from',
    (api) => api.getReadings({ deviceId: 'esp32-01', metric: 'signal', from: NOW, to: NOW - 1 }),
  ],
  [
    'readings: range too long',
    (api) =>
      api.getReadings({
        deviceId: 'esp32-01',
        metric: 'signal',
        from: NOW - API.MAX_RANGE_MS - 1,
        to: NOW,
      }),
  ],
  [
    'readings: too many points',
    (api) =>
      api.getReadings({
        deviceId: 'esp32-01',
        metric: 'signal',
        from: NOW - HOUR,
        to: NOW,
        maxPoints: API.MAX_POINTS + 1,
      }),
  ],
  [
    'readings: too few points',
    (api) =>
      api.getReadings({
        deviceId: 'esp32-01',
        metric: 'signal',
        from: NOW - HOUR,
        to: NOW,
        maxPoints: API.MIN_POINTS - 1,
      }),
  ],
  [
    'readings: fractional timestamp',
    (api) =>
      api.getReadings({ deviceId: 'esp32-01', metric: 'signal', from: NOW - HOUR + 0.5, to: NOW }),
  ],
  [
    'readings: unknown metric',
    // An unknown metric is exactly what is being tested, so the type has to be bypassed.
    (api) =>
      api.getReadings({
        deviceId: 'esp32-01',
        metric: 'co2',
        from: NOW - HOUR,
        to: NOW,
      } as unknown as ReadingsRequest),
  ],
  [
    'alerts: range too long',
    (api) => api.listAlerts({ from: NOW - API.MAX_ALERT_RANGE_MS - 1, to: NOW }),
  ],
  [
    'alerts: limit above the cap',
    (api) => api.listAlerts({ from: NOW - HOUR, to: NOW, limit: API.MAX_ALERT_LIMIT + 1 }),
  ],
  [
    'rule: threshold outside the metric range',
    (api) => api.createAlertRule({ ...rule, threshold: 1000 }),
  ],
  ['rule: empty name', (api) => api.createAlertRule({ ...rule, name: '   ' })],
  [
    'rule: client-chosen id in the body',
    (api) => api.createAlertRule({ ...rule, id: 'mine' } as typeof rule),
  ],
  ['rule: malformed id on update', (api) => api.updateAlertRule('../x', rule)],
  ['rule: malformed id on delete', (api) => api.deleteAlertRule('__proto__')],
];

const scenarios: Scenario[] = [
  {
    name: 'lists the simulated fleet',
    run: async (api) => [await settle(api.listDevices())],
    check: ([outcome]) => {
      const devices = value(outcome) as { id: string; source: string }[];
      expect(devices).toHaveLength(DEVICE_COUNT);
      expect(new Set(devices.map((device) => device.id)).size).toBe(DEVICE_COUNT);
      expect(devices.every((device) => device.source === 'simulated')).toBe(true);
    },
  },
  {
    name: 'returns detail for every device, never newer than now',
    run: async (api) => {
      const devices = await api.listDevices();
      return Promise.all(devices.map((device) => settle(api.getDevice(device.id))));
    },
    check: (outcomes) => {
      expect(outcomes).toHaveLength(DEVICE_COUNT);
      for (const outcome of outcomes) {
        const detail = value(outcome) as { latest: { ts: number } | null };
        expect(detail.latest?.ts).toBeLessThanOrEqual(NOW);
      }
    },
  },
  ...readingsCases.map(([name, query]): Scenario => ({
    name: `readings, ${name}`,
    run: async (api) => [await settle(api.getReadings({ deviceId: 'esp32-04', ...query }))],
    check: ([outcome]) => {
      const readings = value(outcome) as {
        timestamps: number[];
        resolution: { method: string; rawCount: number; returnedCount: number };
      };
      const budget = query.maxPoints ?? API.DEFAULT_MAX_POINTS;
      expect(readings.timestamps.length).toBeLessThanOrEqual(budget);
      expect(readings.timestamps.every((ts) => ts <= NOW)).toBe(true);
      expect(readings.resolution.method).toBe(
        readings.resolution.rawCount > budget ? 'min-max' : 'raw',
      );
    },
  })),
  {
    name: 'alert history from the default rules, newest first, with limit and truncation',
    run: async (api) => [
      await settle(api.listAlerts({ from: NOW - API.MAX_ALERT_RANGE_MS, to: NOW })),
      await settle(api.listAlerts({ from: NOW - API.MAX_ALERT_RANGE_MS, to: NOW, limit: 5 })),
      await settle(api.listAlerts({ from: NOW + HOUR, to: NOW + 2 * HOUR })),
    ],
    check: ([all, limited, future]) => {
      const history = value(all) as { alerts: { ts: number }[]; truncated: boolean };
      expect(history.alerts.length).toBeGreaterThan(0);
      expect(
        history.alerts.every((a, i) => i === 0 || a.ts <= (history.alerts.at(i - 1)?.ts ?? a.ts)),
      ).toBe(true);
      const firstFive = value(limited) as { alerts: unknown[]; truncated: boolean };
      expect(firstFive.alerts).toEqual(history.alerts.slice(0, 5));
      expect(firstFive.truncated).toBe(history.alerts.length > 5);
      expect(value(future)).toEqual({ alerts: [], truncated: false });
    },
  },
  {
    name: 'starts with the default rules',
    run: async (api) => [await settle(api.listAlertRules())],
    check: ([outcome]) => {
      expect(value(outcome)).toEqual(
        DEFAULT_ALERT_RULES.map((input, index) => ({ ...input, id: `rule-${String(index + 1)}` })),
      );
    },
  },
  {
    name: 'alert rule CRUD, and rules drive alert history',
    run: async (api) => {
      const range = { from: NOW - API.MAX_ALERT_RANGE_MS, to: NOW, limit: API.MAX_ALERT_LIMIT };
      const created = await settle(
        api.createAlertRule({ ...rule, name: '  Greenhouse\u0007 humid ' }),
      );
      const id = (value(created) as { id: string }).id;
      return [
        created,
        await settle(api.listAlertRules()),
        await settle(api.listAlerts(range)),
        await settle(api.updateAlertRule(id, { ...rule, threshold: 65, enabled: false })),
        await settle(api.listAlerts(range)),
        await settle(api.deleteAlertRule(id)),
        await settle(api.deleteAlertRule(id)),
        await settle(api.updateAlertRule(id, rule)),
        await settle(api.listAlertRules()),
      ];
    },
    check: ([
      created,
      listed,
      alerts,
      updated,
      alertsAfter,
      deleted,
      deletedAgain,
      updateMissing,
      final,
    ]) => {
      // Input is normalized (control characters removed, trimmed) the same way on both sides.
      expect(value(created)).toEqual({ ...rule, id: 'rule-3' });
      expect(value(listed)).toContainEqual({ ...rule, id: 'rule-3' });
      const ruleAlerts = (outcome: Outcome | undefined) =>
        (value(outcome) as { alerts: { ruleId: string }[] }).alerts.filter(
          (a) => a.ruleId === 'rule-3',
        );
      expect(ruleAlerts(alerts).length).toBeGreaterThan(0);
      expect(value(updated)).toEqual({ ...rule, id: 'rule-3', threshold: 65, enabled: false });
      expect(ruleAlerts(alertsAfter)).toEqual([]);
      expect(value(deleted)).toBeNull();
      expect(failure(deletedAgain)).toMatchObject({ kind: 'http', status: 404, code: 'not_found' });
      expect(failure(updateMissing)).toMatchObject({
        kind: 'http',
        status: 404,
        code: 'not_found',
      });
      expect(value(final)).toHaveLength(DEFAULT_ALERT_RULES.length);
    },
  },
  {
    name: 'refuses rules beyond the cap with 409',
    run: async (api) => {
      const outcomes: Outcome[] = [];
      for (let count = DEFAULT_ALERT_RULES.length; count <= API.MAX_ALERT_RULES; count += 1) {
        outcomes.push(
          await settle(api.createAlertRule({ ...rule, name: `Rule ${String(count)}` })),
        );
      }
      return outcomes;
    },
    check: (outcomes) => {
      expect(outcomes.slice(0, -1).every((outcome) => outcome.ok)).toBe(true);
      expect(failure(outcomes.at(-1))).toMatchObject({
        kind: 'http',
        status: 409,
        code: 'limit_reached',
      });
    },
  },
  {
    name: 'answers 404 for unknown devices',
    run: async (api) => [
      await settle(api.getDevice('esp32-99')),
      await settle(
        api.getReadings({ deviceId: 'esp32-99', metric: 'signal', from: NOW - HOUR, to: NOW }),
      ),
    ],
    check: (outcomes) => {
      for (const outcome of outcomes) {
        expect(failure(outcome)).toEqual({
          kind: 'http',
          status: 404,
          code: 'not_found',
          message: 'Device not found',
          issues: [],
        });
      }
    },
  },
  {
    name: 'rejects invalid input before any request, with the issues',
    run: (api) => Promise.all(invalidCalls.map(([, call]) => settle(call(api)))),
    check: (outcomes) => {
      expect(outcomes).toHaveLength(invalidCalls.length);
      for (const outcome of outcomes) {
        const error = failure(outcome);
        expect(error).toMatchObject({
          kind: 'validation',
          status: undefined,
          code: 'invalid_request',
        });
        expect(error.issues.length).toBeGreaterThan(0);
      }
    },
  },
  {
    name: 'honours an already-aborted signal',
    run: async (api) => {
      const signal = AbortSignal.abort();
      return [
        await settle(api.listDevices({ signal })),
        await settle(api.createAlertRule(rule, { signal })),
        await settle(api.listAlertRules()),
      ];
    },
    check: ([list, create, rules]) => {
      expect(failure(list)).toMatchObject({ kind: 'aborted' });
      expect(failure(create)).toMatchObject({ kind: 'aborted' });
      // The aborted create never reached the store.
      expect(value(rules)).toHaveLength(DEFAULT_ALERT_RULES.length);
    },
  },
];

const open: Instance[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((instance) => instance.close()));
});

async function create(factory: ApiFactory): Promise<TelemetryApi> {
  const instance = await factory();
  open.push(instance);
  return instance.api;
}

/** The TelemetryApi contract, for any implementation. */
function describeTelemetryApiContract(name: string, factory: ApiFactory) {
  describe(`TelemetryApi contract: ${name}`, () => {
    it.each(scenarios.map((scenario) => [scenario.name, scenario] as const))(
      '%s',
      async (_name, scenario) => {
        scenario.check(await scenario.run(await create(factory)));
      },
    );
  });
}

describeTelemetryApiContract('DemoTelemetryApi', demoFactory);
describeTelemetryApiContract('HttpTelemetryApi against the mock server', httpFactory);

describe('TelemetryApi parity: Demo and HTTP give identical outcomes for the same seed', () => {
  it.each(scenarios.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    async (_name, scenario) => {
      const [demo, http] = await Promise.all([create(demoFactory), create(httpFactory)]);
      const demoOutcomes = await scenario.run(demo);
      expect(await scenario.run(http)).toEqual(demoOutcomes);
    },
  );

  it('differs only in mode', async () => {
    const [demo, http] = await Promise.all([create(demoFactory), create(httpFactory)]);
    expect([demo.mode, http.mode]).toEqual(['demo', 'live']);
  });
});
