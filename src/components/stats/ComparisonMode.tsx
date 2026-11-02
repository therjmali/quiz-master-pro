import { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { QuizResult } from '../../types/quiz';

interface Props { history: QuizResult[]; }

type CompareMode = 'time' | 'subject';
type TimePeriod = 'week' | 'month';

function DiffBadge({ diff, suffix = '%' }: { diff: number; suffix?: string }) {
  if (diff === 0) return <span className="flex items-center gap-0.5 text-xs font-bold text-foreground/30"><Minus className="w-3 h-3" /> 0{suffix}</span>;
  const positive = diff > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-black ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      {positive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {positive ? '+' : ''}{diff}{suffix}
    </span>
  );
}

function StatCompare({ label, valA, valB, suffix = '' }: { label: string; valA: number; valB: number; suffix?: string }) {
  const diff = valA - valB;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs font-bold text-foreground/50">{label}</span>
      <div className="flex items-center gap-4">
        <span className="text-xs font-bold text-foreground/40 w-14 text-right">{valB}{suffix}</span>
        <span className="text-xs text-foreground/15">→</span>
        <span className="text-xs font-black text-foreground w-14 text-right">{valA}{suffix}</span>
        <div className="w-16 text-right"><DiffBadge diff={diff} suffix={suffix} /></div>
      </div>
    </div>
  );
}

function computePeriodStats(results: QuizResult[]) {
  if (!results.length) return { avg: 0, accuracy: 0, count: 0, correct: 0, wrong: 0, time: 0 };
  const correct = results.reduce((a, r) => a + r.correct, 0);
  const wrong = results.reduce((a, r) => a + r.wrong, 0);
  return {
    avg: Math.round(results.reduce((a, r) => a + r.percentage, 0) / results.length),
    accuracy: (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0,
    count: results.length,
    correct,
    wrong,
    time: results.reduce((a, r) => a + r.timeTaken, 0),
  };
}

export default function ComparisonMode({ history }: Props) {
  const [mode, setMode] = useState<CompareMode>('time');
  const [period, setPeriod] = useState<TimePeriod>('week');
  const [subjectA, setSubjectA] = useState('');
  const [subjectB, setSubjectB] = useState('');

  const subjects = useMemo(() => {
    const set = new Set<string>();
    history.forEach(r => { if (r.subject) set.add(r.subject); });
    return Array.from(set);
  }, [history]);

  // Time comparison
  const { currentPeriod, previousPeriod } = useMemo(() => {
    const days = period === 'week' ? 7 : 30;
    const now = Date.now();
    const cutoff = now - days * 86400000;
    const prevCutoff = cutoff - days * 86400000;
    return {
      currentPeriod: history.filter(r => r.timestamp >= cutoff),
      previousPeriod: history.filter(r => r.timestamp >= prevCutoff && r.timestamp < cutoff),
    };
  }, [history, period]);

  const currentStats = useMemo(() => computePeriodStats(currentPeriod), [currentPeriod]);
  const previousStats = useMemo(() => computePeriodStats(previousPeriod), [previousPeriod]);

  // Subject comparison
  const { subjAStats, subjBStats } = useMemo(() => {
    const a = history.filter(r => r.subject === subjectA);
    const b = history.filter(r => r.subject === subjectB);
    return { subjAStats: computePeriodStats(a), subjBStats: computePeriodStats(b) };
  }, [history, subjectA, subjectB]);

  if (history.length < 4) return null;

  return (
    <div className="glass-card p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">⚖️</span>
        <h3 className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.12em]">Comparison Mode</h3>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-1.5 bg-foreground/[0.03] p-1 rounded-lg border border-border mb-4">
        {[
          { key: 'time' as const, label: '📅 Time Period' },
          { key: 'subject' as const, label: '📚 Subjects' },
        ].map(m => (
          <button key={m.key} onClick={() => setMode(m.key)}
            className={`flex-1 text-[11px] font-bold py-2 rounded-md transition-all ${mode === m.key ? 'bg-primary/15 text-foreground border border-primary/25' : 'text-foreground/40'}`}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'time' && (
        <>
          <div className="flex gap-1.5 mb-4">
            {(['week', 'month'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`flex-1 text-[11px] font-bold py-2 rounded-lg border transition-all ${period === p ? 'bg-primary/10 border-primary/30 text-foreground' : 'border-border text-foreground/30'}`}>
                {p === 'week' ? 'This Week vs Last' : 'This Month vs Last'}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-3 text-[9px] font-bold text-foreground/30 uppercase tracking-widest">
            <span>Metric</span>
            <div className="flex gap-4">
              <span className="w-14 text-right">Before</span>
              <span className="w-3" />
              <span className="w-14 text-right">Now</span>
              <span className="w-16 text-right">Change</span>
            </div>
          </div>

          <StatCompare label="Avg Score" valA={currentStats.avg} valB={previousStats.avg} suffix="%" />
          <StatCompare label="Accuracy" valA={currentStats.accuracy} valB={previousStats.accuracy} suffix="%" />
          <StatCompare label="Quizzes" valA={currentStats.count} valB={previousStats.count} />
          <StatCompare label="Correct" valA={currentStats.correct} valB={previousStats.correct} />
        </>
      )}

      {mode === 'subject' && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <select value={subjectA} onChange={e => setSubjectA(e.target.value)}
              className="bg-foreground/[0.04] border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary/50">
              <option value="">Select Subject A</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={subjectB} onChange={e => setSubjectB(e.target.value)}
              className="bg-foreground/[0.04] border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary/50">
              <option value="">Select Subject B</option>
              {subjects.filter(s => s !== subjectA).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {subjectA && subjectB ? (
            <>
              <div className="flex items-center justify-between mb-3 text-[9px] font-bold text-foreground/30 uppercase tracking-widest">
                <span>Metric</span>
                <div className="flex gap-4">
                  <span className="w-14 text-right truncate">{subjectB.slice(0, 6)}</span>
                  <span className="w-3" />
                  <span className="w-14 text-right truncate">{subjectA.slice(0, 6)}</span>
                  <span className="w-16 text-right">Diff</span>
                </div>
              </div>
              <StatCompare label="Avg Score" valA={subjAStats.avg} valB={subjBStats.avg} suffix="%" />
              <StatCompare label="Accuracy" valA={subjAStats.accuracy} valB={subjBStats.accuracy} suffix="%" />
              <StatCompare label="Quizzes" valA={subjAStats.count} valB={subjBStats.count} />
            </>
          ) : (
            <p className="text-xs text-foreground/30 text-center py-4">Select two subjects to compare</p>
          )}
        </>
      )}
    </div>
  );
}
