import { ArrowLeft, X } from 'lucide-react';
import { ScoreResult } from '../../types/quiz';

interface Props {
  originalResult: ScoreResult;
  simResult: ScoreResult;
  passMark: number;
  negMarks: number;
  marksPerQ: number;
  totalQuestions: number;
  onBack: () => void;
  onClose: () => void;
}

function getZoneColor(pct: number) {
  if (pct >= 67) return '#34C759';
  if (pct >= 40) return '#F0A500';
  return '#FF3B5C';
}

export default function NegativeMarkingCompare({
  originalResult, simResult, passMark, negMarks, marksPerQ, totalQuestions,
  onBack, onClose,
}: Props) {
  const pctDiff = simResult.percentage - originalResult.percentage;
  const scoreDiff = parseFloat((simResult.netScore - originalResult.netScore).toFixed(2));
  const withoutPct = originalResult.percentage;
  const withPct = simResult.percentage;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-card border-t border-x border-border rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-md z-10 px-5 pt-4 pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-foreground/40 hover:text-foreground transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <h3 className="text-xs font-black text-foreground/70 uppercase tracking-widest">Without vs With Marking</h3>
            <button onClick={onClose} className="w-7 h-7 rounded-lg bg-foreground/5 border border-border flex items-center justify-center active:scale-90">
              <X className="w-3.5 h-3.5 text-foreground/40" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Side-by-side cards with VS badge */}
          <div className="relative grid grid-cols-2 gap-3">
            <ResultCard label="Without Negative Marking" result={originalResult} passMark={passMark} />
            <ResultCard label={`With -${negMarks}/wrong`} result={simResult} passMark={passMark} highlight />

            {/* VS Badge centered between cards */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-black shadow-xl border-2 ${
                pctDiff < 0
                  ? 'bg-destructive/90 border-destructive/50 text-white'
                  : 'bg-emerald-500/90 border-emerald-500/50 text-white'
              }`}>
                {pctDiff < 0 ? `${pctDiff}%` : pctDiff === 0 ? '0%' : `+${pctDiff}%`}
              </div>
            </div>
          </div>

          {/* Visual Score Drop Bar */}
          <div className="rounded-2xl border border-border p-4 bg-foreground/[0.02]">
            <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-3">📊 Score Comparison</p>
            <div className="space-y-2.5">
              {/* Without bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-foreground/50">Without Marking</span>
                  <span className="text-[11px] font-black text-emerald-400">{originalResult.netScore}/{originalResult.maxScore} ({withoutPct}%)</span>
                </div>
                <div className="h-3.5 bg-foreground/8 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500/70 transition-all duration-700" style={{ width: `${withoutPct}%` }} />
                </div>
              </div>
              {/* With bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-foreground/50">With Marking</span>
                  <span className="text-[11px] font-black text-destructive">{simResult.netScore}/{simResult.maxScore} ({withPct}%)</span>
                </div>
                <div className="h-3.5 bg-foreground/8 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-destructive/70 transition-all duration-700" style={{ width: `${withPct}%` }} />
                </div>
              </div>
              {/* Gap indicator */}
              {pctDiff !== 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 h-px bg-border" />
                  <span className={`text-[10px] font-black ${pctDiff < 0 ? 'text-destructive' : 'text-emerald-400'}`}>
                    {Math.abs(pctDiff)}% {pctDiff < 0 ? 'drop' : 'gain'}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
            </div>
          </div>

          {/* Impact Summary Strip */}
          <div className={`rounded-2xl border p-4 ${pctDiff < 0 ? 'bg-destructive/8 border-destructive/20' : 'bg-emerald-500/8 border-emerald-500/20'}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-foreground/30">Impact Summary</span>
            </div>

            {/* Flow: Without → With = Drop */}
            <div className="flex items-center justify-center gap-2 mb-3 flex-wrap">
              <span className="text-sm font-black text-emerald-400">{withoutPct}%</span>
              <span className="text-[10px] text-foreground/30 font-bold">without →</span>
              <span className="text-sm font-black text-destructive">{withPct}%</span>
              <span className="text-[10px] text-foreground/30 font-bold">with =</span>
              <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${pctDiff < 0 ? 'bg-destructive/15 text-destructive' : 'bg-emerald-500/15 text-emerald-400'}`}>
                {pctDiff < 0 ? '▼' : '▲'} {Math.abs(pctDiff)}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-lg font-black text-foreground">{Math.abs(scoreDiff)}</div>
                <div className="text-[8px] text-foreground/30 font-bold uppercase">Marks {scoreDiff < 0 ? 'Lost' : 'Gained'}</div>
              </div>
              <div>
                <div className="text-lg font-black text-destructive">-{simResult.penalty}</div>
                <div className="text-[8px] text-foreground/30 font-bold uppercase">Total Penalty</div>
              </div>
              <div>
                <div className="text-lg font-black text-foreground">
                  {simResult.wrong} × {negMarks}
                </div>
                <div className="text-[8px] text-foreground/30 font-bold uppercase">Wrong × Rate</div>
              </div>
            </div>
            {pctDiff < 0 && (
              <p className="text-[10px] font-bold text-destructive/80 mt-3 text-center leading-relaxed">
                Negative marking cost you <span className="font-black">{Math.abs(scoreDiff)} marks</span> ({Math.abs(pctDiff)}% drop)
              </p>
            )}
          </div>

          {/* Settings info */}
          <div className="flex items-center justify-center gap-3 text-[10px] text-foreground/25 font-bold">
            <span>{totalQuestions} Qs</span>
            <span>·</span>
            <span>{marksPerQ} marks/Q</span>
            <span>·</span>
            <span>-{negMarks}/wrong</span>
            <span>·</span>
            <span>Pass: {passMark}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ label, result, passMark, highlight }: {
  label: string; result: ScoreResult; passMark: number; highlight?: boolean;
}) {
  const color = getZoneColor(result.percentage);
  const passed = result.percentage >= passMark;
  const r = 30;
  const circ = 2 * Math.PI * r;

  return (
    <div className="rounded-2xl border p-4 transition-all"
      style={{
        background: highlight ? `linear-gradient(135deg, ${color}08, ${color}15)` : undefined,
        borderColor: highlight ? `${color}30` : undefined,
      }}>
      <p className="text-[8px] font-black uppercase tracking-widest mb-3 leading-tight min-h-[24px]"
        style={{ color: highlight ? color : 'rgb(var(--foreground) / 0.35)' }}>
        {label}
      </p>

      {/* Ring gauge */}
      <div className="flex flex-col items-center mb-3">
        <div className="relative" style={{ width: 72, height: 72 }}>
          <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
            <circle cx="36" cy="36" r={r} fill="none" stroke={`${color}15`} strokeWidth="5" />
            <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${(Math.min(result.percentage, 100) / 100) * circ} ${circ}`}
              style={{ transition: 'stroke-dasharray 0.8s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black" style={{ color }}>{result.percentage}%</span>
          </div>
        </div>
      </div>

      {/* Score */}
      <div className="text-center mb-3">
        <span className="text-xl font-black" style={{ color }}>{result.netScore}</span>
        <span className="text-xs font-bold opacity-40" style={{ color }}> / {result.maxScore}</span>
      </div>

      {/* Pass/Fail */}
      <div className={`text-center mb-3 inline-flex items-center gap-1 mx-auto px-2 py-1 rounded-full text-[9px] font-black uppercase w-full justify-center ${
        passed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
      }`}>
        {passed ? '✓ PASS' : '✗ FAIL'}
      </div>

      {/* Breakdown */}
      <div className="space-y-1.5">
        <Row label="Gain" value={`+${result.gain}`} cls="text-emerald-400" />
        <Row label="Penalty" value={result.penalty > 0 ? `-${result.penalty}` : '0'} cls={result.penalty > 0 ? 'text-destructive' : 'text-foreground/40'} />
        <Row label="Correct" value={String(result.correct)} cls="text-emerald-400" />
        <Row label="Wrong" value={String(result.wrong)} cls="text-destructive" />
        <Row label="Skipped" value={String(result.skipped)} cls="text-amber-400" />
      </div>
    </div>
  );
}

function Row({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-foreground/35 font-semibold">{label}</span>
      <span className={`text-[11px] font-black ${cls}`}>{value}</span>
    </div>
  );
}
