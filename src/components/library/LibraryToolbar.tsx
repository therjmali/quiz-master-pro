import { useEffect, useMemo, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import SearchInput from '../shared/SearchInput';
import { Search, X, Trash2, BookOpen, Dumbbell, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from 'zitejs/auth';
import { getTrashCount } from 'zitejs/api';
import { hapticTap } from '../../utils/haptics';
import { loadTrash, ORGANIZER_CHANGED_EVENT } from '../../utils/fileTree';
import { QuizResult } from '../../types/quiz';
import { SessionMode, getSessionLabel } from '../SessionSelector';

/**
 * Shared "command bar" for the Library screen (History tab + Organizer tab).
 *
 * Layout contract — identical everywhere so nothing ever feels scattered:
 *   1. Search field on top (full width)
 *   2. ONE straight toolbar line underneath: filters · view/actions · trash
 *   3. Optional single chips line for active filters
 */

export const TB_ICON = 'w-[18px] h-[18px]';

/* ─── Search ─────────────────────────────────────────────────────────── */
export function SearchField({ value, onChange, onClear, placeholder, right }: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  placeholder: string;
  right?: ReactNode;
}) {
  // Debounced, focus-preserving input: the parent list only re-filters once typing pauses.
  return (
    <SearchInput value={value} placeholder={placeholder} right={right}
      onChange={v => (v === '' ? onClear() : onChange(v))} />
  );
}

/* ─── Toolbar ────────────────────────────────────────────────────────── */
export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div role="toolbar" className="flex items-stretch gap-0.5 rounded-2xl border border-border bg-card p-1 shadow-sm">
      {children}
    </div>
  );
}

export function ToolbarDivider() {
  return <div aria-hidden className="w-px my-2 mx-0.5 bg-border flex-shrink-0" />;
}

type Tone = 'primary' | 'amber' | 'danger';

