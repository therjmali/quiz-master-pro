import { useMemo } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { QuizResult } from '../../types/quiz';

interface Props { history: QuizResult[]; }

const PERIOD_LABELS = ['Night 🌙', 'Morning 🌅', 'Afternoon ☀️', 'Evening 🌆'];
const PERIOD_COLORS = ['#6366F1', '#F59E0B', '#10B981', '#F97316'];
const getPeriod = (h: number) => h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3;

export default function TimeOfDayChart({ history }: Props) {
  const { chartData, peakHour, peakPeriod, periodCounts } = useMemo(() => {
    const counts = new Array(24).fill(0);
    const periodArr = [0, 0, 0, 0];
    history.forEach(r => {
      const h = new Date(r.timestamp).getHours();
      counts[h]++;
      periodArr[getPeriod(h)]++;
    });
    const max = Math.max(...counts);
    const peak = counts.indexOf(max);

    const chartData = counts.map((count, h) => ({
      hour: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
      count,
      isPeak: count === max && count > 0,
      period: getPeriod(h),
    }));

    return {
      chartData,
      peakHour: max > 0 ? peak : -1,
      peakPeriod: max > 0 ? getPeriod(peak) : -1,
      periodCounts: periodArr,
    };
  }, [history]);

  if (!history.length) return null;

  const formatPeak = (h: number) => {
    if (h < 0) return '';
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${h % 12 || 12}:00 ${ampm}`;
  };

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Study Time Pattern</p>
      </div>
      {peakHour >= 0 && (
        <p className="text-xs text-foreground/50 mb-3">
          You study best at{' '}
          <span className="text-primary font-bold">{formatPeak(peakHour)}</span>
          {peakPeriod >= 0 && <span className="ml-1 text-foreground/30">{PERIOD_LABELS[peakPeriod]}</span>}
        </p>
      )}

      {/* Period breakdown pills */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {PERIOD_LABELS.map((label, i) => (
          <div key={i} className="text-center rounded-xl p-2 border border-white/5 bg-white/3">
            <div className="text-sm font-black" style={{ color: PERIOD_COLORS[i] }}>{periodCounts[i]}</div>
            <div className="text-[7px] text-foreground/30 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <XAxis dataKey="hour" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} interval={3} />
          <Tooltip
            formatter={(v: any) => [v, 'Quizzes']}
            contentStyle={{ background: '#12152a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i}
                fill={entry.isPeak ? PERIOD_COLORS[entry.period] : `${PERIOD_COLORS[entry.period]}40`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
