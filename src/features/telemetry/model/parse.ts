import { PROTOCOL } from '../config';
import { MESSAGE_TYPES, telemetryMessageSchema } from './protocol';
import { FORBIDDEN_KEYS } from './untrusted';

import type { MessageType, TelemetryMessage } from './protocol';

/** Why a frame was rejected. Every rejection has exactly one reason; the parser never throws. */
export const PARSE_FAILURE_REASONS = [
  /** Not a text frame (binary data, objects from a buggy transport). */
  'unsupported_payload',
  /** Larger than PROTOCOL.MAX_FRAME_BYTES (UTF-8). */
  'too_large',
  /** Not valid JSON (includes NaN/Infinity, which JSON cannot encode). */
  'invalid_json',
  /** Contains a `__proto__`, `constructor` or `prototype` key at any depth. */
  'forbidden_key',
  /** Valid JSON but not an object (array, string, number, null). */
  'not_an_object',
  /** Missing or unsupported protocol version `v`. */
  'unknown_version',
  /** Missing or unknown message `type`. */
  'unknown_type',
  /** Right version and type, but fields are missing, extra, mistyped or out of range. */
  'schema_violation',
] as const;

export type ParseFailureReason = (typeof PARSE_FAILURE_REASONS)[number];

export type ParseResult =
  | { ok: true; message: TelemetryMessage }
  | { ok: false; reason: ParseFailureReason; detail?: string };

const encoder = new TextEncoder();
/** UTF-8 encodes each UTF-16 code unit as at most 3 bytes. */
const MAX_UTF8_BYTES_PER_CODE_UNIT = 3;

/** True when the UTF-8 size exceeds the limit; encodes only when cheap bounds cannot decide. */
export function exceedsFrameLimit(
  text: string,
  maxBytes: number = PROTOCOL.MAX_FRAME_BYTES,
): boolean {
  if (text.length > maxBytes) return true; // at least one byte per code unit
  if (text.length * MAX_UTF8_BYTES_PER_CODE_UNIT <= maxBytes) return false;
  return encoder.encode(text).length > maxBytes;
}

class ForbiddenKeyError extends Error {}

function rejectForbiddenKeys(key: string, value: unknown): unknown {
  if (FORBIDDEN_KEYS.has(key)) throw new ForbiddenKeyError(key);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const KNOWN_TYPES: ReadonlySet<string> = new Set<MessageType>(MESSAGE_TYPES);

const failure = (reason: ParseFailureReason, detail?: string): ParseResult =>
  detail === undefined ? { ok: false, reason } : { ok: false, reason, detail };

/**
 * Parses one raw frame from any transport (WebSocket, simulator worker) into a validated
 * TelemetryMessage. Checks run cheapest first: payload type, size, JSON syntax with forbidden-key
 * rejection, envelope (version, type), then the strict schema with range checks and string
 * sanitization. Never throws.
 */
export function parseTelemetryMessage(raw: unknown): ParseResult {
  if (typeof raw !== 'string') return failure('unsupported_payload');
  if (exceedsFrameLimit(raw)) return failure('too_large');

  let data: unknown;
  try {
    data = JSON.parse(raw, rejectForbiddenKeys);
  } catch (error) {
    if (error instanceof ForbiddenKeyError) return failure('forbidden_key', error.message);
    return failure('invalid_json');
  }

  if (!isRecord(data)) return failure('not_an_object');
  if (data.v !== PROTOCOL.VERSION) {
    // Echo only numbers: an attacker-controlled string must not flow into logs or the UI.
    return failure('unknown_version', typeof data.v === 'number' ? String(data.v) : typeof data.v);
  }
  if (typeof data.type !== 'string' || !KNOWN_TYPES.has(data.type)) {
    return failure('unknown_type');
  }

  const result = telemetryMessageSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.map(String).join('.') ?? '';
    return failure('schema_violation', `${path || '(root)'}: ${issue?.code ?? 'invalid'}`);
  }
  return { ok: true, message: result.data };
}
