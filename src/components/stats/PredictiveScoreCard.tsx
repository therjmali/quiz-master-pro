import { useMemo } from 'react';
import { QuizResult } from '../../types/quiz';
import { computeExamReadiness } from '../../utils/predictionEngine';
import { getUpcomingExams } from '../../utils/examDates';

export default function PredictiveScoreCard({ history }: { history: QuizResult[] }) {
  const prediction = useMemo(() => {
    if (history.length < 5) return null;
    return computeExamReadiness(history);
  }, [history]);

  const exams = useMemo(() => getUpcomingExams(3), []);

  if (!prediction) {
    return (
      <div className="glass-card p-5 text-center">
        <span className="text-3xl mb-3 block">📊</span>
        <p className="text-sm font-bold text-foreground/50">Score Predictions</p>
        <p className="text-xs text-foreground/30 mt-1">Complete 5+ quizzes to unlock predictions</p>
        <div className="mt-3 h-2 bg-foreground/5 rounded-full overflow-hidden max-w-xs mx-auto">
          <div className="h-full bg-primary/30 rounded-full" style={{ width: `${(history.length / 5) * 100}%` }} />
        </div>
        <p className="text-[9px] text-foreground/20 mt-1">{history.length}/5 quizzes</p>
      </div>
    );
  }

  const pct = prediction.overallPredicted;
  const conf = prediction.confidence;
  const confBadge = conf === 'high' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
    conf === 'medium' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' :
    'bg-red-500/15 text-red-400 border-red-500/25';

  // Gauge
  const gaugeAngle = (pct / 100) * 180;
  const gaugeColor = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : pct >= 40 ? '#F97316' : '#EF4444';

  // Insights
  const subjects = prediction.subjects || [];
  const weakest = subjects.length > 0 ? subjects.reduce((a, b) => a.predicted < b.predicted ? a : b) : null;

  const thisWeek = history.filter(r => Date.now() - r.timestamp < 7 * 86400000);
  const lastWeek = history.filter(r => Date.now() - r.timestamp >= 7 * 86400000 && Date.now() - r.timestamp < 14 * 86400000);
  const thisAvg = thisWeek.length > 0 ? Math.round(thisWeek.reduce((a, r) => a + r.percentage, 0) / thisWeek.length) : 0;
  const lastAvg = lastWeek.length > 0 ? Math.round(lastWeek.reduce((a, r) => a + r.percentage, 0) / lastWeek.length) : 0;
  const improvement = thisAvg - lastAvg;

  return (
    <div className="glass-card p-5 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">📊 Predicted Score</p>
          <p className="text-xs text-foreground/25 mt-0.5">{prediction.totalQuizzesUsed} quizzes analyzed</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${confBadge}`}>
          {conf} confidence
        </span>
      </div>

      {/* Gauge */}
      <div className="flex justify-center mb-4">
        <div className="relative w-48 h-40">
          <svg viewBox="0 0 200 120" className="w-full h-[75%]">
            {/* Background arc */}
            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="currentColor" className="text-border" strokeWidth="12" strokeLinecap="round" />
            {/* Color zones */}
            <path d="M 20 100 A 80 80 0 0 1 60 32" fill="none" stroke="#EF4444" strokeWidth="12" strokeLinecap="round" opacity="0.15" />
            <path d="M 60 32 A 80 80 0 0 1 100 20" fill="none" stroke="#F59E0B" strokeWidth="12" opacity="0.15" />
            <path d="M 100 20 A 80 80 0 0 1 140 32" fill="none" stroke="#22C55E" strokeWidth="12" opacity="0.15" />
            <path d="M 140 32 A 80 80 0 0 1 180 100" fill="none" stroke="#10B981" strokeWidth="12" opacity="0.15" />
            {/* Needle */}
            <line
              x1="100" y1="100"
              x2={100 + 65 * Math.cos(Math.PI - (gaugeAngle * Math.PI / 180))}
              y2={100 - 65 * Math.sin(Math.PI - (gaugeAngle * Math.PI / 180))}
              stroke={gaugeColor} strokeWidth="3" strokeLinecap="round"
              style={{ transition: 'all 1s ease' }}
            />
            <circle cx="100" cy="100" r="5" fill={gaugeColor} />
          </svg>
          {/* Score text — positioned below the gauge arc, separate from the SVG */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center w-full">
            <span className="text-2xl sm:text-3xl font-black leading-none" style={{ color: gaugeColor }}>{pct}%</span>
            <p className="text-[10px] text-foreground/30 mt-0.5">predicted</p>
          </div>
        </div>
      </div>

      {/* Insights */}
      <div className="space-y-2.5">
        {weakest && weakest.predicted < 70 && (
          <div className="flex items-start gap-2 bg-foreground/4 rounded-xl p-3 border border-border">
            <span className="text-sm flex-shrink-0">🎯</span>
            <p className="text-xs text-foreground/60 leading-relaxed">
              To improve: Focus on <strong className="text-foreground/80">{weakest.subject}</strong> — predicted {weakest.predicted}%
            </p>
          </div>
        )}
        {improvement !== 0 && thisWeek.length >= 2 && (
          <div className="flex items-start gap-2 bg-foreground/4 rounded-xl p-3 border border-border">
            <span className="text-sm flex-shrink-0">{improvement > 0 ? '📈' : '📉'}</span>
            <p className="text-xs text-foreground/60 leading-relaxed">
              Your accuracy {improvement > 0 ? 'improved' : 'decreased'} <strong className={improvement > 0 ? 'text-emerald-400' : 'text-red-400'}>{Math.abs(improvement)}%</strong> this week
            </p>
          </div>
        )}
        {exams.length > 0 && (
          <div className="flex items-start gap-2 bg-foreground/4 rounded-xl p-3 border border-border">
            <span className="text-sm flex-shrink-0">📅</span>
            <p className="text-xs text-foreground/60 leading-relaxed">
              {exams[0].subject}: Predicted {pct}% {exams[0].targetScore ? `(Target: ${exams[0].targetScore}%)` : ''} — {exams[0].daysLeft} days left
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
