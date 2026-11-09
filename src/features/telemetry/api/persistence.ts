import { z } from 'zod/mini';

import { createIdbStorage, persistQueryCache, restoreQueryCache } from '@/shared/api';
import type { KeyValueStorage, PersistPolicy, RestoreReport } from '@/shared/api';

import { API } from '../config';
import { alertRuleSchema, deviceSummarySchema, historicalReadingsSchema } from './contract';
import { resourceOf } from './query-keys';

import type { TelemetryMode } from '../store/telemetry-store';
import type { QueryClient } from '@tanstack/react-query';

const deviceListSchema = z.array(deviceSummarySchema);
const alertRulesSchema = z.array(alertRuleSchema).check(z.maxLength(API.MAX_ALERT_RULES));

/**
 * What may be persisted, per mode: the device list, historical readings ranges and alert rules.
 * Not device detail (its "latest" is superseded by the live stream within seconds), not alert
 * history (cheap and time-sensitive), never live ring buffers (they are not in the Query cache),
 * never anything secret (there is none in these resources). A key from another mode is refused,
 * so demo data can never be restored into Live Mode.
 */
export function telemetryPersistPolicy(mode: TelemetryMode): PersistPolicy {
  return {
    schemaFor(key) {
      if (key[1] !== mode) return null;
      switch (resourceOf(key)) {
        case 'deviceList':
          return deviceListSchema;
        case 'readings':
          return historicalReadingsSchema;
        case 'alertRules':
          return alertRulesSchema;
        default:
          return null;
      }
    },
  };
}

export interface TelemetryPersistenceOptions {
  client: QueryClient;
  mode: TelemetryMode;
  /** Defaults to IndexedDB; null (or unavailable IndexedDB) means memory-only. */
  storage?: KeyValueStorage | null;
  now?: () => number;
}

/**
 * Restores the persisted cache for `mode`, then keeps persisting it. Call once at startup (and
 * again after switching modes, with a fresh QueryClient or after clearing it). Never throws.
 */
export async function setupTelemetryPersistence({
  client,
  mode,
  storage = createIdbStorage(),
  now,
}: TelemetryPersistenceOptions): Promise<{ report: RestoreReport; stop: () => void }> {
  const options = {
    client,
    storage,
    namespace: `telemetry.${mode}`,
    buster: API.PERSISTED_CACHE_BUSTER,
    policy: telemetryPersistPolicy(mode),
    ...(now ? { now } : {}),
  };
  const report = await restoreQueryCache(options);
  return { report, stop: persistQueryCache(options) };
}
