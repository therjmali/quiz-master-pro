import { useMemo } from 'react';
import { QuizResult } from '../../types/quiz';
import { computeExamReadiness } from '../../utils/predictionEngine';

export default function CompactPrediction({ history }: { history: QuizResult[] }) {
  const prediction = useMemo(() => {
    if (history.length < 5) return null;
    return computeExamReadiness(history);
  }, [history]);

  if (!prediction) return null;

  const pct = prediction.overallPredicted;
  const color = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
  const ringColor = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#EF4444';
  const R = 20, C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;
  const shortSuggestion = prediction.suggestion ? prediction.suggestion.slice(0, 50) : '';

  return (
    <div className="glass-card p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 pointer-events-none" />
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0 w-14 h-14">
          <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
            <circle cx="28" cy="28" r={R} fill="none" stroke="currentColor" className="text-border" strokeWidth="4" />
            <circle cx="28" cy="28" r={R} fill="none" stroke={ringColor} strokeWidth="4"
              strokeDasharray={`${dash} ${C}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-sm font-black ${color}`}>{pct}%</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Predicted Score</p>
          <p className={`text-lg font-black ${color}`}>{pct}%</p>
          <p className="text-[9px] text-foreground/30">{prediction.confidence} confidence · {shortSuggestion}</p>
        </div>
      </div>
    </div>
  );
}
