import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, Search, SlidersHorizontal, X } from 'lucide-react';
import type { QuizResult } from '../../types/quiz';
import { derivePercentage } from '../../utils/scoring';
import { getSubjectColors } from '../../utils/subjects';
import { hapticTap } from '../../utils/haptics';
import { DEFAULT_SWITCH_FILTERS, activeSwitchFilters, filterSwitchList, subjectCounts, subjectOf, type DatePreset, type SwitchFilters, type SwitchSort } from '../../utils/quizSwitcher';

interface Props {
  list: readonly QuizResult[];
  current: QuizResult;
  onOpen: (r: QuizResult) => void;
  onClose: () => void;
}

const PRESETS: { v: DatePreset; label: string }[] = [
  { v: 'all', label: 'Any date' }, { v: 'today', label: 'Today' }, { v: '7d', label: '7 days' }, { v: '30d', label: '30 days' }, { v: 'custom', label: 'Range' },
];
const SORTS: { v: SwitchSort; label: string }[] = [{ v: 'new', label: 'Newest' }, { v: 'old', label: 'Oldest' }, { v: 'score', label: 'Top score' }];
const PAGE = 60;

const sameResult = (a: QuizResult, b: QuizResult) => (a.id && b.id ? a.id === b.id : a.timestamp === b.timestamp);
const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * "Jump to a quiz": a premium popup (bottom sheet on phones, centred card on tablets) that filters every quiz you took by
 * name, subject (several at once) and date (presets or a range), sorts them and opens the one you tap.
 */
