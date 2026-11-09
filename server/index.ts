// Mock telemetry server CLI: `npm run server` (or `npm run server:dev` to restart on changes).
// Options come from flags or environment variables and are validated like any other input.
import { parseArgs } from 'node:util';

import { z } from 'zod/mini';

import { MOCK_SERVER, SIMULATOR } from '../src/features/telemetry';
import { parseFaultSpec } from './rest/faults';
import { startTelemetryServer } from './telemetry-server';

const MAX_PORT = 65_535;

const optionsSchema = z.strictObject({
  host: z.string().check(z.minLength(1)),
  port: z.coerce.number().check(z.int(), z.gte(0), z.lte(MAX_PORT)),
  seed: z.coerce.number().check(z.int(), z.gte(0)),
  devices: z.coerce.number().check(z.int(), z.gte(1), z.lte(SIMULATOR.MAX_DEVICE_COUNT)),
  rate: z.coerce.number().check(z.gte(SIMULATOR.MIN_RATE_HZ), z.lte(SIMULATOR.MAX_RATE_HZ)),
  relay: z.boolean(),
  origin: z.array(z.string()),
  faults: z.string(),
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
    /** Extra allowed browser origin (repeatable), e.g. --origin http://localhost:4173 */
    origin: { type: 'string', multiple: true, default: [] },
    /** Test-only REST fault injection, e.g. --faults latency=300,failure=0.25,status=503 */
    faults: { type: 'string', default: process.env.PULSE_FAULTS ?? '' },
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

// Extra origins must be bare http(s) origins (scheme://host[:port]), compared exactly.
const extraOrigins: string[] = [];
for (const candidate of values.origin) {
  let origin: URL | null = null;
  try {
    origin = new URL(candidate);
  } catch {
    origin = null;
  }
  if (!origin || !['http:', 'https:'].includes(origin.protocol) || origin.origin !== candidate) {
    console.error(`Invalid --origin "${candidate}": expected e.g. http://localhost:4173`);
    process.exit(1);
  }
  extraOrigins.push(origin.origin);
}

const faults = values.faults ? parseFaultSpec(values.faults) : null;
if (faults && !faults.ok) {
  console.error(`Invalid --faults: ${faults.error}`);
  process.exit(1);
}

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
  allowedOrigins: [...MOCK_SERVER.ALLOWED_ORIGINS, ...extraOrigins],
  faults: faults?.ok ? faults.config : null,
  log: (line) => {
    console.log(`[server] ${line}`);
  },
});
console.log(
  `[server] streaming ${String(options.devices)} simulated devices at ${String(options.rate)} Hz on ${server.url}${
    options.relay ? ' (relaying device frames)' : ''
  }`,
);
console.log(
  `[server] REST API on ${server.httpUrl}/api, allowed origins: ${[...MOCK_SERVER.ALLOWED_ORIGINS, ...extraOrigins].join(', ')}`,
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
