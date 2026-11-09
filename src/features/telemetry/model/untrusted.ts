import { z } from 'zod/mini';

import { FORBIDDEN_KEYS } from '@/shared/lib/safe-json';

export { FORBIDDEN_KEYS };

// Characters removed from free-text fields before display:
// - C0 controls, DEL and C1 controls (terminal escapes, NUL, line breaks in log lines);
// - Unicode bidi embedding/override/isolate controls (text spoofing, "Trojan Source");
// - line and paragraph separators (break single-line UI and logs).
/* eslint-disable no-control-regex -- matching control characters is the point */
const UNSAFE_TEXT_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\u2028\u2029]/g;
/* eslint-enable no-control-regex */

export function stripUnsafeCharacters(value: string): string {
  return value.replace(UNSAFE_TEXT_CHARACTERS, '');
}

/**
 * Untrusted free text (names, locations): capped in length before any processing, stripped of
 * control and bidi characters, trimmed, and required to be non-empty afterwards.
 */
export function untrustedText(maxLength: number) {
  return z.pipe(
    z.pipe(
      z.string().check(z.maxLength(maxLength)),
      z.transform((value) => stripUnsafeCharacters(value).trim()),
    ),
    z.string().check(z.minLength(1)),
  );
}

/** Identifier syntax: letters, digits and `. _ : -` only, so ids are safe in URLs, logs and keys. */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]+$/;

/** Untrusted identifier: strict allowlist (rejected, not cleaned) and never a prototype key. */
export function untrustedIdentifier(maxLength: number) {
  return z.string().check(
    z.minLength(1),
    z.maxLength(maxLength),
    z.regex(IDENTIFIER_PATTERN),
    z.refine((value) => !FORBIDDEN_KEYS.has(value), { message: 'Reserved identifier' }),
  );
}

/** Finite number within inclusive physical bounds (zod/mini rejects NaN and ±Infinity). */
export function boundedNumber({ min, max }: { readonly min: number; readonly max: number }) {
  return z.number().check(z.gte(min), z.lte(max));
}
