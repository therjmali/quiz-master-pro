import { useState, useMemo, useCallback } from 'react';
import { X, ChevronDown, Calculator, Check, RotateCcw, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { QuizQuestion, ScoreResult } from '../../types/quiz';
import { calculateScore } from '../../utils/scoring';
import { isNegativeMarkingApplied, getNegativeMarkingConfig, getOriginalScore } from '../../utils/negativeMarkingStore';

interface Props {
  quizData: QuizQuestion[];
  userAnswers: (string | null)[];
  originalMarksPerQ: number;
  originalNegMarking: boolean;
  originalNegMarks: number;
  originalResult: ScoreResult;
  passMark: number;
  quizId: string;
  onClose: () => void;
  onApplyMarking?: (marksPerQ: number, negMarks: number, simResult: ScoreResult) => void;
  onRemoveMarking?: () => void;
}

const PRESETS = [
  { label: '1/4', value: 0.25 },
  { label: '1/3', value: 0.33 },
  { label: '1/2', value: 0.5 },
  { label: '1/1', value: 1 },
];

function getZoneColor(pct: number) {
  if (pct >= 67) return '#34C759';
  if (pct >= 40) return '#F0A500';
  return '#FF3B5C';
}

export default function NegativeMarkingPanel({
  quizData, userAnswers, originalMarksPerQ, originalNegMarking, originalNegMarks,
  originalResult, passMark, quizId, onClose, onApplyMarking, onRemoveMarking,
}: Props) {
  const isApplied = isNegativeMarkingApplied(quizId);
  const currentConfig = getNegativeMarkingConfig(quizId);
  const originalScore = getOriginalScore(quizId);

  const [negMarks, setNegMarks] = useState(currentConfig?.negMarks ?? 0.25);
  const [marksPerQ, setMarksPerQ] = useState(currentConfig?.marksPerQ ?? originalMarksPerQ);
  const [customInput, setCustomInput] = useState('');
  const [activePreset, setActivePreset] = useState(() => {
    const val = currentConfig?.negMarks ?? 0.25;
    return PRESETS.findIndex(p => Math.abs(p.value - val) < 0.01);
  });
  // Settings collapsed by default when marking is applied, expanded when not
  const [showSettings, setShowSettings] = useState(!isApplied);

  const handlePreset = useCallback((idx: number) => {
    setActivePreset(idx);
    setNegMarks(PRESETS[idx].value);
    setCustomInput('');
  }, []);

  const handleCustom = useCallback((val: string) => {
    setCustomInput(val);
    setActivePreset(-1);
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0 && n <= 10) setNegMarks(n);
  }, []);

  const simResult = useMemo(() =>
    calculateScore(quizData, userAnswers, marksPerQ, true, negMarks),
    [quizData, userAnswers, marksPerQ, negMarks]
  );

  const origRecalc = useMemo(() =>
    calculateScore(quizData, userAnswers, marksPerQ, false, 0),
    [quizData, userAnswers, marksPerQ]
  );

  const pctDiff = simResult.percentage - origRecalc.percentage;
  const scoreDiff = parseFloat((simResult.netScore - origRecalc.netScore).toFixed(2));

  const simPassed = simResult.percentage >= passMark;

  const zone = simResult.percentage >= 67 ? { color: '#34C759' }
    : simResult.percentage >= 40 ? { color: '#F0A500' }
    : { color: '#FF3B5C' };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card border-t border-x border-border rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-md z-10 px-5 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center">
                <Calculator className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-foreground">Negative Marking Simulator</h3>
                <p className="text-[10px] text-foreground/40 font-bold">
                  {isApplied ? (
                    <span className="text-red-400">➖ Marking Applied ({currentConfig?.negMarks}/wrong)</span>
                  ) : 'What-if analysis with penalty rules'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-foreground/5 border border-border flex items-center justify-center hover:bg-foreground/10 transition-all active:scale-90">
              <X className="w-4 h-4 text-foreground/50" />
            </button>
          </div>

          {/* Applied status badge */}
          {isApplied && originalScore && (
            <div className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/8 border border-red-500/15">
              <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">➖ Active</span>
              <span className="text-[10px] text-foreground/40">
                Original: {originalScore.percentage}% → Current: {originalResult.percentage}%
              </span>
            </div>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* ═══ PRIMARY: Without vs With Comparison Dashboard ═══ */}
          <div className="space-y-4">
            {/* Side-by-side cards with VS badge */}
            <div className="relative grid grid-cols-2 gap-3">
              <CompactResultCard label="Without Negative Marking" result={origRecalc} passMark={passMark} />
              <CompactResultCard label={`With -${negMarks}/wrong`} result={simResult} passMark={passMark} highlight />
              {/* VS Badge */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[9px] font-black shadow-lg border-2 ${
                  pctDiff < 0
                    ? 'bg-destructive/90 border-destructive/50 text-white'
                    : 'bg-emerald-500/90 border-emerald-500/50 text-white'
                }`}>
                  {pctDiff < 0 ? `${pctDiff}%` : pctDiff === 0 ? '0%' : `+${pctDiff}%`}
                </div>
              </div>
            </div>

            {/* Score comparison bars */}
            <div className="rounded-2xl border border-border p-4 bg-foreground/[0.02] space-y-2.5">
              <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">📊 Score Comparison</p>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-foreground/50">Without</span>
                  <span className="text-[10px] font-black text-emerald-400">{origRecalc.netScore}/{origRecalc.maxScore} ({origRecalc.percentage}%)</span>
                </div>
                <div className="h-3 bg-foreground/8 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500/70 transition-all duration-700" style={{ width: `${origRecalc.percentage}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-foreground/50">With Marking</span>
                  <span className="text-[10px] font-black text-destructive">{simResult.netScore}/{simResult.maxScore} ({simResult.percentage}%)</span>
                </div>
                <div className="h-3 bg-foreground/8 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-destructive/70 transition-all duration-700" style={{ width: `${simResult.percentage}%` }} />
                </div>
              </div>
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

            {/* Compact impact stats */}
            <div className={`rounded-2xl border p-4 ${pctDiff < 0 ? 'bg-destructive/8 border-destructive/20' : 'bg-emerald-500/8 border-emerald-500/20'}`}>
              <div className="flex items-center justify-center gap-2 mb-3 flex-wrap">
                <span className="text-sm font-black text-emerald-400">{origRecalc.percentage}%</span>
                <span className="text-[10px] text-foreground/30 font-bold">without →</span>
                <span className="text-sm font-black text-destructive">{simResult.percentage}%</span>
                <span className="text-[10px] text-foreground/30 font-bold">with =</span>
                <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${pctDiff < 0 ? 'bg-destructive/15 text-destructive' : 'bg-emerald-500/15 text-emerald-400'}`}>
                  {pctDiff < 0 ? '▼' : '▲'} {Math.abs(pctDiff)}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-foreground/[0.04] rounded-xl p-2 border border-border/50">
                  <div className="text-sm font-black text-foreground">{Math.abs(scoreDiff)}</div>
                  <div className="text-[7px] text-foreground/30 font-bold uppercase">Marks {scoreDiff < 0 ? 'Lost' : 'Gained'}</div>
                </div>
                <div className="bg-foreground/[0.04] rounded-xl p-2 border border-border/50">
                  <div className="text-sm font-black text-destructive">-{simResult.penalty}</div>
                  <div className="text-[7px] text-foreground/30 font-bold uppercase">Total Penalty</div>
                </div>
                <div className="bg-foreground/[0.04] rounded-xl p-2 border border-border/50">
                  <div className="text-sm font-black text-foreground">{simResult.wrong}×{negMarks}</div>
                  <div className="text-[7px] text-foreground/30 font-bold uppercase">Wrong × Rate</div>
                </div>
              </div>
              {pctDiff < 0 && (
                <p className="text-[10px] font-bold text-destructive/70 mt-3 text-center leading-relaxed">
                  ⚠️ Negative marking would cost you <span className="font-black text-destructive">{Math.abs(scoreDiff)} marks</span> ({Math.abs(pctDiff)}% drop)
                </p>
              )}
            </div>
          </div>

          {/* ═══ COLLAPSIBLE: Marking Settings ═══ */}
          <div className="rounded-2xl border border-border overflow-hidden">
            <button
              onClick={() => setShowSettings(v => !v)}
              className="w-full flex items-center justify-between gap-2.5 py-3.5 px-4 font-black text-sm transition-all active:scale-[0.99] bg-foreground/[0.03] text-foreground/70 hover:bg-foreground/[0.06]"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-foreground/40" />
                <span>⚙️ Adjust Marking Rules</span>
                <span className="text-[9px] font-bold text-foreground/30 bg-foreground/[0.06] px-2 py-0.5 rounded-md">
                  {marksPerQ}m/Q · -{negMarks}/wrong
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-foreground/40 transition-transform duration-300 ${showSettings ? 'rotate-180' : ''}`} />
            </button>

            <div className={`grid transition-all duration-300 ease-in-out ${showSettings ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden">
                <div className="p-4 space-y-5 border-t border-border/50">
                  {/* Marks Per Question */}
                  <div>
                    <label className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2 block">
                      Marks Per Question
                    </label>
                    <div className="flex gap-2">
                      {[1, 2, 4, 5].map(v => (
                        <button key={v} onClick={() => setMarksPerQ(v)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all active:scale-95 ${
                            marksPerQ === v
                              ? 'bg-primary/15 border-primary/40 text-primary shadow-sm'
                              : 'bg-foreground/[0.03] border-border text-foreground/50 hover:border-foreground/20'
                          }`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Negative Marks Presets */}
                  <div>
                    <label className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2 block">
                      Negative Marks Per Wrong Answer
                    </label>
                    <div className="flex gap-2 mb-2.5">
                      {PRESETS.map((p, i) => (
                        <button key={p.label} onClick={() => handlePreset(i)}
                          className={`flex-1 py-3 rounded-xl border transition-all active:scale-95 flex flex-col items-center gap-0.5 ${
                            activePreset === i
                              ? 'bg-red-500/15 border-red-500/40 text-red-400 shadow-sm'
                              : 'bg-foreground/[0.03] border-border text-foreground/50 hover:border-foreground/20'
                          }`}>
                          <span className="text-sm font-black">{p.label}</span>
                          <span className="text-[9px] font-bold opacity-60">{p.value}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-foreground/30">Custom:</span>
                      <input
                        type="number" step="0.01" min="0" max="10"
                        value={customInput}
                        onChange={e => handleCustom(e.target.value)}
                        placeholder="e.g. 0.33"
                        className="flex-1 bg-foreground/[0.04] border border-border rounded-xl px-3 py-2 text-sm font-bold text-foreground placeholder-foreground/20 focus:outline-none focus:border-red-500/40"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Simulated Result Card */}
          <div className="relative overflow-hidden rounded-2xl border p-5"
            style={{ background: `linear-gradient(135deg, ${zone.color}08, ${zone.color}18)`, borderColor: `${zone.color}30` }}>
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full" style={{ background: `radial-gradient(circle, ${zone.color}15 0%, transparent 70%)` }} />

            <p className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: `${zone.color}90` }}>
              ➖ Simulated Result
            </p>

            <div className="flex items-center gap-4 mb-4">
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                  <circle cx="40" cy="40" r="34" fill="none" stroke={`${zone.color}15`} strokeWidth="6" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke={zone.color} strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${(Math.min(simResult.percentage, 100) / 100) * 213.6} 213.6`}
                    style={{ transition: 'stroke-dasharray 0.6s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-black" style={{ color: zone.color }}>{simResult.percentage}%</span>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-black" style={{ color: zone.color }}>{simResult.netScore}</span>
                  <span className="text-sm font-bold opacity-40" style={{ color: zone.color }}>/ {simResult.maxScore}</span>
                </div>
                <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  simPassed ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-red-500/15 text-red-400 border border-red-500/25'
                }`}>
                  {simPassed ? '✓ PASS' : '✗ FAIL'}
                  <span className="opacity-50 normal-case font-semibold">({passMark}%)</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Gain" value={`+${simResult.gain}`} color="text-emerald-400" />
              <MiniStat label="Penalty" value={`-${simResult.penalty}`} color="text-red-400" />
              <MiniStat label="Net" value={String(simResult.netScore)} color="text-primary" />
            </div>
          </div>

          {/* Apply / Remove Toggle */}
          <div className="flex gap-2">
            {onApplyMarking && (
              <button
                onClick={() => {
                  onApplyMarking(marksPerQ, negMarks, simResult);
                  toast.success(`✅ Marking applied! ${marksPerQ} marks/Q, -${negMarks}/wrong → ${simResult.percentage}%`, {
                    action: onRemoveMarking ? {
                      label: 'Undo',
                      onClick: () => { onRemoveMarking(); toast.success('↩️ Reverted to original scores'); },
                    } : undefined,
                    duration: 6000,
                  });
                  onClose();
                }}
                className="flex-1 flex items-center justify-center gap-2.5 py-4 rounded-2xl font-black text-sm border transition-all active:scale-[0.98] bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15">
                <Check className="w-4 h-4" />
                {isApplied ? '🔄 Update Marking' : '✅ Apply Permanently'}
              </button>
            )}
            {isApplied && onRemoveMarking && (
              <button
                onClick={() => {
                  onRemoveMarking();
                  toast.success('↩️ Negative marking removed — original scores restored!');
                  onClose();
                }}
                className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl font-black text-sm border transition-all active:scale-[0.98] bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/15">
                <RotateCcw className="w-4 h-4" /> Remove
              </button>
            )}
          </div>

          {/* Settings info */}
          <div className="flex items-center justify-center gap-3 text-[10px] text-foreground/25 font-bold pb-2">
            <span>{quizData.length} Qs</span>
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

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-foreground/[0.04] rounded-xl p-2.5 text-center border border-border/50">
      <div className={`text-base font-black ${color} leading-none`}>{value}</div>
      <div className="text-[8px] text-foreground/30 font-bold uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function CompactResultCard({ label, result, passMark, highlight }: {
  label: string; result: ScoreResult; passMark: number; highlight?: boolean;
}) {
  const color = getZoneColor(result.percentage);
  const passed = result.percentage >= passMark;
  const r = 26;
  const circ = 2 * Math.PI * r;

  return (
    <div className="rounded-xl border p-3 transition-all"
      style={{
        background: highlight ? `linear-gradient(135deg, ${color}08, ${color}15)` : undefined,
        borderColor: highlight ? `${color}30` : undefined,
      }}>
      <p className="text-[7px] font-black uppercase tracking-widest mb-2 leading-tight min-h-[20px]"
        style={{ color: highlight ? color : 'rgb(var(--foreground) / 0.35)' }}>
        {label}
      </p>

      <div className="flex flex-col items-center mb-2">
        <div className="relative" style={{ width: 60, height: 60 }}>
          <svg viewBox="0 0 60 60" className="w-full h-full -rotate-90">
            <circle cx="30" cy="30" r={r} fill="none" stroke={`${color}15`} strokeWidth="4" />
            <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(Math.min(result.percentage, 100) / 100) * circ} ${circ}`}
              style={{ transition: 'stroke-dasharray 0.8s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-black" style={{ color }}>{result.percentage}%</span>
          </div>
        </div>
      </div>

      <div className="text-center mb-2">
        <span className="text-base font-black" style={{ color }}>{result.netScore}</span>
        <span className="text-[10px] font-bold opacity-40" style={{ color }}> / {result.maxScore}</span>
      </div>

      <div className={`text-center py-1 rounded-full text-[8px] font-black uppercase ${
        passed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
      }`}>
        {passed ? '✓ PASS' : '✗ FAIL'}
      </div>

      <div className="space-y-1 mt-2">
        <SmallRow label="Gain" value={`+${result.gain}`} cls="text-emerald-400" />
        <SmallRow label="Penalty" value={result.penalty > 0 ? `-${result.penalty}` : '0'} cls={result.penalty > 0 ? 'text-destructive' : 'text-foreground/40'} />
        <SmallRow label="Correct" value={String(result.correct)} cls="text-emerald-400" />
        <SmallRow label="Wrong" value={String(result.wrong)} cls="text-destructive" />
      </div>
    </div>
  );
}

function SmallRow({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-foreground/35 font-semibold">{label}</span>
      <span className={`text-[10px] font-black ${cls}`}>{value}</span>
    </div>
  );
}
