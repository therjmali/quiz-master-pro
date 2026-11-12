import { useState, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { toast } from 'sonner';
import { hapticTap } from '../../utils/haptics';
import { usePersistedState } from '../../hooks/usePersistedState';
import { QuizResult, QuizSettings, ReportOrder, RationalePrefs, AIMode } from '../../types/quiz';
import ReviewCard from './ReviewCard';
import { loadFileTree, saveFileTree, addBookmarkToTree, removeBookmarkNode, isQuestionBookmarked, getAllBookmarks, FileNode, BookmarkData } from '../../utils/fileTree';

type Filter = 'all' | 'correct' | 'wrong' | 'skipped' | 'bookmarked';

interface Props {
  result: QuizResult;
  settings: QuizSettings;
  rationaleCache: Record<string, string>;
  getAiRationale: (q: string, ca: string, ua: string | null, s: 'correct' | 'wrong' | 'skipped') => Promise<string>;
  activeFilter: Filter;
  onFilterChange: (f: Filter) => void;
  reportOrder?: ReportOrder;
  rationalePrefs: RationalePrefs;
  onRationalePrefsChange: (p: RationalePrefs) => void;
  reportHelper: AIMode;
  onReportHelperChange: (m: AIMode) => void;
  onAskAI?: (context: { question: string; options: string[]; correctAnswer: string; userAnswer: string | null; rationale?: string; difficulty?: string; questionType?: string }) => void;
}

interface QPair {
  q: ReturnType<typeof Object.assign>;
  userAnswer: string | null;
  attemptIdx: number;
}

/** "All" is the only filter with a word; the rest are emoji only (their names are in aria-label / title). */
const FILTER_BTNS: { key: Filter; label: string; icon: string; color: string }[] = [
  { key: 'all',     label: 'All',        icon: '📚', color: '' },
  { key: 'correct', label: 'Correct',    icon: '✅', color: '' },
  { key: 'wrong',   label: 'Wrong',      icon: '❌', color: '' },
  { key: 'skipped', label: 'Skipped',    icon: '⏭️', color: '' },
  { key: 'bookmarked', label: 'Bookmarked', icon: '🔖', color: '' },
];

function TogglePill({ active, icon, label, onClick }: {
  active: boolean; icon: string; label: string; activeClass?: string; onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={() => { hapticTap(); onClick(); }} className="qmp-capsule">
      <span className="leading-none">{icon}</span><span>{label}</span>
    </button>
  );
}

export default function ReviewSection({
  result, settings, rationaleCache, getAiRationale,
  activeFilter, onFilterChange,
  reportOrder = 'attempt',
  rationalePrefs, onRationalePrefsChange,
  reportHelper, onReportHelperChange, onAskAI,
}: Props) {
  const [explainAllLoading, setExplainAllLoading] = useState(false);
  const [explainProgress, setExplainProgress] = useState({ done: 0, total: 0 });
  const [explainDifficulty, setExplainDifficulty] = useState<string>('all');
  const [showAnswersInline, setShowAnswersInline] = usePersistedState('qmp_show_answers_inline', true);

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

  // File-tree based bookmark system
  const [fileTree, setFileTree] = useState<FileNode>(() => loadFileTree());
  const bookmarkedSet = useMemo(() => {
    const set = new Set<string>();
    getAllBookmarks(fileTree).forEach(b => { if (b.bookmarkData) set.add(b.bookmarkData.question); });
    return set;
  }, [fileTree]);
  const [showBookmarked, setShowBookmarked] = useState(false);

  const handleToggleBookmark = useCallback((q: any, userAnswer: string | null) => {
    setFileTree(prev => {
      const isAlready = isQuestionBookmarked(prev, q.question);
      if (isAlready) {
        const allBm = getAllBookmarks(prev);
        const target = allBm.find(b => b.bookmarkData?.question === q.question);
        if (target) {
          const updated = removeBookmarkNode(prev, target.id);
          toast.success('🔖 Bookmark removed');
          return JSON.parse(JSON.stringify(updated));
        }
        return prev;
      } else {
        const data: BookmarkData = {
          question: q.question,
          options: q.options || [],
          correctAnswer: q.correctAnswer,
          userAnswer,
          rationale: q.rationale,
          difficulty: q.difficulty,
          questionType: q.questionType,
          quizTitle: result.quizTitle || 'Untitled Quiz',
          subject: result.subject || 'General',
          bookmarkedAt: Date.now(),
        };
        const updated = addBookmarkToTree(prev, data);
        toast.success(`🔖 Saved to Bookmarks / ${result.subject || 'General'} / ${result.quizTitle || 'Quiz'}`);
        return JSON.parse(JSON.stringify(updated));
      }
    });
  }, [result.subject, result.quizTitle]);

  const counts = useMemo(() => {
    let correct = 0, wrong = 0, skipped = 0;
    result.quizData.forEach((q, i) => {
      const ua = result.userAnswers[i] ?? null;
      if (ua === null) skipped++;
      else if (ua === q.correctAnswer || q.correctAnswers?.includes(ua)) correct++;
      else wrong++;
    });
    return { correct, wrong, skipped } as Record<string, number>;
  }, [result]);

  const bookmarkedCount = useMemo(() => {
    return result.quizData.filter(q => bookmarkedSet.has(q.question)).length;
  }, [result.quizData, bookmarkedSet]);

  const filtered = useMemo<QPair[]>(() => {
    const pairs: QPair[] = result.quizData.map((q, attemptIdx) => ({
      q: reportOrder === 'original' ? { ...q, shuffledOpts: q.options } : q,
      userAnswer: result.userAnswers[attemptIdx] ?? null,
      attemptIdx,
    }));

    const sorted = reportOrder === 'original'
      ? [...pairs].sort(
          (a, b) =>
            ((a.q as any).originalIndex ?? a.attemptIdx) -
            ((b.q as any).originalIndex ?? b.attemptIdx)
        )
      : pairs;

    return sorted.filter(({ q, userAnswer }) => {
      const isCorrect = userAnswer === q.correctAnswer;
      const isSkipped = userAnswer === null;
      if (activeFilter === 'correct') return isCorrect;
      if (activeFilter === 'wrong')   return !isCorrect && !isSkipped;
      if (activeFilter === 'skipped') return isSkipped;
      if (activeFilter === 'bookmarked') return bookmarkedSet.has(q.question);
      return true;
    });
  }, [result, reportOrder, activeFilter]);

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

      {/* Status filters: capsules, one line, swipe sideways */}
      <div className="qmp-capsules mb-2" role="tablist" aria-label="Filter questions" data-testid="review-filters">
        {FILTER_BTNS.map(({ key, label, icon }) => {
          const n = key === 'all' ? result.quizData.length : key === 'bookmarked' ? bookmarkedCount : counts[key];
          return (
            <button key={key} type="button" role="tab" aria-selected={activeFilter === key} aria-pressed={activeFilter === key}
              aria-label={`${label}${n !== undefined ? ` (${n})` : ''}`} title={label}
              onClick={() => { hapticTap(); onFilterChange(key); }}
              className={`qmp-capsule ${key === 'all' ? '' : 'qmp-capsule--emoji'}`}>
              <span className="leading-none">{icon}</span>{key === 'all' && <span>All</span>}
            </button>
          );
        })}
      </div>

      {/* View options: capsules, one line, swipe sideways */}
      <div className="sticky top-0 z-30 -mx-1 mb-4 bg-background/95 px-1 py-1.5 backdrop-blur-md">
        <div className="qmp-capsules" data-testid="review-options">
          <TogglePill
            active={showAnswersInline}
            icon="👁️"
            label="Answers"
            activeClass=""
            onClick={() => preserveScroll(() => setShowAnswersInline(!showAnswersInline))}
          />
          <TogglePill
            active={rationalePrefs.showBook}
            icon="📖"
            label="Book"
            activeClass=""
            onClick={() => preserveScroll(() => onRationalePrefsChange({ ...rationalePrefs, showBook: !rationalePrefs.showBook }))}
          />
          <TogglePill
            active={rationalePrefs.showAi}
            icon="💡"
            label="AI"
            activeClass=""
            onClick={() => preserveScroll(() => onRationalePrefsChange({ ...rationalePrefs, showAi: !rationalePrefs.showAi }))}
          />
          <label className="qmp-capsule relative cursor-pointer gap-1 pr-2" data-on={explainDifficulty !== 'all'}>
            <span className="sr-only">Difficulty</span>
            <select
              value={explainDifficulty}
              onChange={e => preserveScroll(() => setExplainDifficulty(e.target.value))}
              className="cursor-pointer appearance-none bg-transparent pr-4 text-[0.8rem] font-bold outline-none"
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
            className="qmp-capsule disabled:opacity-40"
            data-on={explainAllLoading}
          >
            {explainAllLoading
              ? <><span className="qmp-spinner" style={{ width: '10px', height: '10px' }} /> {explainProgress.total > 0 ? `${explainProgress.done}/${explainProgress.total}` : 'Starting…'}</>
              : <><span className="leading-none">✨</span> Explain {explainDifficulty === 'all' ? 'all' : difficultyFiltered.length}</>
            }
          </button>
        </div>
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
            .map(({ q, userAnswer, attemptIdx }, displayIdx) => (
            <ReviewCard
              key={`${attemptIdx}-${displayIdx}`}
              q={q}
              index={attemptIdx}
              userAnswer={userAnswer}
              rationaleCache={rationaleCache}
              getAiRationale={getAiRationale}
              showBook={rationalePrefs.showBook}
              showAi={rationalePrefs.showAi}
              showAnswersInline={showAnswersInline}
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
