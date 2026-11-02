import { useMemo } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import { QuizResult } from '../../types/quiz';

interface Props { history: QuizResult[]; }

export default function RadarSubjectChart({ history }: Props) {
  const { data, topSubject, worstSubject } = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    history.forEach(r => {
      const s = r.subject || 'General';
      if (!map[s]) map[s] = { total: 0, count: 0 };
      map[s].total += r.percentage;
      map[s].count++;
    });
    const data = Object.entries(map)
      .map(([subject, { total, count }]) => ({
        subject: subject.length > 10 ? subject.slice(0, 10) + '…' : subject,
        fullSubject: subject,
        avg: Math.round(total / count),
        fullMark: 100,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 8);

    const topSubject = data[0] || null;
    const worstSubject = data.length > 1 ? data[data.length - 1] : null;
    return { data, topSubject, worstSubject };
  }, [history]);

  if (data.length < 2) return null;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Subject Radar</p>
        <span className="text-[9px] text-foreground/25">{data.length} subjects</span>
      </div>
      <p className="text-[10px] text-foreground/25 mb-3">Average score % per subject</p>

      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <defs>
            <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#6366F1" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#6366F1" stopOpacity={0.1} />
            </radialGradient>
          </defs>
          <PolarGrid stroke="rgba(255,255,255,0.07)" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.5)', fontWeight: 600 }} />
          <Radar name="Avg Score" dataKey="avg" stroke="#6366F1" fill="url(#radarFill)" strokeWidth={2}
            dot={{ r: 3, fill: '#6366F1', strokeWidth: 0 }} />
          <Tooltip
            formatter={(v: any) => [`${v}%`, 'Avg Score']}
            contentStyle={{ background: '#12152a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11, color: '#fff' }}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Insights */}
      <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-white/5">
        {topSubject && (
          <div className="bg-emerald-500/10 rounded-xl p-2.5 border border-emerald-500/15">
            <p className="text-[8px] text-emerald-400/60 uppercase font-bold tracking-widest mb-1">Strongest</p>
            <p className="text-xs font-black text-emerald-400 truncate">{topSubject.fullSubject}</p>
            <p className="text-[10px] text-emerald-400/70">{topSubject.avg}% avg</p>
          </div>
        )}
        {worstSubject && (
          <div className="bg-red-500/10 rounded-xl p-2.5 border border-red-500/15">
            <p className="text-[8px] text-red-400/60 uppercase font-bold tracking-widest mb-1">Needs Work</p>
            <p className="text-xs font-black text-red-400 truncate">{worstSubject.fullSubject}</p>
            <p className="text-[10px] text-red-400/70">{worstSubject.avg}% avg</p>
          </div>
        )}
      </div>
    </div>
  );
}
