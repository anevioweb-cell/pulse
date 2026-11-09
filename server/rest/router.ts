import { z } from 'zod/mini';

import {
  alertRuleInputSchema,
  alertsQuerySchema,
  deviceIdSchema,
  MOCK_SERVER,
  readingsQuerySchema,
  ruleIdSchema,
} from '@/features/telemetry';
import type { AlertRuleStore, SimulatedTelemetryData } from '@/features/telemetry';

import { readJsonBody } from './body';
import { decideCors, preflightHeaders } from './cors';
import { HTTP_STATUS, sendError, sendJson, sendNoContent } from './responses';

import type { FaultConfig } from './faults';
import type { RateLimiter } from './rate-limiter';
import type { Issue } from './responses';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface RestContext {
  data: SimulatedTelemetryData;
  rules: AlertRuleStore;
  allowedOrigins: ReadonlySet<string>;
  limiter: RateLimiter;
  faults: FaultConfig | null;
  random: () => number;
  log: (line: string) => void;
}

type Params = Record<string, string>;
type Handler = (
  request: IncomingMessage,
  response: ServerResponse,
  query: Params,
  id: string,
) => void | Promise<void>;

const MAX_ISSUES = 10;

/** Endpoints without parameters accept no query string at all. */
const emptyQuerySchema = z.strictObject({});
const JSON_CONTENT_TYPE = /^application\/json(\s*;|$)/i;

const issuesOf = (error: {
  issues: readonly { path: readonly PropertyKey[]; code: string }[];
}): Issue[] =>
  error.issues
    .slice(0, MAX_ISSUES)
    .map((issue) => ({ path: issue.path.map(String).join('.'), code: issue.code }));

