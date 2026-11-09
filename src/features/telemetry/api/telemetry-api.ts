import type { TelemetryMode } from '../store/telemetry-store';
import type {
  AlertHistory,
  AlertRule,
  AlertRuleInput,
  AlertsQueryInput,
  DeviceDetail,
  DeviceSummary,
  HistoricalReadings,
  ReadingsQueryInput,
} from './contract';

export interface CallOptions {
  /** Cancels the request (TanStack Query passes one per query). */
  signal?: AbortSignal | undefined;
}

export type ReadingsRequest = ReadingsQueryInput & { deviceId: string };

/**
 * Everything the UI reads or writes outside the live stream. Two implementations: HttpTelemetryApi
 * (Live Mode, REST) and DemoTelemetryApi (Demo Mode, in-browser, no backend). Features never know
 * which one is active (ADR 0015). Every method validates its input, validates its output against
 * the REST contract, and fails only with ApiError.
 */
export interface TelemetryApi {
  readonly mode: TelemetryMode;
  listDevices: (options?: CallOptions) => Promise<DeviceSummary[]>;
  getDevice: (id: string, options?: CallOptions) => Promise<DeviceDetail>;
  getReadings: (request: ReadingsRequest, options?: CallOptions) => Promise<HistoricalReadings>;
  listAlerts: (query: AlertsQueryInput, options?: CallOptions) => Promise<AlertHistory>;
  listAlertRules: (options?: CallOptions) => Promise<AlertRule[]>;
  createAlertRule: (input: AlertRuleInput, options?: CallOptions) => Promise<AlertRule>;
  updateAlertRule: (id: string, input: AlertRuleInput, options?: CallOptions) => Promise<AlertRule>;
  deleteAlertRule: (id: string, options?: CallOptions) => Promise<void>;
}
