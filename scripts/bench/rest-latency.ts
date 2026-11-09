// Mock server REST latency on localhost: `npm run bench:rest`.
// Method: starts the mock server as a separate process (`npm run server`, its own event loop),
// then for each endpoint and concurrency sends WARMUP untimed requests followed by REQUESTS timed
// ones, in bursts of CONCURRENCY simultaneous requests (Node fetch, keep-alive). Latency = time
// from fetch() to the full body read. Bursts are paced below the server's per-client rate limit
// (MOCK_SERVER.MAX_REST_REQUESTS_PER_SECOND) so no request is answered 429; pacing time is not
// counted. Reports p50 and p95 (nearest rank) and fails if any response is not 200.
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

import { MOCK_SERVER } from '../../src/features/telemetry';
import { percentile } from './stats';

const PORT = 8799;
const BASE = `http://127.0.0.1:${String(PORT)}`;
const SEED = 7;
const REQUESTS = 400;
const WARMUP = 20;
const CONCURRENCIES = [1, 8];
/** Stay under the per-client limit with headroom (fixed one-second windows on the server). */
const TARGET_RATE = MOCK_SERVER.MAX_REST_REQUESTS_PER_SECOND - 10;
const MS_PER_S = 1000;
const REQUEST_SPACING_MS = MS_PER_S / TARGET_RATE;
const P50 = 50;
const P95 = 95;
const HTTP_OK = 200;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const STARTUP_TIMEOUT_MS = 20_000;

const now = Date.now();
const endpoints: [string, string][] = [
  ['GET /api/devices', '/api/devices'],
  [
    'GET readings (24 h, temperature, maxPoints=500)',
    `/api/devices/esp32-01/readings?metric=temperature&from=${String(now - DAY_MS)}&to=${String(now)}&maxPoints=500`,
  ],
];

function startServer(): Promise<() => void> {
  // One process (tsx as a loader, not the tsx/npx wrappers), so SIGTERM reaches the server itself.
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'server/index.ts', '--port', String(PORT), '--seed', String(SEED)],
    {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, TSX_TSCONFIG_PATH: 'tsconfig.server.json' },
    },
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('server did not start'));
    }, STARTUP_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('REST API on')) {
        clearTimeout(timer);
        resolve(() => child.kill('SIGTERM'));
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited (${String(code)})`));
    });
  });
}

/**
 * One burst of `concurrency` simultaneous requests every `concurrency * REQUEST_SPACING_MS`: real
 * parallelism inside a burst, and at most TARGET_RATE requests in any one-second window.
 */
async function measure(path: string, count: number, concurrency: number): Promise<number[]> {
  const latencies: number[] = [];
  let bytes = 0;
  const one = async () => {
    const start = performance.now();
    const response = await fetch(`${BASE}${path}`);
    const body = await response.arrayBuffer();
    latencies.push(performance.now() - start);
    bytes = body.byteLength;
    if (response.status !== HTTP_OK) throw new Error(`HTTP ${String(response.status)} on ${path}`);
  };
  for (let sent = 0; sent < count; sent += concurrency) {
    const burstStart = performance.now();
    await Promise.all(Array.from({ length: Math.min(concurrency, count - sent) }, one));
    const wait = concurrency * REQUEST_SPACING_MS - (performance.now() - burstStart);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
  process.stdout.write(`  (${path.split('?')[0] ?? path}: ${String(bytes)} B per response)\n`);
  return latencies;
}

const stop = await startServer();
try {
  console.log(
    `node ${process.version}, ${String(REQUESTS)} timed requests per row after ${String(WARMUP)} warm-up, paced at <= ${String(TARGET_RATE)} req/s`,
  );
  const rows: string[] = [];
  for (const [name, path] of endpoints) {
    for (const concurrency of CONCURRENCIES) {
      await measure(path, WARMUP, concurrency);
      const latencies = await measure(path, REQUESTS, concurrency);
      rows.push(
        `| ${name} | ${String(concurrency)} | ${String(latencies.length)} | ${percentile(latencies, P50).toFixed(2)} | ${percentile(latencies, P95).toFixed(2)} |`,
      );
    }
  }
  console.log('| endpoint | concurrency | requests | p50 ms | p95 ms |');
  console.log('| --- | ---: | ---: | ---: | ---: |');
  for (const row of rows) console.log(row);
} finally {
  stop();
}
