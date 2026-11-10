# Accessibility

What the app does for accessibility, how each part is tested, and what has not been verified. Phase 8 adds screen-reader testing and translations (with Arabic, right to left).

## How it is tested

| Method                            | What it covers                                                                                                                                                                                                                                        | Where                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **jest-axe in jsdom**             | Every shared component and every page in its states (loading, empty, error, live data, not found), including the device page with an open data table. `color-contrast` and `region` are off in jsdom (no layout, components tested alone)             | `expectNoAxeViolations` in 28 test files (`src/test/axe.ts`)       |
| **Contrast of the tokens**        | Text roles 4.5:1, UI roles and the six chart colors 3:1, against every surface, in both themes                                                                                                                                                        | `src/shared/styles/tokens.test.ts`                                 |
| **Behavior with Testing Library** | Roles and names, keyboard order, focus after navigation, `aria-pressed`, `aria-expanded`, `aria-sort`, `aria-rowcount`, live-region text                                                                                                              | Component and page tests                                           |
| **axe in Chromium**               | Stories rendered with real layout and colors: the 8 `TimeSeriesChart` stories and the 7 `ChartControls` and `ChartDataTable` stories in Phase 5B (0 violations). This caught a scrollable table region that was not focusable, which jsdom cannot see | Storybook build, axe-core injected (method in docs/performance.md) |
| **Browser checks by hand**        | Focus after navigation and after a page loads, light and dark, LTR and RTL at 1280 and 375 px                                                                                                                                                         | docs/performance.md, per phase                                     |

## What the app provides

- **Structure:** a skip link, one `banner`, one `nav` named "Main", one `main`; one `<h1>` per page (the `PageHeader`), sections named by their headings.
- **Navigation:** after a navigation to another path, focus moves to the page's `<h1>`, the document title changes, and scroll resets. The device page keeps the same heading element from its loading state to its loaded state, so focus is not lost when the data arrives. Query-string changes (sorting, filtering, a chart range) never move focus.
- **Status without color:** device status is text plus an icon; offline and stale devices also get a titled banner; chart threshold lines have text labels.
- **Live data:**
  - The devices table announces "Showing N of M devices" (`role="status"`).
  - The device page has one polite region that announces only state changes: the device going offline, going stale or reporting again, and charts paused or resumed. Values and samples are never announced (ADR 0027).
- **Charts** (ADR 0027):
  - each canvas is `role="img"` with a generated summary (metric, range, latest, lowest, highest, with units);
  - "Show data table" opens a snapshot table of the drawn values: newest first, at most 300 rows (and it says when rows are left out), refreshable, keyboard-scrollable;
  - the pointer tooltip is `aria-hidden`: it is a convenience, not the way to read values.
- **Controls:** native radio buttons for the chart range, toggle buttons with `aria-pressed` for pause and for expanding a chart, Radix primitives for dialogs, menus and selects (ADR 0008).
- **Motion:** skeleton shimmer, spinners and pulsing status dots stop under `prefers-reduced-motion`. The charts do not animate at all.
- **Direction:** layouts use logical properties and mirror in RTL. Chart plot areas stay left to right (docs/design-system.md, "RTL rule for charts").

## Known limits

- **Numbers with signs in RTL:** the bidi algorithm displays "100+" as "+100" (Overview alerts KPI) and "-61 dBm" as "dBm 61-" (device latest values) when the page is right to left. Phase 8 must isolate numbers with units (`<bdi>`, or `dir="ltr"` on the value).
- **Chart summaries** give latest, lowest and highest values, not the shape of the line (trends, spikes, gaps). The data table holds the detail.
- **No keyboard crosshair** on charts: the data table is the alternative (ADR 0027).
- **The data table is a snapshot:** newer values need "Refresh table".
- **The table's first 300 rows** are the newest: older samples of a full ring buffer are only in the chart.

## Not tested: screen readers

No screen reader has been run on any page: NVDA, JAWS, VoiceOver (macOS, iOS) and TalkBack are all untested. Only the markup, the accessible names and the live-region text were checked. In particular, these behaviors are not verified:

- whether the focused `<h1>` is announced after a navigation, and after the device page finishes loading;
- how the virtualized devices table's `aria-rowcount` and `aria-rowindex` are announced, and whether the row position is right while scrolling;
- whether the polite region's messages ("The device went offline.", "Charts paused.") are announced once, and not dropped when two arrive close together;
- whether a changed `aria-label` on a chart image is read when the user returns to it, and that it is not announced while the chart redraws;
- how the chart data table is announced (caption, headers, the "Newest 300 of N" note) and navigated in table mode;
- whether the range radio group, the pause toggle (`aria-pressed`) and the expand toggles are announced with their state;
- the whole app in Arabic: reading order, mirrored layouts, number isolation.

These are the first items of Phase 8.
