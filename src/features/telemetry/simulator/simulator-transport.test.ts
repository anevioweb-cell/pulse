import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PROTOCOL, SIMULATOR } from '../config';
import { EXAMPLE_TS } from '../model/fixtures';
import { parseTelemetryMessage } from '../model/parse';
import { FakeWorker } from '../testing/fake-worker';
import { SimulatorTransport } from './simulator-transport';

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
