import { ApiError } from '@/shared/api';

import { deviceIdSchema } from '../model/device';
import { HistoryModel } from '../simulator/history-model';
import { AlertRuleStore } from './alert-rule-store';
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
import { demoErrors, invalidRequest, throwIfAborted } from './errors';
import { SimulatedTelemetryData } from './simulated-data';

import type { AlertRuleInput, AlertsQueryInput } from './contract';
import type { CallOptions, ReadingsRequest, TelemetryApi } from './telemetry-api';
import type { z } from 'zod/mini';

export interface DemoTelemetryApiOptions {
  /** Must match the Demo Mode stream (SimulatorTransport) so devices line up. */
  seed?: number;
  deviceCount?: number;
  now?: () => number;
  generateId?: () => string;
}

/** Input check, identical to HttpTelemetryApi's client-side check (same schemas, same error). */
function parse<Output>(schema: z.ZodMiniType<Output>, value: unknown): Output {
  const result = schema.safeParse(value);
  if (!result.success) throw invalidRequest(result.error);
  return result.data;
}

/** Output check: demo data goes through the same contract as server responses. */
function contract<Output>(schema: z.ZodMiniType<Output>, value: unknown): Output {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError('validation', 'Demo data does not match the contract', {
      code: 'schema_violation',
    });
  }
  return result.data;
}

/**
 * Demo Mode repository: no backend, no network, no service worker. Device lists, history and
 * alerts are derived from the deterministic HistoryModel (same seed, same data, for any range);
 * alert rules live in memory for the session (persisted in Phase 4B). Behaves like the HTTP API:
 * async, cancellable, same validation, same error codes.
 */
export class DemoTelemetryApi implements TelemetryApi {
  readonly mode = 'demo' as const;
  private readonly data: SimulatedTelemetryData;
  private readonly rules: AlertRuleStore;

  constructor({
    seed,
    deviceCount,
    now = () => Date.now(),
    generateId,
  }: DemoTelemetryApiOptions = {}) {
    this.rules = new AlertRuleStore(generateId ? { generateId } : {});
    this.data = new SimulatedTelemetryData({
      model: new HistoryModel({
        ...(seed === undefined ? {} : { seed }),
        ...(deviceCount === undefined ? {} : { deviceCount }),
      }),
      rules: this.rules,
      now,
    });
  }

  async listDevices({ signal }: CallOptions = {}) {
    await this.tick(signal);
    return contract(deviceListResponseSchema, { devices: this.data.listDevices() }).devices;
  }

  async getDevice(id: string, { signal }: CallOptions = {}) {
    await this.tick(signal);
    const detail = this.data.getDevice(parse(deviceIdSchema, id));
    if (!detail) throw demoErrors.notFound('Device');
    return contract(deviceDetailSchema, detail);
  }

  async getReadings({ deviceId, ...query }: ReadingsRequest, { signal }: CallOptions = {}) {
    await this.tick(signal);
    const readings = this.data.getReadings(
      parse(deviceIdSchema, deviceId),
      parse(readingsQuerySchema, query),
    );
    if (!readings) throw demoErrors.notFound('Device');
    return contract(historicalReadingsSchema, readings);
  }

  async listAlerts(query: AlertsQueryInput, { signal }: CallOptions = {}) {
    await this.tick(signal);
    return contract(alertHistorySchema, this.data.listAlerts(parse(alertsQuerySchema, query)));
  }

  async listAlertRules({ signal }: CallOptions = {}) {
    await this.tick(signal);
    return contract(alertRuleListResponseSchema, { rules: this.rules.list() }).rules;
  }

  async createAlertRule(input: AlertRuleInput, { signal }: CallOptions = {}) {
    await this.tick(signal);
    const result = this.rules.create(parse(alertRuleInputSchema, input));
    if (!result.ok) throw demoErrors.limitReached();
    return contract(alertRuleSchema, result.rule);
  }

  async updateAlertRule(id: string, input: AlertRuleInput, { signal }: CallOptions = {}) {
    await this.tick(signal);
    const result = this.rules.update(parse(ruleIdSchema, id), parse(alertRuleInputSchema, input));
    if (!result.ok) throw demoErrors.notFound('Alert rule');
    return contract(alertRuleSchema, result.rule);
  }

  async deleteAlertRule(id: string, { signal }: CallOptions = {}) {
    await this.tick(signal);
    if (!this.rules.delete(parse(ruleIdSchema, id))) throw demoErrors.notFound('Alert rule');
  }

  /** Yields once (like a real request) and honours cancellation before doing any work. */
  private async tick(signal: AbortSignal | undefined): Promise<void> {
    throwIfAborted(signal);
    await Promise.resolve();
    throwIfAborted(signal);
  }
}
