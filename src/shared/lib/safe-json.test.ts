import { describe, expect, it } from 'vitest';

import { parseJsonSafely } from './safe-json';

describe('parseJsonSafely', () => {
  it('parses valid JSON', () => {
    expect(parseJsonSafely('{"a":[1,2]}')).toEqual({ ok: true, value: { a: [1, 2] } });
  });

  it.each(['', '{', 'NaN', "{'a':1}"])('reports invalid JSON for %j', (text) => {
    expect(parseJsonSafely(text)).toEqual({ ok: false, reason: 'invalid_json' });
  });

  it.each([
    ['{"__proto__":{"x":1}}', '__proto__'],
    ['{"a":{"constructor":{}}}', 'constructor'],
    ['[{"prototype":1}]', 'prototype'],
  ])('rejects forbidden keys at any depth: %s', (text, key) => {
    expect(parseJsonSafely(text)).toEqual({ ok: false, reason: 'forbidden_key', key });
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});
