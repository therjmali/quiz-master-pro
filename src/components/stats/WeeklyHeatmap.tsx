import { useMemo, useState } from 'react';
import { QuizResult } from '../../types/quiz';
import { calculateStreak } from '../../utils/scoring';

interface Props { history: QuizResult[]; }

interface DayData { date: Date; count: number; isFuture: boolean; avgScore: number; key: string; }

export default function WeeklyHeatmap({ history }: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; day: DayData } | null>(null);

  const { weeks, maxCount } = useMemo(() => {
    const countMap = new Map<string, number>();
    const scoreMap = new Map<string, number[]>();
    history.forEach(r => {
      const d = new Date(r.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      countMap.set(key, (countMap.get(key) || 0) + 1);
      if (!scoreMap.has(key)) scoreMap.set(key, []);
      scoreMap.get(key)!.push(r.percentage);
    });

    // Start from Monday
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const endOfThisWeek = new Date(today);
    endOfThisWeek.setDate(today.getDate() - daysSinceMonday);
    const start = new Date(endOfThisWeek);
    start.setDate(start.getDate() - 11 * 7);
    start.setHours(0, 0, 0, 0);

    const result: DayData[][] = [];
    const cur = new Date(start);
    const now = new Date();
    let max = 0;

    for (let w = 0; w < 12; w++) {
      const week: DayData[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(cur);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const count = countMap.get(key) || 0;
        const scores = scoreMap.get(key) || [];
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        max = Math.max(max, count);
        week.push({ date, count, isFuture: date > now, avgScore, key });
        cur.setDate(cur.getDate() + 1);
      }
      result.push(week);
    }
    return { weeks: result, maxCount: max };
  }, [history]);

  const getColor = (count: number, isFuture: boolean) => {
    if (isFuture) return 'bg-foreground/3';
    if (count === 0) return 'bg-foreground/6';
    if (count <= 2) return 'bg-primary/25';
    if (count <= 4) return 'bg-primary/50';
    return 'bg-primary';
  };

  const totalDaysActive = useMemo(() => {
    const days = new Set<string>();
    history.forEach(r => {
      const d = new Date(r.timestamp);
      days.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    });
    return days.size;
  }, [history]);

  const streak = useMemo(() => calculateStreak(history.map(r => r.timestamp)), [history]);

  const mostActiveDay = useMemo(() => {
    const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
    history.forEach(r => {
      const dow = new Date(r.timestamp).getDay();
      const idx = dow === 0 ? 6 : dow - 1; // Convert to Mon=0
      dayCounts[idx]++;
    });
    const maxIdx = dayCounts.indexOf(Math.max(...dayCounts));
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][maxIdx];
  }, [history]);

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const monthLabels = useMemo(() => {
    const labels: { text: string; colIndex: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const m = week[0].date.getMonth();
      if (m !== lastMonth) {
        labels.push({ text: week[0].date.toLocaleDateString('en', { month: 'short' }), colIndex: wi });
        lastMonth = m;
      }
    });
    return labels;
  }, [weeks]);

  const handleCellInteraction = (e: React.MouseEvent | React.TouchEvent, day: DayData) => {
    if (day.isFuture) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, day });
  };

  return (
    <div className="glass-card p-4" onMouseLeave={() => setTooltip(null)}>
      <div className="mb-3">
        <p className="text-xs font-black text-foreground/60">📊 Activity Heatmap — 12 Weeks</p>
        <p className="text-[10px] text-foreground/30 mt-0.5">Your daily quiz activity at a glance</p>
      </div>

      {/* Month labels */}
      <div className="flex mb-1 ml-10">
        {weeks.map((week, wi) => {
          const label = monthLabels.find(l => l.colIndex === wi);
          return (
            <div key={wi} className="flex-1 text-[8px] font-bold text-foreground/30 truncate">
              {label ? label.text : ''}
            </div>
          );
        })}
      </div>

      <div className="flex gap-[3px]">
        <div className="flex flex-col gap-[3px] mr-1 flex-shrink-0">
          {dayLabels.map((d, i) => (
            <div key={i} className="text-[8px] font-bold text-foreground/30 w-8 min-h-4 h-4 flex items-center">{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px] flex-1">
            {week.map((day, di) => (
              <div
                key={di}
                onMouseEnter={(e) => handleCellInteraction(e, day)}
                onTouchStart={(e) => handleCellInteraction(e, day)}
                className={`min-w-4 min-h-4 h-4 rounded-[3px] transition-colors flex items-center justify-center ${getColor(day.count, day.isFuture)} ${day.count > 0 ? 'cursor-pointer hover:brightness-125 hover:scale-110 transition-transform' : ''}`}
              >
                {day.count > 0 && !day.isFuture && (
                  <span className="text-[7px] font-black text-foreground/70 leading-none">{day.count}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-border">
        {[
          { label: 'No activity', count: 0 },
          { label: '1–2 quizzes', count: 1 },
          { label: '3–4 quizzes', count: 3 },
          { label: '5+ quizzes', count: 5 },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${getColor(item.count, false)}`} />
            <span className="text-[9px] text-foreground/35 font-medium">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-border text-[10px]">
        <span className="text-foreground/40">
          Most active day: <span className="font-bold text-foreground/70">{mostActiveDay}</span>
        </span>
        <span className="text-foreground/40">
          Total active days: <span className="font-bold text-foreground/70">{totalDaysActive}</span>
        </span>
        <span className="text-foreground/40">
          Current streak: <span className="font-bold text-orange-400">{streak} days</span>
        </span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-card border border-border rounded-xl px-3 py-2 shadow-xl pointer-events-none animate-fade-in"
          style={{
            left: Math.min(tooltip.x, window.innerWidth - 140),
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="text-[10px] font-bold text-foreground/60 mb-0.5">
            {tooltip.day.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
          {tooltip.day.count > 0 ? (
            <>
              <p className="text-[10px] font-black text-primary">{tooltip.day.count} quiz{tooltip.day.count !== 1 ? 'zes' : ''}</p>
              <p className="text-[9px] text-foreground/40">Avg score: {tooltip.day.avgScore}%</p>
            </>
          ) : (
            <p className="text-[10px] text-foreground/30">No activity</p>
          )}
        </div>
      )}
    </div>
  );
}
