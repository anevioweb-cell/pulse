import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod/mini';

import { RETRY } from './config';
import { ApiError } from './errors';
import { createHttpClient } from './http-client';
import { retryDelay, shouldRetry } from './retry';

const BASE = 'http://api.test';
const itemSchema = z.strictObject({ id: z.string(), value: z.number() });

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

const client = (options: { timeoutMs?: number; maxResponseBytes?: number } = {}) =>
  createHttpClient({ baseUrl: BASE, ...options });

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('Expected the request to fail');
}

describe('createHttpClient', () => {
  it('returns validated data and sends query parameters', async () => {
    server.use(
      http.get(`${BASE}/item`, ({ request }) =>
        HttpResponse.json({ id: new URL(request.url).searchParams.get('id'), value: 1 }),
      ),
    );
    await expect(
      client().request('GET', '/item', itemSchema, { query: { id: 'a', skip: undefined } }),
    ).resolves.toEqual({
      id: 'a',
      value: 1,
    });
  });

  it('sends JSON bodies with the right headers', async () => {
    server.use(
      http.post(`${BASE}/item`, async ({ request }) => {
        expect(request.headers.get('content-type')).toBe('application/json');
        expect(request.headers.get('accept')).toBe('application/json');
        return HttpResponse.json({ ...((await request.json()) as object), value: 2 });
      }),
    );
    await expect(
      client().request('POST', '/item', itemSchema, { body: { id: 'b' } }),
    ).resolves.toEqual({
      id: 'b',
      value: 2,
    });
  });

  it.each([
    ['schema violation', HttpResponse.json({ id: 1, value: 'x' }), 'schema_violation'],
    ['extra key', HttpResponse.json({ id: 'a', value: 1, admin: true }), 'schema_violation'],
    [
      'invalid JSON',
      new HttpResponse('{oops', { headers: { 'Content-Type': 'application/json' } }),
      'invalid_json',
    ],
    [
      'prototype key',
      new HttpResponse('{"__proto__":{"x":1},"id":"a","value":1}', {
        headers: { 'Content-Type': 'application/json' },
      }),
      'forbidden_key',
    ],
    ['HTML instead of JSON', HttpResponse.html('<h1>Proxy error</h1>'), 'unexpected_content_type'],
  ])('turns a malformed response (%s) into a validation error', async (_name, response, code) => {
    server.use(http.get(`${BASE}/item`, () => response));
    const error = await failureOf(client().request('GET', '/item', itemSchema));
    expect(error).toMatchObject({ kind: 'validation', code });
    expect(error.retryable).toBe(false);
  });

  it('reports the failing paths of a schema violation', async () => {
    server.use(http.get(`${BASE}/item`, () => HttpResponse.json({ id: 'a', value: 'x' })));
    const error = await failureOf(client().request('GET', '/item', itemSchema));
    expect(error.issues).toEqual([expect.objectContaining({ path: 'value' })]);
  });

  it('maps an error envelope to a typed http error', async () => {
    server.use(
      http.get(`${BASE}/item`, () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'Device not found' } },
          { status: 404 },
        ),
      ),
    );
    const error = await failureOf(client().request('GET', '/item', itemSchema));
    expect(error).toMatchObject({
      kind: 'http',
      status: 404,
      code: 'not_found',
      message: 'Device not found',
    });
    expect(error.retryable).toBe(false);
  });

  it.each([
    [500, true],
    [503, true],
    [429, true],
    [400, false],
    [403, false],
  ])('classifies HTTP %i as retryable=%s, even without an envelope', async (status, retryable) => {
    server.use(http.get(`${BASE}/item`, () => new HttpResponse('nope', { status })));
    const error = await failureOf(client().request('GET', '/item', itemSchema));
    expect(error).toMatchObject({ kind: 'http', status, code: undefined });
    expect(error.retryable).toBe(retryable);
  });

  it('times out slow responses', async () => {
    server.use(
      http.get(`${BASE}/item`, async () => {
        await delay(1000);
        return HttpResponse.json({ id: 'a', value: 1 });
      }),
    );
    const error = await failureOf(client({ timeoutMs: 30 }).request('GET', '/item', itemSchema));
    expect(error.kind).toBe('timeout');
    expect(error.retryable).toBe(true);
  });

  it('reports caller cancellation as aborted, before and during the request', async () => {
    server.use(
      http.get(`${BASE}/item`, async () => {
        await delay(1000);
        return HttpResponse.json({ id: 'a', value: 1 });
      }),
    );
    const controller = new AbortController();
    const pending = client().request('GET', '/item', itemSchema, { signal: controller.signal });
    setTimeout(() => {
      controller.abort();
    }, 10);
    expect((await failureOf(pending)).kind).toBe('aborted');

    const already = AbortSignal.abort();
    expect(
      (await failureOf(client().request('GET', '/item', itemSchema, { signal: already }))).kind,
    ).toBe('aborted');
  });

  it('reports network failures', async () => {
    server.use(http.get(`${BASE}/item`, () => HttpResponse.error()));
    const error = await failureOf(client().request('GET', '/item', itemSchema));
    expect(error.kind).toBe('network');
    expect(error.retryable).toBe(true);
  });

  it('refuses to follow redirects', async () => {
    server.use(
      http.get(
        `${BASE}/item`,
        () => new HttpResponse(null, { status: 302, headers: { Location: 'http://evil.test/' } }),
      ),
    );
    expect((await failureOf(client().request('GET', '/item', itemSchema))).kind).toBe('network');
  });

  it('rejects oversized responses, with or without Content-Length', async () => {
    const big = JSON.stringify({ id: 'x'.repeat(500), value: 1 });
    server.use(
      http.get(
        `${BASE}/declared`,
        () =>
          new HttpResponse(big, {
            headers: { 'Content-Type': 'application/json', 'Content-Length': String(big.length) },
          }),
      ),
      http.get(`${BASE}/streamed`, () => {
        const stream = new ReadableStream({
          start(controller) {
            const chunk = new TextEncoder().encode(big);
            controller.enqueue(chunk);
            controller.enqueue(chunk);
            controller.close();
          },
        });
        return new HttpResponse(stream, { headers: { 'Content-Type': 'application/json' } });
      }),
    );
    for (const path of ['/declared', '/streamed']) {
      const error = await failureOf(
        client({ maxResponseBytes: 100 }).request('GET', path, itemSchema),
      );
      expect(error).toMatchObject({ kind: 'validation', code: 'response_too_large' });
    }
  });

  it('expects 204 for no-content requests', async () => {
    server.use(
      http.delete(`${BASE}/item/a`, () => new HttpResponse(null, { status: 204 })),
      http.delete(`${BASE}/item/b`, () => HttpResponse.json({ deleted: true })),
    );
    await expect(client().requestNoContent('DELETE', '/item/a')).resolves.toBeUndefined();
    expect(await failureOf(client().requestNoContent('DELETE', '/item/b'))).toMatchObject({
      kind: 'validation',
      code: 'unexpected_body',
    });
  });

  it('only talks to its own origin and http(s) base URLs', async () => {
    await expect(client().request('GET', 'http://evil.test/steal', itemSchema)).rejects.toThrow(
      RangeError,
    );
    expect(() => createHttpClient({ baseUrl: 'ftp://api.test' })).toThrow(RangeError);
  });
});

describe('retry policy', () => {
  const http500 = new ApiError('http', 'boom', { status: 500 });
  it.each([
    [0, http500, true],
    [RETRY.MAX_RETRIES - 1, http500, true],
    [RETRY.MAX_RETRIES, http500, false],
    [0, new ApiError('http', 'bad', { status: 404 }), false],
    [0, new ApiError('validation', 'bad'), false],
    [0, new ApiError('aborted', 'stop'), false],
    [0, new ApiError('timeout', 'slow'), true],
    [0, new Error('not an ApiError'), false],
  ])('after %i failures, retries %o: %s', (failures, error, expected) => {
    expect(shouldRetry(failures, error)).toBe(expected);
  });

  it('backs off exponentially up to the cap', () => {
    expect([0, 1, 2, 3, 10].map(retryDelay)).toEqual([
      RETRY.BASE_DELAY_MS,
      RETRY.BASE_DELAY_MS * 2,
      RETRY.BASE_DELAY_MS * 4,
      RETRY.BASE_DELAY_MS * 8,
      RETRY.MAX_DELAY_MS,
    ]);
  });
});
