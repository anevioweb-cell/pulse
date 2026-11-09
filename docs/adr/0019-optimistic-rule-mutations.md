# 0019. Optimistic alert-rule mutations, no automatic retries, no offline write queue

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Alert rules are the only server data the user edits. Waiting a round trip before a toggle or a new rule appears feels slow, and on a slow link it is. Optimistic updates fix that, but they are easy to get subtly wrong:

- a rollback that restores a snapshot erases other changes still in flight;
- a refetch already in flight overwrites the optimistic state with older data;
- concurrent edits of one rule can be undone in the wrong order;
- a created rule has no id until the server answers;
- a retried POST can create the same rule twice;
- TanStack's default network mode _pauses_ mutations while offline, so they hang with no feedback.

## Decision

1. **Only rule CRUD is optimistic.** Create, update and delete (`api/rule-mutations.ts`, hooks `useCreateAlertRule`, `useUpdateAlertRule`, `useDeleteAlertRule`) change the cached rules list at once. Nothing else is optimistic: everything else is read-only, or (live data) pushed by the server.
2. **The onMutate / onError / onSettled pattern**, with these rules:
   - **onMutate:**
     - cancel in-flight rule queries, so an older refetch cannot land on top;
     - validate the input with the contract schema (invalid input is never shown, and the API returns the typed validation error);
     - apply the change, and record what it replaced.
   - **onError:** undo exactly this change, as a patch:
     - remove the created rule, restore the previous version of an updated rule, or put a deleted rule back at its index;
     - when the result is the list as it was before, restore that exact list object and its `dataUpdatedAt`, so the cache is byte for byte what it was (tested over HTTP and with fake timers).
   - **onSuccess:** replace the optimistic rule with the server's version.
   - **onSettled:** when the last pending rule mutation settles, invalidate `['telemetry', mode, 'alerts']` (rules and alert history), so the repository's state wins. This is not awaited. Offline, the refetch is paused until the connection returns, and awaiting it would leave the mutation pending.
3. **Concurrency.**
   - **One scope:** all rule mutations share one TanStack `scope`, so requests run one at a time, in the order they were made. TanStack still runs `onMutate` for queued mutations, so every change shows up at once.
   - **A chain per rule:** pending changes of one rule form a chain. A change that fails while a later one is pending does not touch the cache (the later one owns what is shown). It hands its "previous" value and its "before" snapshot to the later change, so if that one fails too, the original comes back exactly. A change that succeeds hands down the server's version.
   - **One refetch:** only the last settle refetches, because an earlier refetch would replace the optimistic state of changes still in flight.
4. **Temporary ids.** An optimistic create gets `optimistic-<n>`, which is never sent to the API. Changes of that rule queue behind the create (same scope) and are sent with the server id once it is known. If the create failed, they fail locally with `validation`/`unsaved_rule` and leave nothing behind.
5. **No automatic retries.** Mutations set `retry: false` (also the client default). A POST whose response was lost may have succeeded, so retrying it could create a duplicate rule. The typed `ApiError` goes to the caller, and the user decides whether to try again.
6. **No offline write queue.** Mutations use `networkMode: 'always'` and check `onlineManager` first. Offline, they fail at once with `ApiError` kind `offline` (never retried), and the change is rolled back. They are not paused and not stored for later.

## Alternatives considered

- **Snapshot restore on error** (the common example). Restoring the whole list taken in `onMutate` erases every other change made since, including successful ones. It is only correct when one mutation is in flight. We restore the snapshot only when the patch shows nothing else changed.
- **Pessimistic updates** (wait for the server). Simple and always consistent, but slow on the one interaction that should feel instant. They remain the rule for everything except rule CRUD.
- **Parallel requests for independent rules.** Faster in theory, but server state would depend on arrival order, and the chain logic would have to cover cross-rule interleavings. Rule edits are rare and small, so serializing them costs nothing noticeable.
- **Retry with idempotency keys.** The right fix for duplicate POSTs, but it needs server support the REST contract does not have. Revisit with a real backend.
- **An offline write queue** (paused mutations, persisted and resumed on reconnect, as TanStack supports). It needs conflict resolution when the rules changed meanwhile (another tab, the server), persisting mutation variables, and UI for queued and failed-later states. A dashboard's rule edits are not worth that complexity, and a silent queue would show changes as saved when they are not. Out of scope. Offline edits fail clearly instead.

## Consequences

- **Positive:**
  - Rule changes appear immediately, and failures undo exactly what failed, with a typed error.
  - The server's state always wins in the end.
  - These cases are tested with fake timers (`api/rule-mutations.test.ts`): success, the 409 cap, validation errors, failed update and delete, offline, no retry, three concurrent-update orders, rollback order, a refetch in flight, request ordering, and edits of a just-created rule.
  - The same rollbacks are tested over real HTTP against the mock server's fault injection (`server/optimistic-rules-http.test.ts`).
- **Negative:**
  - Requests for rule edits are serialized.
  - The registry of pending changes is module state, kept per QueryClient in a `WeakMap`.
  - An optimistic list can be persisted by the query persister if the tab closes mid-request. The next load revalidates rules on mount (ADR 0018), which removes it.
- **Follow-up:** Phase 5 shows the typed errors (offline, 409, validation) in the rules UI.
