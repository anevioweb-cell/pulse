import { STORE } from '../config';

/** Cancels a scheduled frame callback. Safe to call after it ran. */
export type CancelFrame = () => void;

/**
 * Schedules work for the next rendering frame. Injected so tests drive frames by hand and Node
 * (server tests, benchmarks) can run without requestAnimationFrame.
 */
export interface FrameScheduler {
  request: (callback: () => void) => CancelFrame;
}

/**
 * requestAnimationFrame in browsers (it pauses while the tab is hidden; see ADR 0014), a
 * ~60 Hz timer elsewhere.
 */
export const defaultFrameScheduler: FrameScheduler =
  typeof globalThis.requestAnimationFrame === 'function'
    ? {
        request: (callback) => {
          const handle = globalThis.requestAnimationFrame(() => {
            callback();
          });
          return () => {
            globalThis.cancelAnimationFrame(handle);
          };
        },
      }
    : {
        request: (callback) => {
          const handle = globalThis.setTimeout(callback, STORE.FALLBACK_FRAME_MS);
          return () => {
            globalThis.clearTimeout(handle);
          };
        },
      };
