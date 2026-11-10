import type { AlertRule, SensorMetric } from '@/features/telemetry';
import { messages } from '@/shared/i18n';
import type { ChartThreshold } from '@/shared/ui/TimeSeriesChart';

import { formatMetric, metricUnit } from '../model/format';

/**
 * Threshold lines for one device's chart of one metric, from the alert rules (read only; rules are
 * edited in Phase 5C). A rule applies when it is enabled, is about this metric, and targets this
 * device or every device (`deviceId: null`). Rules for another device or metric never appear.
 */
export function thresholdsFor(
  rules: readonly AlertRule[] | undefined,
  deviceId: string,
  metric: SensorMetric,
  locale?: string,
): ChartThreshold[] {
  if (!rules) return [];
  const unit = metricUnit(metric);
  const text = messages.deviceDetail.threshold;
  return rules
    .filter(
      (rule) =>
        rule.enabled &&
        rule.metric === metric &&
        (rule.deviceId === null || rule.deviceId === deviceId),
    )
    .map((rule) => {
      const value = formatMetric(metric, rule.threshold, locale);
      return {
        value: rule.threshold,
        label: rule.comparator === 'above' ? text.above(value, unit) : text.below(value, unit),
        tone: 'danger' as const,
      };
    });
}
