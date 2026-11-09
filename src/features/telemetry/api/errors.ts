import { ApiError } from '@/shared/api';
import type { ApiIssue } from '@/shared/api';

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

const issuesOf = (error: {
  issues: readonly { path: readonly PropertyKey[]; code: string }[];
}): ApiIssue[] =>
  error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), code: issue.code }));

/** The same errors the mock server sends, so Demo Mode fails exactly like Live Mode. */
export const demoErrors = {
  badRequest: (error: { issues: readonly { path: readonly PropertyKey[]; code: string }[] }) =>
    new ApiError('http', 'Invalid request', {
      status: HTTP_BAD_REQUEST,
      code: 'bad_request',
      issues: issuesOf(error),
    }),
  notFound: (what: string) =>
    new ApiError('http', `${what} not found`, { status: HTTP_NOT_FOUND, code: 'not_found' }),
  limitReached: () =>
    new ApiError('http', 'Alert rule limit reached', {
      status: HTTP_CONFLICT,
      code: 'limit_reached',
    }),
};

/** Client-side input check before a request leaves the browser (bad ids never reach a URL). */
export const invalidRequest = (error: {
  issues: readonly { path: readonly PropertyKey[]; code: string }[];
}) =>
  new ApiError('validation', 'Invalid request parameters', {
    code: 'invalid_request',
    issues: issuesOf(error),
  });

export const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) throw new ApiError('aborted', 'Request aborted');
};
