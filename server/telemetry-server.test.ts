// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsClient } from 'ws';

import {
  CLOSE_CODES,
  encodeMessage,
  MOCK_SERVER,
  parseTelemetryMessage,
  PROTOCOL,
  WebSocketTransport,
} from '../src/features/telemetry';
import { startTelemetryServer } from './telemetry-server';

import type { TelemetryMessage } from '../src/features/telemetry';
import type { TelemetryServer } from './telemetry-server';

const DEVICES = 3;
const RATE_HZ = 5;

let server: TelemetryServer | null = null;
const transports: WebSocketTransport[] = [];

async function start(relay = false) {
  server = await startTelemetryServer({
    port: 0,
    seed: 42,
    deviceCount: DEVICES,
    rateHz: RATE_HZ,
    relay,
  });
  return server;
}

function connectTransport(url: string) {
  const transport = new WebSocketTransport({ url });
  transports.push(transport);
  const messages: TelemetryMessage[] = [];
  const failures: string[] = [];
  transport.onMessage((raw) => {
    const result = parseTelemetryMessage(raw);
    if (result.ok) messages.push(result.message);
    else failures.push(result.reason);
  });
  transport.connect();
  return { transport, messages, failures };
}

/** Opens a raw ws client and resolves with the close code the server sends. */
function rawClient(url: string, onOpen: (socket: WsClient) => void): Promise<number> {
  return new Promise((resolve) => {
    const socket = new WsClient(url);
    socket.on('open', () => {
      onOpen(socket);
    });
    socket.on('close', (code) => {
      resolve(code);
    });
    socket.on('error', () => undefined);
  });
}

afterEach(async () => {
  for (const transport of transports.splice(0)) transport.disconnect();
  await server?.close();
  server = null;
});

describe('mock telemetry server', () => {
  it('binds to loopback by default and on an ephemeral port in tests', async () => {
    const { url, port } = await start();
    expect(port).toBeGreaterThan(0);
    expect(url).toBe(`ws://${MOCK_SERVER.DEFAULT_HOST}:${String(port)}`);
  });

  it('streams announcements then readings that the real transport and parser accept', async () => {
    const { url } = await start();
    const { transport, messages, failures } = connectTransport(url);

    await vi.waitFor(
      () => {
        expect(messages.filter((message) => message.type === 'reading').length).toBeGreaterThan(
          DEVICES * 2,
        );
      },
      { timeout: 5000, interval: 50 },
    );
    expect(transport.getStatus().state).toBe('open');
    expect(failures).toEqual([]);
    expect(messages.slice(0, DEVICES).map((message) => message.type)).toEqual(
      Array.from({ length: DEVICES }, () => 'device_online'),
    );
  });

  it('answers application-level pings with a pong echoing the ping timestamp', async () => {
    const { url } = await start();
    const { transport, messages } = connectTransport(url);
    await vi.waitFor(() => {
      expect(transport.getStatus().state).toBe('open');
    });
    const pingTs = Date.now();
    transport.send(encodeMessage({ v: PROTOCOL.VERSION, type: 'ping', ts: pingTs }));

    await vi.waitFor(() => {
      expect(messages).toContainEqual(expect.objectContaining({ type: 'pong', pingTs }));
    });
    expect(server?.stats.pingsAnswered).toBe(1);
  });

  it('closes clients that exceed the per-connection rate limit (1008)', async () => {
    const { url } = await start();
    const ping = encodeMessage({ v: PROTOCOL.VERSION, type: 'ping', ts: Date.now() });
    const code = await rawClient(url, (socket) => {
      for (let index = 0; index <= MOCK_SERVER.MAX_CLIENT_MESSAGES_PER_SECOND; index += 1) {
        socket.send(ping);
      }
    });
    expect(code).toBe(CLOSE_CODES.POLICY_VIOLATION);
    expect(server?.stats.rateLimitedClients).toBe(1);
  });

  it('refuses frames above the protocol size limit (1009)', async () => {
    const { url } = await start();
    const code = await rawClient(url, (socket) => {
      socket.send('x'.repeat(PROTOCOL.MAX_FRAME_BYTES + 1));
    });
    expect(code).toBe(CLOSE_CODES.MESSAGE_TOO_BIG);
  });

  it('ignores invalid and binary inbound frames without crashing', async () => {
    const { url } = await start();
    const { transport } = connectTransport(url);
    await vi.waitFor(() => {
      expect(transport.getStatus().state).toBe('open');
    });
    await new Promise<void>((resolve) => {
      const socket = new WsClient(url);
      socket.on('open', () => {
        socket.send('{"__proto__":{"polluted":true}}');
        socket.send(Buffer.from([1, 2, 3]));
        socket.send('not json');
        setTimeout(() => {
          socket.close();
          resolve();
        }, 100);
      });
    });
    expect(server?.stats.rejectedInbound).toBe(3);
    expect(transport.getStatus().state).toBe('open');
  });

  it('relays valid device frames to other clients only in relay mode, re-encoded', async () => {
    const reading = {
      v: PROTOCOL.VERSION,
      type: 'reading',
      ts: Date.now(),
      deviceId: 'esp32-hardware',
      seq: 1,
      values: { temperature: 22.5, humidity: 40, signal: -60 },
    } as const;
    const device = {
      v: 1,
      type: 'device_online',
      ts: Date.now(),
      device: {
        id: 'esp32-hardware',
        name: ' Real\u0007 ESP32 ',
        location: 'Desk',
        firmware: '0.1.0',
      },
    };

    for (const relay of [false, true]) {
      const { url } = await start(relay);
      const { transport, messages } = connectTransport(url);
      await vi.waitFor(() => {
        expect(transport.getStatus().state).toBe('open');
      });
      await new Promise<void>((resolve) => {
        const socket = new WsClient(url);
        socket.on('open', () => {
          socket.send(JSON.stringify(device));
          socket.send(encodeMessage(reading));
          setTimeout(() => {
            socket.close();
            resolve();
          }, 200);
        });
      });
      const fromHardware = messages.filter(
        (message) =>
          ('deviceId' in message && message.deviceId === 'esp32-hardware') ||
          (message.type === 'device_online' && message.device.id === 'esp32-hardware'),
      );
      if (relay) {
        expect(fromHardware).toEqual([
          expect.objectContaining({
            type: 'device_online',
            device: expect.objectContaining({ name: 'Real ESP32' }) as unknown,
          }),
          reading,
        ]);
      } else {
        expect(fromHardware).toEqual([]);
      }
      transport.disconnect();
      await server?.close();
      server = null;
    }
  });

  it('shuts down gracefully: clients receive 1001 and the transport starts reconnecting', async () => {
    const running = await start();
    const { transport } = connectTransport(running.url);
    // Record every status: the first retry can fail (1006, server gone) before a poll would see
    // the 1001 transition, so asserting on the current status alone would be racy.
    const statuses: { state: string; reason?: string | undefined }[] = [];
    transport.onStatus((status) => statuses.push(status));
    await vi.waitFor(() => {
      expect(running.clientCount).toBe(1);
    });
    await running.close();
    server = null;

    await vi.waitFor(() => {
      expect(statuses).toContainEqual(
        expect.objectContaining({ state: 'reconnecting', reason: 'closed_1001' }),
      );
    });
  });
});
