import { describe, expect, it, vi } from 'vitest';

import type { FrameScheduler } from '@/features/telemetry';

import { RedrawScheduler } from './redraw-scheduler';

import type { RedrawTarget, VisibilitySource } from './redraw-scheduler';

/** Frames run only when the test says so. */
function fakeFrames() {
  let pending: (() => void) | null = null;
  let requests = 0;
  const frames: FrameScheduler = {
    request: (callback) => {
      requests += 1;
      pending = callback;
      return () => {
        if (pending === callback) pending = null;
      };
    },
  };
  return {
    frames,
    get pending() {
      return pending !== null;
    },
    get requests() {
      return requests;
    },
    run(count = 1) {
      for (let index = 0; index < count; index += 1) {
        const callback = pending;
        pending = null;
        callback?.();
      }
    },
  };
}

function fakeVisibility(initial = true) {
  let visible = initial;
  const listeners = new Set<() => void>();
  const source: VisibilitySource = {
    isVisible: () => visible,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    listeners,
    set(value: boolean) {
      visible = value;
      for (const listener of listeners) listener();
    },
  };
}

/** A target over a fake buffer whose version the test bumps, like ring-buffer pushes. */
function target() {
  let version = 0;
  const draw = vi.fn<(now: number) => void>();
  const value: RedrawTarget = { version: () => version, draw };
  return {
    value,
    draw,
    push(samples = 1) {
      version += samples;
    },
  };
}

const TICK = 1000;

function setup(visible = true) {
  const frames = fakeFrames();
  const visibility = fakeVisibility(visible);
  let now = 10 * TICK;
  const scheduler = new RedrawScheduler({
    frames: frames.frames,
    visibility: visibility.source,
    clock: () => now,
    tickMs: TICK,
  });
  return {
    frames,
    visibility,
    scheduler,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('RedrawScheduler', () => {
  it('draws a new target once, then only when its version changes', () => {
    const { frames, scheduler } = setup();
    const chart = target();
    scheduler.add(chart.value);
    frames.run();
    expect(chart.draw).toHaveBeenCalledTimes(1);

    frames.run(10);
    expect(chart.draw).toHaveBeenCalledTimes(1);
    expect(scheduler.stats.frames).toBe(11);
  });

  it('turns many samples between two frames into one redraw', () => {
    const { frames, scheduler } = setup();
    const chart = target();
    scheduler.add(chart.value);
    frames.run();
    chart.push(500);
    frames.run();
    expect(chart.draw).toHaveBeenCalledTimes(2);
  });

  it('serves every target with one frame request, and draws only the changed one', () => {
    const { frames, scheduler } = setup();
    const charts = [target(), target(), target(), target(), target()];
    for (const chart of charts) scheduler.add(chart.value);
    expect(frames.requests).toBe(1);
    frames.run();
    charts[2]?.push();
    frames.run();
    expect(charts.map((chart) => chart.draw.mock.calls.length)).toEqual([1, 1, 2, 1, 1]);
  });

  it('moves the window once per clock tick without new data (a silent device)', () => {
    const { frames, scheduler, advance } = setup();
    const chart = target();
    scheduler.add(chart.value);
    frames.run();
    advance(TICK / 2);
    frames.run();
    expect(chart.draw).toHaveBeenCalledTimes(1);
    advance(TICK / 2);
    frames.run();
    expect(chart.draw).toHaveBeenCalledTimes(2);
  });

  it('does no work while hidden, and catches up with one draw when visible again', () => {
    const { frames, scheduler, visibility, advance } = setup();
    const chart = target();
    scheduler.add(chart.value);
    frames.run();
    visibility.set(false);
    expect(frames.pending).toBe(false);
    chart.push(1000);
    advance(60 * TICK);
    frames.run(5);
    expect(chart.draw).toHaveBeenCalledTimes(1);

    visibility.set(true);
    frames.run();
    expect(chart.draw).toHaveBeenCalledTimes(2);
  });

  it('does not start drawing while the page starts hidden', () => {
    const { frames, scheduler } = setup(false);
    const chart = target();
    scheduler.add(chart.value);
    expect(frames.pending).toBe(false);
    expect(chart.draw).not.toHaveBeenCalled();
  });

  it('freezes on pause while data keeps arriving, and redraws at the live edge on resume', () => {
    const { frames, scheduler, advance } = setup();
    const listener = vi.fn();
    scheduler.subscribe(listener);
    const chart = target();
    scheduler.add(chart.value);
    frames.run();

    scheduler.pause();
    expect(scheduler.paused).toBe(true);
    expect(frames.pending).toBe(false);
    chart.push(30);
    advance(30 * TICK);
    frames.run(3);
    expect(chart.draw).toHaveBeenCalledTimes(1);

    scheduler.resume();
    frames.run();
    expect(chart.draw).toHaveBeenCalledTimes(2);
    expect(chart.draw).toHaveBeenLastCalledWith(40 * TICK);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('redraws an unchanged target when invalidated (resize, theme)', () => {
    const { frames, scheduler } = setup();
    const chart = target();
    scheduler.add(chart.value);
    frames.run();
    scheduler.invalidate(chart.value);
    frames.run();
    expect(chart.draw).toHaveBeenCalledTimes(2);
  });

  it('stops requesting frames and listening when the last target leaves, and on dispose', () => {
    const { frames, scheduler, visibility } = setup();
    const remove = scheduler.add(target().value);
    expect(visibility.listeners.size).toBe(1);
    remove();
    expect(frames.pending).toBe(false);
    expect(visibility.listeners.size).toBe(0);

    scheduler.add(target().value);
    scheduler.dispose();
    expect(frames.pending).toBe(false);
    expect(scheduler.scheduled).toBe(false);
    expect(visibility.listeners.size).toBe(0);
  });
});
