import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import { toast } from 'sonner';
import { ReportOrder, RationalePrefs, AIMode } from '../../types/quiz';
import ReviewCard from '../results/ReviewCard';
import { orderAttemptItems, type AttemptItem } from '../../utils/attemptStats';

interface Props {
  type: 'correct' | 'wrong' | 'skipped';
  /** Already status-filtered slice of the master list (the master itself is never touched here). */
  items: readonly AttemptItem[];
  /** Static total for this status (the same number as the filter pill). */
  total?: number;
  rationaleCache: Record<string, string>;
  getAiRationale: (q: string, ca: string, ua: string | null, s: 'correct' | 'wrong' | 'skipped') => Promise<string>;
  reportOrder?: ReportOrder;
  rationalePrefs: RationalePrefs;
  reportHelper: AIMode;
}

const PAGE_SIZE = 30;

const HistoryList = memo(function HistoryList({
  type, items, total, rationaleCache, getAiRationale,
  reportOrder = 'attempt', rationalePrefs, reportHelper,
}: Props) {
  const [explainAllLoading, setExplainAllLoading] = useState(false);
  const [explainProgress, setExplainProgress] = useState({ done: 0, total: 0 });
  const [explainDifficulty, setExplainDifficulty] = useState<string>('all');

  // Book order is applied to a COPY; the master list keeps attempt order.
  const displayItems = useMemo(() => orderAttemptItems(items, reportOrder).map(it => ({
    ...it,
    q: reportOrder === 'original' ? { ...it.q, shuffledOpts: it.q.options } : it.q,
    date: new Date(it.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  })), [items, reportOrder]);
  const shownTotal = total ?? displayItems.length;

  const headingColor = type === 'correct' ? 'text-emerald-500' : type === 'wrong' ? 'text-red-500' : 'text-amber-500';
  const badgeCls    = type === 'correct'
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
    : type === 'wrong'
    ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25'
    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25';

  const orderBadge = reportOrder === 'original'
    ? { icon: '📖', text: 'Original order', cls: 'bg-emerald-500/8 border-emerald-500/15 text-emerald-600 dark:text-emerald-400' }
    : { icon: '🎯', text: 'Attempt order',  cls: 'bg-primary/8 border-primary/15 text-primary' };

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [explainDifficulty, type]);
  const loadMore = useCallback(() => setVisibleCount(v => v + PAGE_SIZE), []);

  // Auto-load more on scroll via IntersectionObserver
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const difficultyFilteredItems = useMemo(() => {
    if (explainDifficulty === 'all') return displayItems;
    return displayItems.filter(({ level }) => level === explainDifficulty);
  }, [displayItems, explainDifficulty]);

  const handleExplainAll = async () => {
    if (!rationalePrefs.showAi) { toast('Enable AI Rationale first.'); return; }
    const pending = difficultyFilteredItems.slice(0, 30).filter(({ q }) => !rationaleCache[q.question]);
    if (pending.length === 0) { toast.success('All explanations already loaded!'); return; }

    setExplainAllLoading(true);
    setExplainProgress({ done: 0, total: pending.length });
    let done = 0;
    const BATCH_SIZE = 4;
    try {
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(({ q, userAnswer, status }) => {
          return getAiRationale(q.question, q.correctAnswer, userAnswer, status)
            .then(() => { done++; setExplainProgress({ done, total: pending.length }); })
            .catch(() => { done++; setExplainProgress({ done, total: pending.length }); });
        }));
      }
      toast.success('Explanations loaded!');
    } catch {}
    finally { setExplainAllLoading(false); setExplainProgress({ done: 0, total: 0 }); }
  };

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`text-sm font-bold uppercase tracking-widest ${headingColor}`}>
            {type === 'correct' ? '✓' : type === 'wrong' ? '✗' : '⏭'}{' '}
            {type === 'correct' ? 'Correct Answers' : type === 'wrong' ? 'Mistakes History' : 'Skipped Questions'}
          </span>
          <span className={`text-xs px-3 py-1.5 rounded-lg font-bold border ${badgeCls}`}>
            {shownTotal} {type === 'correct' ? 'correct' : type === 'wrong' ? 'mistakes' : 'skipped'}
          </span>
          <span className={`text-[10px] px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1 ${orderBadge.cls}`}>
            <span>{orderBadge.icon}</span><span>{orderBadge.text}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={explainDifficulty}
            onChange={e => setExplainDifficulty(e.target.value)}
            className="h-9 px-2 py-1 rounded-xl border text-[11px] font-bold bg-foreground/5 border-border text-foreground/70 appearance-none cursor-pointer transition-all hover:bg-foreground/10 flex-shrink-0"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 12 12%27%3e%3cpath fill=%27%23888%27 d=%27M3 5l3 3 3-3%27/%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', paddingRight: '20px' }}
          >
            <option value="all">All</option>
            <option value="easy">🟢 Easy</option>
            <option value="medium">🟡 Medium</option>
            <option value="hard">🔴 Hard</option>
          </select>
          <button onClick={handleExplainAll} disabled={explainAllLoading || difficultyFilteredItems.length === 0 || !rationalePrefs.showAi}
            className="flex items-center justify-center gap-2 bg-violet-500/15 hover:bg-violet-500/25 text-violet-600 dark:text-violet-300 text-xs px-4 py-2.5 rounded-xl font-bold border border-violet-500/25 transition-colors disabled:opacity-40 whitespace-nowrap"
            title={!rationalePrefs.showAi ? 'Enable AI Rationale first' : undefined}>
            {explainAllLoading
              ? <><span className="qmp-spinner" style={{ width: '12px', height: '12px' }} /> {explainProgress.total > 0 ? `${explainProgress.done}/${explainProgress.total}` : 'Starting...'}</>
              : <><span>✨</span> Explain {explainDifficulty === 'all' ? 'All' : difficultyFilteredItems.length}</>
            }
          </button>
        </div>
      </div>

      {/* Question List */}
      {displayItems.length === 0 ? (
        <div className="text-foreground/30 text-sm text-center py-10 bg-foreground/5 rounded-xl border border-border">
          {shownTotal > 0 ? 'The questions of these quizzes are not stored on this device.' : 'No data yet.'}
        </div>
      ) : (
        <div className="space-y-5 pr-1">
          {displayItems.slice(0, visibleCount).map(({ key, q, userAnswer, date, quizTitle }, i) => (
            <div key={key}>
              <div className="text-[10px] text-foreground/30 font-bold mb-2 px-1 truncate">{date}{quizTitle ? ` · ${quizTitle}` : ''}</div>
              <ReviewCard
                q={q} index={i} userAnswer={userAnswer}
                rationaleCache={rationaleCache} getAiRationale={getAiRationale}
                showBook={rationalePrefs.showBook} showAi={rationalePrefs.showAi}
                aiEnabled={reportHelper !== 'off'}
              />
            </div>
          ))}
          {displayItems.length > visibleCount && (
            <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-4">
              <p className="text-foreground/30 text-xs">Showing {Math.min(visibleCount, displayItems.length)} of {displayItems.length} items</p>
              <button onClick={loadMore}
                className="text-xs font-bold text-primary bg-primary/10 border border-primary/25 px-5 py-2.5 rounded-xl transition-all active:scale-95 hover:bg-primary/15">
                Load More ({Math.min(PAGE_SIZE, displayItems.length - visibleCount)} more)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
export default HistoryList;
