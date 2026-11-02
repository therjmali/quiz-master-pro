import { useState, useRef, useMemo } from 'react';
import { Trash2, RotateCcw, Pin, PinOff, Pencil, FolderOpen, ChevronDown, ChevronUp, Dumbbell } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { QuizResult } from '../../types/quiz';
import { QuizGroup } from '../../utils/quizGrouping';
import { formatTime } from '../../utils/scoring';
import { formatDateShort } from '../../utils/dateFormat';
import { hapticTap, hapticHeavy } from '../../utils/haptics';

const COLORS = [
  'from-primary/40 to-accent/40', 'from-emerald-500/40 to-teal-600/40',
  'from-amber-500/40 to-orange-600/40', 'from-pink-500/40 to-rose-600/40',
  'from-cyan-500/40 to-blue-600/40',
];
function scoreColor(p: number) { return p >= 80 ? 'text-emerald-400' : p >= 60 ? 'text-amber-400' : 'text-red-400'; }
function scoreBg(p: number) { return p >= 80 ? 'bg-emerald-500/15 border-emerald-500/30' : p >= 60 ? 'bg-amber-500/15 border-amber-500/30' : 'bg-red-500/15 border-red-500/30'; }
function scoreBar(p: number) { return p >= 80 ? 'bg-emerald-500' : p >= 60 ? 'bg-amber-500' : 'bg-red-500'; }
function dotColor(p: number) { return p >= 80 ? 'bg-emerald-500' : p >= 60 ? 'bg-amber-500' : 'bg-red-500'; }
function lineGrad(a: number, b: number) {
  const c = (v: number) => v >= 80 ? '#10b981' : v >= 60 ? '#f59e0b' : '#ef4444';
  return `linear-gradient(to right, ${c(a)}, ${c(b)})`;
}
function timeAgo(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return '1d ago';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

interface Props {
  group: QuizGroup;
  isPinned: boolean;
  colorIdx: number;
  onViewResult: (r: QuizResult) => void;
  onDelete: (r: QuizResult) => void;
  onTogglePin: () => void;
  onEdit?: (r: QuizResult) => void;
  onAddToFolder?: (r: QuizResult) => void;
  onStartPractice: (r: QuizResult) => void;
}

export default function GroupedQuizCard({ group, isPinned, colorIdx, onViewResult, onDelete, onTogglePin, onEdit, onAddToFolder, onStartPractice }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(group.allResults.length - 1);
  const [showTimeline, setShowTimeline] = useState(false);
  const selected = group.allResults[Math.min(selectedIdx, group.allResults.length - 1)];
  const pct = selected.percentage;
  const initial = group.quizTitle?.[0]?.toUpperCase() || '📝';
  const hasMultiple = group.allResults.length > 1;

  const mistakeCount = useMemo(() => (selected.quizData || []).filter((q, i) =>
    selected.userAnswers[i] !== null && selected.userAnswers[i] !== q.correctAnswer
  ).length, [selected]);

  const latestMistakes = useMemo(() => (group.latestResult.quizData || []).filter((q, i) =>
    group.latestResult.userAnswers[i] !== null && group.latestResult.userAnswers[i] !== group.latestResult.quizData?.[i]?.correctAnswer
  ).length, [group.latestResult]);

  const lastLabel = useMemo(() => {
    if (!group.lastPracticedAt) return { text: 'Not practiced', warn: group.latestResult.percentage < 80 };
    const d = (Date.now() - group.lastPracticedAt) / 86400000;
    return { text: `Practiced ${timeAgo(group.lastPracticedAt)}`, warn: d > 7 && group.latestResult.percentage < 80 };
  }, [group.lastPracticedAt, group.latestResult.percentage]);

  const tabs = useMemo(() => group.allResults.map((r, i) => {
    const isMain = (r.attemptType || 'main') === 'main';
    const prev = i > 0 ? group.allResults[i - 1].percentage : null;
    const trend = prev !== null ? (r.percentage > prev ? '▲' : r.percentage < prev ? '▼' : '') : '';
    return { label: isMain ? 'Main' : `P${r.attemptNumber || i}`, score: r.percentage, trend, isMain };
  }), [group.allResults]);

  // Swipe
  const [swipeX, setSwipeX] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);
  const onTS = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX; startY.current = e.touches[0].clientY; swiping.current = false; };
  const onTM = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx > 5) { setSwipeX(0); return; }
    swiping.current = true;
    setSwipeX(Math.max(-120, dx));
  };
  const onTE = () => { if (swiping.current) { setSwipeX(swipeX < -80 ? -100 : 0); swiping.current = false; } };

  const showRePractice = group.latestResult.percentage < 80 && latestMistakes > 0;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 right-0 w-[100px] bg-destructive/90 flex items-center justify-center rounded-r-2xl">
        <button onClick={() => { hapticHeavy(); setSwipeX(0); onDelete(selected); }} className="flex flex-col items-center gap-1 text-white">
          <Trash2 className="w-5 h-5" /><span className="text-[9px] font-bold">Delete</span>
        </button>
      </div>

      <div
        className={`relative z-10 bg-card border rounded-2xl overflow-hidden shadow-sm transition-colors ${isPinned ? 'border-amber-500/20' : 'border-border hover:border-foreground/15'}`}
        style={{ transform: `translateX(${swipeX}px)`, transition: swiping.current ? 'none' : 'transform 0.3s cubic-bezier(0.25,1,0.5,1)' }}
        onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}
      >
        {isPinned && (
          <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-0.5">
            <span className="text-amber-400 text-[9px]">⭐</span>
            <span className="text-[9px] font-black text-amber-400/70 uppercase tracking-widest">Pinned</span>
          </div>
        )}

        {/* Header */}
        <button onClick={() => onViewResult(selected)} className="w-full flex items-center gap-3 p-4 pb-2 text-left active:bg-foreground/5">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${COLORS[colorIdx % COLORS.length]} flex items-center justify-center flex-shrink-0 text-lg font-black text-white border border-foreground/10`}>
            {initial !== '📝' ? initial : '📝'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <p className="text-sm font-bold text-foreground flex-1 truncate leading-snug">{group.quizTitle}</p>
              <div className={`flex-shrink-0 text-base font-black px-3 py-1.5 rounded-xl border ${scoreBg(pct)} ${scoreColor(pct)}`}>{pct}%</div>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {group.subject && <span className="text-[9px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">{group.subject}</span>}
              {group.practices.length > 0 && (
                <span className="text-[9px] font-bold text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  🏋️ ×{group.practices.length}
                </span>
              )}
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${lastLabel.warn ? 'text-amber-400/80 bg-amber-500/10 border-amber-500/20 animate-pulse' : 'text-foreground/30 bg-foreground/5 border-transparent'}`}>
                {lastLabel.text}
              </span>
              <span className="text-[10px] text-foreground/30 ml-auto">{formatDateShort(selected.timestamp)}</span>
            </div>
          </div>
        </button>

        {/* Session Tabs */}
        {hasMultiple && (
          <div className="px-4 pb-1.5">
            <div className="flex gap-1 overflow-x-auto no-scrollbar py-0.5">
              {tabs.map((tab, i) => (
                <button key={i} onClick={(e) => { e.stopPropagation(); hapticTap(); setSelectedIdx(i); }}
                  className={`flex-shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                    i === selectedIdx
                      ? tab.isMain ? 'bg-primary/15 border-primary/30 text-foreground' : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      : 'bg-transparent border-transparent text-foreground/30 hover:text-foreground/50'
                  }`}
                >
                  {!tab.isMain && <Dumbbell className="w-2.5 h-2.5" />}
                  <span>{tab.label}</span>
                  <span className={scoreColor(tab.score)}>{tab.score}%</span>
                  {tab.trend && <span className={`text-[8px] ${tab.trend === '▲' ? 'text-emerald-400' : 'text-red-400'}`}>{tab.trend}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Progress Dots + Compare */}
        {hasMultiple && (
          <button onClick={() => setShowTimeline(v => !v)} className="w-full px-4 pb-2 flex items-center gap-3">
            <div className="flex items-center flex-shrink-0">
              {group.allResults.map((r, i) => (
                <div key={i} className="flex items-center">
                  {i > 0 && <div className="w-4 h-[2px] rounded-full" style={{ background: lineGrad(group.allResults[i - 1].percentage, r.percentage) }} />}
                  <div className={`w-2 h-2 rounded-full ${dotColor(r.percentage)} ${i === selectedIdx ? 'ring-2 ring-foreground/20 ring-offset-1 ring-offset-card' : ''} transition-all`} />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 text-[10px] flex-1 min-w-0">
              <span className={scoreColor(group.allResults[0].percentage)}>{group.allResults[0].percentage}%</span>
              <span className="text-foreground/15">→</span>
              <span className={scoreColor(group.latestResult.percentage)}>{group.latestResult.percentage}%</span>
              <span className={`font-black ${group.improvement >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ({group.improvement >= 0 ? '+' : ''}{group.improvement}%{group.improvement >= 0 ? ' ▲' : ' ▼'})
              </span>
            </div>
            {showTimeline ? <ChevronUp className="w-3 h-3 text-foreground/20" /> : <ChevronDown className="w-3 h-3 text-foreground/20" />}
          </button>
        )}

        {/* Expandable Timeline */}
        <AnimatePresence>
          {showTimeline && hasMultiple && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="px-4 pb-3 ml-2">
                {group.allResults.map((r, i) => {
                  const isMain = (r.attemptType || 'main') === 'main';
                  const prev = i > 0 ? group.allResults[i - 1] : null;
                  const delta = prev ? r.percentage - prev.percentage : null;
                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full ${dotColor(r.percentage)} mt-1.5`} />
                        {i < group.allResults.length - 1 && <div className="w-[1px] h-7 bg-foreground/10" />}
                      </div>
                      <button onClick={() => { setSelectedIdx(i); onViewResult(r); }}
                        className="flex-1 flex items-center gap-2 py-1 text-left hover:bg-foreground/3 rounded-lg px-1.5 -ml-1 transition-all">
                        <span className={`text-[10px] font-bold w-9 ${isMain ? 'text-primary' : 'text-amber-400'}`}>
                          {isMain ? 'Main' : `P${r.attemptNumber || i}`}
                        </span>
                        <span className="text-[10px] text-foreground/30">{formatDateShort(r.timestamp)}</span>
                        <span className={`text-[10px] font-black ${scoreColor(r.percentage)}`}>{r.percentage}%</span>
                        <span className="text-[10px] text-foreground/20">{formatTime(r.timeTaken)}</span>
                        {delta !== null && (
                          <span className={`text-[9px] font-bold ml-auto ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {delta >= 0 ? '+' : ''}{delta}%
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats Row */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">✓{selected.correct}</span>
            <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-md">✗{selected.wrong}</span>
            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md">⏭{selected.skipped}</span>
            <span className="text-[10px] text-foreground/25 ml-auto">{selected.totalQuestions} Qs · {formatTime(selected.timeTaken)}</span>
          </div>
          <div className="mt-1.5 h-1 bg-muted/60 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${scoreBar(pct)}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Re-practice Button */}
        {showRePractice && (
          <div className="px-4 pb-2">
            <button onClick={() => onStartPractice(group.latestResult)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] font-bold transition-all hover:bg-amber-500/15 active:scale-[0.98]">
              <Dumbbell className="w-3.5 h-3.5" /> Practice Again ({latestMistakes} mistakes)
            </button>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex border-t border-border">
          <button onClick={onTogglePin}
            className={`flex items-center justify-center px-3 py-2.5 text-[11px] font-bold transition-all active:scale-95 border-r border-border ${isPinned ? 'text-amber-400 hover:bg-amber-500/5' : 'text-foreground/25 hover:text-amber-400 hover:bg-amber-500/5'}`}>
            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          {onEdit && (
            <button onClick={() => onEdit(selected)} className="flex items-center justify-center px-3 py-2.5 text-[11px] font-bold text-foreground/25 hover:text-primary hover:bg-primary/5 transition-all active:scale-95 border-r border-border">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onAddToFolder && (
            <button onClick={() => onAddToFolder(selected)} className="flex items-center justify-center px-3 py-2.5 text-[11px] font-bold text-foreground/25 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all active:scale-95 border-r border-border">
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          )}
          {mistakeCount > 0 && (
            <button onClick={() => onStartPractice(selected)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold text-red-400/80 hover:text-red-300 hover:bg-red-500/5 transition-all active:scale-95">
              <RotateCcw className="w-3.5 h-3.5" /> Practice ({mistakeCount})
            </button>
          )}
          <button onClick={() => onDelete(selected)} className="flex items-center justify-center px-5 py-2.5 text-[11px] font-bold text-foreground/25 hover:text-red-400 hover:bg-red-500/5 transition-all active:scale-95 border-l border-border">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
