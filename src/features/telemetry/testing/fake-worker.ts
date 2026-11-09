// In-thread stand-in for the simulator module worker (jsdom cannot run workers): it runs the real
// simulator host and delivers its events asynchronously, like a worker would.
import { createSimulatorHost } from '../simulator/simulator-host';

import type { WorkerLike } from '../simulator/simulator-transport';

type Listener = (event: { data: unknown }) => void;

export class FakeWorker implements WorkerLike {
  readonly received: unknown[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Listener[]>();
  private readonly host = createSimulatorHost({
    post: (event) => {
      queueMicrotask(() => {
        this.emit('message', event);
      });
    },
    now: () => Date.now(),
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (handle) => {
      clearInterval(handle);
    },
  });

  addEventListener(type: 'message', listener: Listener): void;
  addEventListener(type: 'error', listener: () => void): void;
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(message: unknown): void {
    this.received.push(message);
    if (!this.terminated) this.host.handle(message);
  }

  terminate(): void {
    this.terminated = true;
    this.host.handle({ type: 'stop' });
  }

  get running(): boolean {
    return this.host.running;
  }

  emit(type: string, data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}
