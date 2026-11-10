import { createContext, use, useState, useSyncExternalStore } from 'react';

import { RedrawScheduler } from './redraw-scheduler';

import type { RedrawSchedulerOptions } from './redraw-scheduler';
import type { ReactNode } from 'react';

const SchedulerContext = createContext<RedrawScheduler | null>(null);

/**
 * One RedrawScheduler for every chart of a page (ADR 0026). It needs no teardown of its own: each
 * chart removes its target on unmount, and with no targets the scheduler requests no frames and
 * stops listening for visibility changes.
 */
export function ChartSchedulerProvider({
  children,
  options,
}: {
  children: ReactNode;
  /** Injected frames, clock and visibility (tests). */
  options?: RedrawSchedulerOptions;
}) {
  const [scheduler] = useState(() => new RedrawScheduler(options));
  return <SchedulerContext value={scheduler}>{children}</SchedulerContext>;
}

export function useChartScheduler(): RedrawScheduler {
  const scheduler = use(SchedulerContext);
  if (!scheduler) throw new Error('useChartScheduler must be used inside <ChartSchedulerProvider>');
  return scheduler;
}

/** Whether the page's charts are paused; re-renders only on pause and resume. */
export function useChartsPaused(): boolean {
  const scheduler = useChartScheduler();
  return useSyncExternalStore(
    (listener) => scheduler.subscribe(listener),
    () => scheduler.paused,
  );
}
