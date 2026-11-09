import { z } from 'zod/mini';

import { MOCK_SERVER } from '@/features/telemetry';

const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_INTERNAL = 500;

/**
 * Test-only fault injection for REST (Phase 4B tests rollback against it). Disabled unless
 * `--faults` or PULSE_FAULTS is given, e.g. "latency=300,failure=0.25,status=503".
 */
export const faultConfigSchema = z.strictObject({
  latency: z.optional(
    z.coerce.number().check(z.int(), z.gte(0), z.lte(MOCK_SERVER.MAX_FAULT_LATENCY_MS)),
  ),
  failure: z.optional(z.coerce.number().check(z.gte(0), z.lte(1))),
  status: z.optional(
    z.coerce.number().check(z.int(), z.gte(HTTP_INTERNAL), z.lte(HTTP_SERVICE_UNAVAILABLE)),
  ),
});

export interface FaultConfig {
  latencyMs: number;
  failureRate: number;
  status: number;
}

export type FaultParse = { ok: true; config: FaultConfig } | { ok: false; error: string };

/** Parses "key=value,key=value". Unknown keys, duplicates or bad values are errors. */
export function parseFaultSpec(spec: string): FaultParse {
  const entries = new Map<string, string>();
  for (const part of spec.split(',')) {
    const [key = '', value = '', ...rest] = part.split('=');
    const name = key.trim();
    const setting = value.trim();
    // Every entry must be "name=value" with both parts present; a bare "latency" is an error,
    // not latency=0.
    if (rest.length > 0 || !name || !setting || entries.has(name)) {
      return { ok: false, error: `bad fault spec near "${part}"` };
    }
    entries.set(name, setting);
  }
  const parsed = faultConfigSchema.safeParse(Object.fromEntries(entries));
  if (!parsed.success) return { ok: false, error: 'invalid fault values' };
  return {
    ok: true,
    config: {
      latencyMs: parsed.data.latency ?? 0,
      failureRate: parsed.data.failure ?? 0,
      status: parsed.data.status ?? HTTP_SERVICE_UNAVAILABLE,
    },
  };
}
