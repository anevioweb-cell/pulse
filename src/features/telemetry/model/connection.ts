import { z } from 'zod/mini';

/** Transport connection states (see the state machine in websocket-transport.ts). */
export const connectionStateSchema = z.enum([
  'idle',
  'connecting',
  'open',
  'reconnecting',
  'closed',
  'failed',
]);

export const connectionStatusSchema = z.strictObject({
  state: connectionStateSchema,
  /** Consecutive failed attempts since the last stable connection. */
  attempt: z.int().check(z.gte(0)),
  /** Delay before the next attempt, while `reconnecting`. */
  retryInMs: z.optional(z.number().check(z.gte(0))),
  /** Why the transport is `failed` or `closed`, for display and logs. */
  reason: z.optional(z.string()),
});

export type ConnectionState = z.infer<typeof connectionStateSchema>;
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;
