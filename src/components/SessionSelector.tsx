import { useMemo } from 'react';
import { ChevronDown, Dumbbell, BookOpen } from 'lucide-react';
import { QuizResult } from '../types/quiz';

export type SessionMode = 'main' | 'all_practice' | number; // number = specific practice attempt number

interface Props {
  history: QuizResult[];
  value: SessionMode;
  onChange: (v: SessionMode) => void;
  compact?: boolean;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
function ordinal(n: number) { return ORDINALS[n - 1] || `${n}th`; }

export function filterBySession(history: QuizResult[], mode: SessionMode): QuizResult[] {
  if (mode === 'main') return history.filter(r => (r.attemptType || 'main') === 'main');
  if (mode === 'all_practice') return history.filter(r => r.attemptType === 'practice');
  if (typeof mode === 'number') return history.filter(r => r.attemptType === 'practice' && r.attemptNumber === mode);
  return history;
}

export function getSessionLabel(mode: SessionMode): string {
  if (mode === 'main') return 'Main Quizzes';
  if (mode === 'all_practice') return 'All Practice';
  if (typeof mode === 'number') return `Practice ${ordinal(mode)}`;
  return 'All';
}

function avgScore(results: QuizResult[]): number {
  if (results.length === 0) return 0;
  return Math.round(results.reduce((a, r) => a + r.percentage, 0) / results.length);
}

export default function SessionSelector({ history, value, onChange, compact }: Props) {
  const practiceNumbers = useMemo(() => {
    const nums = new Set<number>();
    history.forEach(r => {
      if (r.attemptType === 'practice' && r.attemptNumber) nums.add(r.attemptNumber);
    });
    return Array.from(nums).sort((a, b) => a - b);
  }, [history]);

  const practiceCount = useMemo(() => history.filter(r => r.attemptType === 'practice').length, [history]);

  const options = useMemo(() => {
    const mainResults = history.filter(r => (r.attemptType || 'main') === 'main');
    const mainAvg = avgScore(mainResults);

    const opts: { value: SessionMode; label: string; icon: string; count: number; avg: number }[] = [
      { value: 'main', label: 'Main Quizzes', icon: '📚', count: mainResults.length, avg: mainAvg },
    ];

    if (practiceCount > 0) {
      const allPractice = history.filter(r => r.attemptType === 'practice');
      opts.push({ value: 'all_practice', label: 'All Practice', icon: '🔄', count: practiceCount, avg: avgScore(allPractice) });
    }

    let prevAvg = mainAvg;
    practiceNumbers.forEach(n => {
      const results = history.filter(r => r.attemptType === 'practice' && r.attemptNumber === n);
      const avg = avgScore(results);
      const diff = avg - prevAvg;
      const trend = diff > 0 ? ' ▲' : diff < 0 ? ' ▼' : '';
      opts.push({
        value: n,
        label: `Practice ${ordinal(n)}${trend}`,
        icon: '🏋️',
        count: results.length,
        avg,
      });
      prevAvg = avg;
    });

    return opts;
  }, [history, practiceNumbers, practiceCount]);

  if (practiceCount === 0) return null;

  return (
    <div className="relative group">
      <div className="relative">
        <select
          value={String(value)}
          onChange={e => {
            const v = e.target.value;
            if (v === 'main' || v === 'all_practice') onChange(v as SessionMode);
            else onChange(Number(v));
          }}
          className={`appearance-none cursor-pointer bg-card border border-border rounded-xl font-bold text-foreground transition-all hover:border-primary/30 focus:outline-none focus:border-primary/40 ${
            compact ? 'text-[11px] pl-8 pr-7 py-2' : 'text-xs pl-9 pr-8 py-2.5'
          } ${value !== 'main' ? 'bg-amber-500/10 border-amber-500/25 text-amber-300' : ''}`}
        >
          {options.map(o => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label} ({o.count}) · {o.avg}%
            </option>
          ))}
        </select>
        <div className={`absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${compact ? 'text-sm' : 'text-base'}`}>
          {value === 'main' ? <BookOpen className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-primary`} /> : <Dumbbell className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-amber-400`} />}
        </div>
        <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-foreground/30 ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
      </div>
    </div>
  );
}
