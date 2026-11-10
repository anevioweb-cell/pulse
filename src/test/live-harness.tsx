// Test harness for live UI: a TelemetryService writing to the app-wide live store (the one the
// hooks read), fed by a hand-driven transport, plus a QueryClient and TelemetryApi for server data.
import { QueryClientProvider } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import {
  createTelemetryQueryClient,
  DemoTelemetryApi,
  encodeMessage,
  TelemetryApiProvider,
  TelemetryService,
  telemetryStore,
} from '@/features/telemetry';
import type {
  ConnectionStatus,
  SensorReading,
  TelemetryApi,
  TelemetryTransport,
  TransportStats,
} from '@/features/telemetry';

import type { ReactNode } from 'react';

const emptyStats = (): TransportStats => ({
  received: 0,
  droppedOversized: 0,
  droppedRateLimited: 0,
  droppedNonText: 0,
  droppedOutgoing: 0,
  reconnects: 0,
});

class ManualTransport implements TelemetryTransport {
  private readonly messageListeners = new Set<(raw: string) => void>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private status: ConnectionStatus = { state: 'idle', attempt: 0 };
  connect = () => {
    this.setStatus({ state: 'open', attempt: 0 });
  };
  disconnect = () => {
    this.setStatus({ state: 'closed', attempt: 0 });
  };
  onMessage = (listener: (raw: string) => void) => {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  };
  onStatus = (listener: (status: ConnectionStatus) => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };
  getStatus = () => this.status;
  getStats = emptyStats;
  emit(raw: string) {
    for (const listener of this.messageListeners) listener(raw);
  }
  private setStatus(status: ConnectionStatus) {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

const VALUES: SensorReading = {
  temperature: 21,
  humidity: 45,
  pressure: 1013,
  battery: 80,
  signal: -60,
};

export function createLiveHarness(
  api: TelemetryApi = new DemoTelemetryApi({ ruleStorage: null }),
  { initialPath = '/' }: { initialPath?: string } = {},
) {
  const transport = new ManualTransport();
  const pending = new Set<() => void>();
  const service = new TelemetryService({
    store: telemetryStore,
    frames: {
      request: (callback) => {
        pending.add(callback);
        return () => {
          pending.delete(callback);
        };
      },
    },
    createDemoTransport: () => transport,
  });
  const client = createTelemetryQueryClient(api);
  let seq = 0;
  let ts = Date.now();

  const publish = () => {
    act(() => {
      service.flush();
    });
  };

  return {
    api,
    client,
    service,
    start: () => {
      service.start({ mode: 'demo' });
    },
    stop: () => {
      service.stop();
      client.clear();
    },
    /** Announces devices, then publishes once. */
    announce(devices: readonly { id: string; name: string; location: string }[]) {
      for (const { id, name, location } of devices) {
        transport.emit(
          encodeMessage({
            v: 1,
            type: 'device_online',
            ts,
            device: { id, name, location, firmware: '1.0.0' },
          }),
        );
      }
      publish();
    },
    /** Marks devices offline (`device_offline`), then publishes once. */
    offline(ids: readonly string[]) {
      ts += 1;
      for (const deviceId of ids) {
        transport.emit(
          encodeMessage({ v: 1, type: 'device_offline', ts, deviceId, reason: 'shutdown' }),
        );
      }
      publish();
    },
    /** One reading per entry, then one publish (one frame). */
    readings(entries: readonly { id: string; values?: Partial<SensorReading> }[]) {
      ts += 1;
      for (const { id, values } of entries) {
        seq += 1;
        transport.emit(
          encodeMessage({
            v: 1,
            type: 'reading',
            ts,
            deviceId: id,
            seq,
            values: { ...VALUES, ...values },
          }),
        );
      }
      publish();
    },
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[initialPath]}>
        <QueryClientProvider client={client}>
          <TelemetryApiProvider api={api}>{children}</TelemetryApiProvider>
        </QueryClientProvider>
      </MemoryRouter>
    ),
  };
}
