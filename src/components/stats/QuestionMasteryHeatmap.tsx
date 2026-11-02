import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Dumbbell } from 'lucide-react';
import { QuizResult, QuizQuestion } from '../../types/quiz';

interface Props {
  history: QuizResult[];
  onPractice?: (questions: QuizQuestion[]) => void;
}

interface QuestionMastery {
  question: string;
  attempts: number;
  correct: number;
  wrong: number;
  ratio: number; // 0-1 mastery ratio
  lastSeen: number;
  difficulty: string;
  questionObj: QuizQuestion;
}

type MasteryLevel = 'all' | 'weak' | 'inconsistent' | 'mastered';

function getMasteryColor(ratio: number, attempts: number): string {
  if (attempts === 0) return 'bg-foreground/5 border-foreground/5';
  if (ratio >= 0.8) return 'bg-emerald-500/60 border-emerald-400/40';
  if (ratio >= 0.5) return 'bg-amber-500/50 border-amber-400/35';
  return 'bg-red-500/50 border-red-400/35';
}

function getMasteryLabel(ratio: number, attempts: number): { label: string; color: string; emoji: string } {
  if (attempts === 0) return { label: 'Unseen', color: 'text-foreground/30', emoji: '⬜' };
  if (ratio >= 0.8) return { label: 'Mastered', color: 'text-emerald-400', emoji: '🟢' };
  if (ratio >= 0.5) return { label: 'Inconsistent', color: 'text-amber-400', emoji: '🟡' };
  return { label: 'Weak', color: 'text-red-400', emoji: '🔴' };
}

