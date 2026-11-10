import { describe, expect, it } from 'vitest';

import type { AlertRule } from '@/features/telemetry';

import { thresholdsFor } from './thresholds';

const rule = (overrides: Partial<AlertRule>): AlertRule => ({
  id: 'r',
  name: 'Rule',
  deviceId: null,
  metric: 'temperature',
  comparator: 'above',
  threshold: 30,
  enabled: true,
  ...overrides,
});

const RULES: AlertRule[] = [
  rule({ id: 'fleet-temp', threshold: 30 }),
  rule({ id: 'mine-temp-low', deviceId: 'esp32-01', comparator: 'below', threshold: 10 }),
  rule({ id: 'other-device', deviceId: 'esp32-02', threshold: 25 }),
  rule({ id: 'other-metric', metric: 'humidity', threshold: 70 }),
  rule({ id: 'mine-other-metric', deviceId: 'esp32-01', metric: 'battery', threshold: 15 }),
  rule({ id: 'disabled', deviceId: 'esp32-01', threshold: 28, enabled: false }),
];

describe('thresholdsFor', () => {
  it('keeps enabled rules for this metric that target this device or every device', () => {
    expect(thresholdsFor(RULES, 'esp32-01', 'temperature').map((line) => line.value)).toEqual([
      30, 10,
    ]);
  });

  it('never shows rules for another device, another metric, or disabled rules', () => {
    const values = thresholdsFor(RULES, 'esp32-01', 'temperature').map((line) => line.value);
    expect(values).not.toContain(25);
    expect(values).not.toContain(70);
    expect(values).not.toContain(15);
    expect(values).not.toContain(28);
    expect(thresholdsFor(RULES, 'esp32-03', 'humidity').map((line) => line.value)).toEqual([70]);
    expect(thresholdsFor(RULES, 'esp32-03', 'signal')).toEqual([]);
  });

  it('labels each line with its direction and unit', () => {
    expect(thresholdsFor(RULES, 'esp32-01', 'temperature').map((line) => line.label)).toEqual([
      'Alert above 30.0 °C',
      'Alert below 10.0 °C',
    ]);
  });

  it('draws nothing before the rules load', () => {
    expect(thresholdsFor(undefined, 'esp32-01', 'temperature')).toEqual([]);
  });
});
