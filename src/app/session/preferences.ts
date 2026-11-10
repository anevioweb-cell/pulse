import { z } from 'zod/mini';

import { validateWebSocketUrl } from '@/features/telemetry';
import type { TelemetryMode } from '@/features/telemetry';
import { parseJsonSafely } from '@/shared/lib';

import { PREFERENCES } from '../config';

/** The minimal app preference (the full Settings page is Phase 5C). */
export interface Preferences {
  readonly mode: TelemetryMode;
  /** ws:// or wss:// URL of the Live Mode server, validated with the transport's own rule. */
  readonly liveUrl: string;
}

/** The subset of the Web Storage API used here (localStorage, or a fake in tests). */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const DEFAULT_PREFERENCES: Preferences = {
  mode: PREFERENCES.DEFAULT_MODE,
  liveUrl: PREFERENCES.DEFAULT_LIVE_URL,
};

const storedPreferencesSchema = z.strictObject({
  version: z.literal(PREFERENCES.SCHEMA_VERSION),
  mode: z.enum(['demo', 'live']),
  liveUrl: z.string().check(z.maxLength(PREFERENCES.MAX_URL_LENGTH)),
});

export type LiveUrlProblem =
  'empty' | 'too_long' | 'invalid_url' | 'unsupported_scheme' | 'credentials_in_url';

export type LiveUrlValidation = { ok: true; url: string } | { ok: false; problem: LiveUrlProblem };

/**
 * Checks a Live URL typed by the user or read from storage: trimmed, length-capped, then the
 * transport's strict rule (ws: or wss: only, no credentials). Never throws.
 */
export function validateLiveUrl(input: string): LiveUrlValidation {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, problem: 'empty' };
  if (trimmed.length > PREFERENCES.MAX_URL_LENGTH) return { ok: false, problem: 'too_long' };
  const result = validateWebSocketUrl(trimmed);
  if (result.ok) return { ok: true, url: result.url };
  switch (result.reason) {
    case 'unsupported_scheme':
    case 'credentials_in_url':
      return { ok: false, problem: result.reason };
    default:
      return { ok: false, problem: 'invalid_url' };
  }
}

/** Why the stored record was not used: nothing stored is not an issue. */
export type PreferenceIssue = 'unavailable' | 'invalid';

export interface PreferenceRead {
  preferences: Preferences;
  issue: PreferenceIssue | null;
}

/**
 * Reads the stored preference. Storage is untrusted: the record is length-capped, parsed without
 * prototype keys, checked against a strict schema, and its URL against the transport's rule.
 * Anything wrong (or storage that throws) gives the defaults, which start in Demo Mode. Never throws.
 */
export function readPreferences(storage: PreferenceStorage | null): PreferenceRead {
  if (!storage) return { preferences: DEFAULT_PREFERENCES, issue: 'unavailable' };
  let raw: string | null;
  try {
    raw = storage.getItem(PREFERENCES.STORAGE_KEY);
  } catch {
    return { preferences: DEFAULT_PREFERENCES, issue: 'unavailable' };
  }
  if (raw === null) return { preferences: DEFAULT_PREFERENCES, issue: null };
  const invalid = { preferences: DEFAULT_PREFERENCES, issue: 'invalid' } as const;
  if (raw.length > PREFERENCES.MAX_RECORD_LENGTH) return invalid;
  const json = parseJsonSafely(raw);
  if (!json.ok) return invalid;
  const record = storedPreferencesSchema.safeParse(json.value);
  if (!record.success) return invalid;
  const url = validateLiveUrl(record.data.liveUrl);
  if (!url.ok) return invalid;
  return { preferences: { mode: record.data.mode, liveUrl: url.url }, issue: null };
}

/** Stores the preference. A failing storage (quota, private mode) is ignored: it is a convenience. */
export function writePreferences(
  storage: PreferenceStorage | null,
  preferences: Preferences,
): void {
  try {
    storage?.setItem(
      PREFERENCES.STORAGE_KEY,
      JSON.stringify({ version: PREFERENCES.SCHEMA_VERSION, ...preferences }),
    );
  } catch {
    // Not persisted: the choice still applies to this session.
  }
}

/** localStorage, or null where reading it throws (blocked storage, sandboxed frames). */
export function browserPreferenceStorage(): PreferenceStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
