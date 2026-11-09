import { PROTOCOL } from '../config';
import { exceedsFrameLimit } from '../model/parse';
import { createListenerSet } from '../transport/listeners';
import { assertTransition } from '../transport/state-machine';
import { emptyStats } from '../transport/types';
import { simulatorEventSchema } from './control';

import type { ConnectionStatus } from '../model/connection';
import type { Unsubscribe } from '../transport/listeners';
import type { TelemetryTransport, TransportStats } from '../transport/types';
import type { SimulatorControl } from './control';
import type { SimulatorFault } from './simulation-engine';

/** The subset of the DOM Worker API this transport uses. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: () => void): void;
}

export interface SimulatorTransportOptions {
  seed?: number;
  deviceCount?: number;
  rateHz?: number;
  /** Creates the worker. Defaults to the bundled simulator module worker. */
  createWorker?: () => WorkerLike;
}

const createSimulatorWorker = (): WorkerLike =>
  new Worker(new URL('./simulator.worker.ts', import.meta.url), {
    type: 'module',
    name: 'simulator',
  });

/**
 * Demo Mode transport: runs the SimulationEngine in a Web Worker and delivers its frames as raw
 * strings, exactly like WebSocketTransport, so the same parser validates both (ADR 0010).
 */
export class SimulatorTransport implements TelemetryTransport {
  private readonly options: SimulatorTransportOptions;
  private readonly messageListeners = createListenerSet<string>();
  private readonly statusListeners = createListenerSet<ConnectionStatus>();
  private status: ConnectionStatus = { state: 'idle', attempt: 0 };
  private stats: TransportStats = emptyStats();
  private worker: WorkerLike | null = null;

  constructor(options: SimulatorTransportOptions = {}) {
    this.options = options;
  }

  connect(): void {
    const { state } = this.status;
    if (state === 'connecting' || state === 'open') return;
    this.setStatus({ state: 'connecting', attempt: 0 });

    let worker: WorkerLike;
    try {
      worker = (this.options.createWorker ?? createSimulatorWorker)();
    } catch {
      this.setStatus({ state: 'failed', attempt: 0, reason: 'worker_unavailable' });
      return;
    }
    this.worker = worker;
    worker.addEventListener('message', (event) => {
      if (this.worker === worker) this.handleEvent(event.data);
    });
    worker.addEventListener('error', () => {
      if (this.worker === worker) this.fail('worker_error');
    });
    this.control({
      type: 'start',
      ...(this.options.seed === undefined ? {} : { seed: this.options.seed }),
      ...(this.options.deviceCount === undefined ? {} : { deviceCount: this.options.deviceCount }),
      ...(this.options.rateHz === undefined ? {} : { rateHz: this.options.rateHz }),
    });
  }

  disconnect(): void {
    const { state } = this.status;
    if (state !== 'connecting' && state !== 'open') return;
    this.stopWorker();
    this.setStatus({ state: 'closed', attempt: 0, reason: 'disconnected' });
  }

  setDeviceCount(count: number): void {
    this.control({ type: 'set_device_count', count });
  }

  setRate(rateHz: number): void {
    this.control({ type: 'set_rate', rateHz });
  }

  injectFault(fault: SimulatorFault): void {
    this.control({ type: 'inject_fault', fault });
  }

  onMessage(listener: (raw: string) => void): Unsubscribe {
    return this.messageListeners.add(listener);
  }

  onStatus(listener: (status: ConnectionStatus) => void): Unsubscribe {
    return this.statusListeners.add(listener);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getStats(): TransportStats {
    return { ...this.stats };
  }

  private control(message: SimulatorControl): void {
    this.worker?.postMessage(message);
  }

  private handleEvent(data: unknown): void {
    const parsed = simulatorEventSchema.safeParse(data);
    if (!parsed.success) {
      this.fail('invalid_worker_message');
      return;
    }
    const event = parsed.data;
    switch (event.type) {
      case 'ready':
        if (this.status.state === 'connecting') this.setStatus({ state: 'open', attempt: 0 });
        return;
      case 'frames':
        for (const frame of event.frames) {
          if (exceedsFrameLimit(frame, PROTOCOL.MAX_FRAME_BYTES)) {
            this.stats.droppedOversized += 1;
            continue;
          }
          this.stats.received += 1;
          this.messageListeners.emit(frame);
        }
        return;
      case 'error':
        // Control errors (bad parameters) do not stop the stream.
        return;
    }
  }

  private fail(reason: string): void {
    this.stopWorker();
    const next = this.status.state === 'open' ? 'closed' : 'failed';
    this.setStatus({ state: next, attempt: 0, reason });
  }

  private stopWorker(): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.postMessage({ type: 'stop' } satisfies SimulatorControl);
      worker.terminate();
    }
  }

  private setStatus(next: ConnectionStatus): void {
    assertTransition(this.status.state, next.state);
    this.status = next;
    this.statusListeners.emit(next);
  }
}
