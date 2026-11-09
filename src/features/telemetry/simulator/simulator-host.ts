import { SIMULATOR } from '../config';
import { encodeMessage } from '../model/protocol';
import { simulatorControlSchema } from './control';
import { SimulationEngine } from './simulation-engine';

import type { TelemetryMessage } from '../model/protocol';
import type { SimulatorEvent } from './control';

export interface SimulatorHostEnvironment {
  post: (event: SimulatorEvent) => void;
  now: () => number;
  setInterval: (callback: () => void, ms: number) => ReturnType<typeof globalThis.setInterval>;
  clearInterval: (handle: ReturnType<typeof globalThis.setInterval>) => void;
}

/**
 * Everything the simulator worker does, minus the worker itself (jsdom cannot run workers):
 * validates control messages, drives a SimulationEngine on a fixed tick and posts encoded frames.
 */
export function createSimulatorHost(environment: SimulatorHostEnvironment) {
  let engine: SimulationEngine | null = null;
  let ticker: ReturnType<typeof globalThis.setInterval> | null = null;

  const flush = (messages: TelemetryMessage[]) => {
    if (messages.length > 0)
      environment.post({ type: 'frames', frames: messages.map(encodeMessage) });
  };

  const stop = () => {
    if (ticker !== null) environment.clearInterval(ticker);
    ticker = null;
    engine = null;
  };

  return {
    handle(data: unknown): void {
      const parsed = simulatorControlSchema.safeParse(data);
      if (!parsed.success) {
        environment.post({ type: 'error', reason: 'invalid_control' });
        return;
      }
      const control = parsed.data;
      if (control.type === 'start') {
        stop();
        const started = new SimulationEngine({
          startTime: environment.now(),
          ...(control.seed === undefined ? {} : { seed: control.seed }),
          ...(control.deviceCount === undefined ? {} : { deviceCount: control.deviceCount }),
          ...(control.rateHz === undefined ? {} : { rateHz: control.rateHz }),
        });
        engine = started;
        environment.post({ type: 'ready' });
        flush(started.announce());
        ticker = environment.setInterval(() => {
          flush(started.advance(environment.now()));
        }, SIMULATOR.TICK_MS);
        return;
      }
      if (control.type === 'stop') {
        stop();
        return;
      }
      if (!engine) {
        environment.post({ type: 'error', reason: 'not_started' });
        return;
      }
      switch (control.type) {
        case 'set_device_count':
          flush(engine.setDeviceCount(control.count));
          return;
        case 'set_rate':
          engine.setRate(control.rateHz);
          return;
        case 'inject_fault':
          flush(engine.injectFault(control.fault));
          return;
      }
    },
    /** For tests: whether an engine is running. */
    get running(): boolean {
      return engine !== null;
    },
  };
}
