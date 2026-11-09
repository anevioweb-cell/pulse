import { mutationOptions, onlineManager } from '@tanstack/react-query';

import { ApiError } from '@/shared/api';

import { alertRuleInputSchema } from './contract';
import { telemetryKeys } from './query-keys';

import type { AlertRule, AlertRuleInput } from './contract';
import type { TelemetryApi } from './telemetry-api';
import type { QueryClient } from '@tanstack/react-query';

// Optimistic alert-rule mutations (ADR 0019). The rules list changes in the cache at once, the
// request runs, and on failure exactly that change is undone. When the last pending rule
// mutation settles, rules and alert history are invalidated, so the repository's state wins.
//
// - Every rule mutation shares one scope: requests run one at a time, in the order they were
//   made, while their optimistic updates appear immediately (TanStack runs onMutate for queued
//   mutations). Server state never sees the requests reordered.
// - Rollback is a patch, not a snapshot restore: undoing one mutation never erases another
//   pending one. Per rule, pending mutations form a chain; a failed mutation hands its "previous"
//   value to the next one in the chain instead of writing it into the cache.
// - A create gets a temporary id; later mutations of that rule are translated to the server id
//   once the create succeeds (they are queued behind it by the scope).
// - Mutations never retry, never pause offline (they fail with `offline`), and are never queued
//   for later (ADR 0019).

/** Prefix of temporary ids given to optimistic creates. Never sent to the API. */
export const OPTIMISTIC_ID_PREFIX = 'optimistic-';

interface PendingChange {
  /** The rule as it was before this change; null if this change creates it. */
  previous: AlertRule | null;
  /** The rule as this change shows it; null if this change deletes it. */
  optimistic: AlertRule | null;
  /** Its position before the change, to reinsert a deleted rule where it was. */
  index: number;
  /**
   * The cached list and its timestamp before the first still-pending change of this rule: when
   * undoing leaves exactly this list, it is restored with its timestamp (byte for byte).
   */
  before: { data: AlertRule[]; updatedAt: number };
}

interface Registry {
  pending: Map<string, PendingChange[]>;
  /** Temporary id -> server id, once the create succeeded. */
  saved: Map<string, string>;
  nextTemporaryId: number;
}

const registries = new WeakMap<QueryClient, Registry>();

function registryOf(client: QueryClient): Registry {
  let registry = registries.get(client);
  if (!registry) {
    registry = { pending: new Map(), saved: new Map(), nextTemporaryId: 0 };
    registries.set(client, registry);
  }
  return registry;
}

export interface RuleMutationContext {
  /** Logical id of the affected rule (the temporary id for a create). */
  ruleId: string;
  /** Null when there was nothing to update optimistically (no cached list, invalid input). */
  change: PendingChange | null;
}

export interface UpdateAlertRuleVariables {
  id: string;
  input: AlertRuleInput;
}
export interface DeleteAlertRuleVariables {
  id: string;
}

const offlineError = () =>
  new ApiError('offline', 'You are offline. The change was not sent.', { code: 'offline' });

const unsavedError = () =>
  new ApiError('validation', 'This rule is not saved yet', { code: 'unsaved_rule' });

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function setup(api: TelemetryApi, client: QueryClient) {
  const rulesKey = telemetryKeys.alertRules(api.mode);
  const registry = registryOf(client);
  const scope = { id: rulesKey.join('/') };

  const resolveId = (id: string): string => {
    const saved = registry.saved.get(id);
    if (saved) return saved;
    if (id.startsWith(OPTIMISTIC_ID_PREFIX)) throw unsavedError();
    return id;
  };

  /** A rule matches its logical id, or the server id its temporary id became. */
  const matches = (rule: AlertRule, id: string) =>
    rule.id === id || rule.id === registry.saved.get(id);

  const ensureOnline = () => {
    if (!onlineManager.isOnline()) throw offlineError();
  };

  /** Cancels in-flight rule fetches, then applies `next` to the cached list (if any). */
  async function apply(
    ruleId: string,
    plan: (rules: AlertRule[]) => Omit<PendingChange, 'before'> | null,
    next: (rules: AlertRule[]) => AlertRule[],
  ): Promise<RuleMutationContext> {
    // A refetch that started before this change would overwrite it with older server data.
    await client.cancelQueries({ queryKey: rulesKey });
    const data = client.getQueryData<AlertRule[]>(rulesKey);
    const planned = data ? plan(data) : null;
    if (!data || !planned) return { ruleId, change: null };
    const change: PendingChange = {
      ...planned,
      before: { data, updatedAt: client.getQueryState(rulesKey)?.dataUpdatedAt ?? 0 },
    };
    const chain = registry.pending.get(ruleId) ?? [];
    chain.push(change);
    registry.pending.set(ruleId, chain);
    client.setQueryData<AlertRule[]>(rulesKey, next(data));
    return { ruleId, change };
  }

  /** Removes `change` from its chain; returns the change queued after it, if any. */
  function release(context: RuleMutationContext): PendingChange | undefined {
    const chain = registry.pending.get(context.ruleId);
    if (!chain || !context.change) return undefined;
    const position = chain.indexOf(context.change);
    if (position === -1) return undefined;
    chain.splice(position, 1);
    if (chain.length === 0) registry.pending.delete(context.ruleId);
    return chain.at(position);
  }

  function rollback(context: RuleMutationContext | undefined): void {
    if (!context?.change) return;
    const { change } = context;
    const later = release(context);
    if (later) {
      // A later change of the same rule is still pending and owns what the cache shows: it now
      // undoes to what was there before this (failed) one.
      later.previous = change.previous;
      later.before = change.before;
      return;
    }
    client.setQueryData<AlertRule[]>(rulesKey, (rules) => {
      if (!rules) return rules;
      const id = context.ruleId;
      const without = rules.filter((rule) => !matches(rule, id));
      if (!change.previous) return without;
      const position = rules.findIndex((rule) => matches(rule, id));
      const at = position === -1 ? Math.min(change.index, without.length) : position;
      return [...without.slice(0, at), change.previous, ...without.slice(at)];
    });
    // Nothing else changed since: restore the exact list object and timestamp.
    const after = client.getQueryData<AlertRule[]>(rulesKey);
    if (sameJson(after, change.before.data)) {
      client.setQueryData(rulesKey, change.before.data, { updatedAt: change.before.updatedAt });
    }
  }

  /** The server's version replaces what this change showed, unless a later change owns the rule. */
  function confirm(context: RuleMutationContext | undefined, saved: AlertRule | null): void {
    if (!context?.change) return;
    const later = release(context);
    if (later) {
      later.previous = saved;
      return;
    }
    if (!saved || !context.change.optimistic) return;
    client.setQueryData<AlertRule[]>(rulesKey, (rules) =>
      rules?.map((rule) => (matches(rule, context.ruleId) ? saved : rule)),
    );
  }

  const settle = () => {
    // Only the last pending rule mutation refetches: an earlier refetch would replace the
    // optimistic state of mutations still in flight with intermediate server state. Not
    // awaited: offline, the refetch is paused, and awaiting it would leave the mutation pending.
    if (client.isMutating({ mutationKey: rulesKey }) === 1) {
      void client.invalidateQueries({ queryKey: telemetryKeys.alerts(api.mode) });
    }
  };

  const common = {
    scope,
    retry: false,
    // Fail fast offline instead of pausing (TanStack's default for mutations is to wait).
    networkMode: 'always',
  } as const;

  return {
    rulesKey,
    registry,
    matches,
    resolveId,
    ensureOnline,
    apply,
    rollback,
    confirm,
    settle,
    common,
  };
}

