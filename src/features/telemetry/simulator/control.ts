import { z } from 'zod/mini';

import { SIMULATOR } from '../config';
import { deviceIdSchema } from '../model/device';

// Messages between SimulatorTransport (main thread) and the simulator worker. Both directions are
// validated: postMessage is a boundary like any other.

const deviceCountSchema = z.int().check(z.gte(1), z.lte(SIMULATOR.MAX_DEVICE_COUNT));
const rateSchema = z.number().check(z.gte(SIMULATOR.MIN_RATE_HZ), z.lte(SIMULATOR.MAX_RATE_HZ));
const seedSchema = z.int().check(z.gte(0), z.lte(Number.MAX_SAFE_INTEGER));

export const simulatorControlSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('start'),
    seed: z.optional(seedSchema),
    deviceCount: z.optional(deviceCountSchema),
    rateHz: z.optional(rateSchema),
  }),
  z.strictObject({ type: z.literal('stop') }),
  z.strictObject({ type: z.literal('set_device_count'), count: deviceCountSchema }),
  z.strictObject({ type: z.literal('set_rate'), rateHz: rateSchema }),
  z.strictObject({
    type: z.literal('inject_fault'),
    fault: z.strictObject({
      kind: z.enum(['dropout', 'spike', 'low_battery']),
      deviceId: z.optional(deviceIdSchema),
    }),
  }),
]);

export const simulatorEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready') }),
  /** A batch of raw wire frames (JSON strings), flushed once per tick. */
  z.strictObject({ type: z.literal('frames'), frames: z.array(z.string()) }),
  z.strictObject({ type: z.literal('error'), reason: z.string() }),
]);

export type SimulatorControl = z.infer<typeof simulatorControlSchema>;
export type SimulatorEvent = z.infer<typeof simulatorEventSchema>;
