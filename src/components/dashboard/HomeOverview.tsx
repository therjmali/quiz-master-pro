import { lazy, Suspense } from 'react';
import { ChevronRight } from 'lucide-react';
import type { QuizResult } from '../../types/quiz';

// recharts + the calendar are only needed once the section scrolls into use, keep them out of the first paint
const OverviewTab = lazy(() => import('../profile/OverviewTab'));

interface Props {
  history: QuizResult[];
  filteredHistory: QuizResult[];
  subjectFilter?: string;
  onViewResult: (r: QuizResult) => void;
  onDeleteHistory: (id: string) => void;
  onOpenProgress?: () => void;
}

/**
 * Home -> Overview. Study calendar, score trend, AI study strategy, every quiz you took (search, filter, open, delete)
 * and data tools in one premium section. The Progress tab keeps only the combined dashboards of all quizzes.
 */
export default function HomeOverview({ history, filteredHistory, subjectFilter, onViewResult, onDeleteHistory, onOpenProgress }: Props) {
  return (
    <section data-testid="home-overview" aria-label="Overview" className="space-y-3">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-gradient-to-br from-indigo-500/12 via-card to-violet-500/10 px-4 py-3.5 flex items-center gap-3 shadow-sm">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-xl shadow-lg shadow-indigo-600/30" aria-hidden>📊</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45">Your study at a glance</p>
          <h2 className="text-lg font-black leading-tight text-foreground">Overview</h2>
          <p className="text-[11px] font-semibold text-foreground/55">Calendar · trend · every quiz you took</p>
        </div>
        {onOpenProgress && (
          <button type="button" onClick={onOpenProgress} data-testid="home-overview-progress"
            className="flex shrink-0 items-center gap-0.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-[11px] font-bold text-primary transition-transform active:scale-95">
            Progress <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-3xl border border-border bg-foreground/[0.04]" aria-busy="true" />}>
        <OverviewTab history={history} filteredHistory={filteredHistory} onViewResult={onViewResult} onDeleteHistory={onDeleteHistory} subjectFilter={subjectFilter} difficultyFilter="all" />
      </Suspense>
    </section>
  );
}
