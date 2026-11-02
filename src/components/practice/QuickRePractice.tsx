import { useMemo } from 'react';
import { RotateCcw, Dumbbell } from 'lucide-react';
import { QuizResult, QuizQuestion } from '../../types/quiz';
import { getQuizzesNeedingPractice } from '../../utils/practiceUtils';

interface Props {
  history: QuizResult[];
  onPractice: (questions: QuizQuestion[]) => void;
}

function scoreColor(pct: number) {
  return pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
}

export default function QuickRePractice({ history, onPractice }: Props) {
  const items = useMemo(() => getQuizzesNeedingPractice(history, 4), [history]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Needs More Practice</p>
        <span className="text-[9px] text-foreground/25">{items.length} quizzes below 80%</span>
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.mainResult.timestamp} className="flex items-center gap-3 bg-card border border-amber-500/10 rounded-2xl p-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-base font-black text-amber-400">
                {item.mainResult.quizTitle?.[0]?.toUpperCase() || '🔄'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate leading-snug">
                {item.mainResult.quizTitle || 'Untitled Quiz'}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-black ${scoreColor(item.latestScore)}`}>
                  {item.latestScore}%
                </span>
                <span className="text-[9px] text-foreground/25">
                  {item.practiceCount > 0 ? `${item.practiceCount} practice${item.practiceCount !== 1 ? 's' : ''}` : 'Not practiced'}
                </span>
              </div>
              {/* Mini progress bar */}
              <div className="mt-1.5 h-1 bg-foreground/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${item.latestScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${item.latestScore}%` }}
                />
              </div>
            </div>
            <button
              onClick={() => onPractice(item.mainResult.quizData)}
              className="flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-300 text-[10px] font-bold px-3 py-2 rounded-xl transition-all active:scale-95 flex-shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