export function ToolbarButton({ icon, label, title, onClick, active = false, badge, badgeTone, tone = 'primary', disabled = false, disabledHint }: {
  icon: ReactNode;
  label: string;
  title?: string;
  onClick?: () => void;
  active?: boolean;
  badge?: number | string;
  badgeTone?: Tone;
  tone?: Tone;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const activeCls =
    tone === 'danger' ? 'bg-destructive/10 text-destructive'
    : tone === 'amber' ? 'bg-amber-500/12 text-amber-500'
    : 'bg-primary/12 text-primary';
  const bTone = badgeTone || tone;
  const badgeCls =
    bTone === 'danger' ? 'bg-destructive text-destructive-foreground'
    : bTone === 'amber' ? 'bg-amber-500 text-white'
    : 'bg-primary text-primary-foreground';
  const showBadge = badge !== undefined && badge !== 0 && badge !== '';

  return (
    <button
      type="button"
      title={title || label}
      aria-label={title || label}
      aria-pressed={active}
      aria-disabled={disabled}
      onClick={() => {
        if (disabled) { if (disabledHint) toast(disabledHint); return; }
        hapticTap();
        onClick?.();
      }}
      className={`relative flex-1 min-w-0 h-[46px] rounded-xl flex flex-col items-center justify-center gap-[3px] transition-all active:scale-95 ${
        active ? activeCls : 'text-foreground/45 hover:text-foreground/75 hover:bg-foreground/5'
      } ${disabled ? 'opacity-35' : ''}`}
    >
      <span className="relative flex items-center justify-center">
        {icon}
        {showBadge && (
          <span className={`absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-full text-[8px] font-black flex items-center justify-center leading-none shadow-sm ${badgeCls}`}>
            {badge}
          </span>
        )}
      </span>
      <span className="text-[9px] font-bold tracking-wide leading-none truncate max-w-full px-0.5">{label}</span>
    </button>
  );
}

/* ─── Trash shortcut (with live count) ───────────────────────────────── */
function organizerTrashCount(): number {
  try { return loadTrash().length; } catch { return 0; }
}

function useTrashCount(refreshKey: unknown): number {
  const { user } = useAuth();
  const signedIn = !!user;
  const [org, setOrg] = useState<number>(() => organizerTrashCount());
  const [cloud, setCloud] = useState(0);

  // Organizer trash lives on this device — follow changes made anywhere in the app
  useEffect(() => {
    const h = () => setOrg(organizerTrashCount());
    window.addEventListener(ORGANIZER_CHANGED_EVENT, h);
    return () => window.removeEventListener(ORGANIZER_CHANGED_EVENT, h);
  }, []);
  useEffect(() => { setOrg(organizerTrashCount()); }, [refreshKey]);

  // Quiz-history trash lives in the cloud — tiny count query, re-checked shortly after any change
  useEffect(() => {
    if (!signedIn) { setCloud(0); return; }
    let alive = true;
    const run = () => { getTrashCount({}).then(r => { if (alive) setCloud(r.count); }).catch(() => {}); };
    run();
    const t = setTimeout(run, 1200);
    return () => { alive = false; clearTimeout(t); };
  }, [signedIn, refreshKey]);

  return org + cloud;
}

export function TrashToolbarButton({ onOpen, refreshKey }: { onOpen?: () => void; refreshKey?: unknown }) {
  const count = useTrashCount(refreshKey);
  return (
    <ToolbarButton
      icon={<Trash2 className={TB_ICON} />}
      label="Trash"
      title={count > 0 ? `Open Trash (${count} item${count !== 1 ? 's' : ''})` : 'Open Trash'}
      tone="danger"
      active={count > 0}
      badge={count > 99 ? '99+' : count}
      badgeTone="danger"
      onClick={onOpen}
    />
  );
}

/* ─── Quiz mode (Main / Practice) picker — native select under a toolbar button ── */
export function SessionToolbarButton({ history, value, onChange }: {
  history: QuizResult[];
  value: SessionMode;
  onChange: (v: SessionMode) => void;
}) {
  const { options, practiceCount } = useMemo(() => {
    const avg = (rs: QuizResult[]) => rs.length ? Math.round(rs.reduce((a, r) => a + r.percentage, 0) / rs.length) : 0;
    const main = history.filter(r => (r.attemptType || 'main') === 'main');
    const practice = history.filter(r => r.attemptType === 'practice');
    const opts: { value: SessionMode; label: string; count: number; avg: number }[] = [
      { value: 'main', label: 'Main Quizzes', count: main.length, avg: avg(main) },
    ];
    if (practice.length > 0) opts.push({ value: 'all_practice', label: 'All Practice', count: practice.length, avg: avg(practice) });
    const nums = Array.from(new Set(practice.map(r => r.attemptNumber).filter((n): n is number => !!n))).sort((a, b) => a - b);
    nums.forEach(n => {
      const rs = practice.filter(r => r.attemptNumber === n);
      opts.push({ value: n, label: getSessionLabel(n), count: rs.length, avg: avg(rs) });
    });
    return { options: opts, practiceCount: practice.length };
  }, [history]);

  const active = value !== 'main';
  const icon = active ? <Dumbbell className={TB_ICON} /> : <BookOpen className={TB_ICON} />;
  const label = value === 'main' ? 'Mode' : value === 'all_practice' ? 'Practice' : `P${value}`;

  if (practiceCount === 0) {
    return <ToolbarButton icon={icon} label="Mode" title="Quiz mode" disabled disabledHint="No practice sessions yet — everything here is a main quiz" />;
  }

  return (
    <div className="relative flex flex-1 min-w-0">
      <ToolbarButton icon={icon} label={label} tone="amber" active={active} title={`Showing: ${getSessionLabel(value)}`} />
      <select
        aria-label="Quiz mode"
        value={String(value)}
        onChange={e => {
          hapticTap();
          const v = e.target.value;
          if (v === 'main' || v === 'all_practice') onChange(v as SessionMode);
          else onChange(Number(v));
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {options.map(o => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label} ({o.count}) · {o.avg}%
          </option>
        ))}
      </select>
    </div>
  );
}

/* ─── Bottom sheet + option rows (Sort, New …) ───────────────────────── */
export function ToolbarSheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-t-3xl sm:rounded-2xl w-full sm:max-w-xs max-h-[70vh] overflow-y-auto p-4 pb-8 sm:pb-4 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-foreground/15 mx-auto mb-3 sm:hidden" />
        <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-3">{title}</p>
        <div className="space-y-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function SheetOption({ icon, label, hint, selected = false, onClick }: {
  icon?: ReactNode; label: string; hint?: string; selected?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => { hapticTap(); onClick(); }}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all active:scale-[0.98] ${
        selected ? 'bg-primary/12 text-primary border border-primary/25' : 'text-foreground/70 hover:bg-foreground/5 border border-transparent'
      }`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold truncate">{label}</span>
        {hint && <span className="block text-[11px] font-medium text-foreground/35 mt-0.5">{hint}</span>}
      </span>
      {selected && <Check className="w-4 h-4 flex-shrink-0" />}
    </button>
  );
}

/* ─── Active-filter chips (single line, horizontally scrollable) ─────── */
export function ChipsBar({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-0.5 animate-fade-in">{children}</div>;
}

export function Chip({ label, prefix, tone = 'primary', onRemove }: {
  label: string; prefix?: string; tone?: 'primary' | 'amber'; onRemove?: () => void;
}) {
  const cls = tone === 'amber'
    ? 'bg-amber-500/10 border-amber-500/25 text-amber-500'
    : 'bg-primary/10 border-primary/25 text-primary';
  return (
    <span className={`flex-shrink-0 inline-flex items-center gap-1 h-7 pl-2.5 ${onRemove ? 'pr-1' : 'pr-2.5'} rounded-full border text-[11px] font-bold ${cls}`}>
      {prefix && <span className="opacity-60 font-semibold">{prefix}</span>}
      <span className="max-w-[110px] truncate">{label}</span>
      {onRemove && (
        <button type="button" onClick={() => { hapticTap(); onRemove(); }} aria-label={`Remove ${label}`}
          className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-foreground/10 active:scale-90 transition-all">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
