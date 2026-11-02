/**
 * TimingBreakdown
 * ───────────────
 * Premium per-question timing display in results screen.
 * Shows total time, average, and a mini bar chart for each question.
 */

import { useMemo } from 'react';
import { Clock, Zap, TrendingDown } from 'lucide-react';
import { QuizResult } from '../../types/quiz';

function formatSec(s: number): string {
  if (s <= 0) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}

interface Props {
  result: QuizResult;
}

export default function TimingBreakdown({ result }: Props) {
  const { timeTaken, totalQuestions, questionTimings } = result;

  const stats = useMemo(() => {
    const avg = totalQuestions > 0 ? timeTaken / totalQuestions : 0;
    const timings = questionTimings && questionTimings.length === totalQuestions
      ? questionTimings
      : new Array(totalQuestions).fill(avg);

    const maxT = Math.max(...timings, 1);
    const minT = Math.min(...timings.filter(t => t > 0));
    const fastestIdx = timings.indexOf(Math.min(...timings.filter(t => t > 0)));
    const slowestIdx = timings.indexOf(maxT);

    return { avg, timings, maxT, minT, fastestIdx, slowestIdx };
  }, [timeTaken, totalQuestions, questionTimings]);

  // Per-question status
  const getStatus = (i: number) => {
    const ua = result.userAnswers[i];
    if (ua === null) return 'skipped';
    return ua === result.quizData[i]?.correctAnswer ? 'correct' : 'wrong';
  };

  const barColor = (i: number, t: number) => {
    if (t === 0) return 'bg-foreground/10';
    const status = getStatus(i);
    if (i === stats.slowestIdx) return 'bg-red-400/70';
    if (i === stats.fastestIdx) return 'bg-emerald-400/70';
    if (status === 'correct') return 'bg-emerald-500/50';
    if (status === 'wrong')   return 'bg-red-500/50';
    return 'bg-white/25';
  };

  const mins = Math.floor(timeTaken / 60);
  const secs = timeTaken % 60;

  return (
    <div className="glass-card px-5 py-5 mb-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
          <Clock className="w-3.5 h-3.5 text-purple-300" />
        </div>
        <div>
          <h3 className="text-xs font-black text-foreground">⏱ Time Analysis</h3>
          <p className="text-[9px] text-foreground/35">Total &amp; per-question breakdown</p>
        </div>
      </div>

      {/* Total + Average row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-purple-500/8 border border-purple-500/15 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-purple-300 tabular-nums leading-none">
            {mins > 0 ? `${mins}m` : ''}{secs > 0 || mins === 0 ? `${String(secs).padStart(2,'0')}s` : ''}
          </div>
          <div className="text-[8px] font-bold uppercase tracking-widest text-foreground/35 mt-1">Total Time</div>
        </div>
        <div className="bg-blue-500/8 border border-blue-500/15 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-blue-300 tabular-nums leading-none">
            {formatSec(stats.avg)}
          </div>
          <div className="text-[8px] font-bold uppercase tracking-widest text-foreground/35 mt-1">Avg / Q</div>
        </div>
        <div className="bg-foreground/5 border border-border rounded-xl p-3 text-center">
          <div className="text-xl font-black text-foreground/60 tabular-nums leading-none">
            {totalQuestions}
          </div>
          <div className="text-[8px] font-bold uppercase tracking-widest text-foreground/35 mt-1">Questions</div>
        </div>
      </div>

      {/* Fastest / Slowest */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/15 rounded-lg px-3 py-2">
          <Zap className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          <div>
            <div className="text-[8px] font-bold uppercase tracking-wider text-emerald-400/70">Fastest</div>
            <div className="text-xs font-black text-emerald-300">
              Q{stats.fastestIdx + 1} · {formatSec(stats.timings[stats.fastestIdx])}
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-2 bg-red-500/8 border border-red-500/15 rounded-lg px-3 py-2">
          <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
          <div>
            <div className="text-[8px] font-bold uppercase tracking-wider text-red-400/70">Slowest</div>
            <div className="text-xs font-black text-red-300">
              Q{stats.slowestIdx + 1} · {formatSec(stats.timings[stats.slowestIdx])}
            </div>
          </div>
        </div>
      </div>

      {/* Per-question bar chart */}
      <div>
        <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">
          Per-Question Timing
        </p>
        <div className="flex items-end gap-[2px] h-12 bg-white/3 rounded-lg p-1.5">
          {stats.timings.map((t, i) => {
            const heightPct = stats.maxT > 0 ? Math.max(4, (t / stats.maxT) * 100) : 4;
            const status = getStatus(i);
            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center justify-end group relative cursor-default"
                style={{ height: '100%' }}
              >
                {/* Bar */}
                <div
                  className={`w-full rounded-sm transition-all ${barColor(i, t)}`}
                  style={{ height: `${heightPct}%` }}
                />
                {/* Tooltip */}
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-card border border-border text-foreground text-[8px] font-bold px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Q{i + 1} · {formatSec(t)} · {status}
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis labels for first/last */}
        <div className="flex justify-between text-[7.5px] text-white/20 font-bold mt-1 px-1">
          <span>Q1</span>
          {totalQuestions > 1 && <span>Q{Math.ceil(totalQuestions / 2)}</span>}
          <span>Q{totalQuestions}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 pt-2.5 border-t border-border">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm bg-emerald-400/70" />
          <span className="text-[8px] text-foreground/35 font-bold">Fastest Q</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm bg-red-400/70" />
          <span className="text-[8px] text-foreground/35 font-bold">Slowest Q</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm bg-emerald-500/50" />
          <span className="text-[8px] text-foreground/35 font-bold">Correct</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm bg-red-500/50" />
          <span className="text-[8px] text-foreground/35 font-bold">Wrong</span>
        </div>
      </div>
    </div>
  );
}
