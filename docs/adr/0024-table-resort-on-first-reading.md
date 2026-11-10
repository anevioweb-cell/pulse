# 0024. The devices table also re-reads live values on each device's first reading

- **Status:** Accepted. Amends decision 2 of [0022](0022-devices-table-virtualization-and-semantics.md).
- **Date:** 2026-11-10

## Context

ADR 0022 renews the table's row snapshot when the sort, the status filter or any device's status changes. In the production build, opening `/devices?sort=battery` showed an unsorted table: devices announce themselves (status `online`) before their first reading, so the only renewal happened while every live value was still empty, and later readings never renewed it. Verified in Chromium against `vite preview`, and reproduced in `DevicesTable.test.tsx` ("applies a sort from the URL once the first readings arrive").

## Decision

`selectStatusSignature` now encodes, per device, its status **and whether it has a reading yet** (`id:status:0|1`). It still changes rarely: on a status change, and once per device when its first reading arrives, never on later readings. The table's row snapshot is renewed on those changes, so a sort or filter from the URL applies as soon as values exist.

## Alternatives considered

- **Renew on every publish.** Always current, but it re-sorts and re-renders every visible row on every frame, which ADR 0022 rejects.
- **Renew once, when the whole fleet has reported.** A device that never reports would block the sort forever.
- **Delay rendering the table until data exists.** It hides the device list behind the live stream, and Live Mode may never deliver.

## Consequences

- **Positive:** a sort or filter loaded from the URL is correct once readings arrive.
- **Negative:** each device's first reading re-renders the visible rows once (at most `STORE.MAX_DEVICES` such events per session). The render-count test measures the steady state after them.
