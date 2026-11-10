# 0022. Devices table: semantic table markup with virtualized rows and per-row live subscriptions

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

The Devices page lists every device with nine columns (name, location, status, temperature, humidity, pressure, battery, signal, last seen), with sorting, a search, a status filter, column visibility and a sticky header. The constraints:

- **Fleet size:** the store accepts up to 256 devices (`STORE.MAX_DEVICES`), and the stress target is 200. The simulator caps at 100, so larger fleets are tested with synthetic data.
- **Live values change every second per device.** A table that rebuilds its rows on every reading would re-render every visible row at the frame rate.
- **Accessibility:** a screen reader must know the table's size and sort even when only some rows exist in the DOM. Sorting and the column menu must work from the keyboard, focus must be visible, and status must not rely on color.
- **Rules:** no inline `style` props (CLAUDE.md), logical properties, tokens, and the table libraries must stay out of the main chunk.

TanStack Table and TanStack Virtual are pre-approved. TanStack Table is at major version 9 (its API changed from v8: explicit `tableFeatures`, `useTable`, row models as feature slots).

## Decision

1. **TanStack Table v9 for the row model only.** The registered features are sorting, column and global filtering, and column visibility. The table's state is controlled from the URL (ADR 0021). Header clicks write the URL, not table state, and React renders all markup itself.
2. **Live values are not table data.** `data` is the server device list. Each row (`DeviceRow`) subscribes to its own device with `useLiveDevice(id)`, so a reading re-renders that row only. Live columns (status, metrics, last seen) have accessors that read the live store's current snapshot when the row model is computed. The `data` array is renewed (new row objects, fresh snapshot) when:
   - the sort or the status filter changes;
   - any device's status changes (`useLiveStatusSignature`, a string that changes only then, never on a reading).

   Consequence: a sort on a live metric orders by the values at that moment, and rows do not jump while someone reads them. Sorting again re-reads the values.

3. **Semantic `<table>` with spacer rows.** Rows are virtualized with `useVirtualizer` (fixed 48 px rows, 8 rows of overscan), rendered between two spacer rows (`aria-hidden`) whose heights are set through the CSSOM (`element.style.height` in a layout effect). There is no inline `style` prop, and CSSOM writes are not subject to a CSP's `style-src`. The markup:
   - `<table aria-rowcount>`: total rows plus the header;
   - `aria-rowindex` on every rendered row;
   - `<th scope="col">` with `aria-sort` on the sorted column only, and a `<button>` inside each header for sorting (Enter or Space, native focus);
   - `<th scope="row">` holds the device link;
   - a visually hidden `<caption>` naming the table and its current sort;
   - a `role="status"` line with "Showing N of M devices".
4. **Radix DropdownMenu for column visibility** (a Radix primitive, pre-approved; ADR 0008): it provides checkbox items with `aria-checked`, arrow keys, typeahead, Escape, and focus returned to the trigger. The name column cannot be hidden.
5. **The status filter uses the shared `Select`, the search the shared `Input`.** The search writes the URL debounced (250 ms) with `replace`.
6. **A zero-height viewport counts as the initial estimate (600 px).** The default rect observer is wrapped, so a container that is not laid out yet (and jsdom) still renders rows.

## Alternatives considered

- **ARIA grid (`role="grid"`) on divs.** Divs are easier to virtualize with absolute positioning, but a grid promises cell-by-cell arrow-key navigation, which would have to be built and tested. The table is read, not edited, so native table semantics with focusable links and buttons are the honest model.
- **Absolutely positioned rows with `transform` (TanStack Virtual's examples).** That needs a per-row inline style, which the project rules forbid, and it breaks table layout (column widths come from the cells).
- **Live values in `data`.** Simple and always sorted by the newest values, but every reading would rebuild the row model and re-render every visible row, and rows would jump under the reader's eyes.
- **Re-sorting live columns on every frame.** The same cost, plus moving targets for keyboard and pointer users.
- **No virtualization.** 256 rows times 9 cells is about 2,300 cells, workable, but every status-signature change and every sort would re-render all of them. Virtualization keeps the rendered set near 21 rows (measured in the test) at any fleet size.
- **Pagination.** It avoids virtualization, but splits a fleet that fits on one scrollable screen, and paging state would add a fifth URL field.
- **TanStack Table v8.** Better known, but v9 is the current major version, and starting on v8 would mean a migration later.

## Consequences

- **Positive:**
  - Measured in `DevicesTable.test.tsx` with 200 synthetic devices: 21 of 200 rows rendered; a reading for a visible device re-renders 1 row; a reading for an off-screen device re-renders none; 5 visible readings re-render 5 rows.
  - TanStack Table, TanStack Virtual, Radix DropdownMenu, Radix Select and floating-ui are only in the lazy `/devices` chunk (docs/performance.md).
  - Sort, filter, search and hidden columns survive a reload and can be shared as a URL.
- **Negative:**
  - A sort by a live metric is a snapshot: it does not follow the values until the sort, the filter or a status changes.
  - Screen readers announce `aria-rowcount` and `aria-rowindex` differently. Only the markup was verified (jsdom and axe); no screen reader was tested (docs/performance.md and docs/architecture.md say so).
  - Fixed row height: content that wraps would be clipped, so cells use `whitespace-nowrap` and the container scrolls horizontally on narrow screens.
- **Follow-up:** Phase 8 checks the table in RTL with a screen reader. Phase 6 can measure scrolling performance in a browser.
