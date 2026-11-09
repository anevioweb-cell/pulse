import { createContext, use } from 'react';

import type { TelemetryApi } from './telemetry-api';
import type { ReactNode } from 'react';

const TelemetryApiContext = createContext<TelemetryApi | null>(null);

/**
 * Provides the active TelemetryApi (HttpTelemetryApi in Live Mode, DemoTelemetryApi in Demo Mode)
 * to the data hooks. Dependency injection: tests and Demo Mode swap the implementation here, and
 * features never know which one they use. Not a visual component.
 */
export function TelemetryApiProvider({
  api,
  children,
}: {
  api: TelemetryApi;
  children: ReactNode;
}) {
  return <TelemetryApiContext value={api}>{children}</TelemetryApiContext>;
}

export function useTelemetryApi(): TelemetryApi {
  const api = use(TelemetryApiContext);
  if (!api) throw new Error('useTelemetryApi must be used inside <TelemetryApiProvider>');
  return api;
}
