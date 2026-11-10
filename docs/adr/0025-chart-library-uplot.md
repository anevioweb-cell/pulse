# 0025. uPlot for time-series charts, behind a domain-agnostic TimeSeriesChart

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

The device page (Phase 5B) shows one chart per metric, up to five at once, each with up to 1800 points from a ring buffer (ADR 0012) plus up to 500 history points, redrawn at up to the device rate (10 Hz at most) and never more than once per frame (ADR 0026). Requirements:

- **Performance:** five charts redrawn in the same frame must leave room for the rest of the page. React must not re-render per data update.
- **Gaps:** a dropout must break the line, never be interpolated.
- **Bundle:** the library must load only with the device page, not in the initial bundle (177.58 kB gzip at the end of 5A, docs/performance.md).
- **Theming and CSP:** colors from the design tokens, re-applied on theme change; nothing that injects `<style>` or `<script>` (docs/security.md).
- **Accessibility:** a canvas has no text, so the page must provide the summary and the data alternative (ADR 0027) whatever the library.

uPlot is on the pre-approved list in CLAUDE.md.

## Decision

1. **uPlot 1.6.32** draws every time-series chart. Measured: the full library is 52,000 bytes minified and 23,013 bytes gzip (esbuild 0.28.2, `dist/uPlot.esm.js` bundled and minified), its stylesheet 1,857 bytes (772 gzip). It takes typed arrays as data, marks gaps with `null`, draws on one canvas per chart, and has no animation.
2. **One wrapper, `TimeSeriesChart` in `src/shared/ui`.** Props are plain data and options. It creates the chart once per mount and gets data through an imperative handle (`setData`). It reads colors and the font from the tokens and re-reads them when the root theme attribute changes, then redraws the same chart. It sizes itself with a ResizeObserver and destroys the chart and its observers on unmount. Features never import uPlot. The wrapper has its own entry point (`@/shared/ui/TimeSeriesChart`) instead of a re-export from the `@/shared/ui` barrel: uPlot runs code when its module loads (`matchMedia`, the pixel ratio), so modules that import the barrel must not load it.
3. **uPlot's stylesheet is bundled,** imported by the wrapper with a small token-based override file, so the CSS is a static asset of the chart's chunk and not injected at run time.
4. **The plot area is left to right in every locale** (docs/design-system.md, "RTL rule for charts").

## Alternatives considered

- **An SVG chart library (Recharts, Victory, Nivo, visx).** Declarative React components are pleasant, and SVG text is in the DOM. But a line of 1800 points is one large SVG path re-created and diffed by React on every update, five times per frame, and these libraries are built around re-rendering components with new data, which is what ADR 0012 avoids. Recharts also brings D3 modules. Their bundle sizes were not measured here: the redraw model already rules them out for this workload. They remain a good fit for small, static charts (Phase 5C's alert summaries could use one).
- **Chart.js.** Canvas, mature, accessible plugins exist. It is larger than uPlot (not measured here), its default animations would have to be turned off, and its time axis needs a date adapter. It is not on the pre-approved list, so it would need its own ADR, and it offers nothing uPlot lacks for line charts.
- **Canvas by hand.** No dependency, and the drawing itself is simple. But axes with good tick spacing, time formatting per span, HiDPI scaling, cursor hit-testing, resize handling and gap rendering are exactly what uPlot already does well in 23 kB gzip. Writing and testing them would cost more than the bytes saved.
- **Pass data as props and let React drive the chart.** Simpler wiring, but every data update would render the wrapper and diff its props. The handle keeps React out of the data path, and the Profiler tests prove it (`TimeSeriesChart.test.tsx`, and the device page in Phase 5B).

## Consequences

- **Positive:**
  - Gaps, thresholds (a draw hook), the tooltip and the theme switch work without recreating the chart, all tested with a fake uPlot module (jsdom has no canvas) and checked in Chromium on 8 stories (0 axe violations).
  - uPlot creates only `div`, `canvas` and (for its legend, which is off) `table` elements, and sets inline styles through the CSSOM, which a strict `style-src` allows (docs/security.md).
  - The design tokens drive every color, so the Phase 5D visual pass needs no chart rewrite.
- **Negative:**
  - A canvas is invisible to assistive technology: the page must write the summary label and provide the data table (ADR 0027).
  - Tests cannot run uPlot itself in jsdom: drawing is checked in the browser and by screenshots.
  - uPlot's own stylesheet uses physical properties (`left`, `border-right`). They are correct inside the plot area, which is always left to right.
- **Follow-up:** Phase 5B measures the draw time of five full charts per frame (docs/performance.md).
