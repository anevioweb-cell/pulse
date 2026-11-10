import 'uplot/dist/uPlot.min.css';
import './time-series-chart.css';

import { cva } from 'class-variance-authority';
import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import uPlot from 'uplot';

import { cn } from '@/shared/lib';
import { THEME_ATTRIBUTE } from '@/shared/theme';

import { TIME_SERIES_CHART as CHART } from './config';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps, Ref } from 'react';

/** One series in uPlot's aligned form: ascending times (ms) and values, `null` for a gap. */
export interface TimeSeriesData {
  readonly xs: Float64Array | number[];
  readonly ys: (number | null)[];
}

/** The visible time range, both ends in ms. It is the x scale, whatever the data covers. */
export interface ChartWindow {
  readonly from: number;
  readonly to: number;
}

export interface ChartThreshold {
  readonly value: number;
  /** Drawn next to the line ("Above 30"). */
  readonly label: string;
  readonly tone: 'warning' | 'danger';
}

/** Imperative API: data goes to the canvas without a React render. */
export interface TimeSeriesChartHandle {
  setData: (data: TimeSeriesData, window: ChartWindow) => void;
  /** Replaces the accessible summary (for example with new latest, min and max values). */
  setLabel: (label: string) => void;
}

/** Chart palette slots (`--color-chart-1` to `--color-chart-6`, colorblind-safe). */
export type ChartColor = 1 | 2 | 3 | 4 | 5 | 6;

