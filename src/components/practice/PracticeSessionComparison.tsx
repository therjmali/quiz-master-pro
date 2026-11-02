import { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Minus, GitCompareArrows } from 'lucide-react';
import { QuizResult } from '../../types/quiz';
import { formatTime } from '../../utils/scoring';

interface Props {
  history: QuizResult[];
}

function DiffBadge({ diff, suffix = '' }: { diff: number; suffix?: string }) {
  if (diff === 0) return <span className="flex items-center gap-0.5 text-[10px] font-bold text-foreground/30"><Minus className="w-2.5 h-2.5" />0{suffix}</span>;
  const positive = diff > 0;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-black ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      {positive ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
      {positive ? '+' : ''}{diff}{suffix}
    </span>
  );
}

function CompareRow({ label, valA, valB, suffix = '' }: { label: string; valA: number; valB: number; suffix?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-foreground/[0.04] last:border-0">
      <span className="text-[10px] font-bold text-foreground/40 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold text-foreground/30 w-10 text-right tabular-nums">{valA}{suffix}</span>
        <span className="text-foreground/10 text-[10px]">→</span>
        <span className="text-[10px] font-black text-foreground w-10 text-right tabular-nums">{valB}{suffix}</span>
        <div className="w-12 text-right"><DiffBadge diff={valB - valA} suffix={suffix} /></div>
      </div>
    </div>
  );
}

export default function PracticeSessionComparison({ history }: Props) {
  const practiceHistory = useMemo(() =>
    history.filter(r => r.attemptType === 'practice').sort((a, b) => b.timestamp - a.timestamp),
    [history]
  );

  // Build selectable sessions: all practices + main quizzes that have practices
  const sessions = useMemo(() => {
    const mainQuizzes = history.filter(r => (r.attemptType || 'main') === 'main' && r.id);
    const mainWithPractice = mainQuizzes.filter(m =>
      history.some(p => p.attemptType === 'practice' && p.parentQuizId === m.id)
    );
    const all = [
      ...mainWithPractice.map(r => ({ label: `Main · ${r.quizTitle || 'Quiz'}`, value: r.timestamp, result: r })),
      ...practiceHistory.map(r => ({
        label: `P${r.attemptNumber || '?'} · ${r.quizTitle || 'Practice'}`,
        value: r.timestamp,
        result: r,
      })),
    ];
    return all.sort((a, b) => b.value - a.value);
  }, [history, practiceHistory]);

  // Default: compare last 2 practice sessions, or latest practice vs its main quiz
  const [idxA, setIdxA] = useState(0);
  const [idxB, setIdxB] = useState(() => Math.min(1, sessions.length - 1));

  if (sessions.length < 2) return null;

  const sessionA = sessions[Math.min(idxB, sessions.length - 1)]?.result; // "Before"
  const sessionB = sessions[Math.min(idxA, sessions.length - 1)]?.result; // "After" (latest)

  if (!sessionA || !sessionB) return null;

  const accA = (sessionA.correct + sessionA.wrong) > 0 ? Math.round((sessionA.correct / (sessionA.correct + sessionA.wrong)) * 100) : 0;
  const accB = (sessionB.correct + sessionB.wrong) > 0 ? Math.round((sessionB.correct / (sessionB.correct + sessionB.wrong)) * 100) : 0;

  return (
    <div className="glass-card p-4 border-primary/10">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
          <GitCompareArrows className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Session Comparison</p>
      </div>

      {/* Session Selectors */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <select
          value={idxB}
          onChange={e => setIdxB(Number(e.target.value))}
          className="bg-foreground/[0.04] border border-border rounded-lg px-2 py-1.5 text-[10px] text-foreground/60 font-bold focus:outline-none focus:border-primary/40 truncate"
        >
          {sessions.map((s, i) => (
            <option key={`a-${s.value}`} value={i}>{s.label}</option>
          ))}
        </select>
        <select
          value={idxA}
          onChange={e => setIdxA(Number(e.target.value))}
          className="bg-foreground/[0.04] border border-border rounded-lg px-2 py-1.5 text-[10px] text-foreground/60 font-bold focus:outline-none focus:border-primary/40 truncate"
        >
          {sessions.map((s, i) => (
            <option key={`b-${s.value}`} value={i}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Column headers */}
      <div className="flex items-center justify-between mb-1 text-[8px] font-bold text-foreground/20 uppercase tracking-widest">
        <span>Metric</span>
        <div className="flex gap-3">
          <span className="w-10 text-right">Before</span>
          <span className="w-3" />
          <span className="w-10 text-right">After</span>
          <span className="w-12 text-right">Change</span>
        </div>
      </div>

      <CompareRow label="Score" valA={sessionA.percentage} valB={sessionB.percentage} suffix="%" />
      <CompareRow label="Accuracy" valA={accA} valB={accB} suffix="%" />
      <CompareRow label="Correct" valA={sessionA.correct} valB={sessionB.correct} />
      <CompareRow label="Wrong" valA={sessionA.wrong} valB={sessionB.wrong} />
      <CompareRow label="Skipped" valA={sessionA.skipped} valB={sessionB.skipped} />
    </div>
  );
}
