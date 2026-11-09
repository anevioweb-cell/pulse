import { z } from 'zod/mini';

import { parseJsonSafely } from '../lib/safe-json';
import { HTTP } from './config';
import { ApiError } from './errors';

import type { ApiIssue } from './errors';

const HTTP_NO_CONTENT = 204;
const JSON_CONTENT_TYPE = /^application\/json(\s*;|$)/i;

/** Error envelope the mock server (and any compliant backend) returns for non-2xx responses. */
const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.optional(
      z
        .array(z.object({ path: z.string(), code: z.string() }))
        .check(z.maxLength(HTTP.MAX_ERROR_ISSUES)),
    ),
  }),
});

export interface HttpClientOptions {
  /** Absolute http(s) base URL, e.g. "http://127.0.0.1:8787". */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface RequestOptions {
  query?: Readonly<Record<string, string | number | undefined>>;
  body?: unknown;
  signal?: AbortSignal | undefined;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface HttpClient {
  /** Sends a request and validates the JSON response with `schema` before returning it. */
  request: <Output>(
    method: HttpMethod,
    path: string,
    schema: z.ZodMiniType<Output>,
    options?: RequestOptions,
  ) => Promise<Output>;
  /** Sends a request that must answer 204 No Content. */
  requestNoContent: (method: HttpMethod, path: string, options?: RequestOptions) => Promise<void>;
}

const issuesOf = (error: {
  issues: readonly { path: readonly PropertyKey[]; code: string }[];
}): ApiIssue[] =>
  error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), code: issue.code }));

/** Reads a body up to `limit` bytes, cancelling the stream as soon as it is exceeded. */
async function readLimited(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > limit) {
    throw new ApiError('validation', 'Response too large', {
      code: 'response_too_large',
      status: response.status,
    });
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ApiError('validation', 'Response too large', {
        code: 'response_too_large',
        status: response.status,
      });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * JSON-only fetch wrapper: timeout and caller cancellation, size-limited bodies, no redirects or
 * cookies, and every response validated before it is returned. Throws only ApiError.
 */
export function createHttpClient({
  baseUrl,
  fetch: fetchImpl = (input, init) => globalThis.fetch(input, init),
  timeoutMs = HTTP.TIMEOUT_MS,
  maxResponseBytes = HTTP.MAX_RESPONSE_BYTES,
}: HttpClientOptions): HttpClient {
  const base = new URL(baseUrl);
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new RangeError('baseUrl must be an http(s) URL');
  }

  async function send(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
  ): Promise<Response> {
    const url = new URL(path, base);
    if (url.origin !== base.origin)
      throw new RangeError('Request path must stay on the API origin');
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    if (options.signal?.aborted) throw new ApiError('aborted', 'Request aborted');
    const controller = new AbortController();
    // Set from the timer and abort listener (closures), read in the catch block.
    const ended = { byTimeout: false, byCaller: false };
    const timer = setTimeout(() => {
      ended.byTimeout = true;
      controller.abort();
    }, timeoutMs);
    const forwardAbort = () => {
      ended.byCaller = true;
      controller.abort();
    };
    options.signal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      return await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error',
      });
    } catch (cause) {
      if (ended.byTimeout) throw new ApiError('timeout', 'Request timed out', { cause });
      if (ended.byCaller) throw new ApiError('aborted', 'Request aborted', { cause });
      throw new ApiError('network', 'Network request failed', { cause });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', forwardAbort);
    }
  }

  async function failure(response: Response): Promise<never> {
    let text = '';
    try {
      text = await readLimited(response, maxResponseBytes);
    } catch {
      // Unreadable error body: fall back to the status alone.
    }
    const json = parseJsonSafely(text);
    const envelope = json.ok ? errorEnvelopeSchema.safeParse(json.value) : null;
    if (envelope?.success) {
      throw new ApiError('http', envelope.data.error.message, {
        status: response.status,
        code: envelope.data.error.code,
        issues: envelope.data.error.issues ?? [],
      });
    }
    throw new ApiError('http', `HTTP ${String(response.status)}`, { status: response.status });
  }

  return {
    async request(method, path, schema, options = {}) {
      const response = await send(method, path, options);
      if (!response.ok) return failure(response);
      if (!JSON_CONTENT_TYPE.test(response.headers.get('content-type') ?? '')) {
        throw new ApiError('validation', 'Unexpected content type', {
          code: 'unexpected_content_type',
          status: response.status,
        });
      }
      const text = await readLimited(response, maxResponseBytes);
      const json = parseJsonSafely(text);
      if (!json.ok) {
        throw new ApiError('validation', 'Invalid JSON in response', {
          code: json.reason,
          status: response.status,
        });
      }
      const parsed = schema.safeParse(json.value);
      if (!parsed.success) {
        throw new ApiError('validation', 'Response does not match the expected schema', {
          code: 'schema_violation',
          status: response.status,
          issues: issuesOf(parsed.error),
        });
      }
      return parsed.data;
    },

    async requestNoContent(method, path, options = {}) {
      const response = await send(method, path, options);
      if (!response.ok) return failure(response);
      if (response.status !== HTTP_NO_CONTENT) {
        throw new ApiError('validation', 'Expected an empty response', {
          code: 'unexpected_body',
          status: response.status,
        });
      }
    },
  };
}