export function createAlertRuleMutation(api: TelemetryApi, client: QueryClient) {
  const m = setup(api, client);
  return mutationOptions<AlertRule, ApiError, AlertRuleInput, RuleMutationContext>({
    ...m.common,
    mutationKey: [...m.rulesKey, 'create'],
    mutationFn: async (input) => {
      m.ensureOnline();
      return api.createAlertRule(input);
    },
    onMutate: (input) => {
      m.registry.nextTemporaryId += 1;
      const ruleId = `${OPTIMISTIC_ID_PREFIX}${String(m.registry.nextTemporaryId)}`;
      // Invalid input is not shown; the API rejects it with a typed validation error.
      const parsed = alertRuleInputSchema.safeParse(input);
      const rule: AlertRule | null = parsed.success ? { ...parsed.data, id: ruleId } : null;
      return m.apply(
        ruleId,
        (rules) => (rule ? { previous: null, optimistic: rule, index: rules.length } : null),
        (rules) => (rule ? [...rules, rule] : rules),
      );
    },
    onSuccess: (saved, _input, context) => {
      m.registry.saved.set(context.ruleId, saved.id);
      m.confirm(context, saved);
    },
    onError: (_error, _input, context) => {
      m.rollback(context);
    },
    onSettled: () => {
      m.settle();
    },
  });
}

export function createUpdateAlertRuleMutation(api: TelemetryApi, client: QueryClient) {
  const m = setup(api, client);
  return mutationOptions<AlertRule, ApiError, UpdateAlertRuleVariables, RuleMutationContext>({
    ...m.common,
    mutationKey: [...m.rulesKey, 'update'],
    mutationFn: async ({ id, input }) => {
      m.ensureOnline();
      return api.updateAlertRule(m.resolveId(id), input);
    },
    onMutate: ({ id, input }) => {
      const parsed = alertRuleInputSchema.safeParse(input);
      return m.apply(
        id,
        (rules) => {
          const index = rules.findIndex((rule) => m.matches(rule, id));
          const previous = rules.at(index);
          if (!parsed.success || index === -1 || !previous) return null;
          return { previous, optimistic: { ...parsed.data, id: previous.id }, index };
        },
        (rules) =>
          parsed.success
            ? rules.map((rule) => (m.matches(rule, id) ? { ...parsed.data, id: rule.id } : rule))
            : rules,
      );
    },
    onSuccess: (saved, _variables, context) => {
      m.confirm(context, saved);
    },
    onError: (_error, _variables, context) => {
      m.rollback(context);
    },
    onSettled: () => {
      m.settle();
    },
  });
}

export function createDeleteAlertRuleMutation(api: TelemetryApi, client: QueryClient) {
  const m = setup(api, client);
  return mutationOptions<null, ApiError, DeleteAlertRuleVariables, RuleMutationContext>({
    ...m.common,
    mutationKey: [...m.rulesKey, 'delete'],
    mutationFn: async ({ id }) => {
      m.ensureOnline();
      await api.deleteAlertRule(m.resolveId(id));
      return null;
    },
    onMutate: ({ id }) =>
      m.apply(
        id,
        (rules) => {
          const index = rules.findIndex((rule) => m.matches(rule, id));
          const previous = rules.at(index);
          return index === -1 || !previous ? null : { previous, optimistic: null, index };
        },
        (rules) => rules.filter((rule) => !m.matches(rule, id)),
      ),
    onSuccess: (_data, _variables, context) => {
      m.confirm(context, null);
    },
    onError: (_error, _variables, context) => {
      m.rollback(context);
    },
    onSettled: () => {
      m.settle();
    },
  });
}
