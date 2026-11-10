import { RotateCw } from 'lucide-react';

import type { SensorMetric } from '@/features/telemetry';
import { messages } from '@/shared/i18n';
import { Button } from '@/shared/ui';

import { formatMetric, metricLabel, metricUnit } from '../../model/format';

import type { AlignedSeries } from '../../charts/series-adapter';

/** A copy of the drawn samples, newest first, capped: the chart's arrays are reused per frame. */
export interface TableSnapshot {
  readonly rows: readonly { readonly t: number; readonly value: number }[];
  /** Real samples in the drawn series (gap markers excluded). */
  readonly total: number;
  /** When the copied frame was drawn. */
  readonly at: number;
}

/** Copies the newest `maxRows` real samples of a drawn series (gap markers are not samples). */
export function snapshotOf(series: AlignedSeries, at: number, maxRows: number): TableSnapshot {
  const rows: { t: number; value: number }[] = [];
  let total = 0;
  for (let index = series.xs.length - 1; index >= 0; index -= 1) {
    const value = series.ys.at(index);
    const t = series.xs.at(index);
    if (value === null || value === undefined || t === undefined) continue;
    total += 1;
    if (rows.length < maxRows) rows.push({ t, value });
  }
  return { rows, total, at };
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const countFormat = new Intl.NumberFormat();

/**
 * The accessible alternative to a chart (ADR 0027): the values the chart drew, as a table, newest
 * first. It is a snapshot, so it does not change under a reader; "Refresh" copies the latest frame
 * (while charts are paused, that is the frozen view).
 */
export function ChartDataTable({
  metric,
  snapshot,
  onRefresh,
}: {
  metric: SensorMetric;
  snapshot: TableSnapshot;
  onRefresh: () => void;
}) {
  const text = messages.deviceDetail.table;
  const name = metricLabel(metric);
  const caption = text.caption(name, timeFormat.format(snapshot.at));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <p>
          {snapshot.rows.length < snapshot.total &&
            text.capped(
              countFormat.format(snapshot.rows.length),
              countFormat.format(snapshot.total),
            )}
        </p>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RotateCw aria-hidden="true" />
          {text.refresh}
        </Button>
      </div>
      {/* A scrolling region must be reachable by keyboard to scroll it (WCAG 2.1.1). */}
      <div
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region needs focus to scroll by keyboard
        tabIndex={0}
        role="region"
        aria-label={caption}
        className="max-h-72 overflow-auto rounded-md border border-border"
      >
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-sunken text-text-muted">
            <tr>
              <th scope="col" className="px-3 py-1.5 text-start font-medium">
                {text.time}
              </th>
              <th scope="col" className="px-3 py-1.5 text-end font-medium">
                {text.value(metricUnit(metric))}
              </th>
            </tr>
          </thead>
          <tbody>
            {snapshot.rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-2 text-text-muted">
                  {text.empty}
                </td>
              </tr>
            ) : (
              snapshot.rows.map((row) => (
                <tr key={row.t} className="border-t border-border">
                  <td className="px-3 py-1 tabular-nums">{timeFormat.format(row.t)}</td>
                  <td className="px-3 py-1 text-end tabular-nums">
                    {formatMetric(metric, row.value)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
