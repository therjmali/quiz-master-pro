import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { QuizResult } from '../../types/quiz';
import { getAvailablePracticeRounds } from '../../utils/practiceUtils';

interface RoundData {
  name: string;
  score: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number;
  avgTime: number;
  count: number;
}

type MKey = 'score' | 'correct' | 'wrong' | 'skipped' | 'accuracy' | 'avgTime';

const CTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-foreground/60 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-bold text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function SessionComparisonCard({ history }: { history: QuizResult[] }) {
  const [open, setOpen] = useState(true);

  const roundData = useMemo(() => {
    const rounds: RoundData[] = [];
    const mainWP = history.filter(r => {
      if ((r.attemptType || 'main') !== 'main') return false;
      return history.some(p => p.attemptType === 'practice' && p.parentQuizId === r.id);
    });
    if (mainWP.length > 0) {
      const c = mainWP.reduce((a, r) => a + r.correct, 0);
      const w = mainWP.reduce((a, r) => a + r.wrong, 0);
      const s = mainWP.reduce((a, r) => a + r.skipped, 0);
      const avg = Math.round(mainWP.reduce((a, r) => a + r.percentage, 0) / mainWP.length);
      const acc = (c + w) > 0 ? Math.round(c / (c + w) * 100) : 0;
      const at = Math.round(mainWP.reduce((a, r) => a + (r.totalQuestions > 0 ? r.timeTaken / r.totalQuestions : 0), 0) / mainWP.length);
      rounds.push({ name: 'Main', score: avg, correct: c, wrong: w, skipped: s, accuracy: acc, avgTime: at, count: mainWP.length });
    }
    for (const pr of getAvailablePracticeRounds(history)) {
      const res = history.filter(r => r.attemptType === 'practice' && r.attemptNumber === pr.attemptNumber);
      const c = res.reduce((a, r) => a + r.correct, 0);
      const w = res.reduce((a, r) => a + r.wrong, 0);
      const s = res.reduce((a, r) => a + r.skipped, 0);
      const acc = (c + w) > 0 ? Math.round(c / (c + w) * 100) : 0;
      const at = Math.round(res.reduce((a, r) => a + (r.totalQuestions > 0 ? r.timeTaken / r.totalQuestions : 0), 0) / res.length);
      rounds.push({ name: `P${pr.attemptNumber}`, score: pr.avgScore, correct: c, wrong: w, skipped: s, accuracy: acc, avgTime: at, count: pr.count });
    }
    return rounds;
  }, [history]);

  const insights = useMemo(() => {
    if (roundData.length < 2) return [];
    const f = roundData[0], l = roundData[roundData.length - 1];
    const ins: string[] = [];
    const sd = l.score - f.score;
    if (sd > 0) ins.push(`📈 Score improved ${sd}% from ${f.name} to ${l.name}`);
    else if (sd < 0) ins.push(`📉 Score dropped ${Math.abs(sd)}% — review your mistakes`);
    if (l.accuracy > f.accuracy) ins.push(`🎯 Accuracy: ${f.accuracy}% → ${l.accuracy}% (+${l.accuracy - f.accuracy}%)`);
    if (l.avgTime < f.avgTime) ins.push(`⚡ Speed: ${f.avgTime}s → ${l.avgTime}s per question`);
    if (l.score >= 80) ins.push(`🏆 Latest score ${l.score}% — strong mastery!`);
    else ins.push(`💪 Keep practicing — aim for 80%+`);
    return ins;
  }, [roundData]);

  const pCount = history.filter(r => r.attemptType === 'practice').length;
  if (pCount === 0 || roundData.length < 2) return null;

  const metrics: { label: string; key: MKey; suffix: string; invert?: boolean }[] = [
    { label: 'Score', key: 'score', suffix: '%' },
    { label: 'Correct', key: 'correct', suffix: '' },
    { label: 'Wrong', key: 'wrong', suffix: '', invert: true },
    { label: 'Skipped', key: 'skipped', suffix: '', invert: true },
    { label: 'Accuracy', key: 'accuracy', suffix: '%' },
    { label: 'Time/Q', key: 'avgTime', suffix: 's', invert: true },
  ];

  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3.5 transition-all active:scale-[0.99]">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <TrendingUp className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-xs font-black text-foreground leading-tight">Session Comparison</p>
          <p className="text-[9px] text-foreground/35 mt-0.5">{roundData.length} rounds · {pCount} practices</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-foreground/30" /> : <ChevronDown className="w-4 h-4 text-foreground/30" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">

              {/* Score + Accuracy Trend */}
              <div>
                <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">📈 Score & Accuracy Trend</p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={roundData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="scGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--foreground) / 0.3)" fontSize={11} tickLine={false} />
                    <YAxis domain={[0, 100]} stroke="hsl(var(--foreground) / 0.2)" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip content={<CTooltip />} />
                    <Area type="monotone" dataKey="score" stroke="hsl(var(--chart-1))" fill="url(#scGrad)" strokeWidth={2.5} name="Score %" dot={{ fill: 'hsl(var(--chart-1))', r: 4, strokeWidth: 0 }} />
                    <Area type="monotone" dataKey="accuracy" stroke="hsl(var(--chart-5))" fill="url(#acGrad)" strokeWidth={2} strokeDasharray="4 4" name="Accuracy %" dot={{ fill: 'hsl(var(--chart-5))', r: 3, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-5 mt-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-foreground/40">
                    <span className="w-4 h-[2px] rounded-full" style={{ backgroundColor: 'hsl(var(--chart-1))' }} /> Score
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-foreground/40">
                    <span className="w-4 h-[2px] rounded-full border-t border-dashed" style={{ borderColor: 'hsl(var(--chart-5))' }} /> Accuracy
                  </div>
                </div>
              </div>

              {/* Stacked Bar: Correct/Wrong/Skipped */}
              <div>
                <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">📊 Performance Breakdown</p>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={roundData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--foreground) / 0.3)" fontSize={11} tickLine={false} />
                    <YAxis stroke="hsl(var(--foreground) / 0.2)" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip content={<CTooltip />} />
                    <Bar dataKey="correct" stackId="a" fill="hsl(var(--chart-2))" name="Correct" />
                    <Bar dataKey="wrong" stackId="a" fill="hsl(var(--chart-3))" name="Wrong" />
                    <Bar dataKey="skipped" stackId="a" fill="hsl(var(--chart-4))" name="Skipped" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-1.5">
                  {[{ l: 'Correct', c: 'hsl(var(--chart-2))' }, { l: 'Wrong', c: 'hsl(var(--chart-3))' }, { l: 'Skipped', c: 'hsl(var(--chart-4))' }].map(x => (
                    <div key={x.l} className="flex items-center gap-1.5 text-[10px] text-foreground/40">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: x.c }} />{x.l}
                    </div>
                  ))}
                </div>
              </div>

              {/* Detail Table */}
              <div>
                <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">📋 Detailed Comparison</p>
                <div className="overflow-x-auto -mx-1 rounded-xl border border-border">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border bg-foreground/[0.02]">
                        <th className="text-left font-bold text-foreground/40 py-2.5 px-3 sticky left-0 bg-card z-10 min-w-[70px]">Metric</th>
                        {roundData.map(r => (
                          <th key={r.name} className="text-center font-black py-2.5 px-3 min-w-[65px]">
                            <span className={r.name === 'Main' ? 'text-primary' : 'text-amber-400'}>{r.name}</span>
                            <span className="block text-[8px] text-foreground/20 font-normal mt-0.5">{r.count} quiz{r.count !== 1 ? 'zes' : ''}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map(m => (
                        <tr key={m.label} className="border-b border-border/30 last:border-0">
                          <td className="font-bold text-foreground/50 py-2.5 px-3 sticky left-0 bg-card z-10">{m.label}</td>
                          {roundData.map((r, i) => {
                            const val = r[m.key];
                            const prev = i > 0 ? roundData[i - 1][m.key] : null;
                            const diff = prev !== null ? val - prev : null;
                            const isGood = diff !== null && diff !== 0 ? (m.invert ? diff < 0 : diff > 0) : null;
                            return (
                              <td key={r.name} className="text-center py-2.5 px-3">
                                <span className="font-black text-foreground">{val}{m.suffix}</span>
                                {diff !== null && diff !== 0 && (
                                  <div className="mt-0.5">
                                    <span className={`text-[9px] font-black ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {diff > 0 ? '▲' : '▼'}{Math.abs(diff)}{m.suffix}
                                    </span>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Speed Trend Mini */}
              {roundData.length >= 2 && (
                <div className="flex items-center gap-3 p-3 bg-foreground/[0.02] rounded-xl border border-border">
                  <span className="text-lg">⚡</span>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-foreground/50">Speed Trend</p>
                    <div className="flex items-center gap-2 mt-1">
                      {roundData.map((r, i) => (
                        <div key={r.name} className="flex items-center gap-1">
                          {i > 0 && <span className="text-foreground/15 text-[9px]">→</span>}
                          <span className={`text-xs font-black ${r.name === 'Main' ? 'text-primary' : 'text-amber-400'}`}>{r.avgTime}s</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {roundData[roundData.length - 1].avgTime < roundData[0].avgTime && (
                    <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg">
                      {roundData[0].avgTime - roundData[roundData.length - 1].avgTime}s faster
                    </span>
                  )}
                </div>
              )}

              {/* Quick Insights */}
              {insights.length > 0 && (
                <div>
                  <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">💡 Quick Insights</p>
                  <div className="space-y-1.5 bg-foreground/[0.02] rounded-xl border border-border p-3">
                    {insights.map((ins, i) => (
                      <p key={i} className="text-[11px] text-foreground/60 font-medium leading-relaxed">{ins}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
