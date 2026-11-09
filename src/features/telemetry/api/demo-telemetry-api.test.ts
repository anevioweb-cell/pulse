import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api';

import { API, SIMULATOR } from '../config';
import { EXAMPLE_TS } from '../model/fixtures';
import { DEFAULT_ALERT_RULES } from './alert-rule-store';
import { DemoTelemetryApi } from './demo-telemetry-api';

const HOUR = 3_600_000;
const NOW = EXAMPLE_TS + 30 * 24 * HOUR;

function api(options: { seed?: number } = {}) {
  let id = 0;
  return new DemoTelemetryApi({
    ...options,
    now: () => NOW,
    generateId: () => {
      id += 1;
      return `rule-${String(id)}`;
    },
  });
}

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('Expected a failure');
}

describe('DemoTelemetryApi', () => {
  it('lists the simulated fleet, labelled as simulated', async () => {
    const devices = await api().listDevices();
    expect(devices).toHaveLength(SIMULATOR.DEFAULT_DEVICE_COUNT);
    expect(devices.every((device) => device.source === 'simulated')).toBe(true);
    expect(api().mode).toBe('demo');
  });

  it('returns the same history for the same seed and range, and different data for another seed', async () => {
    const request = {
      deviceId: 'esp32-02',
      metric: 'temperature',
      from: NOW - 6 * HOUR,
      to: NOW,
    } as const;
    const first = await api({ seed: 3 }).getReadings(request);
    expect(await api({ seed: 3 }).getReadings(request)).toEqual(first);
    expect((await api({ seed: 4 }).getReadings(request)).values).not.toEqual(first.values);
  });

  it('gives overlapping raw ranges identical samples', async () => {
    const wide = await api().getReadings({
      deviceId: 'esp32-01',
      metric: 'humidity',
      from: NOW - HOUR,
      to: NOW,
      maxPoints: 2000,
    });
    const narrow = await api().getReadings({
      deviceId: 'esp32-01',
      metric: 'humidity',
      from: NOW - HOUR / 2,
      to: NOW - HOUR / 4,
      maxPoints: 2000,
    });
    expect(wide.resolution.method).toBe('raw');
    const start = wide.timestamps.indexOf(narrow.timestamps[0] ?? -1);
    expect(start).toBeGreaterThan(0);
    expect(wide.values.slice(start, start + narrow.values.length)).toEqual(narrow.values);
  });

  it('downsamples long ranges within maxPoints and reports the resolution', async () => {
    const readings = await api().getReadings({
      deviceId: 'esp32-01',
      metric: 'temperature',
      from: NOW - API.MAX_RANGE_MS,
      to: NOW,
      maxPoints: 300,
    });
    expect(readings.timestamps.length).toBeLessThanOrEqual(300);
    expect(readings.resolution).toMatchObject({
      method: 'min-max',
      sampleIntervalMs: SIMULATOR.HISTORY_SAMPLE_MS,
      rawCount: API.MAX_RANGE_MS / SIMULATOR.HISTORY_SAMPLE_MS + 1,
      returnedCount: readings.timestamps.length,
    });
    expect(readings.resolution.bucketSize).toBeGreaterThan(1);
  });

  it('uses the default point budget and never returns the future', async () => {
    const readings = await api().getReadings({
      deviceId: 'esp32-01',
      metric: 'battery',
      from: NOW - API.MAX_RANGE_MS / 2,
      to: NOW + HOUR,
    });
    expect(readings.timestamps.length).toBeLessThanOrEqual(API.DEFAULT_MAX_POINTS);
    expect(Math.max(...readings.timestamps)).toBeLessThanOrEqual(NOW);
    const future = await api().getReadings({
      deviceId: 'esp32-01',
      metric: 'battery',
      from: NOW + HOUR,
      to: NOW + 2 * HOUR,
    });
    expect(future.timestamps).toEqual([]);
  });

  it('returns device detail with the latest simulated reading', async () => {
    const detail = await api().getDevice('esp32-05');
    expect(detail).toMatchObject({ id: 'esp32-05', source: 'simulated' });
    expect(detail.latest?.ts).toBeLessThanOrEqual(NOW);
  });

  it.each([
    ['range too long', { from: NOW - API.MAX_RANGE_MS - 1, to: NOW }],
    ['to before from', { from: NOW, to: NOW - 1 }],
    ['too many points', { from: NOW - HOUR, to: NOW, maxPoints: API.MAX_POINTS + 1 }],
    ['too few points', { from: NOW - HOUR, to: NOW, maxPoints: 1 }],
    ['fractional timestamp', { from: NOW - HOUR + 0.5, to: NOW }],
  ])('rejects an invalid readings query (%s) with 400 like the server', async (_name, range) => {
    const error = await failureOf(
      api().getReadings({ deviceId: 'esp32-01', metric: 'temperature', ...range }),
    );
    expect(error).toMatchObject({ kind: 'http', status: 400, code: 'bad_request' });
  });

  it('answers 404 for unknown devices and 400 for malformed ids', async () => {
    expect(await failureOf(api().getDevice('esp32-99'))).toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(await failureOf(api().getDevice('../etc/passwd'))).toMatchObject({ status: 400 });
    expect(await failureOf(api().getDevice('__proto__'))).toMatchObject({ status: 400 });
  });

  it('honours AbortSignal', async () => {
    expect((await failureOf(api().listDevices({ signal: AbortSignal.abort() }))).kind).toBe(
      'aborted',
    );
  });

  it('derives deterministic, newest-first alert history from the default rules', async () => {
    const query = { from: NOW - API.MAX_ALERT_RANGE_MS, to: NOW, limit: API.MAX_ALERT_LIMIT };
    const history = await api().listAlerts(query);
    expect(history.alerts.length).toBeGreaterThan(0);
    expect(await api().listAlerts(query)).toEqual(history);
    const timestamps = history.alerts.map((alert) => alert.ts);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
    for (const alert of history.alerts) {
      expect(
        alert.comparator === 'above'
          ? alert.value > alert.threshold
          : alert.value < alert.threshold,
      ).toBe(true);
      expect(alert.source).toBe('simulated');
    }
    const limited = await api().listAlerts({ ...query, limit: 1 });
    expect(limited).toEqual({ alerts: history.alerts.slice(0, 1), truncated: true });
  });

  it('supports alert rule CRUD in memory, with a cap', async () => {
    const demo = api();
    const initial = await demo.listAlertRules();
    expect(initial.map((rule) => rule.name)).toEqual(DEFAULT_ALERT_RULES.map((rule) => rule.name));

    const input = {
      name: '  Greenhouse\u0007 humid ',
      deviceId: 'esp32-07',
      metric: 'humidity',
      comparator: 'above',
      threshold: 70,
      enabled: true,
    } as const;
    const created = await demo.createAlertRule(input);
    expect(created.name).toBe('Greenhouse humid');
    const updated = await demo.updateAlertRule(created.id, {
      ...input,
      threshold: 75,
      enabled: false,
    });
    expect(updated).toMatchObject({ id: created.id, threshold: 75, enabled: false });
    expect(await demo.listAlertRules()).toContainEqual(updated);

    await demo.deleteAlertRule(created.id);
    expect(await failureOf(demo.deleteAlertRule(created.id))).toMatchObject({ status: 404 });
    expect(await failureOf(demo.updateAlertRule('missing', input))).toMatchObject({
      status: 404,
    });
    expect(await failureOf(demo.createAlertRule({ ...input, threshold: 1000 }))).toMatchObject({
      status: 400,
    });

    for (let index = initial.length; index < API.MAX_ALERT_RULES; index += 1) {
      await demo.createAlertRule({ ...input, name: `Rule ${String(index)}` });
    }
    expect(await failureOf(demo.createAlertRule(input))).toMatchObject({
      status: 409,
      code: 'limit_reached',
    });
    // Extra keys (such as an id in the body) are rejected, not silently dropped.
    expect(
      await failureOf(demo.updateAlertRule(created.id, { ...input, id: 'x' } as typeof input)),
    ).toMatchObject({ status: 400 });
  });

  it('returns copies: mutating a result does not change stored rules', async () => {
    const demo = api();
    const [rule] = await demo.listAlertRules();
    if (!rule) throw new Error('no rule');
    rule.threshold = -1;
    expect((await demo.listAlertRules())[0]?.threshold).not.toBe(-1);
  });
});
