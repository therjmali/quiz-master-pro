import { useState, useMemo, useCallback } from 'react';
import Overlay from '../ui/Overlay';
import { X, ChevronDown, Calculator, Check, RotateCcw, Settings, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ScoreResult } from '../../types/quiz';
import { getAppliedCount, getAppliedCountForIds } from '../../utils/negativeMarkingStore';

interface Props {
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  totalQuestions: number;
  originalGain: number;
  originalPenalty: number;
  passMark: number;
  onClose: () => void;
  onApplyAll?: (marksPerQ: number, negMarks: number) => void;
  onRemoveAll?: () => void;
  onRemoveFiltered?: (quizIds: string[]) => void;
  filteredQuizIds?: string[];
  allQuizIds?: string[];
  subjectLabel?: string;
  showDecimalPct?: boolean;
}

const PRESETS = [
  { label: '1/4', value: 0.25 },
  { label: '1/3', value: 0.33 },
  { label: '1/2', value: 0.5 },
  { label: '1/1', value: 1 },
];

function calcLifetime(correct: number, wrong: number, skipped: number, marksPerQ: number, negMarks: number, totalQuestions?: number): ScoreResult & { percentageDecimal: number } {
  const total = totalQuestions || (correct + wrong + skipped);
  const gain = correct * marksPerQ;
  const penalty = parseFloat((wrong * negMarks).toFixed(2));
  const netScore = Math.max(0, parseFloat((gain - penalty).toFixed(2)));
  const maxScore = total * marksPerQ;
  const percentage = maxScore > 0 ? Math.max(0, Math.min(100, Math.round((netScore / maxScore) * 100))) : 0;
  const percentageDecimal = maxScore > 0 ? Math.max(0, Math.min(100, Math.round(((netScore / maxScore) * 100) * 100) / 100)) : 0;
  const accuracy = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
  return { correct, wrong, skipped, gain, penalty, netScore, maxScore, percentage, accuracy, percentageDecimal };
}

function getZoneColor(pct: number) {
  if (pct >= 67) return '#34C759';
  if (pct >= 40) return '#F0A500';
  return '#FF3B5C';
}

