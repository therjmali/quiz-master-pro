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

const FILTER_BTNS: { key: Filter; label: string; icon: string; color: string }[] = [
  { key: 'all',     label: 'All',     icon: '📚', color: 'text-blue-400'    },
  { key: 'correct', label: 'Correct', icon: '✓',  color: 'text-emerald-400' },
  { key: 'wrong',   label: 'Wrong',   icon: '✗',  color: 'text-red-400'     },
  { key: 'skipped', label: 'Skipped', icon: '⏭',  color: 'text-amber-400'   },
  { key: 'bookmarked', label: 'Bookmarked', icon: '🔖', color: 'text-violet-400' },
];

function TogglePill({ active, icon, label, activeClass, onClick }: {
  active: boolean; icon: string; label: string; activeClass: string; onClick: () => void;
}) {
  return (
    <button
      onClick={() => { hapticTap(); onClick(); }}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all active:scale-95 flex-shrink-0 h-8 ${
        active ? activeClass : 'bg-foreground/5 border-border text-foreground/30 hover:text-foreground/50'
      }`}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span>{label}</span>
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
    <div className="w-full max-w-3xl mx-auto">

      {/* Order context badge */}
      <div className={`flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl border text-xs font-bold ${orderMeta.cls}`}>
        <span className="text-sm leading-none flex-shrink-0">{orderMeta.icon}</span>
        <span className="leading-snug">{orderMeta.text}</span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 mb-3 bg-muted/20 p-2.5 rounded-2xl border border-border">
        {FILTER_BTNS.map(({ key, label, icon, color }) => (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-sm transition-all ${
              activeFilter === key
                ? 'bg-foreground/12 border border-foreground/15 text-foreground shadow-sm'
                : 'text-foreground/45 hover:text-foreground/80 hover:bg-foreground/5'
            }`}
          >
            <span className={`${color} text-base leading-none`}>{icon}</span>
            <span>{label}</span>
          </button>
        ))}

        {/* Bookmark filter */}
        {bookmarkedCount > 0 && (
          <button
            onClick={() => { hapticTap(); setShowBookmarked(b => !b); }}
            className={`flex items-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-sm transition-all ${
              showBookmarked
                ? 'bg-amber-500/15 border border-amber-500/25 text-amber-400 shadow-sm'
                : 'text-amber-400/60 hover:text-amber-400 hover:bg-amber-500/5'
            }`}
          >
            <span className="text-base leading-none">📌</span>
            <span>{bookmarkedCount}</span>
          </button>
        )}
      </div>

      {/* ── Sticky Toggle Pills Row ── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md py-2 -mx-1 px-1 mb-4 border-b border-transparent [&:not(:first-child)]:border-border/50">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <TogglePill
            active={showAnswersInline}
            icon="👁"
            label="Answers"
            activeClass="bg-blue-500/15 border-blue-500/30 text-blue-400"
            onClick={() => preserveScroll(() => setShowAnswersInline(!showAnswersInline))}
          />
          <TogglePill
            active={rationalePrefs.showBook}
            icon="📖"
            label="Book"
            activeClass="bg-amber-500/15 border-amber-500/30 text-amber-400"
            onClick={() => preserveScroll(() => onRationalePrefsChange({ ...rationalePrefs, showBook: !rationalePrefs.showBook }))}
          />
          <TogglePill
            active={rationalePrefs.showAi}
            icon="💡"
            label="AI"
            activeClass="bg-purple-500/15 border-purple-500/30 text-purple-400"
            onClick={() => preserveScroll(() => onRationalePrefsChange({ ...rationalePrefs, showAi: !rationalePrefs.showAi }))}
          />
          <select
            value={explainDifficulty}
            onChange={e => preserveScroll(() => setExplainDifficulty(e.target.value))}
            className="h-8 px-2 py-1 rounded-xl border text-[11px] font-bold bg-foreground/5 border-border text-foreground/70 appearance-none cursor-pointer transition-all hover:bg-foreground/10 flex-shrink-0"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 12 12%27%3e%3cpath fill=%27%23888%27 d=%27M3 5l3 3 3-3%27/%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', paddingRight: '20px' }}
          >
            <option value="all">All</option>
            <option value="easy">🟢 Easy</option>
            <option value="medium">🟡 Medium</option>
            <option value="hard">🔴 Hard</option>
          </select>
          <button
            onClick={handleExplainAll}
            disabled={explainAllLoading || difficultyFiltered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all active:scale-95 flex-shrink-0 h-8 bg-purple-500/15 border-purple-500/30 text-purple-400 hover:bg-purple-500/25 disabled:opacity-40 whitespace-nowrap"
          >
            {explainAllLoading
              ? <><span className="qmp-spinner" style={{ width: '10px', height: '10px' }} /> {explainProgress.total > 0 ? `${explainProgress.done}/${explainProgress.total}` : 'Starting...'}</>
              : <><span className="text-sm leading-none">✨</span> Explain {explainDifficulty === 'all' ? 'All' : difficultyFiltered.length}</>
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
