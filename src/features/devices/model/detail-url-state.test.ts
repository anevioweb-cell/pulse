import { describe, expect, it } from 'vitest';

import { DEVICE_CHART } from '../config';
import { DEFAULT_DETAIL_STATE, parseDetailState, serializeDetailState } from './detail-url-state';

import type { DeviceDetailState } from './detail-url-state';

const parse = (query: string) => parseDetailState(new URLSearchParams(query));
const huge = 'x'.repeat(DEVICE_CHART.MAX_PARAM_LENGTH + 1);

describe('parseDetailState: valid input', () => {
  it('reads both fields', () => {
    expect(parse('range=24h&metric=battery')).toEqual({ range: '24h', metric: 'battery' });
  });

  it('gives the defaults for an empty query string', () => {
    expect(parse('')).toEqual(DEFAULT_DETAIL_STATE);
  });

  it('round-trips through serialize, omitting defaults', () => {
    const state: DeviceDetailState = { range: '1h', metric: 'humidity' };
    const query = serializeDetailState(state).toString();
    expect(query).toBe('range=1h&metric=humidity');
    expect(parse(query)).toEqual(state);
    expect(serializeDetailState(DEFAULT_DETAIL_STATE).toString()).toBe('');
  });
});

// Each row: a hostile or malformed query string, and the state it must produce. Fields fall back
// to their defaults one by one; a valid field next to an invalid one is kept.
const HOSTILE: readonly [string, string, Partial<DeviceDetailState>][] = [
  ['unknown range', 'range=7d', {}],
  ['range in another case', 'range=1H', {}],
  ['range with spaces', 'range=%201h', {}],
  ['range as a prototype key', 'range=__proto__', {}],
  ['range as constructor', 'range=constructor', {}],
  ['repeated range key', 'range=1h&range=24h', {}],
  ['huge range value', `range=${huge}`, {}],
  ['empty range', 'range=', {}],
  ['unknown metric', 'metric=co2', {}],
  ['metric as a prototype key', 'metric=__proto__', {}],
  ['metric with markup', 'metric=%3Cscript%3E', {}],
  ['metric with control characters', 'metric=battery%00', {}],
  ['metric with a bidi override', 'metric=%E2%80%AEbattery', {}],
  ['repeated metric key', 'metric=battery&metric=signal', {}],
  ['huge metric value', `metric=${huge}`, {}],
  ['__proto__ as a key', '__proto__=1&constructor=2&prototype=3', {}],
  ['unknown keys next to a valid one', 'evil=1&range=5m&x[y]=z', { range: '5m' }],
  ['one bad field keeps the good one', 'range=forever&metric=signal', { metric: 'signal' }],
  ['malformed percent-encoding', 'range=%E0%A4%A&metric=%', {}],
];

describe('parseDetailState: hostile input never throws and falls back per field', () => {
  it.each(HOSTILE)('%s', (_name, query, expected) => {
    let state: DeviceDetailState | undefined;
    expect(() => {
      state = parse(query);
    }).not.toThrow();
    expect(state).toEqual({ ...DEFAULT_DETAIL_STATE, ...expected });
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it('a huge query string (1 MB) is handled quickly and falls back to defaults', () => {
    const query = `range=${'a'.repeat(1_000_000)}&metric=${'b'.repeat(1_000_000)}`;
    const started = performance.now();
    expect(parse(query)).toEqual(DEFAULT_DETAIL_STATE);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
