import { hapticTap } from '../../utils/haptics';
import type { StatusCounts, StatusFilter } from '../../utils/attemptStats';

export type BarFilter = StatusFilter | 'bookmarked';
export type BarCounts = StatusCounts & { bookmarked: number };

interface Pill {
  key: BarFilter;
  /** "All" is the only pill with a word; the others are emoji only */
  label?: string;
  emoji?: string;
  /** spoken / tooltip name */
  name: string;
  /** background + text while selected */
  on: string;
}

export const BAR_PILLS: Pill[] = [
  { key: 'all', label: 'All', name: 'All questions', on: 'border-indigo-600 bg-indigo-600 text-white shadow-indigo-600/30' },
  { key: 'correct', emoji: '\u2705', name: 'Correct', on: 'border-green-700 bg-green-700 text-white shadow-green-700/30' },
  { key: 'wrong', emoji: '\u274C', name: 'Mistakes', on: 'border-red-600 bg-red-600 text-white shadow-red-600/30' },
  { key: 'skipped', emoji: '\u23ED\uFE0F', name: 'Skipped', on: 'border-yellow-400 bg-yellow-400 text-yellow-950 shadow-yellow-500/30' },
  { key: 'bookmarked', emoji: '\uD83D\uDD16', name: 'Bookmarked', on: 'border-violet-600 bg-violet-600 text-white shadow-violet-600/30' },
];

/** 9 999 -> "9,999", 12 400 -> "12.4k": keeps every pill on one line, the exact number stays in the aria-label. */
export const compactCount = (n: number): string => (n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : n.toLocaleString());

interface Props {
  /** Selected pills (empty = All). ✅ ❌ ⏭️ 🔖 can be on together; All is on when nothing else is. */
  selected: readonly string[];
  onToggle: (f: BarFilter) => void;
  /** Static totals of the whole master set; they never depend on `value`. */
  counts: BarCounts;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}

/**
 * The one status filter used by the Progress dashboard and by every quiz report:
 * All (every question) | \u2705 Correct | \u274C Mistakes | \u23ED\uFE0F Skipped | \uD83D\uDD16 Bookmarked, each with its count,
 * on one straight line at every screen width. Several pills can be on at once (multi-select); counts are static and
 * never change with the selection.
 */
export default function StatusFilterBar({ selected, onToggle, counts, className = '', testId = 'status-filter-bar', ariaLabel = 'Filter questions by status' }: Props) {
  return (
    <div className={`qmp-status-bar ${className}`} role="group" aria-label={ariaLabel} data-testid={testId}>
      {BAR_PILLS.map(({ key, label, emoji, name, on }) => {
        const active = key === 'all' ? selected.length === 0 : selected.includes(key);
        const n = counts[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            aria-label={`${name} (${n})`}
            title={`${name} (${n})`}
            data-testid={`status-pill-${key}`}
            data-status={key}
            data-count={n}
            onClick={() => { hapticTap(); onToggle(key); }}
            className={`qmp-status-pill ${active ? `${on} shadow-md` : 'border-border bg-foreground/[0.05] text-foreground/70 hover:bg-foreground/[0.09]'}`}
          >
            {label ? <span>{label}</span> : <span className="qmp-status-pill__icon" aria-hidden>{emoji}</span>}
            <span className="qmp-status-pill__count">{compactCount(n)}</span>
          </button>
        );
      })}
    </div>
  );
}
