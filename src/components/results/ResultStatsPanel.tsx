import { Check } from 'lucide-react';
import { hapticTap } from '../../utils/haptics';
import { formatTime } from '../../utils/scoring';
import type { FacetKey, StatusFilter } from '../../utils/attemptStats';

interface Props {
  totalQuestions: number;
  correct: number;
  wrong: number;
  skipped: number;
  timeTaken: number;
  accuracy: number;
  rawPct?: number;
  /** ✅ ❌ ⏭️ tiles that are on (empty = Total / All) */
  selected: readonly FacetKey[];
  onToggle: (f: StatusFilter) => void;
}

interface Tile { key: StatusFilter; label: string; value: number; tone: string; on: string; bar: string }

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/**
 * ONE panel for the quiz's numbers (it replaces the old "Question Breakdown" strip + "tap card to filter" grid that showed
 * the same numbers twice). The four tiles are the filter: tap one or several to narrow the review list below; Total shows all.
 */
export default function ResultStatsPanel({ totalQuestions, correct, wrong, skipped, timeTaken, accuracy, rawPct, selected, onToggle }: Props) {
  const tiles: Tile[] = [
    { key: 'all', label: 'Total', value: totalQuestions, tone: 'text-indigo-600 dark:text-indigo-300', on: 'border-indigo-500/60 bg-indigo-500/12 ring-indigo-500/35', bar: '' },
    { key: 'correct', label: 'Correct', value: correct, tone: 'text-emerald-600 dark:text-emerald-400', on: 'border-emerald-500/60 bg-emerald-500/12 ring-emerald-500/35', bar: 'bg-emerald-500' },
    { key: 'wrong', label: 'Wrong', value: wrong, tone: 'text-red-600 dark:text-red-400', on: 'border-red-500/60 bg-red-500/12 ring-red-500/35', bar: 'bg-red-500' },
    { key: 'skipped', label: 'Skipped', value: skipped, tone: 'text-amber-600 dark:text-amber-400', on: 'border-amber-500/60 bg-amber-500/14 ring-amber-500/35', bar: 'bg-amber-500' },
  ];
  const secsPerQ = totalQuestions > 0 ? Math.round(timeTaken / totalQuestions) : 0;

  return (
    <section className="rx-stats w-full" data-testid="result-stats" aria-label="Question breakdown">
      <header className="flex items-center justify-between gap-2 mb-2.5">
        <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-foreground/55">📋 Question breakdown</h3>
        {rawPct !== undefined && (
          <span className="rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-300">
            Raw Score: <b className="font-black">{rawPct}%</b>
          </span>
        )}
      </header>

      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Filter the review by status (select one or more)">
        {tiles.map(t => {
          const active = t.key === 'all' ? selected.length === 0 : selected.includes(t.key as FacetKey);
          return (
            <button key={t.key} type="button" aria-pressed={active} aria-label={`${t.label} ${t.value}`} data-testid={`stat-tile-${t.key}`}
              onClick={() => { hapticTap(); onToggle(t.key); }}
              className={`rx-tile relative flex min-w-0 flex-col items-center justify-center rounded-2xl border px-1 py-3 transition-all duration-200 active:scale-95 ${active ? `${t.on} ring-2 shadow-md` : 'border-border bg-foreground/[0.04] hover:bg-foreground/[0.07]'}`}>
              {active && t.key !== 'all' && <Check className="absolute right-1.5 top-1.5 h-3 w-3 text-foreground/70" aria-hidden />}
              <span className={`text-2xl font-black leading-none tabular-nums sm:text-3xl ${t.tone}`}>{t.value}</span>
              {t.key !== 'all' && <span className="mt-1 text-[11px] font-bold tabular-nums text-foreground/60">{pct(t.value, totalQuestions)}%</span>}
              <span className="mt-1 text-[10px] font-black uppercase tracking-wider text-foreground/60">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* proportion bar: correct | wrong | skipped */}
      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/10" role="img" aria-label={`${correct} correct, ${wrong} wrong, ${skipped} skipped`}>
        {[{ n: correct, c: 'bg-emerald-500' }, { n: wrong, c: 'bg-red-500' }, { n: skipped, c: 'bg-amber-500' }].map((s, i) => (
          s.n > 0 ? <div key={i} className={`${s.c} h-full transition-[width] duration-700`} style={{ width: `${(s.n / Math.max(1, totalQuestions)) * 100}%` }} /> : null
        ))}
      </div>

      {/* time · accuracy · pace */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { icon: '⏱️', value: formatTime(timeTaken), label: 'Time', tone: 'text-violet-600 dark:text-violet-300' },
          { icon: '🎯', value: `${accuracy}%`, label: 'Accuracy', tone: 'text-pink-600 dark:text-pink-300' },
          { icon: '⚡', value: secsPerQ > 0 ? `${secsPerQ}s` : '—', label: 'Pace', tone: 'text-sky-600 dark:text-sky-300' },
        ].map(m => (
          <div key={m.label} className="flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-border bg-foreground/[0.03] px-2 py-2.5" data-testid={`stat-${m.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <span className="text-lg leading-none" aria-hidden>{m.icon}</span>
            <span className="min-w-0 leading-tight">
              <span className={`block truncate text-base font-black tabular-nums ${m.tone}`}>{m.value}</span>
              <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-foreground/55">{m.label}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold text-foreground/50">Tap tiles to filter the review. Select several to combine.</p>
    </section>
  );
}
