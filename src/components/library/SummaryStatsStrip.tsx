import { useMemo } from 'react';
import { Trophy, Target, Dumbbell, Flame } from 'lucide-react';
import { QuizResult } from '../../types/quiz';

interface Props { history: QuizResult[] }

export default function SummaryStatsStrip({ history }: Props) {
  const stats = useMemo(() => {
    const total = history.length;
    const avg = total > 0 ? Math.round(history.reduce((a, r) => a + r.percentage, 0) / total) : 0;
    const practices = history.filter(r => r.attemptType === 'practice').length;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const thisWeek = history.filter(r => r.timestamp >= weekStart.getTime()).length;
    return { total, avg, practices, thisWeek };
  }, [history]);

  if (stats.total === 0) return null;

  const items = [
    { icon: <Trophy className="w-3 h-3" />, label: 'Total', value: stats.total, cls: 'text-primary' },
    { icon: <Target className="w-3 h-3" />, label: 'Avg', value: `${stats.avg}%`, cls: 'text-emerald-400' },
    { icon: <Dumbbell className="w-3 h-3" />, label: 'Practice', value: stats.practices, cls: 'text-amber-400' },
    { icon: <Flame className="w-3 h-3" />, label: 'Week', value: stats.thisWeek, cls: 'text-rose-400' },
  ];

  return (
    <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar">
      {items.map(s => (
        <div key={s.label} className="flex items-center gap-1.5 bg-card/60 backdrop-blur-sm border border-border rounded-xl px-3 py-2 flex-shrink-0">
          <span className={s.cls}>{s.icon}</span>
          <span className="text-[10px] font-bold text-foreground/40">{s.label}</span>
          <span className={`text-xs font-black ${s.cls}`}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}
