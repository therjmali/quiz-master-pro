import { useCallback, useMemo, useState } from 'react';
import type { ReviewStatus } from '../utils/reviewOptions';
import { applyFacets, countStatuses, normalizeFacets, toggleFacet, type FacetKey, type StatusCounts, type StatusFilter } from '../utils/attemptStats';

interface Options<T> {
  /** controlled selection (empty array = All). Strings from older versions ('wrong') are accepted too. */
  selected?: unknown;
  onSelectedChange?: (next: FacetKey[]) => void;
  /** is this item bookmarked? (🔖 narrows the list to these) */
  isBookmarked?: (item: T) => boolean;
  /** Static totals of the whole master set. Use them when some attempts have no question details on this device. */
  totals?: StatusCounts;
}

/**
 * Multi-select status filter over an IMMUTABLE master list.
 *  - `items` is never changed, sorted or replaced here.
 *  - the selection (✅ ❌ ⏭️ 🔖, any mix, empty = All) is its own piece of state.
 *  - `counts` depends on the master only (items / totals), never on the selection, so the pills and the
 *    download tiles can not change when a filter is tapped.
 *  - `displayed` is derived on the fly with useMemo; with nothing selected it is the master array itself.
 */
export function useStatusFilter<T extends { status: ReviewStatus }>(items: readonly T[], opts: Options<T> = {}) {
  const { selected: controlled, onSelectedChange, isBookmarked, totals } = opts;
  const [local, setLocal] = useState<FacetKey[]>([]);
  const selected = useMemo(() => normalizeFacets(controlled !== undefined ? controlled : local), [controlled, local]);

  const setSelected = useCallback((next: FacetKey[]) => {
    if (controlled === undefined) setLocal(next);
    onSelectedChange?.(next);
  }, [controlled, onSelectedChange]);
  const toggle = useCallback((key: StatusFilter | 'bookmarked') => setSelected(toggleFacet(selected, key)), [selected, setSelected]);
  const clear = useCallback(() => setSelected([]), [setSelected]);

  const counts = useMemo<StatusCounts>(() => totals ?? countStatuses(items), [items, totals]);
  const displayed = useMemo(() => applyFacets(items, selected, isBookmarked ?? (() => false)), [items, selected, isBookmarked]);
  return { selected, toggle, clear, setSelected, counts, displayed };
}
