import { createQueryClient } from '@/shared/api';

import type { TelemetryApi } from './telemetry-api';
import type { QueryClient } from '@tanstack/react-query';

/**
 * The QueryClient for one TelemetryApi. The network mode follows the implementation, so no query
 * has to set it: Demo Mode (`requiresNetwork: false`) keeps fetching while the browser reports
 * offline, Live Mode pauses until it is back online.
 */
export function createTelemetryQueryClient(api: TelemetryApi): QueryClient {
  return createQueryClient({ networkMode: api.requiresNetwork ? 'online' : 'always' });
}
