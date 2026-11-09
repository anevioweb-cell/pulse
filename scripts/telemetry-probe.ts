// Connects to a telemetry server through the real WebSocketTransport for N seconds, parses every
// frame with the real parser, and prints a summary. Usage:
//   npm run probe -- --url ws://127.0.0.1:8787 --seconds 10
import { parseArgs } from 'node:util';

import { z } from 'zod/mini';

import { MOCK_SERVER, parseTelemetryMessage, WebSocketTransport } from '../src/features/telemetry';

import type { MessageType, ParseFailureReason } from '../src/features/telemetry';

const DEFAULT_SECONDS = 10;
const MAX_SECONDS = 3600;
const MS_PER_SECOND = 1000;
const RATE_DECIMALS = 1;

const optionsSchema = z.strictObject({
  url: z.string(),
  seconds: z.coerce.number().check(z.gt(0), z.lte(MAX_SECONDS)),
});

const { values } = parseArgs({
  options: {
    url: {
      type: 'string',
      default: `ws://${MOCK_SERVER.DEFAULT_HOST}:${String(MOCK_SERVER.DEFAULT_PORT)}`,
    },
    seconds: { type: 'string', default: String(DEFAULT_SECONDS) },
  },
  strict: true,
});
const parsed = optionsSchema.safeParse(values);
if (!parsed.success) {
  console.error('Usage: npm run probe -- --url ws://host:port --seconds 10');
  process.exit(1);
}
const { url, seconds } = parsed.data;

const byType = new Map<MessageType, number>();
const failures = new Map<ParseFailureReason, number>();
let received = 0;
let firstAt: number | null = null;

const transport = new WebSocketTransport({ url });
transport.onStatus((status) => {
  const extra = status.reason ? ` (${status.reason})` : '';
  console.log(`[probe] status: ${status.state}${extra}`);
});
transport.onMessage((raw) => {
  received += 1;
  firstAt ??= Date.now();
  const result = parseTelemetryMessage(raw);
  if (result.ok) {
    byType.set(result.message.type, (byType.get(result.message.type) ?? 0) + 1);
  } else {
    failures.set(result.reason, (failures.get(result.reason) ?? 0) + 1);
  }
});

console.log(`[probe] connecting to ${url} for ${String(seconds)} s`);
const startedAt = Date.now();
transport.connect();

setTimeout(() => {
  transport.disconnect();
  const elapsed = (Date.now() - startedAt) / MS_PER_SECOND;
  const streaming = firstAt === null ? 0 : (Date.now() - firstAt) / MS_PER_SECOND;
  const stats = transport.getStats();
  const table = (map: Map<string, number>) =>
    map.size === 0
      ? '  (none)'
      : [...map.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, count]) => `  ${key.padEnd(16)} ${String(count)}`)
          .join('\n');

  console.log(`
Telemetry probe summary
  url              ${url}
  duration         ${elapsed.toFixed(RATE_DECIMALS)} s
  messages         ${String(received)}
  messages/second  ${(streaming > 0 ? received / streaming : 0).toFixed(RATE_DECIMALS)}

Messages by type
${table(byType)}

Parse failures by reason
${table(failures)}

Transport counters
  dropped oversized     ${String(stats.droppedOversized)}
  dropped rate-limited  ${String(stats.droppedRateLimited)}
  dropped non-text      ${String(stats.droppedNonText)}
  reconnects            ${String(stats.reconnects)}`);
  process.exit(failures.size === 0 && received > 0 ? 0 : 1);
}, seconds * MS_PER_SECOND);
