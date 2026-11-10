import { Maximize2, Minimize2, Table2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useLiveDeviceSeries } from '@/features/telemetry';
import type { AlertRule, SensorMetric } from '@/features/telemetry';
import { messages } from '@/shared/i18n';
import { Button, IconButton } from '@/shared/ui';
import { TimeSeriesChart } from '@/shared/ui/TimeSeriesChart';
import type { ChartWindow, TimeSeriesChartHandle } from '@/shared/ui/TimeSeriesChart';

import { chartSourceOf, windowAt } from '../../charts/chart-range';
import { useChartScheduler } from '../../charts/scheduler-context';
import { SeriesAdapter } from '../../charts/series-adapter';
import { thresholdsFor } from '../../charts/thresholds';
import { useChartHistory } from '../../charts/use-history';
import { DEVICE_CHART, DEVICE_DISPLAY } from '../../config';
import { formatMetric, metricLabel, metricUnit, rangeName } from '../../model/format';
import { ChartDataTable, snapshotOf } from './ChartDataTable';

import type { ChartRange } from '../../charts/chart-range';
import type { RedrawTarget } from '../../charts/redraw-scheduler';
import type { AlignedSeries, HistorySamples } from '../../charts/series-adapter';
import type { TableSnapshot } from './ChartDataTable';

export interface DeviceChartProps {
  deviceId: string;
  metric: SensorMetric;
  range: ChartRange;
  rules: readonly AlertRule[] | undefined;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Injected clock for history requests (tests). */
  clock?: () => number;
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function summaryOf(metric: SensorMetric, range: ChartRange, series: AlignedSeries): string {
  const text = messages.deviceDetail;
  const name = metricLabel(metric);
  const spokenRange = rangeName(range);
  const { stats } = series;
  if (stats.count === 0) return text.summaryEmpty(name, spokenRange);
  return text.summary(
    name,
    spokenRange,
    formatMetric(metric, stats.latest),
    formatMetric(metric, stats.min),
    formatMetric(metric, stats.max),
    metricUnit(metric),
  );
}

/**
 * One metric's chart card. Data never renders React here: the page's RedrawScheduler calls `draw`
 * when the ring buffer changed, which builds the series and hands it to the chart, then updates
 * the summary label and the notes by hand. This component renders only when its props change, when
 * the device first appears, when a history response arrives, and when the table opens.
 */
export function DeviceChart({
  deviceId,
  metric,
  range,
  rules,
  expanded,
  onToggleExpanded,
  clock,
}: DeviceChartProps) {
  const scheduler = useChartScheduler();
  const series = useLiveDeviceSeries(deviceId);
  const history = useChartHistory(range, deviceId, metric, clock);
  const chartRef = useRef<TimeSeriesChartHandle>(null);
  const emptyRef = useRef<HTMLParagraphElement>(null);
  const sinceRef = useRef<HTMLParagraphElement>(null);
  const [adapter] = useState(() => new SeriesAdapter());
  const lastDrawRef = useRef<{ series: AlignedSeries; window: ChartWindow; at: number } | null>(
    null,
  );
  const [table, setTable] = useState<TableSnapshot | null>(null);
  const headingId = useId();
  const tableId = useId();
  const name = metricLabel(metric);
  const unit = metricUnit(metric);
  const thresholds = useMemo(
    () => thresholdsFor(rules, deviceId, metric),
    [rules, deviceId, metric],
  );

  const historySamples = useMemo<HistorySamples | null>(
    () =>
      history && {
        timestamps: history.timestamps,
        values: history.values,
        intervalMs: history.resolution.sampleIntervalMs * history.resolution.bucketSize,
      },
    [history],
  );

  // The drawing target: reads the buffer and history through refs, so it is registered once per
  // device, metric and range, and history updates only invalidate it.
  const historyRef = useRef(historySamples);
  const target = useMemo<RedrawTarget>(() => {
    const buffer = series?.get(metric) ?? null;
    return {
      version: () => buffer?.version ?? 0,
      draw: (now) => {
        const window = windowAt(range, now);
        const built = adapter.build(window, buffer, historyRef.current);
        chartRef.current?.setData(built, window);
        chartRef.current?.setLabel(summaryOf(metric, range, built));
        lastDrawRef.current = { series: built, window, at: now };
        if (emptyRef.current) emptyRef.current.hidden = built.stats.count > 0;
        const since = sinceRef.current;
        if (since) {
          const oldest = buffer?.oldestTimestamp;
          const partial =
            chartSourceOf(range) === 'buffer' && oldest !== undefined && oldest > window.from;
          since.hidden = !partial;
          if (partial) {
            const text = messages.deviceDetail.recordedSince(timeFormat.format(oldest));
            if (since.textContent !== text) since.textContent = text;
          }
        }
      },
    };
  }, [series, metric, range, adapter]);

  useEffect(() => scheduler.add(target), [scheduler, target]);
  useEffect(() => {
    historyRef.current = historySamples;
    scheduler.invalidate(target);
  }, [historySamples, scheduler, target]);

  const openTable = () => {
    const last = lastDrawRef.current;
    setTable(
      last ? snapshotOf(last.series, last.window.from, last.at, DEVICE_CHART.TABLE_MAX_ROWS) : null,
    );
  };

  const decimals = DEVICE_DISPLAY.DECIMALS.get(metric) ?? 0;
  const text = messages.deviceDetail;

  return (
    <section
      aria-labelledby={headingId}
      className={
        expanded
          ? 'flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm md:col-span-2'
          : 'flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="text-base font-semibold">
          {name} <span className="font-normal text-text-muted">({unit})</span>
        </h3>
        <IconButton
          variant="ghost"
          size="sm"
          label={expanded ? text.collapse(name) : text.expand(name)}
          aria-pressed={expanded}
          onClick={onToggleExpanded}
        >
          {expanded ? <Minimize2 /> : <Maximize2 />}
        </IconButton>
      </div>
      <div className="relative">
        <TimeSeriesChart
          ref={chartRef}
          label={text.summaryEmpty(name, rangeName(range))}
          seriesName={name}
          unit={unit}
          decimals={decimals}
          color={DEVICE_CHART.METRIC_COLORS.get(metric) ?? 1}
          thresholds={thresholds}
          size={expanded ? 'lg' : 'sm'}
        />
        <p
          ref={emptyRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-text-muted"
        >
          {text.noData}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        {chartSourceOf(range) === 'history' ? (
          <p>{text.historySource}</p>
        ) : (
          <p ref={sinceRef} hidden />
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={table !== null}
          aria-controls={tableId}
          onClick={() => {
            if (table) setTable(null);
            else openTable();
          }}
        >
          <Table2 aria-hidden="true" />
          {table ? text.table.hide : text.table.show}
        </Button>
      </div>
      <div id={tableId}>
        {table && <ChartDataTable metric={metric} snapshot={table} onRefresh={openTable} />}
      </div>
    </section>
  );
}
