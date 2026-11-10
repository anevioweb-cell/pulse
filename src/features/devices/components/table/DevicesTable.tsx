import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { observeElementRect, useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown, SearchX } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef } from 'react';

import { readingValue, telemetryStore, useLiveStatusSignature } from '@/features/telemetry';
import type { DeviceSummary, SensorMetric } from '@/features/telemetry';
import { messages } from '@/shared/i18n';
import { Button, EmptyState } from '@/shared/ui';

import { DEVICE_TABLE } from '../../config';
import { DEFAULT_TABLE_STATE, DEVICE_COLUMNS } from '../../model/table-url-state';
import { columnLabel } from './columns';
import { DeviceRow } from './DeviceRow';
import { TableToolbar } from './TableToolbar';
import { useTableUrlState } from './use-table-url-state';

import type { DeviceColumnId, DeviceTableState } from '../../model/table-url-state';
import type { DeviceRowProps } from './DeviceRow';
import type { ComponentType } from 'react';

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  columnVisibilityFeature,
});

// Live values are read from the store's current snapshot when the row model is computed (on a
// sort, filter or status change), never subscribed to here: rows do not jump while you read, and
// readings re-render only their own row (DeviceRow).
const liveOf = (id: string) => telemetryStore.getState().devices.get(id);
const liveMetric = (id: string, metric: SensorMetric) => {
  const latest = liveOf(id)?.latest;
  return latest ? readingValue(latest, metric) : undefined;
};
/** Sort rank of each status: online first, devices with no data last. */
const STATUS_ORDER = new Map(
  (['online', 'stale', 'offline', 'unknown'] as const).map((status, rank) => [status, rank]),
);
const liveStatus = (id: string) => liveOf(id)?.status ?? 'unknown';

const matchesSearch = (device: DeviceSummary, query: unknown) => {
  if (typeof query !== 'string' || query === '') return true;
  const needle = query.toLocaleLowerCase();
  return [device.name, device.location, device.id].some((text) =>
    text.toLocaleLowerCase().includes(needle),
  );
};

const helper = createColumnHelper<typeof features, DeviceSummary>();
const metricColumn = (metric: SensorMetric) =>
  helper.accessor((device) => liveMetric(device.id, metric), {
    id: metric,
    sortUndefined: 'last',
    enableGlobalFilter: false,
  });

const columns = helper.columns([
  helper.accessor('name', { id: 'name', sortFn: 'alphanumeric' }),
  helper.accessor('location', {
    id: 'location',
    sortFn: 'alphanumeric',
    enableGlobalFilter: false,
  }),
  helper.accessor((device) => STATUS_ORDER.get(liveStatus(device.id)), {
    id: 'status',
    enableGlobalFilter: false,
    filterFn: (row, _columnId, value) => value === 'all' || liveStatus(row.original.id) === value,
  }),
  metricColumn('temperature'),
  metricColumn('humidity'),
  metricColumn('pressure'),
  metricColumn('battery'),
  metricColumn('signal'),
  helper.accessor((device) => liveOf(device.id)?.lastHeardAt, {
    id: 'lastSeen',
    sortUndefined: 'last',
    enableGlobalFilter: false,
  }),
]);

/** `aria-rowindex` is 1-based and the header row is row 1. */
const FIRST_BODY_ROW_INDEX = 2;

function SortIcon({ direction }: { direction: 'ascending' | 'descending' | 'none' }) {
  const className = 'size-3.5 shrink-0';
  switch (direction) {
    case 'ascending':
      return <ArrowUp aria-hidden="true" className={className} />;
    case 'descending':
      return <ArrowDown aria-hidden="true" className={className} />;
    default:
      return <ArrowUpDown aria-hidden="true" className={className} />;
  }
}

/**
 * The default rect observer, except that a zero height (a container not laid out yet, or jsdom,
 * which has no layout) counts as the initial viewport estimate, so rows still render.
 */
const observeViewport: typeof observeElementRect = (instance, callback) =>
  observeElementRect(instance, (rect) => {
    callback(rect.height > 0 ? rect : { ...rect, height: DEVICE_TABLE.INITIAL_VIEWPORT_PX });
  });

/** Sets a spacer row's height through the CSSOM (inline style props are not allowed here). */
function useSpacer(height: number) {
  const ref = useRef<HTMLTableRowElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.style.height = `${String(height)}px`;
  }, [height]);
  return ref;
}

function isFiltered(state: DeviceTableState) {
  return state.search !== DEFAULT_TABLE_STATE.search || state.status !== DEFAULT_TABLE_STATE.status;
}

export interface DevicesTableProps {
  devices: readonly DeviceSummary[];
  /** The row component; replaceable for render-count tests. */
  Row?: ComponentType<DeviceRowProps>;
}

