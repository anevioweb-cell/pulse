import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PROTOCOL, SIMULATOR } from '../config';
import { EXAMPLE_TS } from '../model/fixtures';
import { parseTelemetryMessage } from '../model/parse';
import { createSimulatorHost } from './simulator-host';
import { SimulatorTransport } from './simulator-transport';

import type { WorkerLike } from './simulator-transport';

type Listener = (event: { data: unknown }) => void;

/** In-thread stand-in for the module worker: runs the real host, asynchronously like a worker. */
class FakeWorker implements WorkerLike {
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

  emit(type: string, data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

let worker: FakeWorker;

function createTransport() {
  worker = new FakeWorker();
  const transport = new SimulatorTransport({ seed: 1, deviceCount: 4, createWorker: () => worker });
  const frames: string[] = [];
  transport.onMessage((raw) => frames.push(raw));
  const states: string[] = [];
  transport.onStatus((status) => states.push(status.state));
  return { transport, frames, states };
}

beforeEach(() => {
  vi.useFakeTimers({ now: EXAMPLE_TS });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SimulatorTransport', () => {
  it('opens when the worker is ready and delivers raw frames that the shared parser accepts', async () => {
    const { transport, frames, states } = createTransport();
    transport.connect();
    await vi.advanceTimersByTimeAsync(SIMULATOR.TICK_MS * 20);

    expect(states).toEqual(['connecting', 'open']);
    expect(worker.received[0]).toEqual({ type: 'start', seed: 1, deviceCount: 4 });
    expect(frames.length).toBeGreaterThan(4);
    expect(frames.every((frame) => parseTelemetryMessage(frame).ok)).toBe(true);
    expect(transport.getStats().received).toBe(frames.length);
  });

  it('forwards controls and stops the worker on disconnect', async () => {
    const { transport, states } = createTransport();
    transport.connect();
    await vi.advanceTimersByTimeAsync(0);
    transport.setDeviceCount(6);
    transport.setRate(2);
    transport.injectFault({ kind: 'dropout' });
    transport.disconnect();

    expect(worker.received.slice(1)).toEqual([
      { type: 'set_device_count', count: 6 },
      { type: 'set_rate', rateHz: 2 },
      { type: 'inject_fault', fault: { kind: 'dropout' } },
      { type: 'stop' },
    ]);
    expect(worker.terminated).toBe(true);
    expect(states.at(-1)).toBe('closed');
  });

  it('drops oversized frames and rejects malformed worker messages', async () => {
    const { transport, frames } = createTransport();
    transport.connect();
    await vi.advanceTimersByTimeAsync(0);
    const count = frames.length;

    worker.emit('message', { type: 'frames', frames: ['x'.repeat(PROTOCOL.MAX_FRAME_BYTES + 1)] });
    expect(frames).toHaveLength(count);
    expect(transport.getStats().droppedOversized).toBe(1);

    worker.emit('message', { type: 'frames', frames: 'not an array' });
    expect(transport.getStatus()).toMatchObject({
      state: 'closed',
      reason: 'invalid_worker_message',
    });
  });

  it('fails when the worker cannot be created or errors while connecting', () => {
    const broken = new SimulatorTransport({
      createWorker: () => {
        throw new Error('Workers unavailable');
      },
    });
    broken.connect();
    expect(broken.getStatus()).toMatchObject({ state: 'failed', reason: 'worker_unavailable' });

    const { transport } = createTransport();
    transport.connect();
    worker.emit('error');
    expect(transport.getStatus()).toMatchObject({ state: 'failed', reason: 'worker_error' });
  });
});
