import { z } from 'zod/mini';

import { createIdbStorage, withStorageTimeout } from '@/shared/api';
import type { KeyValueStorage } from '@/shared/api';
import { parseJsonSafely } from '@/shared/lib/safe-json';

import { API, DEMO_RULES } from '../config';
import { alertRuleSchema } from './contract';

import type { AlertRule } from './contract';

const recordSchema = z
  .strictObject({
    version: z.literal(DEMO_RULES.SCHEMA_VERSION),
    rules: z.array(alertRuleSchema).check(z.maxLength(API.MAX_ALERT_RULES)),
  })
  .check(
    z.refine(
      (record) => new Set(record.rules.map((rule) => rule.id)).size === record.rules.length,
      {
        message: 'duplicate rule id',
        path: ['rules'],
      },
    ),
  );

const encoder = new TextEncoder();

export type DemoRulesLoad =
  | { status: 'loaded'; rules: AlertRule[] }
  | { status: 'empty' | 'unavailable' }
  | { status: 'discarded'; reason: 'storage_error' | 'too_large' | 'invalid' };

/**
 * Demo Mode's alert rules in IndexedDB: the source of truth for rules in Demo Mode (ADR 0018).
 * What is read is untrusted, like any persisted data (docs/security.md): size-capped before
 * parsing, parsed without prototype keys, and validated with the same strict schema as REST
 * responses. An invalid record is deleted. Nothing here throws; when storage is missing or fails,
 * rules live in memory for the session.
 */
export class DemoRuleStorage {
  private storage: KeyValueStorage | null;
  /** Writes run one after another, so an older snapshot can never overwrite a newer one. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    storage: KeyValueStorage | null = createIdbStorage({
      database: DEMO_RULES.DATABASE,
      store: DEMO_RULES.STORE,
    }),
  ) {
    this.storage = storage;
  }

  async load(): Promise<DemoRulesLoad> {
    const storage = this.storage;
    if (!storage) return { status: 'unavailable' };
    let raw: unknown;
    try {
      raw = await withStorageTimeout(storage.get(DEMO_RULES.STORAGE_KEY));
    } catch {
      this.storage = null;
      return { status: 'discarded', reason: 'storage_error' };
    }
    if (raw === undefined) return { status: 'empty' };
    if (typeof raw !== 'string') return this.discard('invalid');
    if (raw.length > DEMO_RULES.MAX_BYTES || encoder.encode(raw).length > DEMO_RULES.MAX_BYTES) {
      return this.discard('too_large');
    }
    const json = parseJsonSafely(raw);
    if (!json.ok) return this.discard('invalid');
    const record = recordSchema.safeParse(json.value);
    if (!record.success) return this.discard('invalid');
    return { status: 'loaded', rules: record.data.rules };
  }

  /** Stores a snapshot of the rules. Resolves once written (or once storage has been given up). */
  save(rules: readonly AlertRule[]): Promise<void> {
    const text = JSON.stringify({ version: DEMO_RULES.SCHEMA_VERSION, rules });
    this.queue = this.queue.then(async () => {
      const storage = this.storage;
      if (!storage) return;
      try {
        await withStorageTimeout(storage.set(DEMO_RULES.STORAGE_KEY, text));
      } catch {
        this.storage = null; // quota, blocked or broken: memory-only from now on
      }
    });
    return this.queue;
  }

  private async discard(reason: 'too_large' | 'invalid'): Promise<DemoRulesLoad> {
    try {
      await withStorageTimeout(this.storage?.del(DEMO_RULES.STORAGE_KEY) ?? Promise.resolve());
    } catch {
      // Could not delete either: the next successful save overwrites it.
    }
    return { status: 'discarded', reason };
  }
}
