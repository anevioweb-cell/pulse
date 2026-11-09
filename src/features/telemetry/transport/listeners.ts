/** Removes a listener. Calling it more than once is harmless. */
export type Unsubscribe = () => void;

/** Minimal synchronous listener set: no event library, no string event names. */
export interface ListenerSet<T> {
  add: (listener: (value: T) => void) => Unsubscribe;
  emit: (value: T) => void;
  clear: () => void;
  readonly size: number;
}

export function createListenerSet<T>(): ListenerSet<T> {
  const listeners = new Set<(value: T) => void>();
  return {
    add(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(value) {
      // Copy so listeners can unsubscribe while being notified.
      for (const listener of [...listeners]) listener(value);
    },
    clear() {
      listeners.clear();
    },
    get size() {
      return listeners.size;
    },
  };
}