function truncateQ(q: string, max = 80): string {
  const clean = q.replace(/\n/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

export default function QuestionMasteryHeatmap({ history, onPractice }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<MasteryLevel>('all');
  const [showList, setShowList] = useState(false);

  const mastery = useMemo<QuestionMastery[]>(() => {
    const map = new Map<string, QuestionMastery>();
    history.filter(r => r.quizData?.length > 0).forEach(r => {
      r.quizData.forEach((q, i) => {
        const key = q.question.trim().slice(0, 200);
        const existing = map.get(key);
        const isCorrect = r.userAnswers[i] === q.correctAnswer;
        const isSkipped = r.userAnswers[i] === null;
        if (existing) {
          existing.attempts++;
          if (isCorrect) existing.correct++;
          else if (!isSkipped) existing.wrong++;
          existing.ratio = existing.correct / Math.max(existing.correct + existing.wrong, 1);
          if (r.timestamp > existing.lastSeen) {
            existing.lastSeen = r.timestamp;
            existing.questionObj = q;
          }
        } else {
          map.set(key, {
            question: key,
            attempts: 1,
            correct: isCorrect ? 1 : 0,
            wrong: !isCorrect && !isSkipped ? 1 : 0,
            ratio: isCorrect ? 1 : (!isSkipped ? 0 : 0),
            lastSeen: r.timestamp,
            difficulty: q.difficulty || 'medium',
            questionObj: q,
          });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.ratio - b.ratio);
  }, [history]);

  const stats = useMemo(() => {
    const weak = mastery.filter(m => m.attempts > 0 && m.ratio < 0.5);
    const inconsistent = mastery.filter(m => m.attempts > 0 && m.ratio >= 0.5 && m.ratio < 0.8);
    const mastered = mastery.filter(m => m.attempts > 0 && m.ratio >= 0.8);
    return { weak, inconsistent, mastered, total: mastery.filter(m => m.attempts > 0).length };
  }, [mastery]);

  const filtered = useMemo(() => {
    const active = mastery.filter(m => m.attempts > 0);
    if (filter === 'weak') return active.filter(m => m.ratio < 0.5);
    if (filter === 'inconsistent') return active.filter(m => m.ratio >= 0.5 && m.ratio < 0.8);
    if (filter === 'mastered') return active.filter(m => m.ratio >= 0.8);
    return active;
  }, [mastery, filter]);

  const weakQuestions = useMemo(() => {
    return mastery
      .filter(m => m.attempts > 0 && m.ratio < 0.5)
      .map(m => m.questionObj);
  }, [mastery]);

  if (mastery.length === 0) return null;

  const weakPct = stats.total > 0 ? Math.round((stats.weak.length / stats.total) * 100) : 0;
  const inconPct = stats.total > 0 ? Math.round((stats.inconsistent.length / stats.total) * 100) : 0;
  const mastPct = stats.total > 0 ? Math.round((stats.mastered.length / stats.total) * 100) : 0;

  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 transition-all active:scale-[0.99]"
      >
        <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
          <span className="text-base">🧠</span>
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-xs font-black text-foreground leading-tight">Question Mastery</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[9px] font-bold text-red-400">🔴 {stats.weak.length}</span>
            <span className="text-[9px] font-bold text-amber-400">🟡 {stats.inconsistent.length}</span>
            <span className="text-[9px] font-bold text-emerald-400">🟢 {stats.mastered.length}</span>
            <span className="text-[9px] text-foreground/25">· {stats.total} unique Qs</span>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-foreground/30 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-foreground/30 flex-shrink-0" />
        }
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 animate-fade-in border-t border-border pt-4">
          {/* Mastery distribution bar */}
          <div>
            <div className="flex h-3 rounded-full overflow-hidden bg-foreground/5 border border-border">
              {mastPct > 0 && (
                <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${mastPct}%` }} />
              )}
              {inconPct > 0 && (
                <div className="bg-amber-500 transition-all duration-700" style={{ width: `${inconPct}%` }} />
              )}
              {weakPct > 0 && (
                <div className="bg-red-500 transition-all duration-700" style={{ width: `${weakPct}%` }} />
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[9px] text-emerald-400 font-bold">🟢 {mastPct}% Mastered</span>
              <span className="text-[9px] text-amber-400 font-bold">🟡 {inconPct}% Inconsistent</span>
              <span className="text-[9px] text-red-400 font-bold">🔴 {weakPct}% Weak</span>
            </div>
          </div>

          {/* Heatmap grid */}
          <div>
            <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">Mastery Heatmap</p>
            <div className="flex flex-wrap gap-[3px]">
              {mastery.filter(m => m.attempts > 0).slice(0, 120).map((m, i) => (
                <div
                  key={i}
                  title={`${truncateQ(m.question, 60)}\n${m.correct}/${m.attempts} correct (${Math.round(m.ratio * 100)}%)`}
                  className={`w-[14px] h-[14px] rounded-sm border transition-all cursor-default ${getMasteryColor(m.ratio, m.attempts)}`}
                />
              ))}
            </div>
            {mastery.filter(m => m.attempts > 0).length > 120 && (
              <p className="text-[9px] text-foreground/20 mt-1">+ {mastery.filter(m => m.attempts > 0).length - 120} more</p>
            )}
            {/* Legend */}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[9px] text-foreground/30">Weak</span>
              <div className="w-[12px] h-[12px] rounded-sm bg-red-500/50 border border-red-400/35" />
              <div className="w-[12px] h-[12px] rounded-sm bg-amber-500/50 border border-amber-400/35" />
              <div className="w-[12px] h-[12px] rounded-sm bg-emerald-500/60 border border-emerald-400/40" />
              <span className="text-[9px] text-foreground/30">Mastered</span>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1.5">
            {([
              { key: 'all', label: 'All', count: stats.total },
              { key: 'weak', label: '🔴 Weak', count: stats.weak.length },
              { key: 'inconsistent', label: '🟡 Inconsistent', count: stats.inconsistent.length },
              { key: 'mastered', label: '🟢 Mastered', count: stats.mastered.length },
            ] as const).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => { setFilter(key); setShowList(true); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-all active:scale-95 ${
                  filter === key && showList
                    ? 'bg-foreground/10 border-foreground/15 text-foreground'
                    : 'bg-foreground/3 border-border text-foreground/40 hover:text-foreground/60'
                }`}
              >
                <span>{label}</span>
                <span className="text-foreground/25">{count}</span>
              </button>
            ))}
          </div>

          {/* Question list */}
          {showList && (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto thin-scrollbar">
              {filtered.length === 0 ? (
                <p className="text-xs text-foreground/30 text-center py-6">No questions in this category.</p>
              ) : (
                filtered.slice(0, 40).map((m, i) => {
                  const ml = getMasteryLabel(m.ratio, m.attempts);
                  return (
                    <div key={i} className="flex items-start gap-2.5 bg-foreground/3 border border-border rounded-xl px-3 py-2.5">
                      <span className="text-sm leading-none mt-0.5 flex-shrink-0">{ml.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-foreground/80 leading-snug line-clamp-2">
                          {truncateQ(m.question)}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-[9px] font-bold ${ml.color}`}>
                            {m.correct}/{m.correct + m.wrong} correct · {Math.round(m.ratio * 100)}%
                          </span>
                          <span className="text-[9px] text-foreground/20">
                            {m.attempts} attempt{m.attempts !== 1 ? 's' : ''}
                          </span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                            m.difficulty === 'easy' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                            m.difficulty === 'hard' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                            'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          }`}>
                            {m.difficulty === 'easy' ? '🟢' : m.difficulty === 'hard' ? '🔴' : '🟡'} {m.difficulty}
                          </span>
                        </div>
                      </div>
                      {/* Mini mastery bar */}
                      <div className="flex-shrink-0 w-12 mt-1">
                        <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              m.ratio >= 0.8 ? 'bg-emerald-500' : m.ratio >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.round(m.ratio * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {filtered.length > 40 && (
                <p className="text-[10px] text-foreground/25 text-center py-2">
                  Showing 40 of {filtered.length}
                </p>
              )}
            </div>
          )}

          {/* Practice weak questions button */}
          {onPractice && weakQuestions.length > 0 && (
            <button
              onClick={() => onPractice(weakQuestions)}
              className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/15 border border-red-500/25 text-red-400 font-bold text-sm py-3 rounded-xl transition-all active:scale-[0.98]"
            >
              <Dumbbell className="w-4 h-4" />
              Revise {weakQuestions.length} Weak Question{weakQuestions.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
