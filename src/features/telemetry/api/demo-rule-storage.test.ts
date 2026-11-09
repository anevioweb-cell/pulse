import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '@/shared/api';
import type { KeyValueStorage } from '@/shared/api';

import { API, DEMO_RULES } from '../config';
import { DEFAULT_ALERT_RULES } from './alert-rule-store';
import { DemoRuleStorage } from './demo-rule-storage';
import { DemoTelemetryApi } from './demo-telemetry-api';

const KEY = DEMO_RULES.STORAGE_KEY;
const rule = {
  id: 'rule-a',
  name: 'Hot',
  deviceId: null,
  metric: 'temperature',
  comparator: 'above',
  threshold: 30,
  enabled: true,
} as const;
const record = (rules: unknown[], version: unknown = DEMO_RULES.SCHEMA_VERSION) =>
  JSON.stringify({ version, rules });

function failing(operation: 'get' | 'set'): KeyValueStorage {
  const storage = createMemoryStorage();
  return {
    ...storage,
    [operation]: () => Promise.reject(new Error('QuotaExceededError')),
  };
}

describe('DemoRuleStorage', () => {
  it('round-trips rules and reports an empty store', async () => {
    const storage = new DemoRuleStorage(createMemoryStorage());
    expect(await storage.load()).toEqual({ status: 'empty' });
    await storage.save([rule]);
    expect(await storage.load()).toEqual({ status: 'loaded', rules: [rule] });
  });

  it('is unavailable without storage', async () => {
    expect(await new DemoRuleStorage(null).load()).toEqual({ status: 'unavailable' });
  });

  it.each([
    ['not a string', { rules: [] }],
    ['invalid JSON', '{"version":'],
    ['prototype key', '{"version":1,"rules":[],"__proto__":{"x":1}}'],
    ['unknown version', record([rule], 99)],
    ['extra key', JSON.stringify({ version: 1, rules: [], extra: true })],
    ['invalid rule', record([{ ...rule, threshold: 1000 }])],
    ['duplicate ids', record([rule, { ...rule, name: 'Other' }])],
    [
      'too many rules',
      record(
        Array.from({ length: API.MAX_ALERT_RULES + 1 }, (_, i) => ({
          ...rule,
          id: `r${String(i)}`,
        })),
      ),
    ],
  ])('discards and deletes an invalid record: %s', async (_name, stored) => {
    const memory = createMemoryStorage();
    memory.data.set(KEY, stored);
    expect(await new DemoRuleStorage(memory).load()).toEqual({
      status: 'discarded',
      reason: 'invalid',
    });
    expect(memory.data.has(KEY)).toBe(false);
  });

  it('refuses an oversized record before parsing it', async () => {
    const memory = createMemoryStorage();
    memory.data.set(KEY, 'x'.repeat(DEMO_RULES.MAX_BYTES + 1));
    expect(await new DemoRuleStorage(memory).load()).toEqual({
      status: 'discarded',
      reason: 'too_large',
    });
    expect(memory.data.has(KEY)).toBe(false);
  });

  it('keeps the last snapshot when saves overlap', async () => {
    const memory = createMemoryStorage();
    const storage = new DemoRuleStorage(memory);
    void storage.save([rule]);
    void storage.save([]);
    await storage.save([{ ...rule, name: 'Last' }]);
    expect(await storage.load()).toEqual({ status: 'loaded', rules: [{ ...rule, name: 'Last' }] });
  });

  it('falls back to memory-only when reading or writing fails', async () => {
    expect(await new DemoRuleStorage(failing('get')).load()).toEqual({
      status: 'discarded',
      reason: 'storage_error',
    });
    const writeFails = new DemoRuleStorage(failing('set'));
    await expect(writeFails.save([rule])).resolves.toBeUndefined();
  });
});

describe('DemoTelemetryApi rule persistence', () => {
  const input = {
    name: 'Humid',
    deviceId: 'esp32-03',
    metric: 'humidity',
    comparator: 'above',
    threshold: 70,
    enabled: true,
  } as const;

  it('starts from the defaults, writes through every change, and restores on a new instance', async () => {
    const memory = createMemoryStorage();
    let next = 0;
    const generateId = () => `rule-${String((next += 1))}`;
    const first = new DemoTelemetryApi({ ruleStorage: memory, generateId });
    expect((await first.listAlertRules()).map((r) => r.name)).toEqual(
      DEFAULT_ALERT_RULES.map((r) => r.name),
    );
    expect(memory.data.has(KEY)).toBe(false); // defaults are not written until something changes

    const created = await first.createAlertRule(input);
    await first.updateAlertRule(created.id, { ...input, threshold: 75 });
    await first.deleteAlertRule('rule-1');
    const expected = await first.listAlertRules();

    const reloaded = new DemoTelemetryApi({ ruleStorage: memory, generateId: () => 'unused' });
    expect(await reloaded.listAlertRules()).toEqual(expected);
  });

  it('keeps working in memory when storage fails', async () => {
    const api = new DemoTelemetryApi({ ruleStorage: failing('set') });
    const created = await api.createAlertRule(input);
    expect(await api.listAlertRules()).toContainEqual(created);
  });

  it('uses the defaults when the stored record is invalid', async () => {
    const memory = createMemoryStorage();
    memory.data.set(KEY, '{"version":1,"rules":"nope"}');
    const api = new DemoTelemetryApi({ ruleStorage: memory });
    expect(await api.listAlertRules()).toHaveLength(DEFAULT_ALERT_RULES.length);
  });
});
