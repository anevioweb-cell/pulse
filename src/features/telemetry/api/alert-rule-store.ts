import { API } from '../config';

import type { AlertRule, AlertRuleInput } from './contract';

/** Rules every simulated fleet starts with, so alert history is never empty in a demo. */
export const DEFAULT_ALERT_RULES: readonly AlertRuleInput[] = [
  {
    name: 'High temperature',
    deviceId: null,
    metric: 'temperature',
    comparator: 'above',
    threshold: 26,
    enabled: true,
  },
  {
    name: 'Low battery',
    deviceId: null,
    metric: 'battery',
    comparator: 'below',
    threshold: 20,
    enabled: true,
  },
];

export type RuleWriteResult =
  { ok: true; rule: AlertRule } | { ok: false; reason: 'not_found' | 'limit_reached' };

const copy = (rule: AlertRule): AlertRule => ({ ...rule });

/**
 * In-memory alert rules (mock server and Demo Mode; persistence of demo rules is Phase 4B).
 * Keyed by id in a Map; ids come from `generateId` (UUIDs by default), never from clients on
 * create. Returns copies so callers cannot mutate stored rules.
 */
export class AlertRuleStore {
  private readonly rules = new Map<string, AlertRule>();
  private readonly generateId: () => string;

  constructor({
    generateId = () => globalThis.crypto.randomUUID(),
    initial = DEFAULT_ALERT_RULES,
  }: { generateId?: () => string; initial?: readonly AlertRuleInput[] } = {}) {
    this.generateId = generateId;
    for (const input of initial) this.create(input);
  }

  list(): AlertRule[] {
    return [...this.rules.values()].map(copy);
  }

  get(id: string): AlertRule | undefined {
    const rule = this.rules.get(id);
    return rule ? copy(rule) : undefined;
  }

  create(input: AlertRuleInput): RuleWriteResult {
    if (this.rules.size >= API.MAX_ALERT_RULES) return { ok: false, reason: 'limit_reached' };
    const rule: AlertRule = { ...input, id: this.generateId() };
    this.rules.set(rule.id, rule);
    return { ok: true, rule: copy(rule) };
  }

  update(id: string, input: AlertRuleInput): RuleWriteResult {
    if (!this.rules.has(id)) return { ok: false, reason: 'not_found' };
    const rule: AlertRule = { ...input, id };
    this.rules.set(id, rule);
    return { ok: true, rule: copy(rule) };
  }

  delete(id: string): boolean {
    return this.rules.delete(id);
  }
}
