import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area, CartesianGrid, YAxis } from 'recharts';
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { loadSessions, FlashcardSession } from '../../utils/flashcardSessions';

interface CardData {
  question: string;
  difficulty?: string;
  subject?: string;
  questionType?: string;
  wasCorrect: boolean;
  wrongCount: number;
  practiceCount: number;
}

interface Props {
  allCards: CardData[];
  progress: Record<string, 'known' | 'review'>;
  knownCount: number;
  reviewCount: number;
  total: number;
  onBack: () => void;
}

type Range = 'today' | 'week' | 'month' | 'all';
const RANGES: Range[] = ['today', 'week', 'month', 'all'];
const RANGE_LABELS: Record<Range, string> = { today: 'Today', week: 'Week', month: 'Month', all: 'All' };

function hashQ(q: string): string {
  let h = 0;
  for (let i = 0; i < q.length; i++) h = ((h << 5) - h + q.charCodeAt(i)) | 0;
  return 'q' + Math.abs(h).toString(36);
}

function RingChart({ pct: rawPct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const pct = Math.max(0, Math.min(100, rawPct));
  const r = (size - 12) / 2, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: 'hsl(var(--border))' }} strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease' }} />
    </svg>
  );
}

function DiffBar({ label, count, total, barCls, textCls, accuracy }: {
  label: string; count: number; total: number; barCls: string; textCls: string; accuracy: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-foreground/50 w-16 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-foreground/8 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${barCls}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-28 text-right flex items-center gap-1.5 justify-end">
        <span className={`text-xs font-black ${textCls}`}>{pct}%</span>
        <span className="text-[9px] text-foreground/25">({count})</span>
        <span className="text-[9px] text-foreground/25">·</span>
        <span className={`text-[9px] font-bold ${accuracy >= 70 ? 'text-emerald-400' : accuracy >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{accuracy}% acc</span>
      </div>
    </div>
  );
}

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  const isUp = diff > 0, isFlat = diff === 0;
  const color = isUp ? 'text-emerald-400' : isFlat ? 'text-foreground/40' : 'text-red-400';
  const Icon = isUp ? TrendingUp : isFlat ? Minus : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black ${color}`}>
      <Icon className="w-3 h-3" /> {isFlat ? '—' : `${isUp ? '+' : ''}${diff.toFixed(0)}%`}
    </span>
  );
}

