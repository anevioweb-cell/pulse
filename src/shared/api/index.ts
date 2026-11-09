// Domain-agnostic data-access plumbing. Feature-specific APIs live in their features.
export { HTTP, PERSISTENCE, QUERY_DEFAULTS, RETRY } from './config';
export { ApiError, isApiError } from './errors';
export type { ApiErrorKind, ApiIssue } from './errors';
export { createHttpClient } from './http-client';
export type { HttpClient, HttpClientOptions, HttpMethod, RequestOptions } from './http-client';
export { retryDelay, shouldRetry } from './retry';
export { createQueryClient } from './query-client';
export {
  createIdbStorage,
  createMemoryStorage,
  migrateRecord,
  persistQueryCache,
  restoreQueryCache,
  serializeQueryCache,
  withStorageTimeout,
} from './persistence';
export type {
  KeyValueStorage,
  PersistPolicy,
  QueryPersistenceOptions,
  RestoreReport,
} from './persistence';
