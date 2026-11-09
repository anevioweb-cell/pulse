// @vitest-environment node
import { request as httpRequest, createServer } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket as WsClient } from 'ws';

import {
  AlertRuleStore,
  API,
  DemoTelemetryApi,
  HistoryModel,
  MOCK_SERVER,
  SimulatedTelemetryData,
} from '../src/features/telemetry';
import { parseFaultSpec } from './rest/faults';
import { RateLimiter } from './rest/rate-limiter';
import { createRestHandler } from './rest/router';
import { startTelemetryServer } from './telemetry-server';

import type { TelemetryServer, TelemetryServerOptions } from './telemetry-server';
import type { AddressInfo } from 'node:net';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);
const ALLOWED = 'http://localhost:5173';

let server: TelemetryServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(options: TelemetryServerOptions = {}) {
  server = await startTelemetryServer({ port: 0, seed: 11, now: () => NOW, ...options });
  return server;
}

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

/** Raw HTTP call: full control over method, headers and body (browsers and fetch restrict some). */
function call(
  base: string,
  method: string,
  path: string,
  { headers = {}, body }: { headers?: Record<string, string>; body?: string } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const target = new URL(path, base);
    const req = httpRequest(
      {
        method,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: text ? (JSON.parse(text) as unknown) : null,
          });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const errorCode = (reply: Reply) => (reply.body as { error?: { code?: string } }).error?.code;

const rule = {
  name: 'Hot',
  deviceId: null,
  metric: 'temperature',
  comparator: 'above',
  threshold: 30,
  enabled: true,
};
const json = { 'Content-Type': 'application/json' };

describe('REST API: reads', () => {
  it('serves devices with hardened headers, labelled as simulated', async () => {
    const { httpUrl } = await start();
    const reply = await call(httpUrl, 'GET', '/api/devices');
    expect(reply.status).toBe(200);
    expect(reply.headers).toMatchObject({
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    });
    expect(reply.headers['access-control-allow-origin']).toBeUndefined();
    const { devices } = reply.body as { devices: { source: string }[] };
    expect(devices).toHaveLength(12);
    expect(devices.every((device) => device.source === 'simulated')).toBe(true);
  });

  it('returns exactly what DemoTelemetryApi returns for the same seed and clock', async () => {
    const { httpUrl } = await start();
    const demo = new DemoTelemetryApi({ seed: 11, now: () => NOW });
    const query = `from=${String(NOW - 6 * HOUR)}&to=${String(NOW)}&metric=humidity&maxPoints=200`;
    const reply = await call(httpUrl, 'GET', `/api/devices/esp32-04/readings?${query}`);
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual(
      await demo.getReadings({
        deviceId: 'esp32-04',
        metric: 'humidity',
        from: NOW - 6 * HOUR,
        to: NOW,
        maxPoints: 200,
      }),
    );
    expect((await call(httpUrl, 'GET', '/api/devices/esp32-04')).body).toEqual(
      await demo.getDevice('esp32-04'),
    );
  });

  it.each([
    ['/api/devices/esp32-99', 404, 'not_found'],
    ['/api/devices/__proto__', 400, 'bad_request'],
    ['/api/devices/..%2F..%2Fetc%2Fpasswd', 400, 'bad_request'],
    ['/api/devices/%E0%A4%A', 400, 'bad_request'],
    ['/api/devices/', 404, 'not_found'],
    ['/api/devices/esp32-01/readings/extra', 404, 'not_found'],
    ['/api/unknown', 404, 'not_found'],
    ['/', 404, 'not_found'],
    ['/api/devices?debug=1', 400, 'bad_request'],
  ])('rejects %s with %i', async (path, status, code) => {
    const { httpUrl } = await start();
    const reply = await call(httpUrl, 'GET', path);
    expect(reply.status).toBe(status);
    expect(errorCode(reply)).toBe(code);
    expect(JSON.stringify(reply.body)).not.toMatch(/at .*\.ts|stack/i);
  });

  it.each([
    ['missing metric', `from=${String(NOW - HOUR)}&to=${String(NOW)}`],
    ['unknown metric', `from=${String(NOW - HOUR)}&to=${String(NOW)}&metric=co2`],
    ['extra parameter', `from=${String(NOW - HOUR)}&to=${String(NOW)}&metric=signal&x=1`],
    ['duplicate parameter', `from=${String(NOW - HOUR)}&from=1&to=${String(NOW)}&metric=signal`],
    [
      'range too long',
      `from=${String(NOW - API.MAX_RANGE_MS - 1)}&to=${String(NOW)}&metric=signal`,
    ],
    [
      'too many points',
      `from=${String(NOW - HOUR)}&to=${String(NOW)}&metric=signal&maxPoints=${String(API.MAX_POINTS + 1)}`,
    ],
    ['to before from', `from=${String(NOW)}&to=${String(NOW - HOUR)}&metric=signal`],
    ['not a number', `from=yesterday&to=${String(NOW)}&metric=signal`],
  ])('validates readings query parameters: %s', async (_name, query) => {
    const { httpUrl } = await start();
    const reply = await call(httpUrl, 'GET', `/api/devices/esp32-01/readings?${query}`);
    expect(reply.status).toBe(400);
    expect(errorCode(reply)).toBe('bad_request');
    expect((reply.body as { error: { issues?: unknown[] } }).error.issues?.length).toBeGreaterThan(
      0,
    );
  });

  it('caps readings at maxPoints and alerts at the limit', async () => {
    const { httpUrl } = await start();
    const readings = await call(
      httpUrl,
      'GET',
      `/api/devices/esp32-01/readings?from=${String(NOW - API.MAX_RANGE_MS)}&to=${String(NOW)}&metric=temperature&maxPoints=100`,
    );
    expect((readings.body as { timestamps: number[] }).timestamps.length).toBeLessThanOrEqual(100);
    const alerts = await call(
      httpUrl,
      'GET',
      `/api/alerts?from=${String(NOW - API.MAX_ALERT_RANGE_MS)}&to=${String(NOW)}&limit=2`,
    );
    expect(alerts.status).toBe(200);
    expect((alerts.body as { alerts: unknown[] }).alerts.length).toBeLessThanOrEqual(2);
    const tooLong = await call(
      httpUrl,
      'GET',
      `/api/alerts?from=${String(NOW - API.MAX_ALERT_RANGE_MS - 1)}&to=${String(NOW)}`,
    );
    expect(tooLong.status).toBe(400);
  });

  it('refuses overlong URLs with 414', async () => {
    const { httpUrl } = await start();
    const reply = await call(
      httpUrl,
      'GET',
      `/api/devices?${'a'.repeat(MOCK_SERVER.MAX_URL_LENGTH)}`,
    );
    expect(reply.status).toBe(414);
  });
});

describe('REST API: alert rules', () => {
  it('supports create, update and delete with typed responses', async () => {
    const { httpUrl } = await start();
    const created = await call(httpUrl, 'POST', '/api/alert-rules', {
      headers: json,
      body: JSON.stringify(rule),
    });
    expect(created.status).toBe(201);
    const { id } = created.body as { id: string };
    expect(created.body).toEqual({ ...rule, id });

    const updated = await call(httpUrl, 'PUT', `/api/alert-rules/${id}`, {
      headers: json,
      body: JSON.stringify({ ...rule, threshold: 31 }),
    });
    expect(updated.body).toMatchObject({ id, threshold: 31 });

    const removed = await call(httpUrl, 'DELETE', `/api/alert-rules/${id}`);
    expect(removed.status).toBe(204);
    expect(removed.body).toBeNull();
    expect((await call(httpUrl, 'DELETE', `/api/alert-rules/${id}`)).status).toBe(404);
    expect(
      (
        await call(httpUrl, 'PUT', `/api/alert-rules/${id}`, {
          headers: json,
          body: JSON.stringify(rule),
        })
      ).status,
    ).toBe(404);
  });

  it.each([
    ['extra key', JSON.stringify({ ...rule, id: 'chosen-by-client' }), json, 400],
    ['threshold out of range', JSON.stringify({ ...rule, threshold: 500 }), json, 400],
    ['invalid JSON', '{"name":', json, 400],
    ['prototype pollution', '{"__proto__":{"isAdmin":true}}', json, 400],
    ['wrong content type', JSON.stringify(rule), { 'Content-Type': 'text/plain' }, 415],
    [
      'oversized body',
      JSON.stringify({ ...rule, name: 'x'.repeat(MOCK_SERVER.MAX_BODY_BYTES) }),
      json,
      413,
    ],
  ])('rejects a bad body: %s', async (_name, body, headers, status) => {
    const { httpUrl } = await start();
    const reply = await call(httpUrl, 'POST', '/api/alert-rules', { headers, body });
    expect(reply.status).toBe(status);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it('answers 405 with an Allow header for unsupported methods', async () => {
    const { httpUrl } = await start();
    const reply = await call(httpUrl, 'PATCH', '/api/alert-rules');
    expect(reply.status).toBe(405);
    expect(reply.headers.allow).toBe('GET, POST');
  });
});

describe('REST API: CORS, origins and rate limits', () => {
  it('echoes an allowed origin and refuses others without CORS headers', async () => {
    const { httpUrl } = await start();
    const allowed = await call(httpUrl, 'GET', '/api/devices', { headers: { Origin: ALLOWED } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers).toMatchObject({
      'access-control-allow-origin': ALLOWED,
      vary: 'Origin',
    });

    const denied = await call(httpUrl, 'GET', '/api/devices', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(denied.status).toBe(403);
    expect(errorCode(denied)).toBe('forbidden_origin');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers preflights only for allowed origins, and accepts configured origins', async () => {
    const { httpUrl } = await start({ allowedOrigins: ['https://dashboard.example'] });
    const preflight = await call(httpUrl, 'OPTIONS', '/api/alert-rules', {
      headers: { Origin: 'https://dashboard.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers).toMatchObject({
      'access-control-allow-origin': 'https://dashboard.example',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE',
    });
    const devOrigin = await call(httpUrl, 'OPTIONS', '/api/alert-rules', {
      headers: { Origin: ALLOWED },
    });
    expect(devOrigin.status).toBe(403);
  });

  it('checks Origin on WebSocket upgrades (cross-site WebSocket hijacking)', async () => {
    const { url } = await start();
    const outcome = (origin: string) =>
      new Promise<string>((resolve) => {
        const socket = new WsClient(url, { origin });
        socket.on('open', () => {
          socket.close();
          resolve('open');
        });
        socket.on('unexpected-response', (_request, response) => {
          resolve(`rejected ${String(response.statusCode)}`);
        });
        socket.on('error', () => undefined);
      });
    expect(await outcome(ALLOWED)).toBe('open');
    expect(await outcome('https://evil.example')).toBe('rejected 401');
  });

  it('rate-limits each client with 429 and Retry-After', async () => {
    const { httpUrl } = await start();
    const replies = await Promise.all(
      Array.from({ length: MOCK_SERVER.MAX_REST_REQUESTS_PER_SECOND + 5 }, () =>
        call(httpUrl, 'GET', '/api/alert-rules'),
      ),
    );
    const limited = replies.filter((reply) => reply.status === 429);
    expect(limited.length).toBeGreaterThan(0);
    const [first] = limited;
    if (!first) throw new Error('expected a rate-limited reply');
    expect(first.headers['retry-after']).toBe('1');
    expect(errorCode(first)).toBe('rate_limited');
  });

  it('bounds the number of tracked clients', () => {
    const limiter = new RateLimiter({ limit: 1 });
    for (let index = 0; index < MOCK_SERVER.MAX_RATE_LIMIT_CLIENTS + 100; index += 1)
      limiter.hit(`client-${String(index)}`);
    expect(limiter.trackedClients).toBe(MOCK_SERVER.MAX_RATE_LIMIT_CLIENTS);
  });
});

describe('REST API: fault injection and internal errors', () => {
  it('is off by default', async () => {
    const { httpUrl } = await start();
    const started = Date.now();
    const replies = await Promise.all(
      Array.from({ length: 20 }, () => call(httpUrl, 'GET', '/api/devices')),
    );
    expect(replies.every((reply) => reply.status === 200)).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('adds latency and fails requests when explicitly enabled', async () => {
    const { httpUrl } = await start({
      faults: { latencyMs: 80, failureRate: 1, status: 503 },
      random: () => 0,
    });
    const started = Date.now();
    const reply = await call(httpUrl, 'GET', '/api/devices');
    expect(Date.now() - started).toBeGreaterThanOrEqual(75);
    expect(reply.status).toBe(503);
    expect(errorCode(reply)).toBe('injected_fault');
  });

  it('parses fault specs strictly', () => {
    expect(parseFaultSpec('latency=300,failure=0.25,status=500')).toEqual({
      ok: true,
      config: { latencyMs: 300, failureRate: 0.25, status: 500 },
    });
    for (const spec of [
      'latency=-1',
      'failure=2',
      'status=200',
      'explode=1',
      'latency=1,latency=2',
      'latency',
    ]) {
      expect(parseFaultSpec(spec).ok).toBe(false);
    }
  });

  it('hides internal errors behind a generic 500', async () => {
    const rules = new AlertRuleStore();
    const data = new SimulatedTelemetryData({ model: new HistoryModel(), rules, now: () => NOW });
    data.listDevices = () => {
      throw new Error('database password is hunter2');
    };
    const logged: string[] = [];
    const handler = createRestHandler({
      data,
      rules,
      allowedOrigins: new Set(),
      limiter: new RateLimiter(),
      faults: null,
      random: Math.random,
      log: (line) => logged.push(line),
    });
    const raw = createServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve) => raw.listen(0, '127.0.0.1', resolve));
    const { port } = raw.address() as AddressInfo;
    const reply = await call(`http://127.0.0.1:${String(port)}`, 'GET', '/api/devices');
    raw.close();

    expect(reply.status).toBe(500);
    expect(reply.body).toEqual({ error: { code: 'internal', message: 'Internal error' } });
    expect(logged.join()).toContain('hunter2'); // logged server-side only
  });
});
