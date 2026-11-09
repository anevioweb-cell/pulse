import type { ErrorCode } from '@/features/telemetry';

import type { ServerResponse } from 'node:http';

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/** Sent on every REST response: JSON only, never sniffed, never cached, never framed. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
};

export interface Issue {
  path: string;
  code: string;
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    ...headers,
    'Content-Length': String(Buffer.byteLength(payload)),
  });
  response.end(payload);
}

export function sendNoContent(
  response: ServerResponse,
  headers: Readonly<Record<string, string>> = {},
): void {
  const withoutBodyType = Object.fromEntries(
    Object.entries(SECURITY_HEADERS).filter(([name]) => name !== 'Content-Type'),
  );
  response.writeHead(HTTP_STATUS.NO_CONTENT, { ...withoutBodyType, ...headers });
  response.end();
}

/** Typed error envelope. Messages are fixed strings: no stack traces, no echoed input. */
export function sendError(
  response: ServerResponse,
  status: number,
  code: ErrorCode,
  message: string,
  options: { issues?: readonly Issue[]; headers?: Readonly<Record<string, string>> } = {},
): void {
  sendJson(
    response,
    status,
    { error: { code, message, ...(options.issues ? { issues: options.issues } : {}) } },
    options.headers,
  );
}
