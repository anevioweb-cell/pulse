import { createHttpClient } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import { deviceIdSchema } from '../model/device';
import {
  alertHistorySchema,
  alertRuleInputSchema,
  alertRuleListResponseSchema,
  alertRuleSchema,
  alertsQuerySchema,
  deviceDetailSchema,
  deviceListResponseSchema,
  historicalReadingsSchema,
  readingsQuerySchema,
  ruleIdSchema,
} from './contract';
import { invalidRequest } from './errors';

import type { AlertRuleInput, AlertsQueryInput } from './contract';
import type { CallOptions, ReadingsRequest, TelemetryApi } from './telemetry-api';
import type { z } from 'zod/mini';

export interface HttpTelemetryApiOptions {
  /** Absolute http(s) URL of the telemetry server, e.g. "http://127.0.0.1:8787". */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

/** Validates an input (path segment, query or body) before it is used in a request. */
function checked<Output>(schema: z.ZodMiniType<Output>, value: unknown): Output {
  const result = schema.safeParse(value);
  if (!result.success) throw invalidRequest(result.error);
  return result.data;
}

const segment = (id: string) => encodeURIComponent(id);

/** Live Mode repository: the REST API of the telemetry server (mock server or real backend). */
export class HttpTelemetryApi implements TelemetryApi {
  readonly mode = 'live' as const;
  readonly requiresNetwork = true;
  private readonly http: HttpClient;

  constructor({ baseUrl, fetch }: HttpTelemetryApiOptions) {
    this.http = createHttpClient({ baseUrl, ...(fetch ? { fetch } : {}) });
  }

  async listDevices({ signal }: CallOptions = {}) {
    const response = await this.http.request('GET', '/api/devices', deviceListResponseSchema, {
      signal,
    });
    return response.devices;
  }

  async getDevice(id: string, { signal }: CallOptions = {}) {
    const deviceId = checked(deviceIdSchema, id);
    return this.http.request('GET', `/api/devices/${segment(deviceId)}`, deviceDetailSchema, {
      signal,
    });
  }

  async getReadings({ deviceId, ...query }: ReadingsRequest, { signal }: CallOptions = {}) {
    const id = checked(deviceIdSchema, deviceId);
    const params = checked(readingsQuerySchema, query);
    return this.http.request(
      'GET',
      `/api/devices/${segment(id)}/readings`,
      historicalReadingsSchema,
      {
        signal,
        query: params,
      },
    );
  }

  async listAlerts(query: AlertsQueryInput, { signal }: CallOptions = {}) {
    const params = checked(alertsQuerySchema, query);
    return this.http.request('GET', '/api/alerts', alertHistorySchema, { signal, query: params });
  }

  async listAlertRules({ signal }: CallOptions = {}) {
    const response = await this.http.request(
      'GET',
      '/api/alert-rules',
      alertRuleListResponseSchema,
      { signal },
    );
    return response.rules;
  }

  async createAlertRule(input: AlertRuleInput, { signal }: CallOptions = {}) {
    const body = checked(alertRuleInputSchema, input);
    return this.http.request('POST', '/api/alert-rules', alertRuleSchema, { signal, body });
  }

  async updateAlertRule(
    id: string,
    input: z.input<typeof alertRuleInputSchema>,
    { signal }: CallOptions = {},
  ) {
    const ruleId = checked(ruleIdSchema, id);
    const body = checked(alertRuleInputSchema, input);
    return this.http.request('PUT', `/api/alert-rules/${segment(ruleId)}`, alertRuleSchema, {
      signal,
      body,
    });
  }

  async deleteAlertRule(id: string, { signal }: CallOptions = {}) {
    const ruleId = checked(ruleIdSchema, id);
    return this.http.requestNoContent('DELETE', `/api/alert-rules/${segment(ruleId)}`, { signal });
  }
}
