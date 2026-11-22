import { CheckCircle2, LayoutGrid, SkipForward, XCircle, type LucideIcon } from 'lucide-react';
import { hapticTap } from '../../utils/haptics';
import type { StatusCounts, StatusFilter } from '../../utils/attemptStats';

interface Pill {
  key: StatusFilter;
  label: string;
  Icon: LucideIcon;
  /** background + text while selected: Indigo / Green / Red / Yellow */
  on: string;
}

const PILLS: Pill[] = [
  { key: 'all', label: 'Overview', Icon: LayoutGrid, on: 'border-indigo-600 bg-indigo-600 text-white shadow-indigo-600/30' },
  { key: 'correct', label: 'Correct', Icon: CheckCircle2, on: 'border-green-700 bg-green-700 text-white shadow-green-700/30' },
  { key: 'wrong', label: 'Mistakes', Icon: XCircle, on: 'border-red-600 bg-red-600 text-white shadow-red-600/30' },
  { key: 'skipped', label: 'Skipped', Icon: SkipForward, on: 'border-yellow-400 bg-yellow-400 text-yellow-950 shadow-yellow-500/30' },
];

interface Props {
  value: string;
  onChange: (f: StatusFilter) => void;
  /** Static totals of the whole master set; they never depend on `value`. */
  counts: StatusCounts;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}

/**
 * The one status filter used by the Progress dashboard and by every quiz report:
 * Overview (All) / Correct / Mistakes / Skipped, each with icon, label and a count badge.
 * 2 x 2 on phones, one straight row from 640 px up, so nothing is ever clipped.
 */
export default function StatusFilterBar({ value, onChange, counts, className = '', testId = 'status-filter-bar', ariaLabel = 'Filter questions by status' }: Props) {
  return (
    <div className={`qmp-status-bar ${className}`} role="tablist" aria-label={ariaLabel} data-testid={testId}>
      {PILLS.map(({ key, label, Icon, on }) => {
        const active = value === key;
        const n = counts[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${label} (${n})`}
            data-testid={`status-pill-${key}`}
            data-status={key}
            data-count={n}
            onClick={() => { hapticTap(); onChange(key); }}
            className={`qmp-status-pill ${active ? `${on} shadow-md` : 'border-border bg-foreground/[0.05] text-foreground/65 hover:bg-foreground/[0.09]'}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="qmp-status-pill__label">{label}</span>
            <span className={`qmp-status-pill__count ${active ? 'bg-white/25' : 'bg-foreground/10'}`}>{n.toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
}
