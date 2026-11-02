import { useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { QuizResult } from '../../types/quiz';

interface Props {
  result: QuizResult;
  history: QuizResult[];
}

const SCORE_COLORS = (pct: number) =>
  pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="font-bold text-foreground">{payload[0]?.name}: {payload[0]?.value}</p>
    </div>
  );
}

function CustomBarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-foreground/60 mb-1">{payload[0]?.payload?.label}</p>
      <p className="font-black text-foreground">{payload[0]?.value}% score</p>
    </div>
  );
}

export default function ResultsCharts({ result, history }: Props) {
  const [open, setOpen] = useState(true);
  const derivedPct = result.maxScore > 0 ? Math.max(0, Math.min(100, Math.round((result.netScore / result.maxScore) * 100))) : result.percentage;
  const perfect = derivedPct === 100;

  const pieData = useMemo(() => [
    { name: 'Correct',  value: result.correct,  fill: '#10b981' },
    { name: 'Wrong',    value: result.wrong,     fill: '#ef4444' },
    { name: 'Skipped',  value: result.skipped,   fill: '#6b7280' },
  ].filter(d => d.value > 0), [result]);

  const barData = useMemo(() => {
    const prev = [...history].slice(1, 6).reverse();
    const out = prev.map((r, i) => ({
      label: `Quiz ${i + 1}`,
      value: r.percentage,
      isCurrent: false,
    }));
    out.push({ label: '▶ This', value: derivedPct, isCurrent: true });
    return out;
  }, [history, result]);

  return (
    <div className="glass-card mb-6 overflow-hidden">
      {/* Header toggle */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-black text-foreground/80 hover:bg-foreground/5 transition-colors">
        <span className="flex items-center gap-2">📊 Visual Breakdown</span>
        {open ? <ChevronUp className="w-4 h-4 text-foreground/40" /> : <ChevronDown className="w-4 h-4 text-foreground/40" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-5">
            {/* ── Doughnut chart ── */}
            <div className="bg-foreground/4 rounded-2xl p-4 border border-border">
              <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-4">This Quiz Breakdown</p>
              {perfect && (
                <div className="text-center mb-2 py-2 px-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-500 text-sm font-black">
                  🌟 Perfect Score! All {result.totalQuestions} correct!
                </div>
              )}
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%"
                      innerRadius={52} outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      startAngle={90} endAngle={-270}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="-mt-28 mb-16 flex flex-col items-center pointer-events-none">
                  {perfect
                    ? <span className="text-2xl">🌟</span>
                    : <>
                      <span className="text-2xl font-black text-foreground">{derivedPct}%</span>
                      <span className="text-[10px] text-foreground/40">score</span>
                    </>}
                </div>
                <div className="flex gap-4 text-xs font-bold">
                  <span className="text-emerald-500">✓ {result.correct}</span>
                  <span className="text-red-500">✗ {result.wrong}</span>
                  <span className="text-foreground/40">⊘ {result.skipped}</span>
                </div>
              </div>
            </div>

            {/* ── Bar chart: recent scores ── */}
            <div className="bg-foreground/4 rounded-2xl p-4 border border-border">
              <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1">Recent Scores</p>
              <p className="text-[9px] text-foreground/30 mb-4">Last 5 attempts + this quiz</p>
              {barData.length < 2 ? (
                <div className="h-44 flex items-center justify-center text-foreground/30 text-xs text-center px-4">
                  Take more quizzes to see your score comparison 📈
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={barData} margin={{ top: 16, right: 4, left: -24, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fill: 'hsl(var(--foreground) / 0.4)', fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--foreground) / 0.3)', fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomBarTooltip />} />
                    <ReferenceLine y={80} stroke="hsl(var(--border))" strokeDasharray="4 3" label={{ value: '80%', fill: 'hsl(var(--foreground) / 0.3)', fontSize: 9 }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {barData.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.isCurrent ? '#6366f1' : SCORE_COLORS(d.value)}
                          opacity={d.isCurrent ? 1 : 0.75}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="flex items-center gap-3 mt-2 text-[9px] font-bold text-foreground/35">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> This quiz</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> ≥80%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> 60–79%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
