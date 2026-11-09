// Persistence read/write time in a real browser (IndexedDB): `npm run bench:persistence`, then
// open the printed URL (performance.now() is coarsened to 0.1 ms without cross-origin isolation). Method: fill a QueryClient with Demo Mode data (a typical cache, and one
// near PERSISTENCE.MAX_BYTES), then RUNS times each:
// - write = serializeQueryCache (select, cap, JSON) + IndexedDB set, i.e. one debounced persist;
// - read  = restoreQueryCache into an empty QueryClient (IndexedDB get, size check, safe JSON
//   parse, migration, schema validation of every entry, setQueryData).
// One warm-up of each first. Uses its own namespace and deletes it afterwards.
import { QueryClient } from '@tanstack/react-query';

import { API, DemoTelemetryApi, telemetryKeys, telemetryPersistPolicy } from '@/features/telemetry';
import type { ReadingsRequest } from '@/features/telemetry';
import {
  createIdbStorage,
  PERSISTENCE,
  restoreQueryCache,
  serializeQueryCache,
} from '@/shared/api';
import type { KeyValueStorage, QueryPersistenceOptions } from '@/shared/api';

import { median, percentile } from '../stats';

const RUNS = 25;
const P95 = 95;
const MODE = 'demo';
const NAMESPACE = 'bench.persistence';
const STORAGE_KEY = `pulse.query-cache.${NAMESPACE}`;
const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const METRICS = ['temperature', 'humidity', 'pressure', 'battery', 'signal'] as const;
const KIB = 1024;

const output = document.getElementById('output');
const print = (line: string) => {
  if (output)
    output.textContent = `${output.textContent === 'running…' ? '' : output.textContent}${line}\n`;
};

const api = new DemoTelemetryApi({ now: () => NOW });

async function addReadings(client: QueryClient, request: ReadingsRequest) {
  const { deviceId, ...range } = request;
  client.setQueryData(
    telemetryKeys.readings(MODE, deviceId, range),
    await api.getReadings(request),
    {
      updatedAt: NOW,
    },
  );
}

/** Dashboard-sized: device list, alert rules, the last hour of temperature for every device. */
async function typicalCache(): Promise<QueryClient> {
  const client = new QueryClient();
  const devices = await api.listDevices();
  client.setQueryData(telemetryKeys.deviceList(MODE), devices, { updatedAt: NOW });
  client.setQueryData(telemetryKeys.alertRules(MODE), await api.listAlertRules(), {
    updatedAt: NOW,
  });
  for (const device of devices) {
    await addReadings(client, {
      deviceId: device.id,
      metric: 'temperature',
      from: NOW - HOUR_MS,
      to: NOW,
    });
  }
  return client;
}

/** Many 24 h ranges at the maximum point budget: the serializer stops at the byte cap. */
async function nearCapCache(): Promise<QueryClient> {
  const client = await typicalCache();
  const devices = await api.listDevices();
  for (const metric of METRICS) {
    for (const device of devices) {
      await addReadings(client, {
        deviceId: device.id,
        metric,
        from: NOW - DAY_MS,
        to: NOW,
        maxPoints: API.MAX_POINTS,
      });
    }
  }
  return client;
}

const optionsFor = (client: QueryClient, storage: KeyValueStorage): QueryPersistenceOptions => ({
  client,
  storage,
  namespace: NAMESPACE,
  buster: API.PERSISTED_CACHE_BUSTER,
  policy: telemetryPersistPolicy(MODE),
  now: () => NOW,
});

async function bench(name: string, client: QueryClient, storage: KeyValueStorage) {
  const options = optionsFor(client, storage);
  const writes: number[] = [];
  const reads: number[] = [];
  let bytes = 0;
  let restored = 0;
  for (let run = 0; run <= RUNS; run += 1) {
    const writeStart = performance.now();
    const text = serializeQueryCache(options);
    await storage.set(STORAGE_KEY, text);
    const writeMs = performance.now() - writeStart;

    const readStart = performance.now();
    const report = await restoreQueryCache({ ...options, client: new QueryClient() });
    const readMs = performance.now() - readStart;
    if (report.status !== 'restored') throw new Error(`restore failed: ${report.status}`);

    if (run === 0) continue; // warm-up
    bytes = new TextEncoder().encode(text).length;
    restored = report.restored;
    writes.push(writeMs);
    reads.push(readMs);
  }
  const queries = client.getQueryCache().getAll().length;
  print(
    `| ${name} | ${String(queries)} | ${String(restored)} | ${(bytes / KIB).toFixed(1)} KiB | ` +
      `${median(writes).toFixed(2)} / ${percentile(writes, P95).toFixed(2)} | ` +
      `${median(reads).toFixed(2)} / ${percentile(reads, P95).toFixed(2)} |`,
  );
}

async function main() {
  const storage = createIdbStorage();
  if (!storage) throw new Error('IndexedDB unavailable');
  print(navigator.userAgent);
  print(
    `${String(RUNS)} timed runs after 1 warm-up; cap ${String(PERSISTENCE.MAX_BYTES / KIB)} KiB, ${String(PERSISTENCE.MAX_ENTRIES)} entries`,
  );
  print(
    '| cache | queries in memory | entries persisted | stored size | write ms (p50 / p95) | read ms (p50 / p95) |',
  );
  print('| --- | ---: | ---: | ---: | ---: | ---: |');
  await bench('typical', await typicalCache(), storage);
  await bench('near the cap', await nearCapCache(), storage);
  await storage.del(STORAGE_KEY);
  print('done');
}

main().catch((error: unknown) => {
  print(`FAILED: ${error instanceof Error ? error.message : 'unknown error'}`);
});
