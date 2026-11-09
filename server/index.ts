// Mock telemetry server CLI: `npm run server` (or `npm run server:dev` to restart on changes).
// Options come from flags or environment variables and are validated like any other input.
import { parseArgs } from 'node:util';

import { z } from 'zod/mini';

import { MOCK_SERVER, SIMULATOR } from '../src/features/telemetry';
import { startTelemetryServer } from './telemetry-server';

const MAX_PORT = 65_535;

const optionsSchema = z.strictObject({
  host: z.string().check(z.minLength(1)),
  port: z.coerce.number().check(z.int(), z.gte(0), z.lte(MAX_PORT)),
  seed: z.coerce.number().check(z.int(), z.gte(0)),
  devices: z.coerce.number().check(z.int(), z.gte(1), z.lte(SIMULATOR.MAX_DEVICE_COUNT)),
  rate: z.coerce.number().check(z.gte(SIMULATOR.MIN_RATE_HZ), z.lte(SIMULATOR.MAX_RATE_HZ)),
  relay: z.boolean(),
});

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: process.env.PULSE_HOST ?? MOCK_SERVER.DEFAULT_HOST },
    port: { type: 'string', default: process.env.PULSE_PORT ?? String(MOCK_SERVER.DEFAULT_PORT) },
    seed: { type: 'string', default: process.env.PULSE_SEED ?? String(SIMULATOR.DEFAULT_SEED) },
    devices: {
      type: 'string',
      default: process.env.PULSE_DEVICES ?? String(SIMULATOR.DEFAULT_DEVICE_COUNT),
    },
    rate: { type: 'string', default: process.env.PULSE_RATE ?? String(SIMULATOR.DEFAULT_RATE_HZ) },
    /** Forward frames from real devices (see firmware/esp32-telemetry). */
    relay: { type: 'boolean', default: process.env.PULSE_RELAY === '1' },
  },
  strict: true,
});

const parsed = optionsSchema.safeParse(values);
if (!parsed.success) {
  console.error(
    'Invalid options:',
    parsed.error.issues.map((issue) => issue.path.join('.')).join(', '),
  );
  process.exit(1);
}
const options = parsed.data;

if (options.host !== MOCK_SERVER.DEFAULT_HOST) {
  console.warn(
    `Warning: binding to ${options.host}. The mock server is a dev tool; do not expose it.`,
  );
}

const server = await startTelemetryServer({
  host: options.host,
  port: options.port,
  seed: options.seed,
  deviceCount: options.devices,
  rateHz: options.rate,
  relay: options.relay,
  log: (line) => {
    console.log(`[server] ${line}`);
  },
});
console.log(
  `[server] streaming ${String(options.devices)} simulated devices at ${String(options.rate)} Hz on ${server.url}${
    options.relay ? ' (relaying device frames)' : ''
  }`,
);

const shutdown = (signal: string) => {
  console.log(`[server] ${signal} received, shutting down gracefully`);
  void server.close().then(() => {
    console.log('[server] stopped');
    process.exit(0);
  });
};
process.once('SIGINT', () => {
  shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  shutdown('SIGTERM');
});
