import { describe, expect, it } from 'vitest';

import { PROTOCOL, SENSOR_RANGES } from '../config';
import {
  exampleDeviceOffline,
  exampleDeviceOnline,
  examplePing,
  examplePong,
  exampleReading,
} from './fixtures';
import { exceedsFrameLimit, parseTelemetryMessage } from './parse';
import { encodeMessage } from './protocol';

import type { ParseFailureReason } from './parse';

const json = (value: unknown) => JSON.stringify(value);
const reading = (overrides: Record<string, unknown>) => json({ ...exampleReading, ...overrides });
const values = (overrides: Record<string, unknown>) =>
  reading({ values: { ...exampleReading.values, ...overrides } });
const online = (device: Record<string, unknown>) =>
  json({ ...exampleDeviceOnline, device: { ...exampleDeviceOnline.device, ...device } });

describe('parseTelemetryMessage: valid messages', () => {
  it.each([
    ['device_online', exampleDeviceOnline],
    ['reading', exampleReading],
    ['device_offline', exampleDeviceOffline],
    ['ping', examplePing],
    ['pong', examplePong],
  ])('accepts %s and round-trips it', (_type, message) => {
    expect(parseTelemetryMessage(encodeMessage(message))).toEqual({ ok: true, message });
  });

  it('accepts readings without the optional pressure and battery (DHT22, USB power)', () => {
    const { temperature, humidity, signal } = exampleReading.values;
    const dht22 = { temperature, humidity, signal };
    const result = parseTelemetryMessage(reading({ values: dht22 }));
    expect(result.ok).toBe(true);
  });

  it('accepts values exactly at the physical bounds', () => {
    const bounds = Object.fromEntries(
      Object.entries(SENSOR_RANGES).map(([metric, { max }]) => [metric, max]),
    );
    expect(parseTelemetryMessage(values(bounds)).ok).toBe(true);
  });

  it('strips control and bidi characters from names and trims them', () => {
    const result = parseTelemetryMessage(
      online({ name: '\u202e Kitchen\u0007\n', location: 'Hall\u0000way' }),
    );
    expect(result).toMatchObject({
      ok: true,
      message: { device: { name: 'Kitchen', location: 'Hallway' } },
    });
  });

  it('accepts a frame exactly at the size limit boundary check', () => {
    expect(exceedsFrameLimit('a'.repeat(PROTOCOL.MAX_FRAME_BYTES))).toBe(false);
    expect(exceedsFrameLimit('a'.repeat(PROTOCOL.MAX_FRAME_BYTES + 1))).toBe(true);
    // 3-byte UTF-8 characters: the byte count, not the character count, decides.
    expect(exceedsFrameLimit('€'.repeat(Math.ceil(PROTOCOL.MAX_FRAME_BYTES / 3) + 1))).toBe(true);
  });
});

