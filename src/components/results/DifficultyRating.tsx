import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { QuizResult } from '../../types/quiz';

interface Props { result: QuizResult; }

type DiffLevel = 'easy' | 'medium' | 'hard';

const DIFF_CONFIG = [
  { level: 'easy' as DiffLevel, emoji: '🟢', code: 'E', label: 'Easy', bar: 'bg-emerald-500', text: 'text-emerald-400', badgeBg: 'bg-emerald-500/15 border-emerald-500/25' },
  { level: 'medium' as DiffLevel, emoji: '🟡', code: 'M', label: 'Medium', bar: 'bg-amber-500', text: 'text-amber-400', badgeBg: 'bg-amber-500/15 border-amber-500/25' },
  { level: 'hard' as DiffLevel, emoji: '🔴', code: 'H', label: 'Hard', bar: 'bg-red-500', text: 'text-red-400', badgeBg: 'bg-red-500/15 border-red-500/25' },
];

export default function DifficultyRating({ result }: Props) {
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => {
    const acc: Record<DiffLevel, { count: number; correct: number }> = {
      easy: { count: 0, correct: 0 },
      medium: { count: 0, correct: 0 },
      hard: { count: 0, correct: 0 },
    };
    result.quizData.forEach((q, i) => {
      const d = (q.difficulty || 'medium') as DiffLevel;
      if (acc[d]) {
        acc[d].count++;
        if (result.userAnswers[i] === q.correctAnswer) acc[d].correct++;
      }
    });
    return acc;
  }, [result]);

  const total = result.quizData.length;
  if (total === 0) return null;

  const overallCorrect = stats.easy.correct + stats.medium.correct + stats.hard.correct;
  const overallPct = total > 0 ? Math.round((overallCorrect / total) * 100) : 0;

  return (
    <div className="glass-card mb-5 animate-fade-in overflow-hidden">
      {/* Collapsed header — shows distribution summary */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-foreground/[0.02] active:bg-foreground/[0.04]"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">🎯</span>
          <h3 className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.12em]">Difficulty Encountered</h3>
        </div>
        <div className="flex items-center gap-3">
          {/* Inline distribution badges */}
          <div className="flex items-center gap-2">
            {DIFF_CONFIG.map(({ level, emoji, code, text }) => {
              const count = stats[level].count;
              if (count === 0) return null;
              return (
                <span key={level} className={`text-[10px] font-black ${text} flex items-center gap-0.5`}>
                  {emoji} <span className="hidden xs:inline">{code}:</span>{count}
                </span>
              );
            })}
          </div>
          <ChevronDown className={`w-4 h-4 text-foreground/25 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expandable content — accuracy per difficulty */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: expanded ? '500px' : '0px', opacity: expanded ? 1 : 0 }}
      >
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
          {/* Distribution visual */}
          <div className="flex gap-0.5 h-3 rounded-full overflow-hidden mt-3">
            {DIFF_CONFIG.map(({ level, bar }) => {
              const pct = total > 0 ? (stats[level].count / total) * 100 : 0;
              if (pct === 0) return null;
              return <div key={level} className={`${bar} transition-all duration-700`} style={{ width: `${pct}%` }} />;
            })}
          </div>

          {/* Per-difficulty breakdown */}
          {DIFF_CONFIG.map(({ level, emoji, code, label, bar, text, badgeBg }) => {
            const { count, correct } = stats[level];
            if (count === 0) return null;
            const pct = Math.round((correct / count) * 100);
            const distPct = Math.round((count / total) * 100);
            return (
              <div key={level}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border ${badgeBg} ${text}`}>
                      {emoji} {code}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${text}`}>{label}</span>
                    <span className="text-[9px] text-foreground/25">{count} Qs · {distPct}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-black ${text}`}>{pct}%</span>
                    <span className="text-[9px] text-foreground/25">({correct}/{count})</span>
                  </div>
                </div>
                <div className="h-2 bg-foreground/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}

          {/* Overall accuracy */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-[10px] font-bold text-foreground/40">Overall Accuracy</span>
            <span className={`text-xs font-black ${overallPct >= 80 ? 'text-emerald-400' : overallPct >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
              {overallPct}% ({overallCorrect}/{total})
            </span>
          </div>

          {/* Individual question list with difficulty dots */}
          <div className="pt-2 border-t border-border">
            <p className="text-[9px] font-black text-foreground/25 uppercase tracking-widest mb-2">Question Breakdown</p>
            <div className="space-y-1 max-h-[160px] overflow-y-auto thin-scrollbar">
              {result.quizData.map((q, i) => {
                const d = (q.difficulty || 'medium') as DiffLevel;
                const emoji = d === 'easy' ? '🟢' : d === 'hard' ? '🔴' : '🟡';
                const isCorrect = result.userAnswers[i] === q.correctAnswer;
                const isSkipped = result.userAnswers[i] === null;
                return (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="text-foreground/25 font-bold w-6 flex-shrink-0 text-right">Q{i + 1}</span>
                    <span className="text-sm flex-shrink-0" title={d}>{emoji}</span>
                    <span className="text-foreground/50 truncate flex-1">{q.question.slice(0, 50)}</span>
                    <span className={`text-[9px] font-black flex-shrink-0 ${
                      isSkipped ? 'text-amber-400' : isCorrect ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {isSkipped ? '⏭' : isCorrect ? '✓' : '✗'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
