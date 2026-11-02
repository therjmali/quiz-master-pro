import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { QuizResult } from '../../types/quiz';

interface Props { history: QuizResult[]; }

function TrendIcon({ val }: { val: number }) {
  if (val > 3) return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (val < -3) return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-foreground/40" />;
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-foreground/50 font-bold mb-1">{label}</p>
      {payload.map((p: any) => <p key={p.name} style={{ color: p.color }} className="font-bold">{p.name}: {p.value}{p.name === 'Accuracy' ? '%' : ''}</p>)}
    </div>
  );
};

export default function AnalyticsTab({ history }: Props) {
  const dailyData = useMemo(() => {
    const days: { day: string; Quizzes: number; Accuracy: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const qs = history.filter(r => new Date(r.timestamp).toDateString() === key);
      const acc = qs.length ? Math.round(qs.reduce((s, r) => s + r.accuracy, 0) / qs.length) : 0;
      days.push({ day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), Quizzes: qs.length, Accuracy: acc });
    }
    return days;
  }, [history]);

  const weekComparison = useMemo(() => {
    const now = Date.now(); const W = 7 * 86400000;
    const tw = history.filter(r => now - r.timestamp < W);
    const lw = history.filter(r => now - r.timestamp >= W && now - r.timestamp < 2 * W);
    const twAcc = tw.length ? Math.round(tw.reduce((s, r) => s + r.accuracy, 0) / tw.length) : 0;
    const lwAcc = lw.length ? Math.round(lw.reduce((s, r) => s + r.accuracy, 0) / lw.length) : 0;
    return { tw, lw, twAcc, lwAcc, accDiff: twAcc - lwAcc, cntDiff: tw.length - lw.length };
  }, [history]);

  const subjectData = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    history.forEach(r => {
      if (!r.subject) return;
      const ex = map.get(r.subject) || { correct: 0, total: 0 };
      map.set(r.subject, { correct: ex.correct + r.correct, total: ex.total + r.totalQuestions });
    });
    return Array.from(map.entries())
      .map(([subject, d]) => ({ subject, accuracy: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0, total: d.total }))
      .sort((a, b) => b.accuracy - a.accuracy);
  }, [history]);

  const weeklyTrend = useMemo(() => {
    const weeks: { week: string; accuracy: number; quizzes: number }[] = [];
    const now = Date.now();
    for (let i = 7; i >= 0; i--) {
      const from = now - (i + 1) * 7 * 86400000;
      const to = now - i * 7 * 86400000;
      const qs = history.filter(r => r.timestamp >= from && r.timestamp < to);
      if (qs.length > 0) {
        weeks.push({ week: `W${8 - i}`, accuracy: Math.round(qs.reduce((s, r) => s + r.accuracy, 0) / qs.length), quizzes: qs.length });
      }
    }
    return weeks;
  }, [history]);

  if (!history.length) return (
    <div className="text-center text-foreground/30 py-12">Complete some quizzes to see analytics.</div>
  );

  return (
    <div className="space-y-5">
      {/* Growth cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'This Week', sub: 'vs last week', val: weekComparison.tw.length, diff: weekComparison.cntDiff, unit: 'quizzes', color: 'text-primary' },
          { label: 'Avg Accuracy', sub: 'vs last week', val: weekComparison.tw.length > 0 ? `${weekComparison.twAcc}%` : 'N/A', diff: weekComparison.accDiff, unit: '%', color: 'text-emerald-500' },
        ].map(c => (
          <div key={c.label} className="glass-card p-4">
            <div className="text-[9px] font-bold text-foreground/30 uppercase tracking-widest mb-1">{c.label}</div>
            <div className={`text-2xl font-black ${c.color}`}>{c.val}</div>
            <div className="flex items-center gap-1 mt-1.5">
              <TrendIcon val={c.diff} />
              <span className={`text-[10px] font-bold ${c.diff > 0 ? 'text-emerald-500' : c.diff < 0 ? 'text-red-500' : 'text-foreground/30'}`}>
                {c.diff > 0 ? '+' : ''}{c.diff}{c.unit === '%' ? '%' : ''} {c.sub}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Daily activity */}
      <div className="glass-card p-5">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-4">📅 Daily Activity — Last 14 Days</h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fill: 'currentColor', fontSize: 9, opacity: 0.3 }} tickLine={false} axisLine={false} interval={1} />
              <YAxis tick={{ fill: 'currentColor', fontSize: 9, opacity: 0.3 }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="Quizzes" fill="#6366F1" radius={[4, 4, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly accuracy trend */}
      <div className="glass-card p-5">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-4">📈 Weekly Accuracy Trend</h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeklyTrend} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
              <XAxis dataKey="week" tick={{ fill: 'currentColor', fontSize: 9, opacity: 0.3 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: 'currentColor', fontSize: 9, opacity: 0.3 }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} name="Accuracy" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Subject performance */}
      {subjectData.length > 0 ? (
        <div className="glass-card p-5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-4">🏷 Subject Performance</h3>
          <div className="space-y-3">
            {subjectData.map(s => (
              <div key={s.subject}>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-foreground/80">{s.subject}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/30 text-[10px]">{s.total} Qs</span>
                    <span className={s.accuracy >= 70 ? 'text-emerald-500' : s.accuracy >= 50 ? 'text-amber-500' : 'text-red-500'}>{s.accuracy}%</span>
                  </div>
                </div>
                <div className="h-2 bg-foreground/8 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${s.accuracy >= 70 ? 'bg-emerald-500' : s.accuracy >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${s.accuracy}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-foreground/20 mt-3 text-center">Tip: Add subjects when creating quizzes to track performance here</p>
        </div>
      ) : (
        <div className="glass-card p-5 text-center">
          <p className="text-2xl mb-2">🏷</p>
          <p className="text-sm font-bold text-foreground/50">No subject data yet</p>
          <p className="text-[11px] text-foreground/30 mt-1">Tag your quizzes with subjects to see breakdown here.</p>
        </div>
      )}
    </div>
  );
}
