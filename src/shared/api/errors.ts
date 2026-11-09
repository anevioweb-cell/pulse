import { HTTP } from './config';

/**
 * - `network`: the request never got a response (offline, DNS, CORS, connection reset).
 * - `timeout`: no complete response within HTTP.TIMEOUT_MS.
 * - `http`: the server answered with a non-2xx status.
 * - `validation`: the response was not what the contract says (wrong content type, oversized,
 *   invalid JSON, schema violation). Never retried: retrying will not fix a contract mismatch.
 * - `aborted`: the caller cancelled (component unmounted, query superseded).
 * - `offline`: the browser reports no connectivity, so the request was never sent. Used by
 *   mutations, which fail fast instead of waiting paused (ADR 0019). Never retried.
 */
export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'validation' | 'aborted' | 'offline';

export interface ApiIssue {
  readonly path: string;
  readonly code: string;
}

export interface ApiErrorOptions {
  status?: number;
  code?: string;
  issues?: readonly ApiIssue[];
  cause?: unknown;
}

/** The only error type the data layer throws. UI code switches on `kind`, never on messages. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;
  /** Machine-readable code: from the server's error envelope, or set by the client. */
  readonly code: string | undefined;
  readonly issues: readonly ApiIssue[];

  constructor(kind: ApiErrorKind, message: string, options: ApiErrorOptions = {}) {
    super(message.slice(0, HTTP.MAX_ERROR_MESSAGE_LENGTH), { cause: options.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status;
    this.code = options.code;
    this.issues = (options.issues ?? []).slice(0, HTTP.MAX_ERROR_ISSUES);
  }

  /** Worth retrying: transient network problems, timeouts, 5xx and 429. Never 4xx or validation. */
  get retryable(): boolean {
    if (this.kind === 'network' || this.kind === 'timeout') return true;
    if (this.kind !== 'http' || this.status === undefined) return false;
    return this.status >= HTTP_SERVER_ERROR || this.status === HTTP_TOO_MANY_REQUESTS;
  }
}

const HTTP_SERVER_ERROR = 500;
const HTTP_TOO_MANY_REQUESTS = 429;

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;
