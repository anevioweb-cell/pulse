/**
 * Keys that must never appear in untrusted JSON (network, storage, devices): they can reach object
 * prototypes when parsed data is later merged into plain objects. Rejected outright.
 */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export type SafeJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'invalid_json' | 'forbidden_key'; key?: string };

class ForbiddenKeyError extends Error {}

function rejectForbiddenKeys(key: string, value: unknown): unknown {
  if (FORBIDDEN_KEYS.has(key)) throw new ForbiddenKeyError(key);
  return value;
}

/** JSON.parse for untrusted text: never throws, rejects prototype keys at any depth. */
export function parseJsonSafely(text: string): SafeJsonResult {
  try {
    return { ok: true, value: JSON.parse(text, rejectForbiddenKeys) };
  } catch (error) {
    if (error instanceof ForbiddenKeyError)
      return { ok: false, reason: 'forbidden_key', key: error.message };
    return { ok: false, reason: 'invalid_json' };
  }
}
