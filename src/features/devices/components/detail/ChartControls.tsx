import { Pause, Play } from 'lucide-react';
import { useId } from 'react';

import { messages } from '@/shared/i18n';
import { Button } from '@/shared/ui';

import { CHART_RANGES } from '../../charts/chart-range';
import { useChartScheduler, useChartsPaused } from '../../charts/scheduler-context';
import { rangeLabel } from '../../model/format';

import type { ChartRange } from '../../charts/chart-range';

/**
 * Range choice as native radio buttons (arrow keys move and select, the group has a legend), styled
 * as a segmented control, and the pause control. Only this component re-renders on pause.
 */
export function ChartControls({
  range,
  onRangeChange,
}: {
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}) {
  const scheduler = useChartScheduler();
  const paused = useChartsPaused();
  const name = useId();
  const text = messages.deviceDetail;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="float-start me-2 text-sm text-text-muted">{text.rangeLabel}</legend>
        <div className="inline-flex rounded-lg border border-border bg-surface-sunken p-0.5">
          {CHART_RANGES.map((option) => (
            <label
              key={option}
              className="cursor-pointer rounded-md px-3 py-1 text-sm text-text-muted has-checked:bg-surface-raised has-checked:font-medium has-checked:text-text has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring"
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={range === option}
                onChange={() => {
                  onRangeChange(option);
                }}
                className="sr-only"
              />
              {rangeLabel(option)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        {paused && <p className="text-sm text-text-muted">{text.paused}</p>}
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={paused}
          onClick={() => {
            if (paused) scheduler.resume();
            else scheduler.pause();
          }}
        >
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          {paused ? text.resume : text.pause}
        </Button>
      </div>
    </div>
  );
}
