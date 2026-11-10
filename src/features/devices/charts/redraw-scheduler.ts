import { defaultFrameScheduler } from '@/features/telemetry';
import type { CancelFrame, FrameScheduler, Unsubscribe } from '@/features/telemetry';

import { DEVICE_CHART } from '../config';

/** Something the scheduler redraws: in practice one chart and its ring buffer. */
export interface RedrawTarget {
  /** Changes whenever the drawn data changed (the ring buffer's `version`). */
  version: () => number;
  /** Rebuilds the series for the window ending at `now` and hands it to the chart. */
  draw: (now: number) => void;
}

/** Whether the page is visible, and a way to hear when that changes. */
export interface VisibilitySource {
  isVisible: () => boolean;
  subscribe: (listener: () => void) => Unsubscribe;
}

export const documentVisibility: VisibilitySource = {
  isVisible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
  subscribe: (listener) => {
    if (typeof document === 'undefined') return () => undefined;
    document.addEventListener('visibilitychange', listener);
    return () => {
      document.removeEventListener('visibilitychange', listener);
    };
  },
};

export interface RedrawSchedulerOptions {
  frames?: FrameScheduler;
  visibility?: VisibilitySource;
  clock?: () => number;
  /** The window moves at least this often without new data (DEVICE_CHART.CLOCK_TICK_MS). */
  tickMs?: number;
}

interface Registration {
  readonly target: RedrawTarget;
  version: number;
  tick: number;
}

/**
 * Redraws charts at most once per animation frame, and only when something changed (ADR 0026):
 * a target is drawn when its version moved or the clock passed into a new tick, and only while
 * the view is not paused and the page is visible. One frame request at a time serves every
 * target on the page; with nothing to draw, a frame costs one version comparison per target.
 *
 * Pause freezes the visible window: no draws at all, while the ring buffers keep recording
 * (they are written by the TelemetryService, not by the charts). Resume draws every target at
 * the live edge in the next frame.
 */
export class RedrawScheduler {
  private readonly frames: FrameScheduler;
  private readonly visibility: VisibilitySource;
  private readonly clock: () => number;
  private readonly tickMs: number;
  private readonly registrations = new Set<Registration>();
  private readonly listeners = new Set<() => void>();
  private cancelFrame: CancelFrame | null = null;
  private stopVisibility: Unsubscribe | null = null;
  private isPaused = false;
  private disposed = false;
  /** Frames run and draws made, for tests and diagnostics. */
  readonly stats = { frames: 0, draws: 0 };

  constructor({
    frames = defaultFrameScheduler,
    visibility = documentVisibility,
    clock = () => Date.now(),
    tickMs = DEVICE_CHART.CLOCK_TICK_MS,
  }: RedrawSchedulerOptions = {}) {
    this.frames = frames;
    this.visibility = visibility;
    this.clock = clock;
    this.tickMs = tickMs;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  /** Whether a frame is currently requested (for tests: no frame means no work at all). */
  get scheduled(): boolean {
    return this.cancelFrame !== null;
  }

  /** Adds a target; it is drawn in the next frame. Returns its removal. */
  add(target: RedrawTarget): Unsubscribe {
    const registration: Registration = { target, version: Number.NaN, tick: Number.NaN };
    this.registrations.add(registration);
    this.stopVisibility ??= this.visibility.subscribe(this.onVisibilityChange);
    this.schedule();
    return () => {
      this.registrations.delete(registration);
      if (this.registrations.size === 0) this.idle();
    };
  }

  /** Draws a target in the next frame even if nothing changed (after a resize or theme change). */
  invalidate(target: RedrawTarget): void {
    for (const registration of this.registrations) {
      if (registration.target === target) registration.version = Number.NaN;
    }
    this.schedule();
  }

  pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.unschedule();
    this.notify();
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    for (const registration of this.registrations) registration.version = Number.NaN;
    this.schedule();
    this.notify();
  }

  /** Listeners hear pause and resume (for `useSyncExternalStore`). */
  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.registrations.clear();
    this.listeners.clear();
    this.idle();
  }

  private readonly onVisibilityChange = () => {
    if (this.visibility.isVisible()) this.schedule();
    else this.unschedule();
  };

  private readonly onFrame = () => {
    this.cancelFrame = null;
    if (this.isPaused || this.disposed || !this.visibility.isVisible()) return;
    this.stats.frames += 1;
    const now = this.clock();
    const tick = Math.floor(now / this.tickMs);
    for (const registration of this.registrations) {
      const version = registration.target.version();
      if (version === registration.version && tick === registration.tick) continue;
      registration.version = version;
      registration.tick = tick;
      this.stats.draws += 1;
      registration.target.draw(now);
    }
    this.schedule();
  };

  private schedule(): void {
    if (this.cancelFrame !== null || this.isPaused || this.disposed) return;
    if (this.registrations.size === 0 || !this.visibility.isVisible()) return;
    this.cancelFrame = this.frames.request(this.onFrame);
  }

  private unschedule(): void {
    this.cancelFrame?.();
    this.cancelFrame = null;
  }

  private idle(): void {
    this.unschedule();
    this.stopVisibility?.();
    this.stopVisibility = null;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
