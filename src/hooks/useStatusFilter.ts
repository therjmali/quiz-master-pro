import { useCallback, useMemo, useState } from 'react';
import type { ReviewStatus } from '../utils/reviewOptions';
import { countStatuses, isStatusFilter, pickByStatus, type StatusCounts, type StatusFilter } from '../utils/attemptStats';

interface Options {
  /** controlled filter value (extra values such as 'bookmarked' are read as 'all' here; the caller narrows further) */
  filter?: string;
  onFilterChange?: (f: StatusFilter) => void;
  initial?: StatusFilter;
  /** Static totals of the whole master set. Use them when some attempts have no question details on this device. */
  totals?: StatusCounts;
}

/**
 * Status filter over an IMMUTABLE master list.
 *  - `items` is never changed, sorted or replaced here.
 *  - `filter` is its own piece of state.
 *  - `counts` depends on the master only (items / totals), never on the active filter, so the pills
 *    and the download tiles can not change when a filter is tapped.
 *  - `displayed` is derived on the fly; 'all' returns the full master array.
 */
export function useStatusFilter<T extends { status: ReviewStatus }>(items: readonly T[], opts: Options = {}) {
  const { filter: controlled, onFilterChange, initial = 'all', totals } = opts;
  const [local, setLocal] = useState<StatusFilter>(initial);
  const raw = controlled !== undefined ? controlled : local;
  const filter: StatusFilter = isStatusFilter(raw) ? raw : 'all';

  const setFilter = useCallback((f: StatusFilter) => {
    if (controlled === undefined) setLocal(f);
    onFilterChange?.(f);
  }, [controlled, onFilterChange]);

  const counts = useMemo<StatusCounts>(() => totals ?? countStatuses(items), [items, totals]);
  const displayed = useMemo(() => pickByStatus(items, filter), [items, filter]);
  return { filter, setFilter, counts, displayed };
}
