import { useMemo } from 'react';
import { ChevronDown, Dumbbell, BookOpen } from 'lucide-react';
import { QuizResult } from '../../types/quiz';
import { StatsFilter, getAvailablePracticeRounds, getPracticeAttemptsForQuiz } from '../../utils/practiceUtils';
import { getPracticeLabel } from '../../utils/practiceNaming';
import { formatDateShort } from '../../utils/dateFormat';

interface Props {
  history: QuizResult[];
  quizId?: string;       // if scoped to one quiz
  value: StatsFilter;
  onChange: (filter: StatsFilter) => void;
  showAllPractices?: boolean;
  compact?: boolean;
}

function filterKey(f: StatsFilter): string {
  if (f.type === 'main') return 'main';
  if (f.type === 'all-practices') return 'all-practices';
  return `practice-${f.attemptNumber}`;
}

function trendArrow(prevScore: number | null, score: number): string {
  if (prevScore === null) return '';
  const diff = score - prevScore;
  if (diff > 0) return ` ▲+${diff}%`;
  if (diff < 0) return ` ▼${diff}%`;
  return ' →';
}

export default function PracticeFilterDropdown({ history, quizId, value, onChange, showAllPractices = true, compact }: Props) {
  const options = useMemo(() => {
    const opts: { key: string; label: string; filter: StatsFilter; count: number; avgScore?: number; trend?: string; date?: string }[] = [];

    if (quizId) {
      const mainQuiz = history.find(r => r.id === quizId && (r.attemptType || 'main') === 'main');
      opts.push({
        key: 'main',
        label: 'Main',
        filter: { type: 'main' },
        count: mainQuiz ? 1 : 0,
        avgScore: mainQuiz?.percentage,
      });

      const practices = getPracticeAttemptsForQuiz(history, quizId);
      let prevScore = mainQuiz?.percentage ?? null;
      practices.forEach(p => {
        if (p.attemptNumber) {
          const trend = trendArrow(prevScore, p.percentage);
          opts.push({
            key: `practice-${p.attemptNumber}`,
            label: getPracticeLabel(p.attemptNumber, p.timestamp),
            filter: { type: 'practice', attemptNumber: p.attemptNumber },
            count: 1,
            avgScore: p.percentage,
            trend,
            date: formatDateShort(p.timestamp),
          });
          prevScore = p.percentage;
        }
      });
    } else {
      const mainResults = history.filter(r => (r.attemptType || 'main') === 'main');
      const mainCount = mainResults.length;
      const mainAvg = mainCount > 0 ? Math.round(mainResults.reduce((a, r) => a + r.percentage, 0) / mainCount) : 0;
      opts.push({ key: 'main', label: 'Main Quizzes', filter: { type: 'main' }, count: mainCount, avgScore: mainAvg });

      const rounds = getAvailablePracticeRounds(history);
      let prevAvg: number | null = mainAvg;
      rounds.forEach(round => {
        const trend = trendArrow(prevAvg, round.avgScore);
        opts.push({
          key: `practice-${round.attemptNumber}`,
          label: round.label,
          filter: { type: 'practice', attemptNumber: round.attemptNumber },
          count: round.count,
          avgScore: round.avgScore,
          trend,
          date: formatDateShort(round.latestTimestamp),
        });
        prevAvg = round.avgScore;
      });

      if (showAllPractices) {
        const practiceResults = history.filter(r => r.attemptType === 'practice');
        const practiceCount = practiceResults.length;
        if (practiceCount > 0) {
          const allAvg = Math.round(practiceResults.reduce((a, r) => a + r.percentage, 0) / practiceCount);
          opts.push({ key: 'all-practices', label: 'All Practices', filter: { type: 'all-practices' }, count: practiceCount, avgScore: allAvg });
        }
      }
    }

    return opts;
  }, [history, quizId, showAllPractices]);

  const practiceCount = history.filter(r => r.attemptType === 'practice').length;

  if (practiceCount === 0 && !quizId) return null;
  if (quizId && options.length <= 1) return null;

  const isPractice = value.type !== 'main';
  const currentKey = filterKey(value);

  return (
    <div className="relative">
      <select
        value={currentKey}
        onChange={e => {
          const v = e.target.value;
          const opt = options.find(o => o.key === v);
          if (opt) onChange(opt.filter);
        }}
        className={`appearance-none cursor-pointer bg-card border rounded-xl font-bold text-foreground transition-all hover:border-primary/30 focus:outline-none focus:border-primary/40 ${
          compact ? 'text-[11px] pl-8 pr-7 py-2' : 'text-xs pl-9 pr-8 py-2.5'
        } ${isPractice ? 'bg-amber-500/10 border-amber-500/25 text-amber-300' : 'border-border'}`}
      >
        {options.map(o => {
          const scoreLabel = o.avgScore !== undefined ? ` · ${o.avgScore}%` : '';
          const trendLabel = o.trend || '';
          const dateLabel = o.date ? ` · ${o.date}` : '';
          return (
            <option key={o.key} value={o.key}>
              {o.label} ({o.count}){scoreLabel}{trendLabel}{dateLabel}
            </option>
          );
        })}
      </select>
      <div className={`absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${compact ? 'text-sm' : 'text-base'}`}>
        {isPractice
          ? <Dumbbell className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-amber-400`} />
          : <BookOpen className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-primary`} />
        }
      </div>
      <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-foreground/30 ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
    </div>
  );
}
