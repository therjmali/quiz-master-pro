import { useMemo } from 'react';
import { getConfidenceHistory, computeCalibration } from '../../utils/confidenceTracker';

export default function ConfidenceChart() {
  const records = useMemo(() => getConfidenceHistory(), []);
  const cal = useMemo(() => computeCalibration(records), [records]);

  if (records.length < 2) return null;

  const R = 36, C = 2 * Math.PI * R;
  const scoreDash = (cal.calibrationScore / 100) * C;
  const scoreColor = cal.calibrationScore >= 70 ? '#22C55E' : cal.calibrationScore >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <div className="glass-card p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">🎯</span>
        <h3 className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.12em]">Confidence Calibration</h3>
      </div>

      <div className="flex items-center gap-6">
        {/* Score Ring */}
        <div className="relative flex-shrink-0">
          <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
            <circle cx="44" cy="44" r={R} fill="none" className="stroke-foreground/5" strokeWidth="6" />
            <circle cx="44" cy="44" r={R} fill="none" stroke={scoreColor} strokeWidth="6"
              strokeDasharray={`${scoreDash} ${C}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-black text-foreground">{cal.calibrationScore}%</span>
            <span className="text-[7px] text-foreground/30 font-bold">CALIBRATION</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-3">
          {/* Overconfidence */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-foreground/50">Overconfidence</span>
              <span className="text-xs font-black text-red-400">{cal.overconfidence}%</span>
            </div>
            <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full" style={{ width: `${cal.overconfidence}%`, transition: 'width 0.6s ease' }} />
            </div>
            <p className="text-[9px] text-foreground/25 mt-0.5">Said "Sure" but was wrong ({cal.totalSure} total)</p>
          </div>

          {/* Underconfidence */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-foreground/50">Underconfidence</span>
              <span className="text-xs font-black text-amber-400">{cal.underconfidence}%</span>
            </div>
            <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${cal.underconfidence}%`, transition: 'width 0.6s ease' }} />
            </div>
            <p className="text-[9px] text-foreground/25 mt-0.5">Said "Guessing" but was right ({cal.totalGuessing} total)</p>
          </div>
        </div>
      </div>

      {/* Interpretation */}
      <div className="mt-4 bg-foreground/[0.03] border border-border rounded-xl p-3">
        <p className="text-[11px] text-foreground/50 leading-relaxed">
          {cal.calibrationScore >= 80
            ? '🎯 Excellent calibration! You know what you know and what you don\'t.'
            : cal.overconfidence > 30
            ? '⚠️ You\'re often confident but wrong. Slow down on questions you think are easy.'
            : cal.underconfidence > 40
            ? '💡 You know more than you think! Trust your instincts more.'
            : '📊 Room for improvement. Keep tracking to build self-awareness.'}
        </p>
      </div>
    </div>
  );
}
