import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { QuizResult } from '../../types/quiz';
import { getScoreProgression } from '../../utils/practiceUtils';

interface Props {
  history: QuizResult[];
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-amber-500/20 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-foreground/50 mb-1 font-bold">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-black">{p.name}: {p.value}%</p>
      ))}
    </div>
  );
}

export default function PracticeProgressChart({ history }: Props) {
  const data = useMemo(() => getScoreProgression(history), [history]);

  if (data.length < 2) return null;

  const mainScore = data.find(d => d.round === 'Main')?.avgScore;
  const practiceData = data.filter(d => d.round !== 'Main');
  const chartData = data.map(d => ({ name: d.round, Score: d.avgScore, count: d.count }));

  return (
    <div className="glass-card p-4 border-amber-500/10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Score Progression</p>
          <p className="text-[10px] text-foreground/25 mt-0.5">Average score by practice round</p>
        </div>
        {practiceData.length >= 2 && (() => {
          const first = practiceData[0].avgScore;
          const last = practiceData[practiceData.length - 1].avgScore;
          const diff = last - first;
          return (
            <span className={`text-[11px] font-black px-2 py-1 rounded-lg ${
              diff > 0 ? 'text-emerald-400 bg-emerald-500/10' : diff < 0 ? 'text-red-400 bg-red-500/10' : 'text-foreground/40 bg-foreground/5'
            }`}>
              {diff > 0 ? '↑' : diff < 0 ? '↓' : '→'} {diff > 0 ? '+' : ''}{diff}%
            </span>
          );
        })()}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gPracticeScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--foreground) / 0.4)' }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'hsl(var(--foreground) / 0.3)' }} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} />
          {mainScore !== undefined && (
            <ReferenceLine y={mainScore} stroke="#6366F1" strokeDasharray="5 3" strokeOpacity={0.5}
              label={{ value: `Main: ${mainScore}%`, position: 'insideTopRight', fontSize: 9, fill: '#6366F1' }} />
          )}
          <Area type="monotone" dataKey="Score" stroke="#F59E0B" strokeWidth={2.5} fill="url(#gPracticeScore)"
            dot={{ r: 4, fill: '#F59E0B', stroke: '#0A0A0F', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: '#F59E0B', stroke: '#0A0A0F', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-amber-500 rounded-full block" />
          <span className="text-[9px] text-foreground/40 font-bold">Practice Avg</span>
        </div>
        {mainScore !== undefined && (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full block" style={{ background: '#6366F1', opacity: 0.5 }} />
            <span className="text-[9px] text-foreground/40 font-bold">Main Avg</span>
          </div>
        )}
      </div>
    </div>
  );
}