/** Splits a path into decoded segments; null if any segment is not valid percent-encoding. */
function segmentsOf(pathname: string): string[] | null {
  try {
    return pathname
      .split('/')
      .slice(1)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

/** Query string as a null-prototype record; repeated keys (parameter pollution) are an error. */
function queryOf(url: URL): { ok: true; params: Params } | { ok: false; key: string } {
  const params: Params = Object.create(null) as Params;
  for (const [key, value] of url.searchParams) {
    if (Object.hasOwn(params, key)) return { ok: false, key };
    params[key] = value; // eslint-disable-line security/detect-object-injection -- null-prototype record
  }
  return { ok: true, params };
}

/**
 * The mock server's REST API. Every input (path, query, body, headers) is validated with the
 * shared contract schemas; every failure is a typed error envelope with a fixed message.
 */
export function createRestHandler(context: RestContext) {
  const { data, rules } = context;

  const validate = <Output>(
    response: ServerResponse,
    schema: z.ZodMiniType<Output>,
    value: unknown,
  ): { ok: true; value: Output } | { ok: false } => {
    const result = schema.safeParse(value);
    if (result.success) return { ok: true, value: result.data };
    sendError(response, HTTP_STATUS.BAD_REQUEST, 'bad_request', 'Invalid request', {
      issues: issuesOf(result.error),
    });
    return { ok: false };
  };

  const noQuery = (response: ServerResponse, query: Params) =>
    validate(response, emptyQuerySchema, query);

  const readBody = async (request: IncomingMessage, response: ServerResponse) => {
    if (!JSON_CONTENT_TYPE.test(request.headers['content-type'] ?? '')) {
      sendError(
        response,
        HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
        'unsupported_media_type',
        'Content-Type must be application/json',
      );
      return null;
    }
    const body = await readJsonBody(request, MOCK_SERVER.MAX_BODY_BYTES);
    if (body.ok) return body;
    if (body.reason === 'too_large') {
      sendError(
        response,
        HTTP_STATUS.PAYLOAD_TOO_LARGE,
        'payload_too_large',
        'Request body too large',
        {
          headers: { Connection: 'close' },
        },
      );
    } else {
      sendError(
        response,
        HTTP_STATUS.BAD_REQUEST,
        'bad_request',
        'Request body is not valid JSON',
        {
          issues: [{ path: '', code: body.reason }],
        },
      );
    }
    return null;
  };

  const routes: {
    pattern: readonly string[];
    methods: Readonly<Partial<Record<string, Handler>>>;
  }[] = [
    {
      pattern: ['api', 'devices'],
      methods: {
        GET: (_request, response, query) => {
          if (!noQuery(response, query).ok) return;
          sendJson(response, HTTP_STATUS.OK, { devices: data.listDevices() });
        },
      },
    },
    {
      pattern: ['api', 'devices', ':id'],
      methods: {
        GET: (_request, response, query, id) => {
          if (!noQuery(response, query).ok) return;
          const detail = data.getDevice(id);
          if (!detail) {
            sendError(response, HTTP_STATUS.NOT_FOUND, 'not_found', 'Device not found');
            return;
          }
          sendJson(response, HTTP_STATUS.OK, detail);
        },
      },
    },
    {
      pattern: ['api', 'devices', ':id', 'readings'],
      methods: {
        GET: (_request, response, query, id) => {
          const parsed = validate(response, readingsQuerySchema, query);
          if (!parsed.ok) return;
          const readings = data.getReadings(id, parsed.value);
          if (!readings) {
            sendError(response, HTTP_STATUS.NOT_FOUND, 'not_found', 'Device not found');
            return;
          }
          sendJson(response, HTTP_STATUS.OK, readings);
        },
      },
    },
    {
      pattern: ['api', 'alerts'],
      methods: {
        GET: (_request, response, query) => {
          const parsed = validate(response, alertsQuerySchema, query);
          if (!parsed.ok) return;
          sendJson(response, HTTP_STATUS.OK, data.listAlerts(parsed.value));
        },
      },
    },
    {
      pattern: ['api', 'alert-rules'],
      methods: {
        GET: (_request, response, query) => {
          if (!noQuery(response, query).ok) return;
          sendJson(response, HTTP_STATUS.OK, { rules: rules.list() });
        },
        POST: async (request, response, query) => {
          if (!noQuery(response, query).ok) return;
          const body = await readBody(request, response);
          if (!body) return;
          const input = validate(response, alertRuleInputSchema, body.value);
          if (!input.ok) return;
          const result = rules.create(input.value);
          if (!result.ok) {
            sendError(response, HTTP_STATUS.CONFLICT, 'limit_reached', 'Alert rule limit reached');
            return;
          }
          sendJson(response, HTTP_STATUS.CREATED, result.rule);
        },
      },
    },
    {
      pattern: ['api', 'alert-rules', ':id'],
      methods: {
        PUT: async (request, response, query, id) => {
          if (!noQuery(response, query).ok) return;
          const body = await readBody(request, response);
          if (!body) return;
          const input = validate(response, alertRuleInputSchema, body.value);
          if (!input.ok) return;
          const result = rules.update(id, input.value);
          if (!result.ok) {
            sendError(response, HTTP_STATUS.NOT_FOUND, 'not_found', 'Alert rule not found');
            return;
          }
          sendJson(response, HTTP_STATUS.OK, result.rule);
        },
        DELETE: (_request, response, query, id) => {
          if (!noQuery(response, query).ok) return;
          if (!rules.delete(id)) {
            sendError(response, HTTP_STATUS.NOT_FOUND, 'not_found', 'Alert rule not found');
            return;
          }
          sendNoContent(response);
        },
      },
    },
  ];

  const idSchemaFor = (first: string | undefined) =>
    first === 'alert-rules' ? ruleIdSchema : deviceIdSchema;

  return async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const rawUrl = request.url ?? '/';
    if (rawUrl.length > MOCK_SERVER.MAX_URL_LENGTH) {
      sendError(response, HTTP_STATUS.URI_TOO_LONG, 'uri_too_long', 'URL too long');
      return;
    }

    // CORS first: a disallowed browser origin gets nothing else, not even 404s.
    const cors = decideCors(request.headers.origin, context.allowedOrigins);
    if (!cors.allowed) {
      sendError(response, HTTP_STATUS.FORBIDDEN, 'forbidden_origin', 'Origin not allowed');
      return;
    }
    const corsHeaders = cors.headers;
    for (const [name, value] of Object.entries(corsHeaders)) response.setHeader(name, value);

    const client = request.socket.remoteAddress ?? 'unknown';
    const limited = context.limiter.hit(client);
    if (!limited.allowed) {
      sendError(response, HTTP_STATUS.TOO_MANY_REQUESTS, 'rate_limited', 'Too many requests', {
        headers: { 'Retry-After': String(limited.retryAfterSeconds) },
      });
      return;
    }

    if (request.method === 'OPTIONS') {
      sendNoContent(response, preflightHeaders(corsHeaders));
      return;
    }

    const url = new URL(rawUrl, 'http://localhost');
    const segments = segmentsOf(url.pathname);
    if (!segments) {
      sendError(response, HTTP_STATUS.BAD_REQUEST, 'bad_request', 'Malformed path');
      return;
    }

    const route = routes.find(
      ({ pattern }) =>
        pattern.length === segments.length &&
        pattern.every((part, index) =>
          // A parameter never matches an empty segment, so trailing slashes are 404, not "empty id".
          part.startsWith(':') ? segments.at(index) !== '' : part === segments.at(index),
        ),
    );
    if (!route) {
      sendError(response, HTTP_STATUS.NOT_FOUND, 'not_found', 'Not found');
      return;
    }

    const handler = new Map(Object.entries(route.methods)).get(request.method ?? '');
    if (!handler) {
      sendError(
        response,
        HTTP_STATUS.METHOD_NOT_ALLOWED,
        'method_not_allowed',
        'Method not allowed',
        {
          headers: { Allow: Object.keys(route.methods).join(', ') },
        },
      );
      return;
    }

    let id = '';
    const idIndex = route.pattern.indexOf(':id');
    if (idIndex !== -1) {
      const parsed = validate(response, idSchemaFor(segments.at(1)), segments.at(idIndex));
      if (!parsed.ok) return;
      id = parsed.value;
    }

    const query = queryOf(url);
    if (!query.ok) {
      sendError(response, HTTP_STATUS.BAD_REQUEST, 'bad_request', 'Repeated query parameter', {
        issues: [
          { path: query.key.slice(0, MOCK_SERVER.MAX_URL_LENGTH), code: 'duplicate_parameter' },
        ],
      });
      return;
    }

    if (context.faults) {
      const { latencyMs, failureRate, status } = context.faults;
      if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
      if (context.random() < failureRate) {
        sendError(response, status, 'injected_fault', 'Injected fault (test mode)');
        return;
      }
    }

    try {
      await handler(request, response, query.params, id);
    } catch (error) {
      context.log(`REST handler error: ${error instanceof Error ? error.message : 'unknown'}`);
      if (!response.headersSent)
        sendError(response, HTTP_STATUS.INTERNAL, 'internal', 'Internal error');
    }
  };
}
