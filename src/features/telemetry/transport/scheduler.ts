export type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

/** Clock and timers, injectable so tests control time deterministically. */
export interface Scheduler {
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
}

export const systemScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle);
  },
};