/**
 * The devices table: semantic `<table>` markup with virtualized rows (spacer rows above and
 * below the rendered window), `aria-rowcount` and `aria-rowindex` for the full set, `aria-sort`
 * on the sorted column, sort buttons in the headers, and a sticky header. Its view state (sort,
 * search, status filter, hidden columns) is the URL (ADR 0021); ADR 0022 explains the rest.
 */
export function DevicesTable({ devices, Row = DeviceRow }: DevicesTableProps) {
  const { state, update } = useTableUrlState();
  const statusSignature = useLiveStatusSignature();
  // A new array means new row objects, so TanStack reads a fresh live snapshot. The extra keys are
  // the point: re-sort and re-filter when the sort, the filter or any device's status changes.
  const data = useMemo(
    () => [...devices],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [devices, state.sort, state.status, statusSignature],
  );

  const table = useTable({
    features,
    columns,
    data,
    state: {
      sorting: [{ id: state.sort.column, desc: state.sort.descending }],
      columnFilters: state.status === 'all' ? [] : [{ id: 'status', value: state.status }],
      globalFilter: state.search,
      columnVisibility: Object.fromEntries(state.hidden.map((id) => [id, false])),
    },
    globalFilterFn: (row, _columnId, value) => matchesSearch(row.original, value),
  });

  const rows = table.getRowModel().rows;
  const visibleColumns = useMemo(
    () => DEVICE_COLUMNS.filter((column) => !state.hidden.includes(column)),
    [state.hidden],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  // Not memoized by us, and the React Compiler is not used: the virtualizer re-renders this
  // component itself on scroll, which is what the rule warns about.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DEVICE_TABLE.ROW_HEIGHT_PX,
    overscan: DEVICE_TABLE.OVERSCAN_ROWS,
    initialRect: { width: 0, height: DEVICE_TABLE.INITIAL_VIEWPORT_PX },
    observeElementRect: observeViewport,
    getItemKey: (index) => rows.at(index)?.id ?? index,
  });
  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);
  const topSpacer = useSpacer(paddingTop);
  const bottomSpacer = useSpacer(paddingBottom);

  const count = new Intl.NumberFormat();
  const { table: text } = messages.devices;

  return (
    <div className="flex flex-col gap-3">
      <TableToolbar state={state} update={update} />
      <p role="status" className="text-sm text-text-muted">
        {text.shown(count.format(rows.length), count.format(devices.length))}
      </p>
      {rows.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={text.noMatchTitle}
          description={text.noMatchDescription}
          {...(isFiltered(state)
            ? {
                action: (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      update({ search: '', status: 'all' });
                    }}
                  >
                    {text.clearFilters}
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <div
          ref={scrollRef}
          className="max-h-[70dvh] overflow-auto rounded-xl border border-border bg-surface-raised"
        >
          <table aria-rowcount={rows.length + 1} className="w-full border-collapse text-sm">
            <caption className="sr-only">
              {text.caption}. {text.sortedBy(columnLabel(state.sort.column), state.sort.descending)}
            </caption>
            <thead className="sticky top-0 z-raised bg-surface-raised">
              <tr aria-rowindex={1}>
                {visibleColumns.map((column) => (
                  <HeaderCell
                    key={column}
                    column={column}
                    sort={state.sort}
                    onSort={() => {
                      update({
                        sort: {
                          column,
                          descending: state.sort.column === column ? !state.sort.descending : false,
                        },
                      });
                    }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {paddingTop > 0 && (
                <tr ref={topSpacer} aria-hidden="true">
                  <td colSpan={visibleColumns.length} />
                </tr>
              )}
              {items.map((item) => {
                const row = rows[item.index];
                if (!row) return null;
                return (
                  <Row
                    key={row.id}
                    device={row.original}
                    columns={visibleColumns}
                    rowIndex={item.index + FIRST_BODY_ROW_INDEX}
                  />
                );
              })}
              {paddingBottom > 0 && (
                <tr ref={bottomSpacer} aria-hidden="true">
                  <td colSpan={visibleColumns.length} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HeaderCell({
  column,
  sort,
  onSort,
}: {
  column: DeviceColumnId;
  sort: DeviceTableState['sort'];
  onSort: () => void;
}) {
  const direction =
    sort.column === column ? (sort.descending ? 'descending' : 'ascending') : 'none';
  const numeric =
    column !== 'name' && column !== 'location' && column !== 'status' && column !== 'lastSeen';
  return (
    <th
      scope="col"
      aria-sort={direction === 'none' ? undefined : direction}
      className={`h-11 border-b border-border-strong px-1 font-medium whitespace-nowrap ${numeric ? 'text-end' : 'text-start'}`}
    >
      <button
        type="button"
        onClick={onSort}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-sunken ${direction === 'none' ? 'text-text-muted' : 'text-text'}`}
      >
        {columnLabel(column)}
        <SortIcon direction={direction} />
      </button>
    </th>
  );
}