const chartVariants = cva('pulse-chart relative w-full text-xs text-text-muted', {
  variants: {
    size: {
      sm: 'h-40',
      md: 'h-56',
      lg: 'h-72',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface TimeSeriesChartProps
  extends
    Omit<ComponentProps<'div'>, 'children' | 'ref' | 'role' | 'color'>,
    VariantProps<typeof chartVariants> {
  ref?: Ref<TimeSeriesChartHandle>;
  /** Accessible name of the chart image: a short summary, since the canvas has no text. */
  label: string;
  /** Series name in the tooltip ("Temperature"). */
  seriesName: string;
  /** Unit after values in the tooltip ("°C"). */
  unit?: string;
  /** Fraction digits of values on the axis and in the tooltip. */
  decimals?: number;
  color?: ChartColor;
  /** Horizontal reference lines; the value scale always includes them. */
  thresholds?: readonly ChartThreshold[];
  /** BCP 47 locale for times and numbers (default: the browser's). */
  locale?: string;
}

interface Palette {
  series: string;
  axis: string;
  grid: string;
  warning: string;
  danger: string;
  font: string;
}

interface Formatters {
  value: Intl.NumberFormat;
  seconds: Intl.DateTimeFormat;
  minutes: Intl.DateTimeFormat;
  date: Intl.DateTimeFormat;
  full: Intl.DateTimeFormat;
}

function readPalette(element: HTMLElement, color: ChartColor): Palette {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    series: token(`--color-chart-${String(color)}`),
    axis: token('--color-text-muted'),
    grid: token('--color-border'),
    warning: token('--color-warning'),
    danger: token('--color-danger'),
    font: `${style.fontSize} ${style.fontFamily}`,
  };
}

function createFormatters(locale: string | undefined, decimals: number): Formatters {
  const time = { hour: '2-digit', minute: '2-digit' } as const;
  return {
    value: new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
    seconds: new Intl.DateTimeFormat(locale, { ...time, second: '2-digit' }),
    minutes: new Intl.DateTimeFormat(locale, time),
    date: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', ...time }),
    full: new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...time,
      second: '2-digit',
    }),
  };
}

const EMPTY_DATA: TimeSeriesData = { xs: [], ys: [] };
/** Shared default, so a chart without thresholds does not see a new array on every render. */
const NO_THRESHOLDS: readonly ChartThreshold[] = [];

/**
 * A live time-series chart on uPlot (canvas), domain-agnostic: props are plain data and options.
 *
 * - **Data** goes through the imperative handle (`ref.setData`), so streaming updates never
 *   render React. The chart keeps the last data and window, and redraws them after a resize or
 *   a theme change.
 * - **Created once** per mount. Option props (thresholds, formats, color, locale) and theme
 *   changes update the existing chart (`redraw`), never recreate it.
 * - **Colors and fonts** are read from the design tokens on the element (the chart palette slot,
 *   text-muted for axes, border for the grid, warning and danger for thresholds), again whenever
 *   the root theme attribute changes.
 * - **Gaps:** a `null` value breaks the line (`spanGaps: false`); nothing is interpolated.
 * - **Direction:** the plot area is always left to right (time is not mirrored); the tooltip
 *   follows the page direction, for its text and its side of the cursor.
 * - **Motion:** uPlot does not animate, and neither does the tooltip, so there is nothing to turn
 *   off for reduced motion.
 * - **Cleanup:** unmount destroys the chart (uPlot removes its own listeners) and disconnects the
 *   ResizeObserver and the MutationObserver.
 */
export function TimeSeriesChart({
  ref,
  label,
  seriesName,
  unit,
  decimals = 0,
  color = 1,
  thresholds = NO_THRESHOLDS,
  locale,
  size,
  className,
  ...props
}: TimeSeriesChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const dataRef = useRef<{ data: TimeSeriesData; window: ChartWindow | null }>({
    data: EMPTY_DATA,
    window: null,
  });
  // Everything the uPlot callbacks read, kept current without recreating the chart.
  const optionsRef = useRef({ seriesName, unit, decimals, color, thresholds, locale });
  const formattersRef = useRef<Formatters>(createFormatters(locale, decimals));
  const paletteRef = useRef<Palette | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setData(data, window) {
        dataRef.current = { data, window };
        chartRef.current?.setData([data.xs, data.ys] as uPlot.AlignedData);
      },
      setLabel(text) {
        const image = imageRef.current;
        if (image && image.getAttribute('aria-label') !== text) {
          image.setAttribute('aria-label', text);
        }
      },
    }),
    [],
  );

  // Create the chart once, with observers for size and theme.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const target = plotRef.current;
    if (!wrapper || !target) return;
    paletteRef.current = readPalette(wrapper, optionsRef.current.color);
    const palette = () => paletteRef.current ?? readPalette(wrapper, optionsRef.current.color);

    const chart = new uPlot(
      createOptions({
        width: target.clientWidth,
        height: target.clientHeight,
        palette,
        formatters: () => formattersRef.current,
        options: () => optionsRef.current,
        window: () => dataRef.current.window,
        tooltip: () => tooltipRef.current,
        direction: () => getComputedStyle(wrapper).direction,
      }),
      [dataRef.current.data.xs, dataRef.current.data.ys] as uPlot.AlignedData,
      target,
    );
    chartRef.current = chart;

    const resize = new ResizeObserver((entries) => {
      const box = entries.at(-1)?.contentRect;
      if (!box) return;
      chart.setSize({ width: Math.floor(box.width), height: Math.floor(box.height) });
    });
    resize.observe(target);

    // Theme switches change the root attribute; the callback runs before the next paint.
    const theme = new MutationObserver(() => {
      paletteRef.current = readPalette(wrapper, optionsRef.current.color);
      chart.redraw(false, true);
    });
    theme.observe(document.documentElement, { attributeFilter: [THEME_ATTRIBUTE] });

    return () => {
      resize.disconnect();
      theme.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
  }, []);

  // Option props: update in place and redraw, never recreate.
  useEffect(() => {
    const previous = optionsRef.current;
    const next = { seriesName, unit, decimals, color, thresholds, locale };
    const changed = (Object.keys(next) as (keyof typeof next)[]).some(
      (key) => previous[key] !== next[key], // eslint-disable-line security/detect-object-injection -- own fixed keys
    );
    if (!changed) return;
    optionsRef.current = next;
    if (previous.decimals !== decimals || previous.locale !== locale) {
      formattersRef.current = createFormatters(locale, decimals);
    }
    const wrapper = wrapperRef.current;
    if (previous.color !== color && wrapper) paletteRef.current = readPalette(wrapper, color);
    const chart = chartRef.current;
    if (!chart) return;
    if (previous.thresholds !== thresholds) {
      // The value scale includes the thresholds: rescale with the current data.
      const { data } = dataRef.current;
      chart.setData([data.xs, data.ys] as uPlot.AlignedData);
    } else {
      chart.redraw(false, true);
    }
  }, [seriesName, unit, decimals, color, thresholds, locale]);

  return (
    <div ref={wrapperRef} className={cn(chartVariants({ size }), className)} {...props}>
      <div ref={imageRef} role="img" aria-label={label} className="size-full">
        <div ref={plotRef} dir="ltr" className="relative size-full">
          {/* Positioned in the plot's left-to-right frame; its content takes the page direction. */}
          <div
            ref={tooltipRef}
            aria-hidden="true"
            hidden
            className="pointer-events-none absolute start-0 top-0 z-10 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-text shadow-md"
          >
            <div data-tooltip="content" className="flex flex-col gap-0.5 text-start">
              <span data-tooltip="time" className="text-text-muted" />
              <span data-tooltip="value" className="font-medium tabular-nums" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface OptionSources {
  width: number;
  height: number;
  palette: () => Palette;
  formatters: () => Formatters;
  options: () => {
    seriesName: string;
    unit: string | undefined;
    thresholds: readonly ChartThreshold[];
  };
  window: () => ChartWindow | null;
  tooltip: () => HTMLDivElement | null;
  direction: () => string;
}

/** uPlot options whose callbacks read the current props, palette and window on every draw. */
function createOptions(sources: OptionSources): uPlot.Options {
  const { palette, formatters, options } = sources;
  const axisFont = () => palette().font;
  return {
    width: sources.width,
    height: sources.height,
    ms: 1,
    // [top, right, bottom, left]; null keeps uPlot's automatic value. The plot is always LTR.
    padding: [null, CHART.END_PADDING_PX, null, null],
    legend: { show: false },
    cursor: { y: false, drag: { x: false, y: false } },
    select: { show: false, left: 0, top: 0, width: 0, height: 0 },
    scales: {
      x: {
        time: true,
        range: (_chart, dataMin, dataMax) => {
          const window = sources.window();
          return window ? [window.from, window.to] : [dataMin, dataMax];
        },
      },
      y: {
        range: (_chart, dataMin, dataMax) =>
          valueRange(
            dataMin,
            dataMax,
            options().thresholds.map((threshold) => threshold.value),
          ),
      },
    },
    axes: [
      {
        stroke: () => palette().axis,
        font: axisFont(),
        grid: { stroke: () => palette().grid, width: 1 },
        ticks: { stroke: () => palette().grid, width: 1 },
        space: CHART.X_AXIS_SPACE_PX,
        values: (_chart, splits) => {
          const window = sources.window();
          const span = window ? window.to - window.from : 0;
          const format = formatters();
          const formatter =
            span <= CHART.SECONDS_UP_TO_MS
              ? format.seconds
              : span <= CHART.MINUTES_UP_TO_MS
                ? format.minutes
                : format.date;
          return splits.map((split) => formatter.format(split));
        },
      },
      {
        stroke: () => palette().axis,
        font: axisFont(),
        grid: { stroke: () => palette().grid, width: 1 },
        ticks: { show: false },
        space: CHART.Y_AXIS_SPACE_PX,
        values: (_chart, splits) => splits.map((split) => formatters().value.format(split)),
      },
    ],
    series: [
      {},
      {
        label: options().seriesName,
        stroke: () => palette().series,
        width: CHART.LINE_WIDTH_PX,
        spanGaps: false,
      },
    ],
    hooks: {
      draw: [
        (chart) => {
          drawThresholds(chart, options().thresholds, palette());
        },
      ],
      setCursor: [
        (chart) => {
          updateTooltip(chart, sources);
        },
      ],
    },
  };
}

/** The value scale: data and thresholds, padded; a fixed range when there is neither. */
export function valueRange(
  dataMin: number | null,
  dataMax: number | null,
  thresholds: readonly number[],
): [number, number] {
  const values = thresholds.filter((value) => Number.isFinite(value));
  if (dataMin !== null && Number.isFinite(dataMin)) values.push(dataMin);
  if (dataMax !== null && Number.isFinite(dataMax)) values.push(dataMax);
  if (values.length === 0) return [CHART.EMPTY_RANGE[0], CHART.EMPTY_RANGE[1]];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  // A flat line gets a range around it, scaled to the value (or 1 at zero).
  const padding = span > 0 ? span * CHART.RANGE_PADDING : Math.abs(min) * CHART.RANGE_PADDING || 1;
  return [min - padding, max + padding];
}

function drawThresholds(chart: uPlot, thresholds: readonly ChartThreshold[], palette: Palette) {
  if (thresholds.length === 0) return;
  const { ctx, bbox } = chart;
  const ratio = uPlot.pxRatio;
  ctx.save();
  ctx.lineWidth = CHART.THRESHOLD_WIDTH_PX * ratio;
  ctx.setLineDash(CHART.THRESHOLD_DASH_PX.map((length) => length * ratio));
  ctx.font = scaledFont(palette.font, ratio);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  for (const threshold of thresholds) {
    const y = Math.round(chart.valToPos(threshold.value, 'y', true));
    const tone = threshold.tone === 'danger' ? palette.danger : palette.warning;
    ctx.strokeStyle = tone;
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.moveTo(bbox.left, y);
    ctx.lineTo(bbox.left + bbox.width, y);
    ctx.stroke();
    const gap = CHART.THRESHOLD_LABEL_GAP_PX * ratio;
    // At the plot's start: the live edge (the end) is where new data is drawn.
    ctx.fillText(threshold.label, bbox.left + gap, y - gap);
  }
  ctx.restore();
}

/** The canvas is drawn at device pixels: scale the CSS font size by the pixel ratio. */
function scaledFont(font: string, ratio: number): string {
  const match = /^([\d.]+)px (.*)$/.exec(font);
  if (!match) return font;
  return `${String(Number(match[1]) * ratio)}px ${match[2] ?? ''}`;
}

function updateTooltip(chart: uPlot, sources: OptionSources) {
  const tooltip = sources.tooltip();
  if (!tooltip) return;
  const index = chart.cursor.idx;
  const xs = chart.data[0];
  const ys = chart.data[1];
  const value = index === null || index === undefined ? null : ys?.at(index);
  const time = index === null || index === undefined ? undefined : xs.at(index);
  if (value === null || value === undefined || time === undefined) {
    tooltip.hidden = true;
    return;
  }
  const { seriesName, unit } = sources.options();
  const formats = sources.formatters();
  const timeText = tooltip.querySelector('[data-tooltip="time"]');
  const valueText = tooltip.querySelector('[data-tooltip="value"]');
  if (timeText) timeText.textContent = formats.full.format(time);
  if (valueText) {
    const number = formats.value.format(value);
    valueText.textContent = `${seriesName}: ${unit ? `${number} ${unit}` : number}`;
  }
  const direction = sources.direction();
  const content = tooltip.querySelector<HTMLElement>('[data-tooltip="content"]');
  if (content) content.dir = direction;
  tooltip.hidden = false;

  // Plot coordinates (the plot area is left to right) to the tooltip's position.
  const over = chart.over;
  const x = over.offsetLeft + (chart.cursor.left ?? 0);
  const y = over.offsetTop + chart.valToPos(value, 'y');
  const width = tooltip.offsetWidth;
  const room = chart.root.clientWidth;
  const after = x + CHART.TOOLTIP_OFFSET_PX;
  const before = x - CHART.TOOLTIP_OFFSET_PX - width;
  // Reading direction first (right of the cursor in LTR, left in RTL), flipped at the edge.
  const preferAfter = direction !== 'rtl';
  const left = preferAfter
    ? after + width <= room
      ? after
      : before
    : before >= 0
      ? before
      : after;
  const top = Math.max(0, y - tooltip.offsetHeight - CHART.TOOLTIP_OFFSET_PX);
  tooltip.style.transform = `translate(${String(Math.max(0, left))}px, ${String(top)}px)`;
}