export default function LifetimeNegMarkingPanel({
  totalCorrect, totalWrong, totalSkipped, totalQuestions,
  originalGain, originalPenalty, passMark, onClose, onApplyAll, onRemoveAll,
  onRemoveFiltered, filteredQuizIds, allQuizIds, subjectLabel, showDecimalPct = false,
}: Props) {
  const [negMarks, setNegMarks] = useState(0.25);
  const [marksPerQ, setMarksPerQ] = useState(1);
  const [customInput, setCustomInput] = useState('');
  const [activePreset, setActivePreset] = useState(0);

  const appliedInfo = useMemo(() => getAppliedCount(), []);
  const hasApplied = appliedInfo.applied > 0;
  const filteredAppliedInfo = useMemo(() =>
    filteredQuizIds ? getAppliedCountForIds(filteredQuizIds) : null,
    [filteredQuizIds]
  );
  const allAppliedInfo = useMemo(() =>
    allQuizIds ? getAppliedCountForIds(allQuizIds) : null,
    [allQuizIds]
  );

  // Settings collapsed by default when marking is applied, expanded when not
  const [showSettings, setShowSettings] = useState(!hasApplied);

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
    calcLifetime(totalCorrect, totalWrong, totalSkipped, marksPerQ, negMarks, totalQuestions),
    [totalCorrect, totalWrong, totalSkipped, marksPerQ, negMarks, totalQuestions]
  );

  const origResult = useMemo((): ScoreResult & { percentageDecimal: number } => {
    const maxScore = totalQuestions * marksPerQ;
    const gain = totalCorrect * marksPerQ;
    const netScore = gain;
    const percentage = maxScore > 0 ? Math.round((netScore / maxScore) * 100) : 0;
    const percentageDecimal = maxScore > 0 ? Math.max(0, Math.min(100, Math.round(((netScore / maxScore) * 100) * 100) / 100)) : 0;
    const accuracy = (totalCorrect + totalWrong) > 0 ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : 0;
    return { correct: totalCorrect, wrong: totalWrong, skipped: totalSkipped, gain, penalty: 0, netScore, maxScore, percentage, accuracy, percentageDecimal };
  }, [totalCorrect, totalWrong, totalSkipped, totalQuestions, marksPerQ]);

  const pctDiff = simResult.percentage - origResult.percentage;
  const scoreDiff = parseFloat((simResult.netScore - origResult.netScore).toFixed(2));
  const simPassed = simResult.percentage >= passMark;
  const zone = getZoneColor(simResult.percentage);

  return (
    <Overlay open onClose={onClose} kind="sheet" layer="sheet" className="max-w-lg" label="Lifetime negative marking">
      <div className="qmp-panel-body">
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-md z-10 px-5 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-destructive/15 border border-destructive/25 flex items-center justify-center">
                <Calculator className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <h3 className="text-sm font-black text-foreground">Lifetime Negative Marking</h3>
                <p className="text-[10px] text-foreground/40 font-bold">
                  {filteredQuizIds && subjectLabel
                    ? `Applying to ${filteredQuizIds.length} ${subjectLabel} quizzes`
                    : `What-if across all ${totalQuestions} questions`}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-foreground/5 border border-border flex items-center justify-center hover:bg-foreground/10 transition-all active:scale-90">
              <X className="w-4 h-4 text-foreground/50" />
            </button>
          </div>

          {/* Applied status */}
          {hasApplied && (
            <div className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/8 border border-red-500/15">
              <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">➖ Active</span>
              <span className="text-[10px] text-foreground/40">
                {appliedInfo.applied} of {appliedInfo.total} quizzes have marking applied
              </span>
            </div>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* ═══ PRIMARY: Without vs With Comparison Dashboard ═══ */}
          <div className="space-y-4">
            {/* Side-by-side cards with VS badge */}
            <div className="relative grid grid-cols-2 gap-3">
              <ResultCard label="Without Negative Marking" result={origResult} passMark={passMark} showDecimalPct={showDecimalPct} />
              <ResultCard label={`With -${negMarks}/wrong`} result={simResult} passMark={passMark} highlight showDecimalPct={showDecimalPct} />
              {/* VS Badge */}
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

            {/* Score comparison bars */}
            <div className="rounded-2xl border border-border p-4 bg-foreground/[0.02]">
              <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-3">📊 Score Comparison</p>
              <div className="space-y-2.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-foreground/50">Without Marking</span>
                    <span className="text-[11px] font-black text-emerald-400">{origResult.netScore}/{origResult.maxScore} ({showDecimalPct ? `${origResult.percentageDecimal}%` : `${origResult.percentage}%`})</span>
                  </div>
                  <div className="h-3.5 bg-foreground/8 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500/70 transition-all duration-700" style={{ width: `${origResult.percentage}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-foreground/50">With Marking</span>
                    <span className="text-[11px] font-black text-destructive">{simResult.netScore}/{simResult.maxScore} ({showDecimalPct ? `${simResult.percentageDecimal}%` : `${simResult.percentage}%`})</span>
                  </div>
                  <div className="h-3.5 bg-foreground/8 rounded-full overflow-hidden">
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
            </div>

            {/* Impact Summary */}
            <div className={`rounded-2xl border p-4 ${pctDiff < 0 ? 'bg-destructive/8 border-destructive/20' : 'bg-emerald-500/8 border-emerald-500/20'}`}>
              <div className="flex items-center justify-center gap-2 mb-3 flex-wrap">
                <span className="text-sm font-black text-emerald-400">{showDecimalPct ? origResult.percentageDecimal : origResult.percentage}%</span>
                <span className="text-[10px] text-foreground/30 font-bold">without →</span>
                <span className="text-sm font-black text-destructive">{showDecimalPct ? simResult.percentageDecimal : simResult.percentage}%</span>
                <span className="text-[10px] text-foreground/30 font-bold">with =</span>
                <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${pctDiff < 0 ? 'bg-destructive/15 text-destructive' : 'bg-emerald-500/15 text-emerald-400'}`}>
                  {pctDiff < 0 ? '▼' : '▲'} {Math.abs(pctDiff)}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-foreground/[0.04] rounded-xl p-2 border border-border/50">
                  <div className="text-lg font-black text-foreground">{Math.abs(scoreDiff)}</div>
                  <div className="text-[8px] text-foreground/30 font-bold uppercase">Marks {scoreDiff < 0 ? 'Lost' : 'Gained'}</div>
                </div>
                <div className="bg-foreground/[0.04] rounded-xl p-2 border border-border/50">
                  <div className="text-lg font-black text-destructive">-{simResult.penalty}</div>
                  <div className="text-[8px] text-foreground/30 font-bold uppercase">Total Penalty</div>
                </div>
                <div className="bg-foreground/[0.04] rounded-xl p-2 border border-border/50">
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
                    <label className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2 block">Marks Per Question</label>
                    <div className="flex gap-2">
                      {[1, 2, 4, 5].map(v => (
                        <button key={v} onClick={() => setMarksPerQ(v)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all active:scale-95 ${
                            marksPerQ === v ? 'bg-primary/15 border-primary/40 text-primary shadow-sm' : 'bg-foreground/[0.03] border-border text-foreground/50 hover:border-foreground/20'
                          }`}>{v}</button>
                      ))}
                    </div>
                  </div>

                  {/* Negative Marks Presets */}
                  <div>
                    <label className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2 block">Negative Marks Per Wrong Answer</label>
                    <div className="flex gap-2 mb-2.5">
                      {PRESETS.map((p, i) => (
                        <button key={p.label} onClick={() => handlePreset(i)}
                          className={`flex-1 py-3 rounded-xl border transition-all active:scale-95 flex flex-col items-center gap-0.5 ${
                            activePreset === i ? 'bg-destructive/15 border-destructive/40 text-destructive shadow-sm' : 'bg-foreground/[0.03] border-border text-foreground/50 hover:border-foreground/20'
                          }`}>
                          <span className="text-sm font-black">{p.label}</span>
                          <span className="text-[9px] font-bold opacity-60">{p.value}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-foreground/30">Custom:</span>
                      <input type="number" step="0.01" min="0" max="10" value={customInput}
                        onChange={e => handleCustom(e.target.value)} placeholder="e.g. 0.33"
                        className="flex-1 bg-foreground/[0.04] border border-border rounded-xl px-3 py-2 text-sm font-bold text-foreground placeholder-foreground/20 focus:outline-none focus:border-destructive/40" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Simulated Result */}
          <div className="relative overflow-hidden rounded-2xl border p-5"
            style={{ background: `linear-gradient(135deg, ${zone}08, ${zone}18)`, borderColor: `${zone}30` }}>
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full" style={{ background: `radial-gradient(circle, ${zone}15 0%, transparent 70%)` }} />
            <p className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: `${zone}90` }}>➖ Simulated Lifetime Result</p>

            <div className="flex items-center gap-4 mb-4">
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                  <circle cx="40" cy="40" r="34" fill="none" stroke={`${zone}15`} strokeWidth="6" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke={zone} strokeWidth="6"
                    strokeLinecap="round" strokeDasharray={`${(Math.min(simResult.percentage, 100) / 100) * 213.6} 213.6`}
                    style={{ transition: 'stroke-dasharray 0.6s ease' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-black" style={{ color: zone }}>{showDecimalPct ? simResult.percentageDecimal : simResult.percentage}%</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-black" style={{ color: zone }}>{simResult.netScore}</span>
                  <span className="text-sm font-bold opacity-40" style={{ color: zone }}>/ {simResult.maxScore}</span>
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
              {[
                { label: 'Gain', value: `+${simResult.gain}`, cls: 'text-emerald-400' },
                { label: 'Penalty', value: `-${simResult.penalty}`, cls: 'text-destructive' },
                { label: 'Net', value: String(simResult.netScore), cls: 'text-primary' },
              ].map(s => (
                <div key={s.label} className="bg-foreground/[0.04] rounded-xl p-2.5 text-center border border-border/50">
                  <div className={`text-base font-black ${s.cls} leading-none`}>{s.value}</div>
                  <div className="text-[8px] text-foreground/30 font-bold uppercase tracking-wider mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Apply Button */}
          {onApplyAll && (
            <button
              onClick={() => {
                onApplyAll(marksPerQ, negMarks);
                toast.success(`✅ Applied! ${marksPerQ} marks/Q, -${negMarks}/wrong`, {
                  action: onRemoveAll ? {
                    label: 'Undo',
                    onClick: () => { onRemoveAll(); toast.success('↩️ Reverted to original scores'); },
                  } : undefined,
                  duration: 8000,
                });
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-black text-sm border transition-all active:scale-[0.98] bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15">
              <Check className="w-4 h-4" />
              {hasApplied ? '🔄 Re-Apply' : filteredQuizIds ? `✅ Apply to ${filteredQuizIds.length} Quizzes` : '✅ Apply to All Quizzes'}
            </button>
          )}

          {/* ═══ Remove Negative Marking Options ═══ */}
          {hasApplied && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] overflow-hidden">
              <p className="text-[9px] font-black text-amber-400/70 uppercase tracking-widest px-4 pt-3 pb-2">
                <Trash2 className="w-3 h-3 inline mr-1.5 -mt-0.5" />
                Remove Negative Marking
              </p>
              <div className="px-3 pb-3 space-y-1.5">
                {/* Remove from ALL quizzes */}
                {onRemoveAll && (
                  <button
                    onClick={() => {
                      onRemoveAll();
                      toast.success('↩️ Removed from ALL quizzes — original scores restored!');
                      onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl font-bold text-[11px] border transition-all active:scale-[0.98] bg-amber-500/8 border-amber-500/20 text-amber-400 hover:bg-amber-500/15">
                    <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1 text-left">Remove from All Quizzes</span>
                    <span className="text-[9px] font-black bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-md">
                      {appliedInfo.applied} of {appliedInfo.total}
                    </span>
                  </button>
                )}

                {/* Remove from subject-specific quizzes */}
                {subjectLabel && filteredQuizIds && onRemoveFiltered && filteredAppliedInfo && filteredAppliedInfo.applied > 0 && (
                  <button
                    onClick={() => {
                      onRemoveFiltered(filteredQuizIds);
                      toast.success(`↩️ Removed from ${filteredAppliedInfo.applied} ${subjectLabel} quizzes!`);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl font-bold text-[11px] border transition-all active:scale-[0.98] bg-primary/8 border-primary/20 text-primary hover:bg-primary/15">
                    <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1 text-left truncate">Remove from "{subjectLabel}" Quizzes</span>
                    <span className="text-[9px] font-black bg-primary/15 text-primary px-2 py-0.5 rounded-md">
                      {filteredAppliedInfo.applied} of {filteredAppliedInfo.total}
                    </span>
                  </button>
                )}

                {/* Remove from currently viewed quizzes (when not subject-filtered but has a subset) */}
                {!subjectLabel && allQuizIds && onRemoveFiltered && allAppliedInfo && allAppliedInfo.applied > 0 && allAppliedInfo.applied < appliedInfo.applied && (
                  <button
                    onClick={() => {
                      onRemoveFiltered(allQuizIds);
                      toast.success(`↩️ Removed from ${allAppliedInfo.applied} selected quizzes!`);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl font-bold text-[11px] border transition-all active:scale-[0.98] bg-violet-500/8 border-violet-500/20 text-violet-400 hover:bg-violet-500/15">
                    <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1 text-left">Remove from Current View</span>
                    <span className="text-[9px] font-black bg-violet-500/15 text-violet-300 px-2 py-0.5 rounded-md">
                      {allAppliedInfo.applied} of {allAppliedInfo.total}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Settings info */}
          <div className="flex items-center justify-center gap-3 text-[10px] text-foreground/25 font-bold pb-2">
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
    </Overlay>
  );
}

function ResultCard({ label, result, passMark, highlight, showDecimalPct }: {
  label: string; result: ScoreResult & { percentageDecimal?: number }; passMark: number; highlight?: boolean; showDecimalPct?: boolean;
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
            <span className="text-lg font-black" style={{ color }}>
              {showDecimalPct && result.percentageDecimal !== undefined ? result.percentageDecimal : result.percentage}%
            </span>
          </div>
        </div>
      </div>

      <div className="text-center mb-3">
        <span className="text-xl font-black" style={{ color }}>{result.netScore}</span>
        <span className="text-xs font-bold opacity-40" style={{ color }}> / {result.maxScore}</span>
      </div>

      <div className={`text-center mb-3 inline-flex items-center gap-1 mx-auto px-2 py-1 rounded-full text-[9px] font-black uppercase w-full justify-center ${
        passed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
      }`}>
        {passed ? '✓ PASS' : '✗ FAIL'}
      </div>

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
