# 0027. Chart accessibility: a summary image, a data-table alternative, and announcements for state changes only

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

The device page (Phase 5B) shows up to five live charts drawn on canvas by uPlot (ADR 0025). A canvas has no content for assistive technology. The charts update up to 10 times per second per device. The page must be usable without sight and without a pointer:

- each chart needs a text equivalent that stays accurate as data streams in;
- the exact values must be reachable, not only a summary;
- changes that matter must be heard, without a screen reader reading every sample;
- every control must work from the keyboard;
- the tooltip is pointer-only, so it cannot be the only way to read values.

## Decision

1. **Each chart is `role="img"` with a generated summary label:** metric, range, latest, lowest and highest value with their unit, for example "Temperature over the last minute: latest 23.5 °C, lowest 21.0 °C, highest 23.5 °C." With no data it says so ("… : no data."). The label is written imperatively by the redraw (`TimeSeriesChart`'s `setLabel`), only when its text changes, so it is current without rendering React. An `aria-label` change on an image is not announced, so streaming does not make noise.
2. **A "Show data table" toggle per chart** (`aria-expanded`, `aria-controls`) renders the values the chart drew as a table: a caption naming the metric and the time of the copy, column headers, times and values formatted for the locale, newest first.
   - It is a **snapshot**: it does not change under a reader. "Refresh table" copies the latest frame. While the charts are paused it shows exactly the frozen view.
   - It is **capped at `DEVICE_CHART.TABLE_MAX_ROWS` (300) rows,** the newest ones, and says so ("Newest 300 of 1,800 values."). 300 rows cover the `5m` range in full at 1 Hz and most of a 1 h history. A table of thousands of rows is not usable by ear, and a full ring buffer would take noticeable time to render.
   - Gap markers are not rows: they are not samples.
3. **One polite live region per page** (`role="status"`, present from the first render) announces only meaningful state changes: the device going offline, going stale, reporting again, and the charts paused or resumed. Samples, values and range changes are never announced. Range changes are the user's own action, and their result is in the summaries.
4. **Keyboard:**
   - the range control is a group of native radio buttons with a legend (arrow keys move and select);
   - pause and resume is a toggle button with `aria-pressed`;
   - expand and collapse per chart are icon buttons with `aria-pressed` and a full name ("Expand Humidity");
   - the table toggle and refresh are buttons, and every focusable element shows the focus ring.
5. **No keyboard crosshair in this phase.** Moving the chart cursor with arrow keys was considered (an interactive widget with a live value readout). It was not built: the data table already gives exact values with every time, in a form screen readers handle well, and an interactive canvas widget needs its own role and interaction model, plus screen-reader testing that this phase did not include. The table is the documented alternative.
6. **Status never relies on color:** the status badge has text and an icon, and offline or stale devices also get a banner with a title.

## Alternatives considered

- **An SVG chart with focusable points.** Each point would be in the accessibility tree, but 1800 focusable points per chart is unusable, and SVG at this size costs too much to redraw (ADR 0025).
- **A live region that reads the latest value.** At 1 Hz it would talk without pause and drown everything else. Rate-limited readouts (say, every 30 s) still interrupt, and the value is one keystroke away in the "Latest values" list.
- **A data table always present (visually hidden).** Screen readers would always meet hundreds of rows, and React would re-render them on every frame. A toggle keeps it opt-in and static.
- **Sonification (audio graphs).** Promising for trends, but a large feature with its own design and testing needs. Out of scope.
- **A long description (`aria-describedby`) with a trend sentence ("rising over the last minute").** Useful, but computing trends honestly (noise, gaps) is its own problem. The summary gives latest, lowest and highest, which are exact.

## Consequences

- **Positive:**
  - Tested in `DevicePage.test.tsx` with jest-axe (loading, live data, not found, error, open table) and assertions:
    - the summary labels;
    - the table's values, newest first;
    - the offline announcement, and the pause and resume announcements;
    - the radio group and the URL;
    - the `aria-pressed` and `aria-expanded` states.
  - In Chromium, axe finds 0 violations on the 8 chart stories and the 7 `ChartControls` and `ChartDataTable` stories. That pass caught what jsdom could not: the table's scroll container was not keyboard-focusable (`scrollable-region-focusable`). It is now a named region with `tabIndex={0}`.
- **Negative:**
  - The summary does not describe the shape of the line (trends, spikes, gaps). The table holds the detail.
  - The table is a snapshot: a reader must press "Refresh table" to see newer values.
  - Only markup and behavior were tested. No screen reader (NVDA, JAWS, VoiceOver, TalkBack) was used. docs/accessibility.md lists what remains to verify.
- **Follow-up:** Phase 8 tests the page with screen readers and in Arabic. A keyboard crosshair can be added then if testing shows the table is not enough.
