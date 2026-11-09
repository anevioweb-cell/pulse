import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { EXAMPLE_TS, exampleDeviceOnline, exampleReading } from '../model/fixtures';
import { encodeMessage } from '../model/protocol';
import { TelemetryService } from '../service/telemetry-service';
import { FakeTransport, ManualClock, ManualFrames } from '../testing/fakes';
import { createTelemetryHooks } from './selectors';
import { createTelemetryStore } from './telemetry-store';

import type { TelemetryHooks } from './selectors';

let hooks: TelemetryHooks;
let frames: ManualFrames;
const renders = new Map<string, number>();

const count = (name: string) => {
  renders.set(name, (renders.get(name) ?? 0) + 1);
};

/** Throwaway subscribers with render counters (test-only, not app UI). */
function DeviceProbe({ id }: { id: string }) {
  const device = hooks.useDevice(id);
  count(id);
  return <p>{`${id}:${String(device?.latest?.temperature ?? '-')}`}</p>;
}

function IdsProbe() {
  const ids = hooks.useDeviceIds();
  count('ids');
  return <p>{ids.join(',')}</p>;
}

function SummaryProbe() {
  const summary = hooks.useStatusSummary();
  count('summary');
  return <p>{`online:${String(summary.online)}`}</p>;
}

function transport(): FakeTransport {
  const instance = FakeTransport.instances.at(-1);
  if (!instance) throw new Error('No transport');
  return instance;
}

const announce = (id: string) =>
  encodeMessage({ ...exampleDeviceOnline, device: { ...exampleDeviceOnline.device, id } });
const reading = (id: string, ts: number, temperature: number) =>
  encodeMessage({
    ...exampleReading,
    deviceId: id,
    ts,
    values: { ...exampleReading.values, temperature },
  });

beforeEach(() => {
  FakeTransport.instances = [];
  renders.clear();
  const store = createTelemetryStore();
  hooks = createTelemetryHooks(store);
  frames = new ManualFrames();
  const service = new TelemetryService({
    store,
    frames,
    scheduler: new ManualClock(EXAMPLE_TS),
    createDemoTransport: (options) => new FakeTransport('demo', options),
  });
  service.start({ mode: 'demo' });
  transport().emit(announce('a'));
  transport().emit(announce('b'));
  frames.runFrame();
});

describe('selectors and re-renders', () => {
  it('an update to device A does not re-render a subscriber to device B', () => {
    render(
      <>
        <DeviceProbe id="a" />
        <DeviceProbe id="b" />
        <IdsProbe />
        <SummaryProbe />
      </>,
    );
    const initial = new Map(renders);

    act(() => {
      transport().emit(reading('a', EXAMPLE_TS + 1, 30));
      transport().emit(reading('a', EXAMPLE_TS + 2, 31));
      frames.runFrame();
    });

    expect(screen.getByText('a:31')).toBeInTheDocument();
    expect(renders.get('a')).toBe((initial.get('a') ?? 0) + 1); // one publish, one render
    expect(renders.get('b')).toBe(initial.get('b'));
    expect(renders.get('ids')).toBe(initial.get('ids')); // membership unchanged
    expect(renders.get('summary')).toBe(initial.get('summary')); // counts unchanged (shallow)
  });

  it('re-renders the id list and summary only when membership or counts change', () => {
    render(
      <>
        <IdsProbe />
        <SummaryProbe />
      </>,
    );
    const initial = new Map(renders);
    act(() => {
      transport().emit(announce('c'));
      frames.runFrame();
    });
    expect(screen.getByText('a,b,c')).toBeInTheDocument();
    expect(screen.getByText('online:3')).toBeInTheDocument();
    expect(renders.get('ids')).toBe((initial.get('ids') ?? 0) + 1);
    expect(renders.get('summary')).toBe((initial.get('summary') ?? 0) + 1);
  });
});
