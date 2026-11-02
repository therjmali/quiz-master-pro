import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { QuizResult } from '../../types/quiz';

interface Props {
  history: QuizResult[];
}

export default function ImprovementBanner({ history }: Props) {
  const data = useMemo(() => {
    const mainQuizzes = history.filter(r => (r.attemptType || 'main') === 'main' && r.id);
    const practices = history.filter(r => r.attemptType === 'practice');

    if (mainQuizzes.length === 0 || practices.length === 0) return null;

    const mainWithPractice = mainQuizzes.filter(m =>
      practices.some(p => p.parentQuizId === m.id)
    );
    if (mainWithPractice.length === 0) return null;

    const mainAvg = Math.round(mainWithPractice.reduce((a, r) => a + r.percentage, 0) / mainWithPractice.length);

    const latestPracticeScores: number[] = [];
    for (const main of mainWithPractice) {
      const ps = practices.filter(p => p.parentQuizId === main.id).sort((a, b) => b.timestamp - a.timestamp);
      if (ps.length > 0) latestPracticeScores.push(ps[0].percentage);
    }
    const practiceAvg = Math.round(latestPracticeScores.reduce((a, v) => a + v, 0) / latestPracticeScores.length);
    const diff = practiceAvg - mainAvg;

    return { mainAvg, practiceAvg, diff, quizCount: mainWithPractice.length };
  }, [history]);

  if (!data) return null;

  const isPositive = data.diff > 0;
  const maxBar = Math.max(data.mainAvg, data.practiceAvg, 1);

  return (
    <div className={`glass-card p-3.5 border ${isPositive ? 'border-emerald-500/20' : 'border-destructive/20'} relative overflow-hidden`}>
      <div className={`absolute inset-0 ${isPositive ? 'bg-gradient-to-r from-emerald-500/[0.06] to-transparent' : 'bg-gradient-to-r from-destructive/[0.06] to-transparent'} pointer-events-none rounded-[inherit]`} />
      <div className="relative flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isPositive ? 'bg-emerald-500/15' : 'bg-destructive/15'}`}>
          {isPositive
            ? <TrendingUp className="w-4 h-4 text-emerald-400" />
            : <TrendingDown className="w-4 h-4 text-destructive" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-base font-black leading-none ${isPositive ? 'text-emerald-400' : 'text-destructive'}`}>
              {isPositive ? '+' : ''}{data.diff}%
            </span>
            <span className="text-[10px] text-foreground/40 font-bold">
              {isPositive ? 'improvement' : 'change'} · {data.quizCount} quiz{data.quizCount !== 1 ? 'zes' : ''}
            </span>
          </div>
          {/* Mini bar chart */}
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-bold text-foreground/25 w-10">Original</span>
              <div className="flex-1 h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary/40 transition-all duration-700" style={{ width: `${(data.mainAvg / maxBar) * 100}%` }} />
              </div>
              <span className="text-[9px] font-black text-foreground/35 w-7 text-right tabular-nums">{data.mainAvg}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-bold text-foreground/25 w-10">Practice</span>
              <div className="flex-1 h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${isPositive ? 'bg-emerald-500' : 'bg-destructive'}`} style={{ width: `${(data.practiceAvg / maxBar) * 100}%` }} />
              </div>
              <span className={`text-[9px] font-black w-7 text-right tabular-nums ${isPositive ? 'text-emerald-400' : 'text-destructive'}`}>{data.practiceAvg}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
