import { MOCK_SERVER } from '@/features/telemetry';

const ALLOWED_METHODS = 'GET, POST, PUT, DELETE';
const ALLOWED_HEADERS = 'Content-Type';

export type CorsDecision =
  { allowed: true; headers: Readonly<Record<string, string>> } | { allowed: false };

/**
 * Exact-match origin allowlist (no wildcard, no pattern matching). Requests without an Origin
 * header (curl, server-to-server, same-origin GETs) carry no CORS risk and are allowed; browsers
 * always send Origin on cross-origin requests.
 */
export function decideCors(
  origin: string | undefined,
  allowlist: ReadonlySet<string>,
): CorsDecision {
  if (origin === undefined) return { allowed: true, headers: {} };
  if (!allowlist.has(origin)) return { allowed: false };
  return {
    allowed: true,
    headers: {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    },
  };
}

export const preflightHeaders = (
  base: Readonly<Record<string, string>>,
): Record<string, string> => ({
  ...base,
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
  'Access-Control-Allow-Headers': ALLOWED_HEADERS,
  'Access-Control-Max-Age': String(MOCK_SERVER.CORS_MAX_AGE_SECONDS),
});
