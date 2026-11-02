import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Target, Shield, Lightbulb } from 'lucide-react';
import { QuizResult } from '../../types/quiz';
import { computeExamReadiness, SubjectPrediction } from '../../utils/predictionEngine';

interface Props {
  history: QuizResult[];
}

function TrendIcon({ trend }: { trend: number }) {
  if (trend > 1) return <TrendingUp className="w-3 h-3 text-emerald-400" />;
  if (trend < -1) return <TrendingDown className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-foreground/30" />;
}

function SubjectRow({ s }: { s: SubjectPrediction }) {
  const color = s.predicted >= 70 ? 'text-emerald-400' : s.predicted >= 50 ? 'text-amber-400' : 'text-red-400';
  const barColor = s.predicted >= 70 ? 'bg-emerald-500' : s.predicted >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold text-foreground/60 truncate w-20 flex-shrink-0">{s.subject}</span>
      <div className="flex-1 h-1.5 bg-muted/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${s.predicted}%` }} />
      </div>
      <span className={`text-[11px] font-black tabular-nums w-9 text-right ${color}`}>{s.predicted}%</span>
      <div className="flex items-center gap-0.5 w-12">
        <TrendIcon trend={s.trend} />
        <span className={`text-[9px] font-bold ${s.trend > 0 ? 'text-emerald-400' : s.trend < 0 ? 'text-red-400' : 'text-foreground/30'}`}>
          {s.trend > 0 ? '+' : ''}{s.trend.toFixed(1)}
        </span>
      </div>
      {s.needsAttention && <span className="text-[8px]">⚠️</span>}
    </div>
  );
}

export default function ExamReadinessCard({ history }: Props) {
  const readiness = useMemo(() => computeExamReadiness(history), [history]);

  if (!readiness) return null;

  const { overallPredicted, confidence, subjects, totalQuizzesUsed, suggestion } = readiness;
  const scoreColor = overallPredicted >= 70 ? 'text-emerald-400' : overallPredicted >= 50 ? 'text-amber-400' : 'text-red-400';
  const ringColor = overallPredicted >= 70 ? '#22C55E' : overallPredicted >= 50 ? '#F59E0B' : '#EF4444';
  const R = 30, C = 2 * Math.PI * R;
  const fill = (overallPredicted / 100) * C;

  const confBadge = confidence === 'high'
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
    : confidence === 'medium'
    ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
    : 'bg-red-500/15 text-red-400 border-red-500/25';

  return (
    <div className="glass-card p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5 pointer-events-none rounded-[1.5rem]" />
      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
            <Target className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-black text-foreground">Exam Readiness</h3>
            <p className="text-[9px] text-foreground/35">Based on {totalQuizzesUsed} recent quizzes</p>
          </div>
          <span className={`text-[9px] font-black px-2 py-1 rounded-lg border uppercase tracking-wider ${confBadge}`}>
            <Shield className="w-2.5 h-2.5 inline mr-0.5" />{confidence}
          </span>
        </div>

        {/* Score ring + subjects */}
        <div className="flex items-center gap-4">
          {/* Mini ring */}
          <div className="relative flex-shrink-0 w-[72px] h-[72px]">
            <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
              <circle cx="36" cy="36" r={R} fill="none" stroke="currentColor" className="text-muted/40" strokeWidth="5" />
              <circle cx="36" cy="36" r={R} fill="none" stroke={ringColor} strokeWidth="5"
                strokeDasharray={`${fill} ${C}`} strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 1s ease' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-lg font-black leading-none ${scoreColor}`}>{overallPredicted}%</span>
              <span className="text-[7px] text-foreground/30 font-bold mt-0.5">predicted</span>
            </div>
          </div>

          {/* Subject breakdown */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {subjects.slice(0, 4).map(s => (
              <SubjectRow key={s.subject} s={s} />
            ))}
            {subjects.length === 0 && (
              <p className="text-[10px] text-foreground/30 italic">Add subjects to see breakdown</p>
            )}
          </div>
        </div>

        {/* Suggestion */}
        <div className="flex items-start gap-2 mt-3 bg-primary/5 border border-primary/15 rounded-xl px-3 py-2.5">
          <Lightbulb className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-foreground/60 leading-relaxed">{suggestion}</p>
        </div>
      </div>
    </div>
  );
}