const hostile: [string, unknown, ParseFailureReason][] = [
  // Transport-level garbage
  ['binary payload', new ArrayBuffer(8), 'unsupported_payload'],
  ['object instead of text', { v: 1 }, 'unsupported_payload'],
  ['undefined', undefined, 'unsupported_payload'],
  [
    'huge frame',
    `{"v":1,"type":"ping","ts":1,"pad":"${'x'.repeat(PROTOCOL.MAX_FRAME_BYTES)}"}`,
    'too_large',
  ],
  ['huge multi-byte frame', `"${'😀'.repeat(PROTOCOL.MAX_FRAME_BYTES / 2)}"`, 'too_large'],
  // Syntax
  ['empty string', '', 'invalid_json'],
  ['truncated JSON', '{"v":1,"type":"read', 'invalid_json'],
  ['NaN literal', '{"v":1,"type":"reading","ts":NaN}', 'invalid_json'],
  ['Infinity literal', reading({}).replace('21.37', 'Infinity'), 'invalid_json'],
  ['single quotes', "{'v':1}", 'invalid_json'],
  // Prototype pollution
  [
    '__proto__ at top level',
    '{"__proto__":{"isAdmin":true},"v":1,"type":"ping","ts":1794200000000}',
    'forbidden_key',
  ],
  [
    '__proto__ nested',
    reading({}).replace('"values":{', '"values":{"__proto__":{"x":1},'),
    'forbidden_key',
  ],
  ['constructor key', json({ ...examplePing, constructor: { prototype: {} } }), 'forbidden_key'],
  ['prototype key', online({ prototype: 'x' }), 'forbidden_key'],
  // Envelope
  ['array', '[1,2,3]', 'not_an_object'],
  ['null', 'null', 'not_an_object'],
  ['number', '42', 'not_an_object'],
  ['missing version', json({ type: 'ping', ts: exampleReading.ts }), 'unknown_version'],
  ['future version', json({ ...examplePing, v: 2 }), 'unknown_version'],
  ['version as string', json({ ...examplePing, v: '1' }), 'unknown_version'],
  ['unknown type', json({ ...examplePing, type: 'firmware_update' }), 'unknown_type'],
  ['missing type', json({ v: 1, ts: exampleReading.ts }), 'unknown_type'],
  ['type as number', json({ ...examplePing, type: 1 }), 'unknown_type'],
  // Schema: types, ranges, extra keys
  ['extra top-level key', json({ ...examplePing, debug: true }), 'schema_violation'],
  ['extra key in values', values({ co2: 400 }), 'schema_violation'],
  ['extra key in device', online({ admin: true }), 'schema_violation'],
  ['temperature as string', values({ temperature: '21.3' }), 'schema_violation'],
  [
    'temperature too high',
    values({ temperature: SENSOR_RANGES.temperature.max + 0.01 }),
    'schema_violation',
  ],
  ['humidity negative', values({ humidity: -1 }), 'schema_violation'],
  ['pressure too low', values({ pressure: 10 }), 'schema_violation'],
  ['battery over 100', values({ battery: 101 }), 'schema_violation'],
  ['positive RSSI', values({ signal: 5 }), 'schema_violation'],
  ['huge number', values({ temperature: 1e308 }), 'schema_violation'],
  ['missing values', json({ ...exampleReading, values: undefined }), 'schema_violation'],
  ['negative seq', reading({ seq: -1 }), 'schema_violation'],
  ['fractional seq', reading({ seq: 1.5 }), 'schema_violation'],
  ['seconds instead of ms', reading({ ts: 1_794_200_000 }), 'schema_violation'],
  ['timestamp far future', reading({ ts: 9_999_999_999_999 }), 'schema_violation'],
  ['ts as string', reading({ ts: '2026-11-09' }), 'schema_violation'],
  [
    'unknown offline reason',
    json({ ...exampleDeviceOffline, reason: 'hacked' }),
    'schema_violation',
  ],
  ['pong without pingTs', json({ ...examplePong, pingTs: undefined }), 'schema_violation'],
  // Untrusted strings
  [
    'overlong device id',
    reading({ deviceId: 'd'.repeat(PROTOCOL.DEVICE_ID_MAX_LENGTH + 1) }),
    'schema_violation',
  ],
  ['device id with spaces', reading({ deviceId: 'esp 32' }), 'schema_violation'],
  [
    'device id with markup',
    reading({ deviceId: '<img src=x onerror=alert(1)>' }),
    'schema_violation',
  ],
  ['device id __proto__', reading({ deviceId: '__proto__' }), 'schema_violation'],
  ['device id constructor', reading({ deviceId: 'constructor' }), 'schema_violation'],
  ['empty device id', reading({ deviceId: '' }), 'schema_violation'],
  ['overlong name', online({ name: 'n'.repeat(PROTOCOL.NAME_MAX_LENGTH + 1) }), 'schema_violation'],
  ['name of only control characters', online({ name: '\u0000\u0007\u001b' }), 'schema_violation'],
  ['whitespace-only location', online({ location: '   ' }), 'schema_violation'],
  ['firmware with spaces', online({ firmware: '1.0 beta' }), 'schema_violation'],
];

describe('parseTelemetryMessage: malformed and hostile payloads', () => {
  it.each(hostile)('rejects %s', (_name, payload, reason) => {
    const result = parseTelemetryMessage(payload);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason });
  });

  it('never throws and never pollutes Object.prototype', () => {
    for (const [, payload] of hostile) expect(() => parseTelemetryMessage(payload)).not.toThrow();
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it('does not echo attacker-controlled version strings in the failure detail', () => {
    const result = parseTelemetryMessage(json({ ...examplePing, v: '<script>' }));
    expect(result).toEqual({ ok: false, reason: 'unknown_version', detail: 'string' });
  });

  it('reports the failing path for schema violations', () => {
    expect(parseTelemetryMessage(values({ humidity: 120 }))).toMatchObject({
      reason: 'schema_violation',
      detail: expect.stringContaining('values.humidity') as unknown,
    });
  });
});
