import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { parseTableState, serializeTableState } from '../../model/table-url-state';

import type { DeviceTableState } from '../../model/table-url-state';

/**
 * The devices table view, read from and written to the query string (ADR 0021). Writes replace
 * the history entry (no history spam) and keep the scroll position. Unknown keys are dropped on
 * the next write, so junk in a pasted URL does not survive.
 */
export function useTableUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseTableState(params), [params]);
  const update = useCallback(
    (patch: Partial<DeviceTableState>) => {
      setParams((current) => serializeTableState({ ...parseTableState(current), ...patch }), {
        replace: true,
        preventScrollReset: true,
      });
    },
    [setParams],
  );
  return { state, update };
}
