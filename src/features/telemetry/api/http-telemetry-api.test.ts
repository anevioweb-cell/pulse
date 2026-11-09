import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api';

import { EXAMPLE_TS } from '../model/fixtures';
import { DemoTelemetryApi } from './demo-telemetry-api';
import { HttpTelemetryApi } from './http-telemetry-api';

const BASE = 'http://telemetry.test';
const HOUR = 3_600_000;
const NOW = EXAMPLE_TS + 30 * 24 * HOUR;

// Realistic payloads: produced by the same code the mock server uses.
const demo = new DemoTelemetryApi({ now: () => NOW, generateId: () => 'rule-x' });

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const api = () => new HttpTelemetryApi({ baseUrl: BASE });

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('Expected a failure');
}

describe('HttpTelemetryApi', () => {
  it('reads every resource and validates it', async () => {
    const devices = await demo.listDevices();
    const detail = await demo.getDevice('esp32-01');
    const readings = await demo.getReadings({
      deviceId: 'esp32-01',
      metric: 'temperature',
      from: NOW - HOUR,
      to: NOW,
    });
    const alerts = await demo.listAlerts({ from: NOW - HOUR, to: NOW });
    const rules = await demo.listAlertRules();
    server.use(
      http.get(`${BASE}/api/devices`, () => HttpResponse.json({ devices })),
      http.get(`${BASE}/api/devices/esp32-01`, () => HttpResponse.json(detail)),
      http.get(`${BASE}/api/devices/esp32-01/readings`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        expect(Object.fromEntries(params)).toEqual({
          from: String(NOW - HOUR),
          to: String(NOW),
          metric: 'temperature',
        });
        return HttpResponse.json(readings);
      }),
      http.get(`${BASE}/api/alerts`, () => HttpResponse.json(alerts)),
      http.get(`${BASE}/api/alert-rules`, () => HttpResponse.json({ rules })),
    );
    const client = api();
    expect(client.mode).toBe('live');
    expect(await client.listDevices()).toEqual(devices);
    expect(await client.getDevice('esp32-01')).toEqual(detail);
    expect(
      await client.getReadings({
        deviceId: 'esp32-01',
        metric: 'temperature',
        from: NOW - HOUR,
        to: NOW,
      }),
    ).toEqual(readings);
    expect(await client.listAlerts({ from: NOW - HOUR, to: NOW })).toEqual(alerts);
    expect(await client.listAlertRules()).toEqual(rules);
  });

  it('writes alert rules with validated bodies', async () => {
    const input = {
      name: 'Hot',
      deviceId: null,
      metric: 'temperature',
      comparator: 'above',
      threshold: 30,
      enabled: true,
    } as const;
    server.use(
      http.post(`${BASE}/api/alert-rules`, async ({ request }) =>
        HttpResponse.json({ ...((await request.json()) as object), id: 'rule-1' }, { status: 201 }),
      ),
      http.put(`${BASE}/api/alert-rules/rule-1`, async ({ request }) =>
        HttpResponse.json({ ...((await request.json()) as object), id: 'rule-1' }),
      ),
      http.delete(`${BASE}/api/alert-rules/rule-1`, () => new HttpResponse(null, { status: 204 })),
    );
    expect(await api().createAlertRule(input)).toEqual({ ...input, id: 'rule-1' });
    expect(await api().updateAlertRule('rule-1', { ...input, threshold: 31 })).toMatchObject({
      threshold: 31,
    });
    await expect(api().deleteAlertRule('rule-1')).resolves.toBeUndefined();
  });

  it.each(['../admin', 'a/b', '__proto__', '', 'x'.repeat(65)])(
    'refuses malformed ids (%j) before sending anything',
    async (id) => {
      // Any request reaching MSW would fail the test (onUnhandledFrame: 'error').
      expect(await failureOf(api().getDevice(id))).toMatchObject({
        kind: 'validation',
        code: 'invalid_request',
      });
      expect(await failureOf(api().deleteAlertRule(id))).toMatchObject({ kind: 'validation' });
    },
  );

  it('refuses invalid queries and bodies before sending anything', async () => {
    expect(
      await failureOf(
        api().getReadings({ deviceId: 'esp32-01', metric: 'temperature', from: NOW, to: NOW - 1 }),
      ),
    ).toMatchObject({ kind: 'validation', code: 'invalid_request' });
    expect(
      await failureOf(
        api().createAlertRule({
          name: '',
          deviceId: null,
          metric: 'humidity',
          comparator: 'below',
          threshold: 10,
          enabled: true,
        }),
      ),
    ).toMatchObject({ kind: 'validation' });
  });

  it.each([
    ['extra key', { devices: [], admin: true }],
    ['wrong type', { devices: 'all' }],
    [
      'hostile device',
      { devices: [{ id: '<script>', name: 'x', location: 'y', firmware: '1', source: 'device' }] },
    ],
    [
      'unknown source',
      { devices: [{ id: 'a', name: 'x', location: 'y', firmware: '1', source: 'mystery' }] },
    ],
  ])('turns a malformed response (%s) into a validation error', async (_name, body) => {
    server.use(http.get(`${BASE}/api/devices`, () => HttpResponse.json(body)));
    expect(await failureOf(api().listDevices())).toMatchObject({
      kind: 'validation',
      code: 'schema_violation',
    });
  });

  it('rejects readings whose arrays disagree or leave the physical range', async () => {
    const readings = await demo.getReadings({
      deviceId: 'esp32-01',
      metric: 'humidity',
      from: NOW - HOUR,
      to: NOW,
    });
    for (const body of [
      { ...readings, values: readings.values.slice(1) },
      { ...readings, values: readings.values.map(() => 150) },
      { ...readings, timestamps: [...readings.timestamps].reverse() },
    ]) {
      server.use(http.get(`${BASE}/api/devices/esp32-01/readings`, () => HttpResponse.json(body)));
      expect(
        await failureOf(
          api().getReadings({
            deviceId: 'esp32-01',
            metric: 'humidity',
            from: NOW - HOUR,
            to: NOW,
          }),
        ),
      ).toMatchObject({ kind: 'validation' });
    }
  });

  it('maps server errors and aborts to typed errors', async () => {
    server.use(
      http.get(`${BASE}/api/devices/esp32-09`, () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'Device not found' } },
          { status: 404 },
        ),
      ),
      http.get(`${BASE}/api/devices`, () => new HttpResponse('upstream down', { status: 503 })),
      http.get(`${BASE}/api/alert-rules`, async () => {
        await delay(1000);
        return HttpResponse.json({ rules: [] });
      }),
    );
    expect(await failureOf(api().getDevice('esp32-09'))).toMatchObject({
      kind: 'http',
      status: 404,
      code: 'not_found',
    });
    const unavailable = await failureOf(api().listDevices());
    expect(unavailable).toMatchObject({ kind: 'http', status: 503 });
    expect(unavailable.retryable).toBe(true);

    const controller = new AbortController();
    const pending = api().listAlertRules({ signal: controller.signal });
    controller.abort();
    expect((await failureOf(pending)).kind).toBe('aborted');
  });
});
