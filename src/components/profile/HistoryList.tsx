import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import { toast } from 'sonner';
import { Filter, X } from 'lucide-react';
import { QuizQuestion, QuizResult, ReportOrder, RationalePrefs, AIMode } from '../../types/quiz';
import ReviewCard from '../results/ReviewCard';

interface Props {
  type: 'correct' | 'wrong' | 'skipped';
  history: QuizResult[];
  rationaleCache: Record<string, string>;
  getAiRationale: (q: string, ca: string, ua: string | null, s: 'correct' | 'wrong' | 'skipped') => Promise<string>;
  reportOrder?: ReportOrder;
  rationalePrefs: RationalePrefs;
  reportHelper: AIMode;
}

interface Item { q: QuizQuestion; userAns: string | null; date: string; }

const PAGE_SIZE = 30;

const HistoryList = memo(function HistoryList({
  type, history, rationaleCache, getAiRationale,
  reportOrder = 'attempt', rationalePrefs, reportHelper,
}: Props) {
  const [explainAllLoading, setExplainAllLoading] = useState(false);
  const [explainProgress, setExplainProgress] = useState({ done: 0, total: 0 });
  const [explainDifficulty, setExplainDifficulty] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const subjects = useMemo(() => {
    const set = new Set(history.map(r => r.subject).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [history]);

  const topics = useMemo(() => {
    const base = selectedSubject ? history.filter(r => r.subject === selectedSubject) : history;
    const set = new Set(base.map(r => r.quizTitle).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [history, selectedSubject]);

  const handleSubjectChange = (subj: string | null) => { setSelectedSubject(subj); setSelectedTopic(null); };

  const filteredHistory = useMemo(() => {
    let h = history;
    if (selectedSubject) h = h.filter(r => r.subject === selectedSubject);
    if (selectedTopic)   h = h.filter(r => r.quizTitle === selectedTopic);
    return h;
  }, [history, selectedSubject, selectedTopic]);

  const displayItems = useMemo<Item[]>(() => {
    const items: Item[] = [];
    const seen = new Set<string>();
    filteredHistory.forEach(entry => {
      const date = new Date(entry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const orderedData = (() => {
        const pairs = (entry.quizData || []).map((q, idx) => ({
          q: reportOrder === 'original' ? { ...q, shuffledOpts: q.options } : q,
          ua: (entry.userAnswers[idx] ?? null) as string | null,
          sortKey: reportOrder === 'original' ? ((q as any).originalIndex ?? idx) : idx,
        }));
        if (reportOrder === 'original') return [...pairs].sort((a, b) => a.sortKey - b.sortKey);
        return pairs;
      })();
      orderedData.forEach(({ q, ua }) => {
        const isCorrect = ua === q.correctAnswer;
        const isSkipped = ua === null;
        const include = (type === 'correct' && isCorrect) || (type === 'wrong' && !isCorrect && !isSkipped) || (type === 'skipped' && isSkipped);
        if (!include || seen.has(q.question)) return;
        seen.add(q.question);
        items.push({ q, userAns: ua, date });
      });
    });
    return items;
  }, [type, filteredHistory, reportOrder]);

  const headingColor = type === 'correct' ? 'text-emerald-500' : type === 'wrong' ? 'text-red-500' : 'text-amber-500';
  const badgeCls    = type === 'correct'
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
    : type === 'wrong'
    ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25'
    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25';

  const orderBadge = reportOrder === 'original'
    ? { icon: '📖', text: 'Original order', cls: 'bg-emerald-500/8 border-emerald-500/15 text-emerald-600 dark:text-emerald-400' }
    : { icon: '🎯', text: 'Attempt order',  cls: 'bg-primary/8 border-primary/15 text-primary' };

  const hasFilters = !!(selectedSubject || selectedTopic);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [selectedSubject, selectedTopic, explainDifficulty, type]);
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
    return displayItems.filter(({ q }) => (q.difficulty || '').toLowerCase() === explainDifficulty);
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
        await Promise.all(batch.map(({ q, userAns }) => {
          const s = userAns === q.correctAnswer ? 'correct' : userAns === null ? 'skipped' : 'wrong';
          return getAiRationale(q.question, q.correctAnswer, userAns, s)
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
            {displayItems.length} {type === 'correct' ? 'correct' : type === 'wrong' ? 'mistakes' : 'skipped'}
          </span>
          <span className={`text-[10px] px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1 ${orderBadge.cls}`}>
            <span>{orderBadge.icon}</span><span>{orderBadge.text}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(subjects.length > 0 || topics.length > 0) && (
            <button onClick={() => setFilterOpen(o => !o)}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${
                hasFilters || filterOpen
                  ? 'bg-primary/15 border-primary/25 text-primary'
                  : 'bg-foreground/5 border-border text-foreground/40 hover:bg-foreground/10 hover:text-foreground/70'
              }`}>
              <Filter className="w-3.5 h-3.5" />
              Filter
              {hasFilters && (
                <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[8px] font-black flex items-center justify-center">
                  {(selectedSubject ? 1 : 0) + (selectedTopic ? 1 : 0)}
                </span>
              )}
            </button>
          )}
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

      {/* Filter panel */}
      {filterOpen && (subjects.length > 0 || topics.length > 0) && (
        <div className="bg-foreground/5 border border-border rounded-2xl p-4 mb-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">🔖 Filter Questions</p>
            {hasFilters && (
              <button onClick={() => { setSelectedSubject(null); setSelectedTopic(null); }}
                className="text-[10px] text-foreground/30 hover:text-destructive font-bold flex items-center gap-1 transition-colors">
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>

          {subjects.length > 0 && (
            <div>
              <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">📚 Subject</p>
              <div className="flex flex-wrap gap-1.5">
                {[null, ...subjects].map(s => (
                  <button key={s ?? 'all'} onClick={() => handleSubjectChange(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      selectedSubject === s
                        ? 'bg-primary/15 border-primary/30 text-foreground'
                        : 'bg-foreground/5 border-border text-foreground/40 hover:text-foreground/70 hover:bg-foreground/10'
                    }`}>
                    {s === null ? '🌐 All Subjects' : s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {topics.length > 0 && (
            <div>
              <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">📝 Quiz / Topic</p>
              <div className="flex flex-wrap gap-1.5">
                {[null, ...topics].map(t => (
                  <button key={t ?? 'all'} onClick={() => setSelectedTopic(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      selectedTopic === t
                        ? 'bg-primary/15 border-primary/30 text-foreground'
                        : 'bg-foreground/5 border-border text-foreground/40 hover:text-foreground/70 hover:bg-foreground/10'
                    }`}>
                    {t === null ? 'All Topics' : (t.length > 28 ? t.slice(0, 28) + '…' : t)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasFilters && (
            <div className="flex items-center gap-2 pt-1 border-t border-border">
              <span className="text-[9px] text-foreground/30 font-medium">Showing:</span>
              {selectedSubject && (
                <span className="text-[9px] bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-lg font-bold flex items-center gap-1">
                  📚 {selectedSubject}
                  <button onClick={() => handleSubjectChange(null)} className="text-foreground/30 hover:text-foreground/60 ml-0.5">×</button>
                </span>
              )}
              {selectedTopic && (
                <span className="text-[9px] bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-lg font-bold flex items-center gap-1">
                  📝 {selectedTopic.length > 20 ? selectedTopic.slice(0, 20) + '…' : selectedTopic}
                  <button onClick={() => setSelectedTopic(null)} className="text-foreground/30 hover:text-foreground/60 ml-0.5">×</button>
                </span>
              )}
              <span className="text-[9px] text-foreground/25 ml-auto font-medium">{displayItems.length} questions</span>
            </div>
          )}
        </div>
      )}

      {/* Question List */}
      {displayItems.length === 0 ? (
        <div className="text-foreground/30 text-sm text-center py-10 bg-foreground/5 rounded-xl border border-border">
          {hasFilters ? (
            <div>
              <p className="mb-2">No questions match the selected filters.</p>
              <button onClick={() => { setSelectedSubject(null); setSelectedTopic(null); }} className="text-xs text-primary font-bold underline">Clear filters</button>
            </div>
          ) : 'No data yet.'}
        </div>
      ) : (
        <div className="space-y-5 pr-1">
          {displayItems.slice(0, visibleCount).map(({ q, userAns, date }, i) => (
            <div key={`${q.question.slice(0, 30)}-${i}`}>
              <div className="text-[10px] text-foreground/30 font-bold mb-2 px-1">{date}</div>
              <ReviewCard
                q={q} index={i} userAnswer={userAns}
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