export default function FlashcardStats({ allCards, progress, knownCount, reviewCount, total, onBack }: Props) {
  const [range, setRange] = useState<Range>('all');
  const mastery = total > 0 ? Math.round((knownCount / total) * 100) : 0;
  const unmarked = total - knownCount - reviewCount;

  // Load flashcard sessions
  const allSessions = useMemo(() => loadSessions(), []);

  const filteredSessions = useMemo(() => {
    if (range === 'all') return allSessions;
    const now = Date.now();
    if (range === 'today') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      return allSessions.filter(s => s.timestamp >= start.getTime());
    }
    if (range === 'week') return allSessions.filter(s => s.timestamp >= now - 7 * 86400000);
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
    return allSessions.filter(s => s.timestamp >= d.getTime());
  }, [allSessions, range]);

  const prevSessions = useMemo(() => {
    if (range === 'all' || range === 'today') return [];
    const now = Date.now();
    if (range === 'week') {
      const cutEnd = now - 7 * 86400000, cutStart = cutEnd - 7 * 86400000;
      return allSessions.filter(s => s.timestamp >= cutStart && s.timestamp < cutEnd);
    }
    const d = new Date(); d.setMonth(d.getMonth() - 1); d.setDate(1); d.setHours(0, 0, 0, 0);
    const mEnd = new Date(); mEnd.setDate(1); mEnd.setHours(0, 0, 0, 0);
    return allSessions.filter(s => s.timestamp >= d.getTime() && s.timestamp < mEnd.getTime());
  }, [allSessions, range]);

  // Session stats
  const totalReviewed = filteredSessions.reduce((a, s) => a + s.cardsReviewed, 0);
  const totalKnownInSessions = filteredSessions.reduce((a, s) => a + s.markedKnown, 0);
  const sessionMastery = totalReviewed > 0 ? Math.round((totalKnownInSessions / totalReviewed) * 100) : mastery;
  const prevMastery = prevSessions.length > 0
    ? Math.round((prevSessions.reduce((a, s) => a + s.markedKnown, 0) / Math.max(prevSessions.reduce((a, s) => a + s.cardsReviewed, 0), 1)) * 100)
    : 0;
  const totalStudyTime = filteredSessions.reduce((a, s) => a + s.durationSeconds, 0);

  // Difficulty breakdown
  const diffStats = useMemo(() => {
    const acc = { easy: { count: 0, known: 0 }, medium: { count: 0, known: 0 }, hard: { count: 0, known: 0 } };
    for (const c of allCards) {
      const d = (c.difficulty || 'medium') as keyof typeof acc;
      if (acc[d]) { acc[d].count++; if (progress[hashQ(c.question)] === 'known') acc[d].known++; }
    }
    return acc;
  }, [allCards, progress]);

  // Subject breakdown
  const subjectStats = useMemo(() => {
    const map = new Map<string, { count: number; known: number; wrong: number }>();
    for (const c of allCards) {
      const s = c.subject || c.questionType || 'General';
      const prev = map.get(s) || { count: 0, known: 0, wrong: 0 };
      prev.count++;
      if (progress[hashQ(c.question)] === 'known') prev.known++;
      if (c.wrongCount > 0) prev.wrong += c.wrongCount;
      map.set(s, prev);
    }
    return [...map.entries()]
      .map(([name, d]) => ({ name, ...d, mastery: d.count > 0 ? Math.round((d.known / d.count) * 100) : 0 }))
      .sort((a, b) => b.count - a.count).slice(0, 10);
  }, [allCards, progress]);

  // Day of week activity
  const weeklyData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = new Array(7).fill(0);
    filteredSessions.forEach(s => { counts[new Date(s.timestamp).getDay()]++; });
    return days.map((d, i) => ({ day: d, count: counts[i] }));
  }, [filteredSessions]);

  // Time of day distribution
  const timeOfDayData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, count: 0 }));
    filteredSessions.forEach(s => { hours[new Date(s.timestamp).getHours()].count++; });
    return hours.filter(h => h.count > 0 || [6, 9, 12, 15, 18, 21].includes(parseInt(h.hour)));
  }, [filteredSessions]);

  // Mastery trend (last 10 sessions)
  const masteryTrend = useMemo(() => {
    return filteredSessions.slice(0, 15).reverse().map((s, i) => ({
      name: `#${i + 1}`,
      mastery: s.masteryPct,
      cards: s.cardsReviewed,
    }));
  }, [filteredSessions]);

  // Most challenging cards
  const hardestCards = useMemo(() =>
    [...allCards].sort((a, b) => b.wrongCount - a.wrongCount).filter(c => c.wrongCount > 0).slice(0, 5),
  [allCards]);

  // Status distribution
  const masteryBuckets = useMemo(() => [
    { range: 'Known', count: knownCount, color: '#10b981' },
    { range: 'Review', count: reviewCount, color: '#f59e0b' },
    { range: 'Unmarked', count: unmarked, color: '#6b7280' },
  ], [knownCount, reviewCount, unmarked]);

  if (total === 0) {
    return (
      <div className="animate-fade-in pb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-foreground/40 hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Cards
        </button>
        <div className="rounded-2xl bg-card border border-border p-10 flex flex-col items-center text-center">
          <span className="text-4xl mb-4">📊</span>
          <h3 className="text-base font-black text-foreground mb-2">No Stats Yet</h3>
          <p className="text-sm text-foreground/40">Review some flashcards to see your statistics here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-foreground/40 hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Cards
        </button>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">📊</span>
        <div>
          <h2 className="text-lg font-black text-foreground">Flashcard Analytics</h2>
          <p className="text-[11px] text-foreground/40">{total} cards · {filteredSessions.length} sessions</p>
        </div>
      </div>

      {/* Range Tabs */}
      <div className="flex gap-1.5 bg-card/80 p-1.5 rounded-xl border border-border">
        {RANGES.map(r => (
          <button key={r} onClick={() => setRange(r)}
            className={`flex-1 text-[11px] font-bold py-2 px-3 rounded-lg whitespace-nowrap transition-all ${range === r ? 'bg-primary/20 border border-primary/40 text-foreground' : 'text-foreground/40 border border-transparent'}`}>
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* Hero: Mastery Ring */}
      <div className="glass-card p-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] text-foreground/40 uppercase tracking-widest font-bold">Overall Mastery</p>
              {prevSessions.length > 0 && <TrendIndicator current={sessionMastery} previous={prevMastery} />}
            </div>
            <div className="text-4xl font-black text-foreground leading-none">{mastery}<span className="text-2xl text-foreground/40">%</span></div>
            <p className="text-xs text-foreground/40 mt-1">{knownCount} known · {reviewCount} review · {unmarked} unmarked</p>
          </div>
          <div className="relative flex items-center justify-center">
            <RingChart pct={mastery} color="hsl(var(--primary))" size={96} />
            <div className="absolute flex flex-col items-center">
              <span className="text-xl font-black text-foreground">{mastery}%</span>
              <span className="text-[8px] text-foreground/40 font-bold">mastery</span>
            </div>
          </div>
        </div>
        {/* Breakdown */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { v: knownCount, l: 'Known', c: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { v: reviewCount, l: 'Review', c: 'text-amber-400', bg: 'bg-amber-500/10' },
            { v: unmarked, l: 'Unmarked', c: 'text-foreground/40', bg: 'bg-foreground/5' },
          ].map(({ v, l, c, bg }) => (
            <div key={l} className={`${bg} rounded-xl p-2.5 text-center border border-border`}>
              <div className={`text-lg font-black ${c}`}>{v}</div>
              <div className="text-[8px] text-foreground/30 uppercase font-bold tracking-widest mt-0.5">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { icon: '🃏', label: 'Total Cards', value: total, gradient: 'from-primary/30 to-indigo-900/20' },
          { icon: '📝', label: 'Sessions', value: filteredSessions.length, gradient: 'from-purple-600/30 to-violet-900/20' },
          { icon: '⏱️', label: 'Study Time', value: totalStudyTime > 3600 ? `${Math.floor(totalStudyTime / 3600)}h ${Math.floor((totalStudyTime % 3600) / 60)}m` : `${Math.floor(totalStudyTime / 60)}m`, gradient: 'from-amber-600/30 to-orange-900/20' },
          { icon: '📊', label: 'Cards Reviewed', value: totalReviewed, gradient: 'from-emerald-600/30 to-teal-900/20' },
        ].map(({ icon, label, value, gradient }) => (
          <div key={label} className={`relative overflow-hidden bg-gradient-to-br ${gradient} rounded-xl p-3.5 border border-foreground/8`}>
            <div className="absolute top-2.5 right-2.5 text-xl opacity-20">{icon}</div>
            <div className="text-2xl font-black text-foreground leading-none mb-1">{value}</div>
            <div className="text-[9px] text-foreground/50 uppercase tracking-widest font-bold">{label}</div>
          </div>
        ))}
      </div>

      {/* Card Status Distribution */}
      <div className="glass-card p-4">
        <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1">Card Status Distribution</p>
        <p className="text-[10px] text-foreground/25 mb-4">How your cards are categorized</p>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={masteryBuckets} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="range" tick={{ fontSize: 10, fill: 'hsl(var(--foreground) / 0.4)' }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: any) => [v, 'Cards']}
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 10, color: 'hsl(var(--foreground))' }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {masteryBuckets.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Mastery Trend Chart */}
      {masteryTrend.length >= 2 && (
        <div className="glass-card p-4">
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1">Mastery Trend</p>
          <p className="text-[10px] text-foreground/25 mb-4">Session-by-session progress</p>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={masteryTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gMastery" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--foreground) / 0.35)' }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'hsl(var(--foreground) / 0.35)' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 10, color: 'hsl(var(--foreground))' }} />
              <Area type="monotone" dataKey="mastery" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gMastery)" dot={false} name="Mastery %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Difficulty Breakdown */}
      <div className="glass-card p-4">
        <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-4">By Difficulty</p>
        <div className="space-y-3">
          <DiffBar label="Easy" count={diffStats.easy.count} total={total} barCls="bg-emerald-500" textCls="text-emerald-400"
            accuracy={diffStats.easy.count > 0 ? Math.round((diffStats.easy.known / diffStats.easy.count) * 100) : 0} />
          <DiffBar label="Medium" count={diffStats.medium.count} total={total} barCls="bg-amber-500" textCls="text-amber-400"
            accuracy={diffStats.medium.count > 0 ? Math.round((diffStats.medium.known / diffStats.medium.count) * 100) : 0} />
          <DiffBar label="Hard" count={diffStats.hard.count} total={total} barCls="bg-red-500" textCls="text-red-400"
            accuracy={diffStats.hard.count > 0 ? Math.round((diffStats.hard.known / diffStats.hard.count) * 100) : 0} />
        </div>
      </div>

      {/* Subject Breakdown */}
      {subjectStats.length > 0 && (
        <div className="glass-card p-4">
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1">📚 By Subject / Topic</p>
          <p className="text-[10px] text-foreground/25 mb-4">Mastery across different subjects</p>
          <div className="space-y-3">
            {subjectStats.map(s => (
              <div key={s.name} className="flex items-center gap-3">
                <span className="text-xs font-bold text-foreground/60 truncate w-24 flex-shrink-0">{s.name}</span>
                <div className="flex-1 h-2.5 bg-foreground/8 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${s.mastery >= 70 ? 'bg-emerald-500' : s.mastery >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${s.mastery}%` }} />
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-xs font-black ${s.mastery >= 70 ? 'text-emerald-400' : s.mastery >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{s.mastery}%</span>
                  <span className="text-[9px] text-foreground/25">({s.count})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day of Week Activity */}
      {filteredSessions.length >= 2 && (
        <div className="glass-card p-4">
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1">Day of Week Activity</p>
          <p className="text-[10px] text-foreground/25 mb-4">Which days you review flashcards</p>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={weeklyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(var(--foreground) / 0.35)' }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: any) => [v, 'Sessions']}
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 10, color: 'hsl(var(--foreground))' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {weeklyData.map((entry, i) => {
                  const max = Math.max(...weeklyData.map(d => d.count));
                  return <Cell key={i} fill={entry.count === max && max > 0 ? '#F0A500' : 'rgba(240,165,0,0.25)'} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Time of Day */}
      {timeOfDayData.length >= 2 && filteredSessions.length >= 3 && (
        <div className="glass-card p-4">
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1">⏰ Time of Day</p>
          <p className="text-[10px] text-foreground/25 mb-4">When you study flashcards</p>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={timeOfDayData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="hour" tick={{ fontSize: 8, fill: 'hsl(var(--foreground) / 0.3)' }} tickLine={false} axisLine={false} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Most Challenging Cards */}
      {hardestCards.length > 0 && (
        <div className="glass-card p-4">
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1">🔥 Most Challenging</p>
          <p className="text-[10px] text-foreground/25 mb-3">Questions you got wrong most often</p>
          <div className="space-y-2">
            {hardestCards.map((c, i) => (
              <div key={i} className="flex items-start gap-3 bg-foreground/[0.03] border border-border rounded-xl p-3">
                <span className="text-[10px] font-black text-red-400 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20 flex-shrink-0">
                  ✗{c.wrongCount}×
                </span>
                <p className="text-xs text-foreground/60 leading-relaxed line-clamp-2 flex-1">{c.question}</p>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border flex-shrink-0 ${
                  progress[hashQ(c.question)] === 'known'
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : progress[hashQ(c.question)] === 'review'
                      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                      : 'text-foreground/30 bg-foreground/5 border-border'
                }`}>
                  {progress[hashQ(c.question)] === 'known' ? '✓' : progress[hashQ(c.question)] === 'review' ? '↻' : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personal Records */}
      {allSessions.length > 0 && (
        <div className="glass-card p-4">
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-4">🏅 Personal Records</p>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { icon: '🏆', label: 'Best Mastery', value: `${Math.max(...allSessions.map(s => s.masteryPct), 0)}%`, gradient: 'from-amber-500/15 to-amber-900/5' },
              { icon: '🃏', label: 'Most Cards', value: `${Math.max(...allSessions.map(s => s.cardsReviewed), 0)}`, gradient: 'from-primary/15 to-indigo-900/5' },
              { icon: '📝', label: 'Total Sessions', value: `${allSessions.length}`, gradient: 'from-purple-600/15 to-violet-900/5' },
              { icon: '⚡', label: 'Total Known', value: `${allSessions.reduce((a, s) => a + s.markedKnown, 0)}`, gradient: 'from-emerald-600/15 to-teal-900/5' },
            ].map(({ icon, label, value, gradient }) => (
              <div key={label} className={`relative overflow-hidden bg-gradient-to-br ${gradient} rounded-xl p-3.5 border border-foreground/8`}>
                <div className="absolute top-2.5 right-2.5 text-xl opacity-20">{icon}</div>
                <div className="text-xl font-black text-foreground leading-none mb-1">{value}</div>
                <div className="text-[9px] text-foreground/40 font-bold uppercase tracking-wider">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
