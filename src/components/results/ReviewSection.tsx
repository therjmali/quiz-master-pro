import { PopupShell, SwitchRow } from '../ui/ChoicePopup';
import { useState, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { toast } from 'sonner';
import { hapticTap } from '../../utils/haptics';
import { QuizResult, QuizSettings, ReportOrder, RationalePrefs, AIMode } from '../../types/quiz';
import ReviewCard from './ReviewCard';
import StatusFilterBar, { type BarCounts } from '../shared/StatusFilterBar';
import { useStatusFilter } from '../../hooks/useStatusFilter';
import { flattenAttempts, orderAttemptItems, type AttemptItem, type FacetKey } from '../../utils/attemptStats';
import { useQuestionBookmarks } from '../../hooks/useQuestionBookmarks';


interface Props {
  result: QuizResult;
  settings: QuizSettings;
  rationaleCache: Record<string, string>;
  getAiRationale: (q: string, ca: string, ua: string | null, s: 'correct' | 'wrong' | 'skipped') => Promise<string>;
  /** ✅ ❌ ⏭️ 🔖 pills that are on (empty = All); several can be on together */
  selected: readonly FacetKey[];
  onSelectedChange: (next: FacetKey[]) => void;
  reportOrder?: ReportOrder;
  rationalePrefs: RationalePrefs;
  onRationalePrefsChange: (p: RationalePrefs) => void;
  reportHelper: AIMode;
  onReportHelperChange: (m: AIMode) => void;
  onAskAI?: (context: { question: string; options: string[]; correctAnswer: string; userAnswer: string | null; rationale?: string; difficulty?: string; questionType?: string }) => void;
}

export default function ReviewSection({
  result, settings, rationaleCache, getAiRationale,
  selected: selectedProp, onSelectedChange,
  reportOrder = 'attempt',
  rationalePrefs, onRationalePrefsChange,
  reportHelper, onReportHelperChange, onAskAI,
}: Props) {
  const [explainAllLoading, setExplainAllLoading] = useState(false);
  const [explainProgress, setExplainProgress] = useState({ done: 0, total: 0 });
  const [explainDifficulty, setExplainDifficulty] = useState<string>('all');
  const [reviewPopup, setReviewPopup] = useState<'include' | null>(null);

  // Scroll preservation ref — captures scrollY before toggle, restores after render
  const savedScrollRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (savedScrollRef.current !== null) {
      window.scrollTo(0, savedScrollRef.current);
      savedScrollRef.current = null;
    }
  });

  const preserveScroll = useCallback((fn: () => void) => {
    savedScrollRef.current = window.scrollY;
    fn();
  }, []);

  // Bookmarks (same set and toggle as the Progress dashboard)
  const { bookmarkedSet, toggleBookmark } = useQuestionBookmarks();
  const handleToggleBookmark = useCallback((q: any, userAnswer: string | null) => {
    toggleBookmark(q, userAnswer, { quizTitle: result.quizTitle, subject: result.subject });
  }, [toggleBookmark, result.quizTitle, result.subject]);
  const [showBookmarked] = useState(false);

  // Master list: every question of this attempt, built once. It is never filtered, sorted or replaced.
  const master = useMemo(() => flattenAttempts([result]), [result]);
  const isBookmarked = useCallback((it: AttemptItem) => bookmarkedSet.has(it.q.question), [bookmarkedSet]);
  const { selected, toggle, clear, counts, displayed } = useStatusFilter<AttemptItem>(master, { selected: selectedProp, onSelectedChange, isBookmarked });

  const bookmarkedCount = useMemo(() => master.filter(it => bookmarkedSet.has(it.q.question)).length, [master, bookmarkedSet]);
  const barCounts = useMemo<BarCounts>(() => ({ ...counts, bookmarked: bookmarkedCount }), [counts, bookmarkedCount]);

  // View-only step on a COPY: book order.
  const filtered = useMemo(() => {
    return orderAttemptItems(displayed, reportOrder).map(it => ({
      key: it.key,
      q: reportOrder === 'original' ? { ...it.q, shuffledOpts: it.q.options } : it.q,
      userAnswer: it.userAnswer,
      attemptIdx: it.index,
    }));
  }, [displayed, reportOrder]);

  const difficultyFiltered = useMemo(() => {
    if (explainDifficulty === 'all') return filtered;
    return filtered.filter(({ q }) => (q.difficulty || '').toLowerCase() === explainDifficulty);
  }, [filtered, explainDifficulty]);

  const handleExplainAll = async () => {
    if (!rationalePrefs.showAi) {
      onRationalePrefsChange({ ...rationalePrefs, showAi: true });
      toast('AI Rationale enabled. Generating explanations...');
    }
    // Filter out already-cached questions
    const pending = difficultyFiltered.filter(({ q }) => !rationaleCache[q.question]);
    if (pending.length === 0) { toast.success('All explanations already loaded!'); return; }

    setExplainAllLoading(true);
    setExplainProgress({ done: 0, total: pending.length });
    let done = 0;
    const BATCH_SIZE = 4;
    try {
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);
        const promises = batch.map(({ q, userAnswer }) => {
          const status = userAnswer === q.correctAnswer ? 'correct'
            : userAnswer === null ? 'skipped' : 'wrong';
          return getAiRationale(q.question, q.correctAnswer, userAnswer, status)
            .then(() => { done++; setExplainProgress({ done, total: pending.length }); })
            .catch(() => { done++; setExplainProgress({ done, total: pending.length }); });
        });
        await Promise.all(promises);
      }
      toast.success('All explanations loaded!');
    } catch { toast.error('Some explanations failed.'); }
    finally { setExplainAllLoading(false); setExplainProgress({ done: 0, total: 0 }); }
  };

  const orderMeta = reportOrder === 'original'
    ? { icon: '📖', text: 'Original order — matches your pasted text & physical book', cls: 'bg-emerald-500/8 border-emerald-500/15 text-emerald-300' }
    : { icon: '🎯', text: 'Attempt order — as presented during your quiz', cls: 'bg-primary/8 border-primary/15 text-blue-300' };

  const aiEnabled = reportHelper !== 'off';

  return (
    <div className="w-full max-w-5xl mx-auto">

      {/* Order context badge */}
      <div className={`flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl border text-xs font-bold ${orderMeta.cls}`}>
        <span className="text-sm leading-none flex-shrink-0">{orderMeta.icon}</span>
        <span className="leading-snug">{orderMeta.text}</span>
      </div>

      {/* Status filter: the same bar as the Progress dashboard. Counts are static (whole attempt). */}
      <StatusFilterBar className="mb-2" selected={selected} onToggle={toggle} counts={barCounts} testId="review-filters" ariaLabel="Filter questions (select one or more)" />
      {selected.length > 0 && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-foreground/[0.04] px-3 py-1.5" data-testid="review-filter-summary">
          <span className="text-[11px] font-bold text-foreground/70">Showing <b className="text-foreground">{filtered.length}</b> of {counts.all}</span>
          <button type="button" onClick={() => { hapticTap(); clear(); }} className="rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-foreground/70 active:scale-95">Show all</button>
        </div>
      )}

      {/* View options: capsules, one line, swipe sideways (sticks cleanly below navbar) */}
      <div className="sticky top-[60px] sm:top-[68px] z-30 -mx-1 mb-4 bg-background/95 px-1 py-1.5 backdrop-blur-md pointer-events-auto shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
        <div className="qmp-capsules pointer-events-auto" data-testid="review-options">
          <button type="button" className="qmp-capsule pointer-events-auto cursor-pointer transition-all duration-200 active:scale-95" data-on={rationalePrefs.showBook || rationalePrefs.showAi} aria-haspopup="dialog" data-testid="review-opt-include" onClick={() => setReviewPopup('include')}>
            <span className="leading-none">📖</span> Rationale <span className="text-[9px] opacity-50">▾</span>
          </button>
          <label className="qmp-capsule relative cursor-pointer gap-1 pr-2 pointer-events-auto transition-all duration-200" data-on={explainDifficulty !== 'all'}>
            <span className="sr-only">Difficulty</span>
            <select
              value={explainDifficulty}
              onChange={e => preserveScroll(() => setExplainDifficulty(e.target.value))}
              className="relative z-10 cursor-pointer appearance-none bg-transparent pr-4 text-[0.8rem] font-bold outline-none pointer-events-auto"
              aria-label="Difficulty filter"
            >
              <option value="all">All levels</option>
              <option value="easy">🟢 Easy</option>
              <option value="medium">🟡 Medium</option>
              <option value="hard">🔴 Hard</option>
            </select>
            <span className="pointer-events-none absolute right-3 text-[9px] opacity-50">▾</span>
          </label>
          <button
            type="button"
            onClick={handleExplainAll}
            disabled={explainAllLoading || difficultyFiltered.length === 0}
            className="qmp-capsule pointer-events-auto cursor-pointer transition-all duration-200 active:scale-95 disabled:opacity-40"
            data-on={explainAllLoading}
          >
            {explainAllLoading
              ? <><span className="qmp-spinner" style={{ width: '10px', height: '10px' }} /> {explainProgress.total > 0 ? `${explainProgress.done}/${explainProgress.total}` : 'Starting…'}</>
              : <><span className="leading-none">✨</span> Explain {explainDifficulty === 'all' ? 'all' : difficultyFiltered.length}</>
            }
          </button>
        </div>
        <PopupShell open={reviewPopup === 'include'} onClose={() => setReviewPopup(null)} title="Rationale" subtitle="What to show under each question" icon="📖" testId="review-popup-include">
          <SwitchRow label="Book rationale" hint="The explanation from your notes" icon="📖" checked={rationalePrefs.showBook} onChange={v => preserveScroll(() => onRationalePrefsChange({ ...rationalePrefs, showBook: v }))} />
          <SwitchRow label="AI rationale" hint="Explanations written by your AI key" icon="🤖" checked={rationalePrefs.showAi} onChange={v => preserveScroll(() => onRationalePrefsChange({ ...rationalePrefs, showAi: v }))} />
        </PopupShell>
      </div>

      {/* Question list */}
      {filtered.length === 0 ? (
        <div className="text-foreground/35 text-sm text-center py-12 bg-muted/30 rounded-xl border border-border">
          No questions in this category.
        </div>
      ) : (
        <div className="space-y-5">
          {filtered
            .filter(({ q }) => !showBookmarked || bookmarkedSet.has(q.question))
            .map(({ key, q, userAnswer, attemptIdx }) => (
            <ReviewCard
              key={key}
              q={q}
              index={attemptIdx}
              userAnswer={userAnswer}
              rationaleCache={rationaleCache}
              getAiRationale={getAiRationale}
              showBook={rationalePrefs.showBook}
              showAi={rationalePrefs.showAi}
              aiEnabled={aiEnabled}
              bookmarked={bookmarkedSet.has(q.question)}
              onToggleBookmark={() => handleToggleBookmark(q, userAnswer)}
              onAskAI={onAskAI}
            />
          ))}
        </div>
      )}
    </div>
  );
}
