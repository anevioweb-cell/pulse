import { z } from 'zod/mini';

import { PROTOCOL } from '../config';
import { deviceIdSchema, deviceSchema } from './device';
import { sensorReadingSchema } from './reading';

// Wire protocol v1 (docs/telemetry-protocol.md, ADR 0011). Every message is a strict JSON object
// with a version `v`, a discriminating `type` and a timestamp `ts` (epoch milliseconds).

export const MESSAGE_TYPES = [
  'device_online',
  'reading',
  'device_offline',
  'ping',
  'pong',
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

const versionSchema = z.literal(PROTOCOL.VERSION);
const timestampSchema = z
  .int()
  .check(z.gte(PROTOCOL.MIN_TIMESTAMP_MS), z.lte(PROTOCOL.MAX_TIMESTAMP_MS));

export const deviceOnlineMessageSchema = z.strictObject({
  v: versionSchema,
  type: z.literal('device_online'),
  ts: timestampSchema,
  device: deviceSchema,
});

export const readingMessageSchema = z.strictObject({
  v: versionSchema,
  type: z.literal('reading'),
  ts: timestampSchema,
  deviceId: deviceIdSchema,
  /** Per-device counter, incremented by the firmware for every reading (gap = lost readings). */
  seq: z.int().check(z.gte(0), z.lte(PROTOCOL.MAX_SEQUENCE)),
  values: sensorReadingSchema,
});

export const offlineReasonSchema = z.enum(['shutdown', 'low_battery', 'network', 'unknown']);

export const deviceOfflineMessageSchema = z.strictObject({
  v: versionSchema,
  type: z.literal('device_offline'),
  ts: timestampSchema,
  deviceId: deviceIdSchema,
  reason: offlineReasonSchema,
});

export const pingMessageSchema = z.strictObject({
  v: versionSchema,
  type: z.literal('ping'),
  ts: timestampSchema,
});

export const pongMessageSchema = z.strictObject({
  v: versionSchema,
  type: z.literal('pong'),
  ts: timestampSchema,
  /** The `ts` of the ping being answered, so the client can measure round-trip time. */
  pingTs: timestampSchema,
});

export const telemetryMessageSchema = z.discriminatedUnion('type', [
  deviceOnlineMessageSchema,
  readingMessageSchema,
  deviceOfflineMessageSchema,
  pingMessageSchema,
  pongMessageSchema,
]);

export type DeviceOnlineMessage = z.infer<typeof deviceOnlineMessageSchema>;
export type ReadingMessage = z.infer<typeof readingMessageSchema>;
export type DeviceOfflineMessage = z.infer<typeof deviceOfflineMessageSchema>;
export type OfflineReason = z.infer<typeof offlineReasonSchema>;
export type PingMessage = z.infer<typeof pingMessageSchema>;
export type PongMessage = z.infer<typeof pongMessageSchema>;
export type TelemetryMessage = z.infer<typeof telemetryMessageSchema>;

/** Serializes a message for the wire. The inverse of parseTelemetryMessage for valid messages. */
export function encodeMessage(message: TelemetryMessage): string {
  return JSON.stringify(message);
}
