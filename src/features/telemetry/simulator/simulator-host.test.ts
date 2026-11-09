import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SIMULATOR } from '../config';
import { EXAMPLE_TS } from '../model/fixtures';
import { parseTelemetryMessage } from '../model/parse';
import { createSimulatorHost } from './simulator-host';

import type { SimulatorEvent } from './control';

function setup() {
  const events: SimulatorEvent[] = [];
  const host = createSimulatorHost({
    post: (event) => events.push(event),
    now: () => Date.now(),
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (handle) => {
      clearInterval(handle);
    },
  });
  const frames = () => events.flatMap((event) => (event.type === 'frames' ? event.frames : []));
  return { host, events, frames };
}

beforeEach(() => {
  vi.useFakeTimers({ now: EXAMPLE_TS });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('simulator worker host', () => {
  it('starts, announces devices, then streams valid frames every tick', () => {
    const { host, events, frames } = setup();
    host.handle({ type: 'start', seed: 1, deviceCount: 3, rateHz: 2 });

    expect(events[0]).toEqual({ type: 'ready' });
    expect(frames()).toHaveLength(3);
    vi.advanceTimersByTime(SIMULATOR.TICK_MS * 10);

    const parsed = frames().map((frame) => parseTelemetryMessage(frame));
    expect(parsed.every((result) => result.ok)).toBe(true);
    expect(parsed.filter((result) => result.ok && result.message.type === 'reading')).toHaveLength(
      6,
    );
  });

  it('applies runtime controls', () => {
    const { host, frames } = setup();
    host.handle({ type: 'start', deviceCount: 2 });
    host.handle({ type: 'set_device_count', count: 4 });
    host.handle({ type: 'set_rate', rateHz: SIMULATOR.MAX_RATE_HZ });
    host.handle({ type: 'inject_fault', fault: { kind: 'spike', deviceId: 'esp32-01' } });
    expect(frames().filter((frame) => frame.includes('device_online'))).toHaveLength(4);
  });

  it.each([
    ['not an object', 'start'],
    ['unknown type', { type: 'explode' }],
    ['extra keys', { type: 'stop', now: true }],
    ['too many devices', { type: 'set_device_count', count: SIMULATOR.MAX_DEVICE_COUNT + 1 }],
    ['rate out of range', { type: 'set_rate', rateHz: 0 }],
    ['unknown fault', { type: 'inject_fault', fault: { kind: 'fire' } }],
    [
      'hostile device id',
      { type: 'inject_fault', fault: { kind: 'spike', deviceId: '__proto__' } },
    ],
  ])('rejects invalid control messages: %s', (_name, message) => {
    const { host, events } = setup();
    host.handle(message);
    expect(events).toEqual([{ type: 'error', reason: 'invalid_control' }]);
    expect(host.running).toBe(false);
  });

  it('reports controls sent before start and stops cleanly', () => {
    const { host, events, frames } = setup();
    host.handle({ type: 'set_rate', rateHz: 2 });
    expect(events).toEqual([{ type: 'error', reason: 'not_started' }]);

    host.handle({ type: 'start' });
    host.handle({ type: 'stop' });
    const count = frames().length;
    vi.advanceTimersByTime(SIMULATOR.TICK_MS * 50);
    expect(frames()).toHaveLength(count);
    expect(host.running).toBe(false);
  });
});
