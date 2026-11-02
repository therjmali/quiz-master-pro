import { useMemo } from 'react';
import { Timer, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { QuizResult } from '../../types/quiz';
import { getSpeedTrend, SpeedRound } from '../../utils/practiceUtils';

interface Props {
  history: QuizResult[];
}

export default function SpeedImprovementCard({ history }: Props) {
  const speedData = useMemo(() => getSpeedTrend(history), [history]);

  if (speedData.length < 2) return null;

  const first = speedData[0];
  const last = speedData[speedData.length - 1];
  const diff = last.avgSecondsPerQ - first.avgSecondsPerQ;
  const isFaster = diff < 0;
  const isSlower = diff > 0;
  const maxTime = Math.max(...speedData.map(d => d.avgSecondsPerQ), 1);

  return (
    <div className="glass-card p-4 border-amber-500/10">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
            <Timer className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Speed Trend</p>
            <p className="text-[10px] text-foreground/25">Avg seconds per question</p>
          </div>
        </div>
        <div className={`flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-lg ${
          isFaster ? 'text-emerald-400 bg-emerald-500/10' : isSlower ? 'text-red-400 bg-red-500/10' : 'text-foreground/40 bg-foreground/5'
        }`}>
          {isFaster ? <TrendingDown className="w-3 h-3" /> : isSlower ? <TrendingUp className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          {isFaster ? `${Math.abs(diff)}s faster` : isSlower ? `${diff}s slower` : 'Same speed'}
        </div>
      </div>

      {/* Speed bars */}
      <div className="space-y-2">
        {speedData.map((d) => {
          const pct = maxTime > 0 ? (d.avgSecondsPerQ / maxTime) * 100 : 0;
          return (
            <div key={d.round} className="flex items-center gap-3">
              <span className="text-[11px] font-black text-amber-400 w-8 flex-shrink-0">{d.round}</span>
              <div className="flex-1 h-2 bg-foreground/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[11px] font-black text-foreground/60 w-10 text-right tabular-nums">{d.avgSecondsPerQ}s</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
