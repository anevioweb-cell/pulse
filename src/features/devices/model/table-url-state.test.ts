import { describe, expect, it } from 'vitest';

import { DEVICE_TABLE } from '../config';
import {
  DEFAULT_TABLE_STATE,
  HIDEABLE_COLUMNS,
  parseTableState,
  serializeTableState,
} from './table-url-state';

import type { DeviceTableState } from './table-url-state';

const parse = (query: string) => parseTableState(new URLSearchParams(query));
const huge = 'x'.repeat(DEVICE_TABLE.MAX_PARAM_LENGTH + 1);
const hugeSearch = 'k'.repeat(DEVICE_TABLE.SEARCH_MAX_LENGTH + 1);

describe('parseTableState: valid input', () => {
  it('reads every field', () => {
    expect(parse('sort=-temperature&q=kitchen&status=stale&hide=pressure,signal')).toEqual({
      sort: { column: 'temperature', descending: true },
      search: 'kitchen',
      status: 'stale',
      hidden: ['pressure', 'signal'],
    });
  });

  it('gives the defaults for an empty query string', () => {
    expect(parse('')).toEqual(DEFAULT_TABLE_STATE);
  });

  it('round-trips through serialize, omitting defaults', () => {
    const state: DeviceTableState = {
      sort: { column: 'battery', descending: false },
      search: 'Greenhouse',
      status: 'online',
      hidden: ['signal', 'location'],
    };
    const query = serializeTableState(state).toString();
    expect(query).toBe('sort=battery&q=Greenhouse&status=online&hide=location%2Csignal');
    expect(parseTableState(new URLSearchParams(query))).toEqual({
      ...state,
      hidden: ['location', 'signal'],
    });
    expect(serializeTableState(DEFAULT_TABLE_STATE).toString()).toBe('');
  });
});

// Each row: a hostile or malformed query string, and the state it must produce. Fields fall back
// to their defaults one by one; valid fields next to an invalid one are kept.
const HOSTILE: readonly [string, string, Partial<DeviceTableState>][] = [
  ['unknown sort column', 'sort=password', {}],
  ['sort with a prototype key', 'sort=__proto__', {}],
  ['sort by constructor', 'sort=constructor', {}],
  ['double minus', 'sort=--name', {}],
  ['sort with spaces or symbols', 'sort=name;drop', {}],
  ['repeated sort key', 'sort=battery&sort=signal', {}],
  ['huge sort value', `sort=${huge}`, {}],
  ['unknown status', 'status=admin', {}],
  ['status in another case', 'status=ONLINE', {}],
  ['status as a prototype key', 'status=__proto__', {}],
  ['huge search', `q=${hugeSearch}`, {}],
  ['search over the param cap', `q=${huge}`, {}],
  ['repeated search key', 'q=a&q=b', {}],
  ['control and bidi characters are stripped', 'q=%E2%80%AEkit%00chen%0A', { search: 'kitchen' }],
  ['script text stays inert text', 'q=%3Cscript%3E', { search: '<script>' }],
  ['hiding the name column', 'hide=name', {}],
  ['hiding an unknown column', 'hide=pressure,secret', {}],
  ['duplicate hidden columns', 'hide=signal,signal', {}],
  ['prototype keys as columns', 'hide=__proto__,constructor', {}],
  ['too many hidden entries', `hide=${[...HIDEABLE_COLUMNS, 'signal'].join(',')}`, {}],
  ['trailing separator', 'hide=signal,', {}],
  ['huge hidden list', `hide=${huge}`, {}],
  ['__proto__ as a key', '__proto__=1&constructor=2&prototype=3', {}],
  ['unknown keys next to a valid one', 'evil=1&status=offline&x[y]=z', { status: 'offline' }],
  [
    'one bad field keeps the good ones',
    'sort=-signal&status=admin&q=attic',
    { sort: { column: 'signal', descending: true }, search: 'attic' },
  ],
  [
    'malformed percent-encoding decodes leniently to inert text',
    'q=%E0%A4%A&status=%',
    { search: new URLSearchParams('q=%E0%A4%A').get('q') ?? '' },
  ],
];

describe('parseTableState: hostile input never throws and falls back per field', () => {
  it.each(HOSTILE)('%s', (_name, query, expected) => {
    let state: DeviceTableState | undefined;
    expect(() => {
      state = parse(query);
    }).not.toThrow();
    expect(state).toEqual({ ...DEFAULT_TABLE_STATE, ...expected });
    // Parsing never writes to prototypes.
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)['1']).toBeUndefined();
  });

  it('a huge query string (1 MB) is handled quickly and falls back to defaults', () => {
    const query = `sort=${'a'.repeat(1_000_000)}&q=${'b'.repeat(1_000_000)}`;
    const started = performance.now();
    expect(parse(query)).toEqual(DEFAULT_TABLE_STATE);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
