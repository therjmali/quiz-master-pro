import { BarChart2, TrendingUp } from 'lucide-react';

interface BreakdownProps {
  totalQ: number;
  correct: number;
  wrong: number;
  skipped: number;
  /** Optional extra className wrapper */
  className?: string;
}

/** Question Breakdown Strip — Total, Correct%, Wrong%, Skip% + Raw Score (no penalty) */
export function QuestionBreakdownStrip({ totalQ, correct, wrong, skipped, className = '' }: BreakdownProps) {
  const pct = (v: number) => totalQ > 0 ? Math.round((v / totalQ) * 100) : 0;
  const rawScore = pct(correct);

  const cells = [
    { label: 'Total',     value: totalQ,  pctVal: null,           color: 'text-foreground',    bgBar: 'bg-foreground/20' },
    { label: 'Correct ✓', value: correct, pctVal: pct(correct),   color: 'text-emerald-500',   bgBar: 'bg-emerald-500'   },
    { label: 'Wrong ✗',   value: wrong,   pctVal: pct(wrong),     color: 'text-red-500',       bgBar: 'bg-red-500'       },
    { label: 'Skip ⏭',    value: skipped, pctVal: pct(skipped),   color: 'text-amber-500',     bgBar: 'bg-amber-500'     },
  ];

  return (
    <div className={`bg-foreground/[0.03] border border-border rounded-2xl p-3.5 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-foreground/35">📋 Question Breakdown</p>
        <span className="text-[10px] font-bold text-primary/60 bg-primary/8 border border-primary/15 px-2 py-0.5 rounded-lg">
          Raw Score: <span className="font-black text-primary">{rawScore}%</span>
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {cells.map(({ label, value, pctVal, color }) => (
          <div key={label} className="text-center bg-foreground/[0.03] rounded-xl py-2.5 px-1 border border-border/50">
            <div className={`text-lg font-black ${color} leading-none`}>{value}</div>
            {pctVal !== null && (
              <div className={`text-[10px] font-bold ${color} opacity-70 mt-0.5`}>{pctVal}%</div>
            )}
            <div className="text-[8px] text-foreground/30 font-bold uppercase tracking-wider mt-1 leading-tight">{label}</div>
          </div>
        ))}
      </div>

      {/* Visual proportion bar */}
      {totalQ > 0 && (
        <div className="mt-3 h-2 rounded-full overflow-hidden flex bg-foreground/[0.06]">
          {pct(correct) > 0 && (
            <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${pct(correct)}%` }} />
          )}
          {pct(wrong) > 0 && (
            <div className="bg-red-500 transition-all duration-700" style={{ width: `${pct(wrong)}%` }} />
          )}
          {pct(skipped) > 0 && (
            <div className="bg-amber-500 transition-all duration-700" style={{ width: `${pct(skipped)}%` }} />
          )}
        </div>
      )}
    </div>
  );
}


interface DiffProps {
  easy: number;
  medium: number;
  hard: number;
  /** Total Q to compute % against (defaults to easy+medium+hard) */
  totalOverride?: number;
  className?: string;
}

/** Difficulty Distribution Bar — stacked bar with Easy/Medium/Hard counts + percentages */
export function DifficultyDistributionBar({ easy, medium, hard, totalOverride, className = '' }: DiffProps) {
  const total = totalOverride ?? (easy + medium + hard);
  const pct = (v: number) => total > 0 ? Math.round((v / total) * 100) : 0;

  const segments = [
    { label: 'Easy',   emoji: '🟢', count: easy,   pctVal: pct(easy),   bar: 'bg-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-500/8 border-emerald-500/20' },
    { label: 'Medium', emoji: '🟡', count: medium, pctVal: pct(medium), bar: 'bg-amber-500',   text: 'text-amber-500',   bg: 'bg-amber-500/8 border-amber-500/20'   },
    { label: 'Hard',   emoji: '🔴', count: hard,   pctVal: pct(hard),   bar: 'bg-red-500',     text: 'text-red-500',     bg: 'bg-red-500/8 border-red-500/20'       },
  ];

  if (total === 0) return null;

  return (
    <div className={`bg-foreground/[0.03] border border-border rounded-2xl p-3.5 ${className}`}>
      <p className="text-[9px] font-black uppercase tracking-widest text-foreground/35 mb-3">🎯 Difficulty Distribution</p>

      {/* Stacked bar */}
      <div className="h-[6px] rounded-full overflow-hidden flex bg-foreground/[0.06] mb-3">
        {segments.map(s => s.count > 0 && (
          <div key={s.label} className={`${s.bar} transition-all duration-700`} style={{ width: `${s.pctVal}%` }} />
        ))}
      </div>

      {/* Labels */}
      <div className="grid grid-cols-3 gap-2">
        {segments.map(s => (
          <div key={s.label} className={`text-center rounded-xl py-2 px-1 border ${s.bg}`}>
            <div className="text-sm leading-none mb-0.5">{s.emoji}</div>
            <div className={`text-base font-black ${s.text} leading-none`}>{s.count}</div>
            <div className={`text-[10px] font-bold ${s.text} opacity-60`}>{s.pctVal}%</div>
            <div className="text-[8px] text-foreground/30 font-bold uppercase tracking-wider mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


interface PerfBadgesProps {
  percentage: number;
  className?: string;
}

/** Performance + Percentile side-by-side badges */
export function PerformanceBadges({ percentage, className = '' }: PerfBadgesProps) {
  const perf = percentage >= 90 ? { label: 'Excellent!', emoji: '🏆', color: 'text-emerald-500' }
    : percentage >= 70 ? { label: 'Well Done!', emoji: '🌟', color: 'text-emerald-500' }
    : percentage >= 50 ? { label: 'Good Effort!', emoji: '👍', color: 'text-amber-500' }
    : { label: 'Keep Practicing!', emoji: '📚', color: 'text-red-400' };

  const percentile = percentage >= 90 ? { label: 'Above 90%', emoji: '📈', color: 'text-emerald-500' }
    : percentage >= 70 ? { label: 'Above 70%', emoji: '📈', color: 'text-emerald-500' }
    : percentage >= 50 ? { label: 'Above 50%', emoji: '📊', color: 'text-amber-500' }
    : { label: 'Below 50%', emoji: '📉', color: 'text-red-400' };

  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <div className="bg-foreground/[0.03] border border-border rounded-2xl p-3.5 flex flex-col items-center gap-1.5 text-center">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <BarChart2 className="w-4 h-4 text-primary" />
        </div>
        <p className="text-[9px] text-foreground/35 font-black uppercase tracking-widest">Performance</p>
        <p className={`text-sm font-black ${perf.color} leading-tight`}>{perf.emoji} {perf.label}</p>
      </div>
      <div className="bg-foreground/[0.03] border border-border rounded-2xl p-3.5 flex flex-col items-center gap-1.5 text-center">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-primary" />
        </div>
        <p className="text-[9px] text-foreground/35 font-black uppercase tracking-widest">Percentile</p>
        <p className={`text-sm font-black ${percentile.color} leading-tight`}>{percentile.emoji} {percentile.label}</p>
      </div>
    </div>
  );
}
