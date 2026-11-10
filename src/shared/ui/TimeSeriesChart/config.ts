// Drawing constants of TimeSeriesChart. Colors and fonts are not here: they come from the design
// tokens at run time (chart palette, semantic colors, the chart's own font), so a theme or a
// visual redesign changes them without touching this component.

export const TIME_SERIES_CHART = {
  /** Series line width in CSS px: visible at a glance, thin enough for 1800 points. */
  LINE_WIDTH_PX: 2,
  /** Threshold lines: thinner than the data and dashed, so they read as a reference. */
  THRESHOLD_WIDTH_PX: 1,
  THRESHOLD_DASH_PX: [6, 4] as readonly number[],
  /** Space between a threshold line and its label, and from the plot's end. */
  THRESHOLD_LABEL_GAP_PX: 4,
  /** Distance between the cursor and the tooltip, so the tooltip never covers the point. */
  TOOLTIP_OFFSET_PX: 12,
  /** Fraction of the value range added above and below the data (and the thresholds). */
  RANGE_PADDING: 0.1,
  /** Value range used when there is nothing to scale to (no data, no thresholds). */
  EMPTY_RANGE: [0, 1] as readonly [number, number],
  /**
   * Room after the plot's last time label, which uPlot centers on the window's end: about half
   * the widest label ("12:59:50 PM" in a 12 px font is about 70 px).
   */
  END_PADDING_PX: 36,
  /** Axis labels: time labels need at least this much room, values this much. */
  X_AXIS_SPACE_PX: 80,
  Y_AXIS_SPACE_PX: 32,
  /**
   * Time label detail by visible span: seconds up to 10 minutes, hours and minutes up to 2 days,
   * the date beyond.
   */
  SECONDS_UP_TO_MS: 10 * 60 * 1000,
  MINUTES_UP_TO_MS: 2 * 24 * 60 * 60 * 1000,
} as const;
