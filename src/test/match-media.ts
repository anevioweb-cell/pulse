// Test utility: a controllable window.matchMedia (jsdom does not implement it).

import { vi } from 'vitest';

export interface MatchMediaController {
  /** Changes the answer for every query matching `media` and notifies listeners. */
  set: (media: string, matches: boolean) => void;
}

export function installMatchMedia(initial: Record<string, boolean> = {}): MatchMediaController {
  const state = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>();

  const matchMedia = vi.fn((media: string): MediaQueryList => {
    const queryListeners = listeners.get(media) ?? new Set();
    listeners.set(media, queryListeners);
    return {
      media,
      get matches() {
        return state.get(media) ?? false;
      },
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        queryListeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        queryListeners.delete(listener);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });

  vi.stubGlobal('matchMedia', matchMedia);

  return {
    set: (media, matches) => {
      state.set(media, matches);
      for (const listener of listeners.get(media) ?? []) {
        listener({ matches, media } as MediaQueryListEvent);
      }
    },
  };
}
