import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { parseDetailState, serializeDetailState } from '../../model/detail-url-state';

import type { DeviceDetailState } from '../../model/detail-url-state';

/**
 * The device page's view (range and expanded chart), read from and written to the query string
 * (ADR 0021), like the devices table: writes replace the history entry and keep the scroll
 * position, and unknown keys are dropped on the next write.
 */
export function useDetailUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseDetailState(params), [params]);
  const update = useCallback(
    (patch: Partial<DeviceDetailState>) => {
      setParams((current) => serializeDetailState({ ...parseDetailState(current), ...patch }), {
        replace: true,
        preventScrollReset: true,
      });
    },
    [setParams],
  );
  return { state, update };
}
