import { useEffect, useState } from 'react';

import { messages } from '@/shared/i18n';
import { Input, Select } from '@/shared/ui';

import { DEVICE_TABLE } from '../../config';
import { STATUS_FILTERS } from '../../model/table-url-state';
import { ColumnMenu } from './ColumnMenu';

import type { DeviceTableState, StatusFilter } from '../../model/table-url-state';

const statusOptionLabel = (status: StatusFilter) => {
  const options = messages.devices.table.statusOptions;
  switch (status) {
    case 'online':
      return options.online;
    case 'stale':
      return options.stale;
    case 'offline':
      return options.offline;
    case 'unknown':
      return options.unknown;
    default:
      return options.all;
  }
};

const STATUS_OPTIONS = STATUS_FILTERS.map((value) => ({ value, label: statusOptionLabel(value) }));
const isStatusFilter = (value: string): value is StatusFilter =>
  STATUS_FILTERS.some((status) => status === value);

/**
 * Search, status filter and column menu. The search box keeps its own draft and writes the URL
 * DEVICE_TABLE.SEARCH_DEBOUNCE_MS after the last keystroke; an outside change (back/forward)
 * replaces the draft. The other controls write the URL at once.
 */
export function TableToolbar({
  state,
  update,
}: {
  state: DeviceTableState;
  update: (patch: Partial<DeviceTableState>) => void;
}) {
  const [draft, setDraft] = useState(state.search);
  const [synced, setSynced] = useState(state.search);
  if (state.search !== synced) {
    // The URL changed: adopt it, unless it is just the draft written back (trimmed).
    setSynced(state.search);
    if (draft.trim() !== state.search) setDraft(state.search);
  }

  useEffect(() => {
    if (draft.trim() === state.search) return undefined;
    const timer = setTimeout(() => {
      update({ search: draft.slice(0, DEVICE_TABLE.SEARCH_MAX_LENGTH) });
    }, DEVICE_TABLE.SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, state.search, update]);

  const { table: text } = messages.devices;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input
        className="min-w-48 flex-1"
        type="search"
        label={text.searchLabel}
        placeholder={text.searchPlaceholder}
        maxLength={DEVICE_TABLE.SEARCH_MAX_LENGTH}
        autoComplete="off"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
      <Select
        className="w-44"
        label={text.statusLabel}
        options={STATUS_OPTIONS}
        value={state.status}
        onValueChange={(value) => {
          if (isStatusFilter(value)) update({ status: value });
        }}
      />
      <ColumnMenu
        hidden={state.hidden}
        onChange={(hidden) => {
          update({ hidden });
        }}
      />
    </div>
  );
}
