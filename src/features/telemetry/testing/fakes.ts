// Test doubles for the telemetry feature. Not exported from the feature's index.
import { createListenerSet } from '../transport/listeners';
import { emptyStats } from '../transport/types';

import type { ConnectionStatus } from '../model/connection';
import type { FrameScheduler } from '../service/frame-scheduler';
import type { Unsubscribe } from '../transport/listeners';
import type { Scheduler, TimerHandle } from '../transport/scheduler';
import type { TelemetryTransport, TransportStats } from '../transport/types';

/** Frame scheduler whose frames run only when the test says so (a "hidden tab" never runs them). */
export class ManualFrames implements FrameScheduler {
  private readonly pending = new Set<() => void>();
  requested = 0;

  request = (callback: () => void) => {
    this.requested += 1;
    this.pending.add(callback);
    return () => {
      this.pending.delete(callback);
    };
  };

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Runs every callback pending at this moment (callbacks requested during the frame wait). */
  runFrame(): void {
    const callbacks = [...this.pending];
    this.pending.clear();
    for (const callback of callbacks) callback();
  }
}

/** Clock with manually advanced time and inspectable timers. */
export class ManualClock implements Scheduler {
  private time: number;
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  constructor(start: number) {
    this.time = start;
  }

  now = () => this.time;

  setTimeout = (callback: () => void, ms: number): TimerHandle => {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, { at: this.time + ms, callback });
    return id as unknown as TimerHandle;
  };

  clearTimeout = (handle: TimerHandle) => {
    this.timers.delete(handle as unknown as number);
  };

  get activeTimers(): number {
    return this.timers.size;
  }

  /** Moves time forward, running due timers in order (including timers they schedule). */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      let nextId: number | null = null;
      let nextAt = Number.POSITIVE_INFINITY;
      for (const [id, timer] of this.timers) {
        if (timer.at <= target && timer.at < nextAt) {
          nextAt = timer.at;
          nextId = id;
        }
      }
      if (nextId === null) break;
      const timer = this.timers.get(nextId);
      this.timers.delete(nextId);
      this.time = nextAt;
      timer?.callback();
    }
    this.time = target;
  }
}

/** Transport double that counts listeners and lifecycle calls, to prove nothing leaks. */
export class FakeTransport implements TelemetryTransport {
  static instances: FakeTransport[] = [];
  private readonly messages = createListenerSet<string>();
  private readonly statuses = createListenerSet<ConnectionStatus>();
  status: ConnectionStatus = { state: 'idle', attempt: 0 };
  stats: TransportStats = emptyStats();
  connects = 0;
  disconnects = 0;
  readonly kind: 'demo' | 'live';
  readonly options: unknown;

  constructor(kind: 'demo' | 'live', options: unknown) {
    this.kind = kind;
    this.options = options;
    FakeTransport.instances.push(this);
  }

  get listenerCount(): number {
    return this.messages.size + this.statuses.size;
  }

  connect(): void {
    this.connects += 1;
    this.setStatus({ state: 'connecting', attempt: 0 });
  }

  disconnect(): void {
    this.disconnects += 1;
    this.setStatus({ state: 'closed', attempt: 0, reason: 'disconnected' });
  }

  onMessage(listener: (raw: string) => void): Unsubscribe {
    return this.messages.add(listener);
  }

  onStatus(listener: (status: ConnectionStatus) => void): Unsubscribe {
    return this.statuses.add(listener);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getStats(): TransportStats {
    return { ...this.stats };
  }

  emit(raw: string): void {
    this.stats.received += 1;
    this.messages.emit(raw);
  }

  setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statuses.emit(status);
  }
}