export default function QuizSwitcherSheet({ list, current, onOpen, onClose }: Props) {
  const [f, setF] = useState<SwitchFilters>(DEFAULT_SWITCH_FILTERS);
  const [visible, setVisible] = useState(PAGE);
  const panelRef = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<SwitchFilters>) => { setF(prev => ({ ...prev, ...patch })); setVisible(PAGE); };

  const subjects = useMemo(() => subjectCounts(list), [list]);
  const shown = useMemo(() => filterSwitchList(list, f), [list, f]);
  const active = activeSwitchFilters(f);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return createPortal(
    <div className="qmp-switch-root" data-testid="quiz-switcher">
      <div className="qmp-switch-backdrop" onClick={onClose} aria-hidden />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Jump to a quiz" tabIndex={-1} className="qmp-switch-panel">
        <div className="qmp-switch-grip" aria-hidden />
        <header className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-foreground/45">Your quizzes</p>
            <h2 className="text-xl font-black leading-tight text-foreground">Jump to a quiz</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" data-testid="quiz-switcher-close"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-foreground/[0.05] text-foreground/70 active:scale-95"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-3 px-4 pb-3">
          {/* quiz name */}
          <label className="flex items-center gap-2 rounded-2xl border border-border bg-foreground/[0.04] px-3 py-2.5 focus-within:border-primary/50">
            <Search className="h-4 w-4 shrink-0 text-foreground/45" aria-hidden />
            <input type="search" value={f.query} onChange={e => set({ query: e.target.value })} placeholder="Search a quiz or subject" aria-label="Search quizzes"
              data-testid="switcher-search" className="min-w-0 flex-1 bg-transparent text-[0.95rem] font-semibold text-foreground outline-none placeholder:text-foreground/40" />
            {f.query && <button type="button" aria-label="Clear search" onClick={() => set({ query: '' })} className="text-foreground/45"><X className="h-4 w-4" /></button>}
          </label>

          {/* subject (several at once) */}
          {subjects.length > 1 && (
            <div>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45">Subject</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Subjects (select one or more)" data-testid="switcher-subjects">
                {subjects.map(({ subject, count }) => {
                  const on = f.subjects.includes(subject);
                  const c = getSubjectColors(subject);
                  return (
                    <button key={subject} type="button" aria-pressed={on} data-testid={`switcher-subject-${subject}`}
                      onClick={() => { hapticTap(); set({ subjects: on ? f.subjects.filter(s => s !== subject) : [...f.subjects, subject] }); }}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${on ? 'border-primary bg-primary/15 text-foreground' : `border-border bg-foreground/[0.04] text-foreground/70`}`}>
                      <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden />{subject}<span className="text-[10px] opacity-60">{count}</span>
                      {on && <Check className="h-3 w-3" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* date */}
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45"><CalendarDays className="h-3 w-3" aria-hidden /> Date</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Date" data-testid="switcher-dates">
              {PRESETS.map(p => (
                <button key={p.v} type="button" role="radio" aria-checked={f.preset === p.v} data-testid={`switcher-date-${p.v}`}
                  onClick={() => { hapticTap(); set({ preset: p.v }); }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${f.preset === p.v ? 'border-primary bg-primary/15 text-foreground' : 'border-border bg-foreground/[0.04] text-foreground/70'}`}>{p.label}</button>
              ))}
            </div>
            {f.preset === 'custom' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([['from', 'From'], ['to', 'To']] as const).map(([k, label]) => (
                  <label key={k} className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-foreground/50">{label}
                    <input type="date" value={f[k]} onChange={e => set({ [k]: e.target.value } as Partial<SwitchFilters>)} data-testid={`switcher-${k}`}
                      className="rounded-xl border border-border bg-foreground/[0.04] px-2.5 py-2 text-sm font-semibold normal-case tracking-normal text-foreground outline-none focus:border-primary/50" />
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* sort + count */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Sort">
              <SlidersHorizontal className="h-3.5 w-3.5 text-foreground/45" aria-hidden />
              {SORTS.map(s => (
                <button key={s.v} type="button" role="radio" aria-checked={f.sort === s.v} data-testid={`switcher-sort-${s.v}`} onClick={() => set({ sort: s.v })}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${f.sort === s.v ? 'bg-foreground text-background' : 'text-foreground/60'}`}>{s.label}</button>
              ))}
            </div>
            <span className="text-[11px] font-bold text-foreground/55" data-testid="switcher-count">{shown.length} of {list.length}</span>
          </div>
        </div>

        {/* results */}
        <ul className="qmp-switch-list" data-testid="switcher-list">
          {shown.slice(0, visible).map(r => {
            const pct = derivePercentage(r.netScore, r.maxScore);
            const isCurrent = sameResult(r, current);
            const passed = pct >= (r.passMark ?? 50);
            const sub = subjectOf(r);
            const c = getSubjectColors(sub);
            return (
              <li key={r.id || r.timestamp}>
                <button type="button" data-testid="switcher-row" data-current={isCurrent} aria-current={isCurrent ? 'true' : undefined}
                  onClick={() => { hapticTap(); if (isCurrent) onClose(); else onOpen(r); }}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all active:scale-[0.985] ${isCurrent ? 'border-primary/50 bg-primary/10' : 'border-border bg-foreground/[0.03] hover:bg-foreground/[0.06]'}`}>
                  <span className={`h-10 w-1.5 shrink-0 rounded-full ${c.dot}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.95rem] font-extrabold text-foreground">{r.quizTitle || 'Untitled quiz'}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-foreground/55">
                      <span className={`rounded-md border px-1.5 py-px text-[10px] font-bold ${c.badge}`}>{sub}</span>
                      <span>{fmtDate(r.timestamp)}</span>
                      {isCurrent && <span className="font-black text-primary">Viewing</span>}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-black tabular-nums ${passed ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'border-red-500/30 bg-red-500/12 text-red-600 dark:text-red-400'}`}>{pct}%</span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm font-semibold text-foreground/55" data-testid="switcher-empty">No quiz matches these filters.</li>
          )}
          {shown.length > visible && (
            <li><button type="button" onClick={() => setVisible(v => v + PAGE)} className="w-full rounded-2xl border border-border py-2.5 text-xs font-bold text-foreground/70">Show more ({shown.length - visible})</button></li>
          )}
        </ul>

        <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={() => { setF(DEFAULT_SWITCH_FILTERS); setVisible(PAGE); }} disabled={active === 0} data-testid="switcher-reset"
            className="rounded-full border border-border px-4 py-2 text-xs font-bold text-foreground/70 disabled:opacity-35 active:scale-95">Reset filters{active > 0 ? ` (${active})` : ''}</button>
          <button type="button" onClick={onClose} className="rounded-full bg-foreground px-5 py-2 text-xs font-black text-background active:scale-95">Done</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
