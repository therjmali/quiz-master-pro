import { useMemo, useState } from 'react';
import { CheckCircle, AlertCircle, XCircle, Dumbbell, ChevronDown, ChevronUp } from 'lucide-react';
import { QuizResult, QuizQuestion } from '../../types/quiz';
import { getQuestionMasteries, getMasterySummary, QuestionMastery } from '../../utils/practiceUtils';

interface Props {
  history: QuizResult[];
  onPracticeWeak?: (questions: QuizQuestion[]) => void;
}

function MasteryRing({ mastered, improving, weak, total }: { mastered: number; improving: number; weak: number; total: number }) {
  const R = 30, C = 2 * Math.PI * R;
  const t = Math.max(total, 1);
  const mL = (mastered / t) * C;
  const iL = (improving / t) * C;
  const wL = (weak / t) * C;
  const gap = 3;

  return (
    <div className="relative w-[76px] h-[76px] flex-shrink-0">
      <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
        <circle cx="38" cy="38" r={R} fill="none" stroke="currentColor" className="text-amber-500/10" strokeWidth="6" />
        {mL > 1 && <circle cx="38" cy="38" r={R} fill="none" stroke="#22C55E" strokeWidth="6"
          strokeDasharray={`${Math.max(0, mL - gap)} ${C}`} strokeLinecap="round" />}
        {iL > 1 && <circle cx="38" cy="38" r={R} fill="none" stroke="#F59E0B" strokeWidth="6"
          strokeDasharray={`${Math.max(0, iL - gap)} ${C}`} strokeDashoffset={`${-(mL + gap)}`} strokeLinecap="round" />}
        {wL > 1 && <circle cx="38" cy="38" r={R} fill="none" stroke="#EF4444" strokeWidth="6"
          strokeDasharray={`${Math.max(0, wL - gap)} ${C}`} strokeDashoffset={`${-(mL + iL + gap * 2)}`} strokeLinecap="round" />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-black text-foreground leading-none">{total}</span>
        <span className="text-[7px] text-foreground/30 font-bold">questions</span>
      </div>
    </div>
  );
}

function MasteryItem({ m }: { m: QuestionMastery }) {
  const statusConfig = {
    mastered: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Mastered' },
    improving: { icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Improving' },
    weak: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Weak' },
    unknown: { icon: AlertCircle, color: 'text-foreground/30', bg: 'bg-foreground/5', border: 'border-border', label: 'New' },
  }[m.status];
  const Icon = statusConfig.icon;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl ${statusConfig.bg} border ${statusConfig.border}`}>
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${statusConfig.color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-foreground leading-snug line-clamp-2">{m.question}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-[9px] font-bold ${statusConfig.color}`}>{statusConfig.label}</span>
          <span className="text-[9px] text-foreground/25">✓ {m.correctCount} · ✗ {m.wrongCount} · {m.attempts} tries</span>
        </div>
      </div>
    </div>
  );
}

export default function MasteryTracker({ history, onPracticeWeak }: Props) {
  const [expanded, setExpanded] = useState(false);

  const masteries = useMemo(() => getQuestionMasteries(history), [history]);
  const summary = useMemo(() => getMasterySummary(masteries), [masteries]);

  if (masteries.length === 0) return null;

  const weakQuestions: QuizQuestion[] = masteries
    .filter(m => m.status === 'weak')
    .map(m => ({
      question: m.question,
      correctAnswer: m.correctAnswer,
      options: [],
      difficulty: 'medium' as const,
    }));

  // Find full question data from history for weak questions
  const weakQuestionsWithOptions: QuizQuestion[] = masteries
    .filter(m => m.status === 'weak')
    .map(m => {
      for (const r of history) {
        if (!r.quizData?.length) continue;
        const found = r.quizData.find(q => q.question === m.question);
        if (found) return found;
      }
      return { question: m.question, correctAnswer: m.correctAnswer, options: [], difficulty: 'medium' as const };
    });

  const visibleMasteries = expanded ? masteries.slice(0, 20) : masteries.slice(0, 5);

  return (
    <div className="glass-card p-4 border-amber-500/10 space-y-4">
      <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Mastery Tracker</p>

      {/* Summary with ring */}
      <div className="flex items-center gap-4">
        <MasteryRing mastered={summary.mastered} improving={summary.improving} weak={summary.weak} total={summary.total} />
        <div className="flex-1 space-y-2">
          {[
            { label: 'Mastered', count: summary.mastered, color: 'text-emerald-400', bg: 'bg-emerald-500', icon: '🟢' },
            { label: 'Improving', count: summary.improving, color: 'text-amber-400', bg: 'bg-amber-500', icon: '🟡' },
            { label: 'Weak', count: summary.weak, color: 'text-red-400', bg: 'bg-red-500', icon: '🔴' },
          ].map(({ label, count, color, bg }) => {
            const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;
            return (
              <div key={label} className="flex items-center gap-2">
                <span className={`text-[10px] font-bold w-16 ${color}`}>{label}</span>
                <div className="flex-1 h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                  <div className={`h-full ${bg} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                </div>
                <span className={`text-[10px] font-black ${color} w-8 text-right`}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Practice Weak Button */}
      {summary.weak > 0 && onPracticeWeak && (
        <button
          onClick={() => onPracticeWeak(weakQuestionsWithOptions)}
          className="w-full flex items-center justify-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-[0.98]"
        >
          <Dumbbell className="w-3.5 h-3.5" />
          Practice {summary.weak} Weak Question{summary.weak !== 1 ? 's' : ''}
        </button>
      )}

      {/* Question List */}
      <div className="space-y-1.5">
        {visibleMasteries.map(m => <MasteryItem key={m.question.slice(0, 50)} m={m} />)}
      </div>

      {masteries.length > 5 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-center gap-1 text-[10px] font-bold text-foreground/30 hover:text-foreground/50 transition-colors py-1"
        >
          {expanded ? <><ChevronUp className="w-3 h-3" /> Show Less</> : <><ChevronDown className="w-3 h-3" /> Show All ({masteries.length})</>}
        </button>
      )}
    </div>
  );
}
