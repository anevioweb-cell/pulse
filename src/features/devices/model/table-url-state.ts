import { z } from 'zod/mini';

import { stripUnsafeCharacters } from '@/features/telemetry';

import { DEVICE_TABLE } from '../config';

/** Every column of the devices table, in display order. */
export const DEVICE_COLUMNS = [
  'name',
  'location',
  'status',
  'temperature',
  'humidity',
  'pressure',
  'battery',
  'signal',
  'lastSeen',
] as const;
export type DeviceColumnId = (typeof DEVICE_COLUMNS)[number];

/** The name identifies the row (and holds its link), so it can never be hidden. */
export const HIDEABLE_COLUMNS: readonly DeviceColumnId[] = DEVICE_COLUMNS.filter(
  (column) => column !== 'name',
);

export const STATUS_FILTERS = ['all', 'online', 'stale', 'offline', 'unknown'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export interface TableSort {
  column: DeviceColumnId;
  descending: boolean;
}

/** Everything about the table view that lives in the query string. */
export interface DeviceTableState {
  sort: TableSort;
  search: string;
  status: StatusFilter;
  hidden: readonly DeviceColumnId[];
}

export const DEFAULT_TABLE_STATE: DeviceTableState = {
  sort: { column: 'name', descending: false },
  search: '',
  status: 'all',
  hidden: [],
};

/** Query-string keys. Anything else in the URL is ignored and dropped on the next write. */
export const TABLE_PARAMS = {
  sort: 'sort',
  search: 'q',
  status: 'status',
  hidden: 'hide',
} as const;

const DESCENDING_PREFIX = '-';
const LIST_SEPARATOR = ',';

const columnSchema = z.enum(DEVICE_COLUMNS);
const hideableSchema = z.enum(HIDEABLE_COLUMNS as [DeviceColumnId, ...DeviceColumnId[]]);
const sortSchema = z.pipe(
  z.string().check(z.regex(/^-?[A-Za-z]+$/)),
  z.transform((value) => ({
    descending: value.startsWith(DESCENDING_PREFIX),
    column: value.replace(DESCENDING_PREFIX, ''),
  })),
);
const statusSchema = z.enum(STATUS_FILTERS);
const searchSchema = z.pipe(
  z.string(),
  z.transform((value) => stripUnsafeCharacters(value).trim()),
);
const hiddenSchema = z.array(hideableSchema).check(
  z.maxLength(HIDEABLE_COLUMNS.length),
  z.refine((ids) => new Set(ids).size === ids.length, { message: 'duplicate column' }),
);

/** The single value of `key`, or null when it is missing, repeated or too long to be ours. */
function single(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  if (values.length !== 1) return null;
  const [value] = values;
  if (value === undefined || value.length > DEVICE_TABLE.MAX_PARAM_LENGTH) return null;
  return value;
}

function parseSort(raw: string | null): TableSort {
  if (raw === null) return DEFAULT_TABLE_STATE.sort;
  const parsed = sortSchema.safeParse(raw);
  if (!parsed.success) return DEFAULT_TABLE_STATE.sort;
  const column = columnSchema.safeParse(parsed.data.column);
  return column.success
    ? { column: column.data, descending: parsed.data.descending }
    : DEFAULT_TABLE_STATE.sort;
}

function parseSearch(raw: string | null): string {
  if (raw === null) return DEFAULT_TABLE_STATE.search;
  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success || parsed.data.length > DEVICE_TABLE.SEARCH_MAX_LENGTH)
    return DEFAULT_TABLE_STATE.search;
  return parsed.data;
}

function parseStatus(raw: string | null): StatusFilter {
  const parsed = statusSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_TABLE_STATE.status;
}

function parseHidden(raw: string | null): readonly DeviceColumnId[] {
  if (raw === null || raw === '') return DEFAULT_TABLE_STATE.hidden;
  const parsed = hiddenSchema.safeParse(raw.split(LIST_SEPARATOR));
  return parsed.success ? parsed.data : DEFAULT_TABLE_STATE.hidden;
}

/**
 * Reads the table view from the query string. The URL is untrusted input: only the four known
 * keys are read (so `__proto__` or any other key is never touched), each must appear once and be
 * short, and each field that fails its schema falls back to its own default. Never throws.
 */
export function parseTableState(params: URLSearchParams): DeviceTableState {
  return {
    sort: parseSort(single(params, TABLE_PARAMS.sort)),
    search: parseSearch(single(params, TABLE_PARAMS.search)),
    status: parseStatus(single(params, TABLE_PARAMS.status)),
    hidden: parseHidden(single(params, TABLE_PARAMS.hidden)),
  };
}

/**
 * Writes the table view as a query string, omitting defaults (the default view has a clean URL).
 * Hidden columns are written in display order, so equal states give equal URLs.
 */
export function serializeTableState(state: DeviceTableState): URLSearchParams {
  const params = new URLSearchParams();
  const { sort, search, status, hidden } = state;
  const defaults = DEFAULT_TABLE_STATE;
  if (sort.column !== defaults.sort.column || sort.descending !== defaults.sort.descending) {
    params.set(TABLE_PARAMS.sort, `${sort.descending ? DESCENDING_PREFIX : ''}${sort.column}`);
  }
  const query = search.trim();
  if (query !== '') params.set(TABLE_PARAMS.search, query);
  if (status !== defaults.status) params.set(TABLE_PARAMS.status, status);
  const ordered = HIDEABLE_COLUMNS.filter((column) => hidden.includes(column));
  if (ordered.length > 0) params.set(TABLE_PARAMS.hidden, ordered.join(LIST_SEPARATOR));
  return params;
}
