import { parseJsonSafely } from '@/shared/lib/safe-json';

import type { IncomingMessage } from 'node:http';

export type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'too_large' | 'invalid_json' | 'forbidden_key' | 'aborted' };

/** Reads a JSON body up to `limit` bytes, stopping (and draining nothing more) once exceeded. */
export function readJsonBody(request: IncomingMessage, limit: number): Promise<BodyResult> {
  const declared = Number(request.headers['content-length'] ?? Number.NaN);
  if (Number.isFinite(declared) && declared > limit) {
    return Promise.resolve({ ok: false, reason: 'too_large' });
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const finish = (result: BodyResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    request.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        finish({ ok: false, reason: 'too_large' });
        request.pause();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      const json = parseJsonSafely(Buffer.concat(chunks).toString('utf8'));
      finish(json.ok ? { ok: true, value: json.value } : { ok: false, reason: json.reason });
    });
    request.on('error', () => {
      finish({ ok: false, reason: 'aborted' });
    });
  });
}
