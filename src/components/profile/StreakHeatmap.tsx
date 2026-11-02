import { useMemo } from 'react';

interface Props { timestamps: number[]; }

const WEEKS = 15;
const DAYS  = 7;

function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getCellClass(count: number): string {
  if (count === 0) return 'bg-foreground/5 border-foreground/5';
  if (count === 1) return 'bg-emerald-600/30 border-emerald-600/25';
  if (count === 2) return 'bg-emerald-500/55 border-emerald-500/45';
  return 'bg-emerald-500/85 border-emerald-400/60';
}

const DAY_LABELS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function StreakHeatmap({ timestamps }: Props) {
  const { grid, monthLabels, totalActive } = useMemo(() => {
    const countMap: Record<string, number> = {};
    timestamps.forEach(ts => {
      const key = getDayKey(new Date(ts));
      countMap[key] = (countMap[key] || 0) + 1;
    });

    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - daysToMonday - (WEEKS - 1) * 7);

    const grid: { key: string; count: number; date: Date }[][] = [];
    const monthSeen = new Set<string>();
    const monthLabels: { label: string; col: number }[] = [];
    let totalActive = 0;

    for (let w = 0; w < WEEKS; w++) {
      const week: { key: string; count: number; date: Date }[] = [];
      for (let d = 0; d < DAYS; d++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + w * 7 + d);
        const key = getDayKey(date);
        const count = countMap[key] || 0;
        if (count > 0) totalActive++;
        week.push({ key, count, date });
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        if (!monthSeen.has(monthKey) && date.getDate() <= 7) {
          monthSeen.add(monthKey);
          monthLabels.push({ label: MONTH_NAMES[date.getMonth()], col: w });
        }
      }
      grid.push(week);
    }
    return { grid, monthLabels, totalActive };
  }, [timestamps]);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">🗓 Study Calendar</h3>
        <span className="text-[10px] text-foreground/30">{totalActive} active day{totalActive !== 1 ? 's' : ''} in last {WEEKS} weeks</span>
      </div>

      {/* Month labels */}
      <div className="flex gap-[3px] mb-1 ml-8">
        {Array.from({ length: WEEKS }, (_, w) => {
          const ml = monthLabels.find(m => m.col === w);
          return (
            <div key={w} className="w-[14px] flex-shrink-0 text-[8px] text-foreground/25 font-bold leading-none text-center truncate">
              {ml ? ml.label : ''}
            </div>
          );
        })}
      </div>

      <div className="flex gap-1">
        {/* Day labels */}
        <div className="flex flex-col gap-[3px] mr-1 mt-0.5">
          {DAY_LABELS.map((d, i) => (
            <div key={d} className={`h-[14px] text-[8px] text-foreground/25 font-bold leading-[14px] ${i % 2 === 0 ? '' : 'opacity-0'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex gap-[3px] overflow-x-auto no-scrollbar flex-1">
          {grid.map((week, w) => (
            <div key={w} className="flex flex-col gap-[3px] flex-shrink-0">
              {week.map(({ key, count, date }) => {
                const isFuture = date > new Date();
                return (
                  <div key={key}
                    title={`${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${count} quiz${count !== 1 ? 'zes' : ''}`}
                    className={`w-[14px] h-[14px] rounded-sm border transition-all ${isFuture ? 'opacity-20' : ''} ${getCellClass(count)}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 justify-end">
        <span className="text-[9px] text-foreground/30">Less</span>
        {[0, 1, 2, 3].map(n => (
          <div key={n} className={`w-[12px] h-[12px] rounded-sm border ${getCellClass(n)}`} />
        ))}
        <span className="text-[9px] text-foreground/30">More</span>
      </div>
    </div>
  );
}
