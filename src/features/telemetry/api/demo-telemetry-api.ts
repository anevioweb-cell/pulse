import { ApiError } from '@/shared/api';
import type { KeyValueStorage } from '@/shared/api';

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
import { DemoRuleStorage } from './demo-rule-storage';
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
  /**
   * Where alert rules persist (ADR 0018). Defaults to IndexedDB; null keeps them in memory for
   * the session (also the fallback where IndexedDB is missing, as in Node and jsdom).
   */
  ruleStorage?: KeyValueStorage | null;
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
 * alerts are derived from the deterministic HistoryModel (same seed, same data, for any range).
 * Alert rules persist in IndexedDB, and this class is their source of truth in Demo Mode: they
 * are loaded before the first call and written through on every change (ADR 0018). Behaves like
 * the HTTP API: async, cancellable, same validation, same error codes.
 */
export class DemoTelemetryApi implements TelemetryApi {
  readonly mode = 'demo' as const;
  readonly requiresNetwork = false;
  private readonly data: SimulatedTelemetryData;
  private readonly rules: AlertRuleStore;
  private readonly ruleStorage: DemoRuleStorage;
  private rulesLoaded: Promise<void> | null = null;

  constructor({
    seed,
    deviceCount,
    now = () => Date.now(),
    generateId,
    ruleStorage,
  }: DemoTelemetryApiOptions = {}) {
    this.rules = new AlertRuleStore(generateId ? { generateId } : {});
    this.ruleStorage = new DemoRuleStorage(ruleStorage);
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
    await this.ruleStorage.save(this.rules.list());
    return contract(alertRuleSchema, result.rule);
  }

  async updateAlertRule(id: string, input: AlertRuleInput, { signal }: CallOptions = {}) {
    await this.tick(signal);
    const result = this.rules.update(parse(ruleIdSchema, id), parse(alertRuleInputSchema, input));
    if (!result.ok) throw demoErrors.notFound('Alert rule');
    await this.ruleStorage.save(this.rules.list());
    return contract(alertRuleSchema, result.rule);
  }

  async deleteAlertRule(id: string, { signal }: CallOptions = {}) {
    await this.tick(signal);
    if (!this.rules.delete(parse(ruleIdSchema, id))) throw demoErrors.notFound('Alert rule');
    await this.ruleStorage.save(this.rules.list());
  }

  /**
   * Yields (like a real request), loads persisted rules once, and honours cancellation before
   * doing any work.
   */
  private async tick(signal: AbortSignal | undefined): Promise<void> {
    throwIfAborted(signal);
    this.rulesLoaded ??= this.loadRules();
    await this.rulesLoaded;
    throwIfAborted(signal);
  }

  /** Persisted rules replace the defaults; nothing stored (or invalid) keeps the defaults. */
  private async loadRules(): Promise<void> {
    const loaded = await this.ruleStorage.load();
    if (loaded.status === 'loaded') this.rules.replaceAll(loaded.rules);
  }
}
