import { API } from '../config';
import { downsampleMinMax } from '../history/downsample';

import type { DeviceId } from '../model/device';
import type { SensorReading } from '../model/reading';
import type { DeviceProfile } from '../simulator/device-profile';
import type { HistoryModel } from '../simulator/history-model';
import type { AlertRuleStore } from './alert-rule-store';
import type {
  AlertEvent,
  AlertHistory,
  AlertsQuery,
  DeviceDetail,
  DeviceSummary,
  HistoricalReadings,
  ReadingsQuery,
} from './contract';

/**
 * The simulated fleet's REST resources, computed on demand from the HistoryModel. Used verbatim
 * by the mock server (behind HTTP) and by DemoTelemetryApi (in the browser), so Demo Mode and the
 * mock server return identical data for the same seed (ADR 0015). Nothing is returned for times
 * after `now`: the simulated past is fixed, the future does not exist yet.
 */
export class SimulatedTelemetryData {
  private readonly model: HistoryModel;
  private readonly rules: AlertRuleStore;
  private readonly now: () => number;

  constructor({
    model,
    rules,
    now,
  }: {
    model: HistoryModel;
    rules: AlertRuleStore;
    now: () => number;
  }) {
    this.model = model;
    this.rules = rules;
    this.now = now;
  }

  listDevices(): DeviceSummary[] {
    return this.model.devices.map((profile) => this.summary(profile));
  }

  getDevice(id: DeviceId): DeviceDetail | null {
    const profile = this.model.device(id);
    if (!profile) return null;
    const ts = Math.floor(this.now() / this.model.sampleIntervalMs) * this.model.sampleIntervalMs;
    const values: SensorReading = {
      temperature: this.model.sample(profile, 'temperature', ts),
      humidity: this.model.sample(profile, 'humidity', ts),
      pressure: this.model.sample(profile, 'pressure', ts),
      battery: this.model.sample(profile, 'battery', ts),
      signal: this.model.sample(profile, 'signal', ts),
    };
    return { ...this.summary(profile), latest: { ts, values } };
  }

  getReadings(id: DeviceId, query: ReadingsQuery): HistoricalReadings | null {
    const profile = this.model.device(id);
    if (!profile) return null;
    const to = Math.min(query.to, this.now());
    const series =
      to >= query.from
        ? this.model.series(profile, query.metric, query.from, to)
        : { timestamps: new Float64Array(0), values: new Float64Array(0) };
    const maxPoints = query.maxPoints ?? API.DEFAULT_MAX_POINTS;
    const sampled = downsampleMinMax(series.timestamps, series.values, maxPoints);
    return {
      deviceId: profile.id,
      metric: query.metric,
      from: query.from,
      to: query.to,
      source: 'simulated',
      resolution: {
        method: sampled.bucketSize === 1 ? 'raw' : 'min-max',
        sampleIntervalMs: this.model.sampleIntervalMs,
        bucketSize: sampled.bucketSize,
        rawCount: series.timestamps.length,
        returnedCount: sampled.timestamps.length,
      },
      timestamps: sampled.timestamps,
      values: sampled.values,
    };
  }

  /**
   * Alert history: the current enabled rules evaluated over the simulated history once per
   * API.ALERT_EVAL_STEP_MS. An event is the moment a value crosses into breach.
   */
  listAlerts(query: AlertsQuery): AlertHistory {
    const step = API.ALERT_EVAL_STEP_MS;
    const to = Math.min(query.to, this.now());
    const first = Math.ceil(query.from / step) * step;
    const events: AlertEvent[] = [];

    for (const rule of this.rules.list()) {
      if (!rule.enabled) continue;
      const profiles =
        rule.deviceId === null
          ? this.model.devices
          : [this.model.device(rule.deviceId)].filter((profile) => profile !== undefined);
      for (const profile of profiles) {
        const breached = (t: number) => {
          const value = this.model.sample(profile, rule.metric, t);
          return rule.comparator === 'above' ? value > rule.threshold : value < rule.threshold;
        };
        let previous = breached(first - step);
        for (let t = first; t <= to; t += step) {
          const now = breached(t);
          if (now && !previous) {
            events.push({
              id: `${rule.id}.${profile.id}.${String(t)}`,
              ruleId: rule.id,
              ruleName: rule.name,
              deviceId: profile.id,
              metric: rule.metric,
              comparator: rule.comparator,
              threshold: rule.threshold,
              value: this.model.sample(profile, rule.metric, t),
              ts: t,
              source: 'simulated',
            });
          }
          previous = now;
        }
      }
    }

    events.sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
    const limit = query.limit ?? API.DEFAULT_ALERT_LIMIT;
    return { alerts: events.slice(0, limit), truncated: events.length > limit };
  }

  private summary(profile: DeviceProfile): DeviceSummary {
    return {
      id: profile.id,
      name: profile.name,
      location: profile.location,
      firmware: profile.firmware,
      source: 'simulated',
    };
  }
}
