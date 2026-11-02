import { useMemo } from 'react';
import { X, Pencil, Check, Flame, Target, Calendar, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { QuizResult } from '../../types/quiz';
import { calculateStreak } from '../../utils/scoring';
import { isSameLocalDay } from '../../utils/dateFormat';

interface Props {
  history: QuizResult[];
  onClose: () => void;
}

function RingChart({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }} />
    </svg>
  );
}

function TargetCard({ icon, label, target, current, color, storageKey }: {
  icon: string; label: string; target: number; current: number; color: string; storageKey: string;
}) {
  const [val, setVal] = usePersistedState(storageKey, target);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(val));
  const pct = val > 0 ? Math.min(Math.round((current / val) * 100), 100) : 0;
  const done = current >= val;

  const save = () => {
    const n = Math.max(1, Math.min(999, parseInt(draft) || target));
    setVal(n);
    setDraft(String(n));
    setEditing(false);
  };

  return (
    <div className={`rounded-2xl border p-4 transition-all ${done ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-card border-border'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-xs font-black text-foreground/60 uppercase tracking-wider">{label}</span>
        </div>
        {editing ? (
          <button onClick={save} className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 transition-all active:scale-90">
            <Check className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button onClick={() => { setDraft(String(val)); setEditing(true); }} className="w-7 h-7 rounded-lg bg-foreground/5 border border-border flex items-center justify-center text-foreground/30 hover:text-foreground/60 transition-all active:scale-90">
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex items-end gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-black ${done ? 'text-emerald-400' : 'text-foreground'}`}>{current}</span>
            <span className="text-foreground/25 font-bold">/</span>
            {editing ? (
              <input
                type="number"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                autoFocus
                min={1} max={999}
                className="w-14 bg-foreground/5 border border-primary/40 rounded-lg px-2 py-1 text-lg font-black text-foreground focus:outline-none text-center"
              />
            ) : (
              <span className="text-lg font-black text-foreground/40">{val}</span>
            )}
          </div>
          <p className="text-[10px] text-foreground/35 mt-0.5">
            {done ? '✅ Target reached!' : `${val - current} more to go`}
          </p>
        </div>
        <div className="text-right">
          <span className={`text-sm font-black ${pct >= 100 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-foreground/40'}`}>{pct}%</span>
        </div>
      </div>

      <div className="h-2.5 bg-foreground/8 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function StreakTargetsModal({ history, onClose }: Props) {
  const streak = useMemo(() => calculateStreak(history.map(r => r.timestamp)), [history]);

  // Best streak ever
  const bestStreak = useMemo(() => {
    if (history.length === 0) return 0;
    const days = [...new Set(history.map(r => {
      const d = new Date(r.timestamp);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }))].sort();
    let best = 0;
    let cur = 1;
    for (let i = 1; i < days.length; i++) {
      const diff = (new Date(days[i]).getTime() - new Date(days[i - 1]).getTime()) / 86400000;
      if (diff <= 1.5) { cur++; best = Math.max(best, cur); }
      else cur = 1;
    }
    return Math.max(best, cur > 0 && days.length > 0 ? cur : 0);
  }, [history]);

  // Today count
  const todayCount = useMemo(() => history.filter(r => isSameLocalDay(r.timestamp)).length, [history]);

  // This week count (last 7 days)
  const weekCount = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    return history.filter(r => r.timestamp >= cutoff).length;
  }, [history]);

  // This month count (current calendar month)
  const monthCount = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    return history.filter(r => r.timestamp >= start).length;
  }, [history]);

  // Consistency: % of last 30 days with at least 1 quiz
  const consistency = useMemo(() => {
    const daySet = new Set<string>();
    const cutoff = Date.now() - 30 * 86400000;
    history.filter(r => r.timestamp >= cutoff).forEach(r => {
      const d = new Date(r.timestamp);
      daySet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    });
    return Math.round((daySet.size / 30) * 100);
  }, [history]);

  // Last 30 days heatmap
  const last30 = useMemo(() => {
    const dayMap = new Map<string, number>();
    const cutoff = Date.now() - 30 * 86400000;
    history.filter(r => r.timestamp >= cutoff).forEach(r => {
      const d = new Date(r.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dayMap.set(key, (dayMap.get(key) || 0) + 1);
    });

    const days: { date: string; label: string; count: number; isToday: boolean }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({
        date: key,
        label: String(d.getDate()),
        count: dayMap.get(key) || 0,
        isToday: i === 0,
      });
    }
    return days;
  }, [history]);

  const maxCount = Math.max(...last30.map(d => d.count), 1);

  return (
    <div className="fixed inset-0 z-[190] flex flex-col bg-background/95 backdrop-blur-xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/25 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-base font-black text-foreground">Streak & Targets</h2>
            <p className="text-[10px] text-foreground/35 font-bold">Track your daily consistency</p>
          </div>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-foreground/5 border border-border flex items-center justify-center text-foreground/40 hover:text-foreground transition-colors active:scale-90">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Current Streak Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-red-500/5 to-transparent p-6">
          <div className="absolute top-4 right-4 text-5xl opacity-10">🔥</div>
          <div className="flex items-center gap-5">
            <div className="relative flex items-center justify-center flex-shrink-0">
              <RingChart pct={Math.min(streak * 10, 100)} color="#F97316" size={100} />
              <div className="absolute flex flex-col items-center">
                <span className="text-3xl font-black text-orange-400">{streak}</span>
                <span className="text-[8px] text-foreground/40 font-bold uppercase tracking-wider">days</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-foreground/35 uppercase tracking-widest font-bold mb-1">Current Streak</p>
              <p className="text-xl font-black text-foreground leading-tight">
                {streak === 0 ? 'Start today! 💪' : streak === 1 ? '1 day 🔥' : `${streak} days 🔥`}
              </p>
              <p className="text-xs text-foreground/40 mt-1.5">
                {streak >= 7 ? 'Incredible consistency! Keep going! 🌟' : streak >= 3 ? 'Great momentum! 💪' : streak >= 1 ? 'Keep it up tomorrow!' : 'Take a quiz to start your streak!'}
              </p>
              <div className="flex items-center gap-3 mt-3">
                <div className="flex items-center gap-1.5 bg-foreground/5 border border-border rounded-lg px-2.5 py-1.5">
                  <TrendingUp className="w-3 h-3 text-amber-400" />
                  <span className="text-[10px] font-black text-foreground/50">Best: {bestStreak}d</span>
                </div>
                <div className="flex items-center gap-1.5 bg-foreground/5 border border-border rounded-lg px-2.5 py-1.5">
                  <Target className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-black text-foreground/50">Today: {todayCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Targets */}
        <div>
          <p className="text-[10px] font-black text-foreground/35 uppercase tracking-widest mb-3 px-1">🎯 Targets</p>
          <div className="space-y-3">
            <TargetCard icon="📅" label="Daily Goal" target={3} current={todayCount} color="#22C55E" storageKey="qmp_streak_daily_target" />
            <TargetCard icon="📊" label="Weekly Goal" target={15} current={weekCount} color="#3B82F6" storageKey="qmp_streak_weekly_target" />
            <TargetCard icon="🏆" label="Monthly Goal" target={50} current={monthCount} color="#A855F7" storageKey="qmp_streak_monthly_target" />
          </div>
        </div>

        {/* Consistency Score */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-black text-foreground/35 uppercase tracking-widest">Consistency Score</p>
              <p className="text-[9px] text-foreground/25 mt-0.5">Active days in last 30 days</p>
            </div>
            <div className="relative flex items-center justify-center">
              <RingChart pct={consistency} color={consistency >= 70 ? '#22C55E' : consistency >= 40 ? '#EAB308' : '#EF4444'} size={56} />
              <span className="absolute text-sm font-black text-foreground">{consistency}%</span>
            </div>
          </div>
          <div className="h-2 bg-foreground/8 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${consistency}%` }} />
          </div>
          <p className="text-[10px] text-foreground/30 mt-2">
            {consistency >= 70 ? '🌟 Outstanding! You study almost every day.' : consistency >= 40 ? '👍 Good consistency. Try to be more regular.' : '📚 Room for improvement. Aim for daily practice!'}
          </p>
        </div>

        {/* 30-Day Heatmap */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-3.5 h-3.5 text-foreground/30" />
            <p className="text-[10px] font-black text-foreground/35 uppercase tracking-widest">Last 30 Days</p>
          </div>
          <div className="grid grid-cols-10 gap-1.5">
            {last30.map(day => {
              const intensity = day.count > 0 ? Math.max(0.3, day.count / maxCount) : 0;
              return (
                <div key={day.date} className="flex flex-col items-center gap-0.5" title={`${day.date}: ${day.count} quiz${day.count !== 1 ? 'zes' : ''}`}>
                  <div
                    className={`w-full aspect-square rounded-md border transition-all ${
                      day.isToday ? 'border-primary/40 ring-1 ring-primary/20' :
                      day.count > 0 ? 'border-emerald-500/20' : 'border-border'
                    }`}
                    style={{
                      backgroundColor: day.count > 0 ? `rgba(34, 197, 94, ${intensity})` : 'hsl(var(--foreground) / 0.03)',
                    }}
                  />
                  <span className={`text-[7px] font-bold leading-none ${day.isToday ? 'text-primary' : 'text-foreground/20'}`}>{day.label}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-2 mt-2">
            <span className="text-[8px] text-foreground/20">Less</span>
            {[0, 0.3, 0.5, 0.7, 1].map((o, i) => (
              <div key={i} className="w-3 h-3 rounded-sm border border-border" style={{ backgroundColor: o > 0 ? `rgba(34, 197, 94, ${o})` : 'hsl(var(--foreground) / 0.03)' }} />
            ))}
            <span className="text-[8px] text-foreground/20">More</span>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: 'Total Quizzes', v: history.length, c: 'text-primary' },
            { l: 'This Month', v: monthCount, c: 'text-purple-400' },
            { l: 'This Week', v: weekCount, c: 'text-blue-400' },
          ].map(s => (
            <div key={s.l} className="bg-card border border-border rounded-xl p-3 text-center">
              <div className={`text-xl font-black ${s.c}`}>{s.v}</div>
              <div className="text-[8px] text-foreground/30 uppercase tracking-widest font-bold mt-0.5">{s.l}</div>
            </div>
          ))}
        </div>

        {/* ── Weekly Activity Chart ── */}
        <WeeklyActivityChart history={history} />

        {/* ── Study Rhythm ── */}
        <StudyRhythmSection history={history} />

        {/* ── Learning Breakdown by Subject ── */}
        <SubjectBreakdownSection history={history} />

        {/* ── Question Type Breakdown ── */}
        <QuestionTypeBreakdownSection history={history} />

        {/* ── Streak Milestones Progress ── */}
        <StreakMilestonesProgress streak={streak} />

        {/* ── Streak Recovery ── */}
        {streak === 0 && bestStreak > 3 && (
          <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-red-500/5 p-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🔥</span>
              <div>
                <p className="text-sm font-black text-orange-400">Recover your streak!</p>
                <p className="text-[10px] text-foreground/40 mt-0.5">
                  Your best was <strong className="text-foreground/60">{bestStreak} days</strong> — you can do it again!
                </p>
              </div>
            </div>
            {history.length > 0 && (
              <p className="text-[10px] text-foreground/30 mt-2">
                Last active: {new Date(history[0].timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
            )}
            <p className="text-xs text-orange-300/70 mt-2 italic">
              "The comeback is always stronger than the setback" 💪
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Weekly Activity Chart (last 7 days) ── */
function WeeklyActivityChart({ history }: { history: QuizResult[] }) {
  const data = useMemo(() => {
    const days: { label: string; count: number }[] = [];
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      const count = history.filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd).length;
      days.push({ label: dayLabels[d.getDay()], count });
    }
    return days;
  }, [history]);

  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10px] font-black text-foreground/35 uppercase tracking-widest mb-3">📊 Last 7 Days</p>
      <div className="flex items-end gap-2 h-20">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[8px] font-bold text-foreground/40">{d.count || ''}</span>
            <div className="w-full rounded-t-md transition-all duration-500" style={{
              height: `${d.count > 0 ? Math.max(8, (d.count / max) * 56) : 4}px`,
              backgroundColor: d.count > 0 ? 'hsl(var(--primary))' : 'hsl(var(--foreground) / 0.06)',
            }} />
            <span className={`text-[8px] font-bold ${i === 6 ? 'text-primary' : 'text-foreground/25'}`}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Study Rhythm ── */
function StudyRhythmSection({ history }: { history: QuizResult[] }) {
  const slots = useMemo(() => {
    const s = [
      { label: '🌅 Morning', range: '6am–12pm', count: 0 },
      { label: '☀️ Afternoon', range: '12–5pm', count: 0 },
      { label: '🌆 Evening', range: '5–9pm', count: 0 },
      { label: '🌙 Night', range: '9pm–6am', count: 0 },
    ];
    for (const r of history) {
      const h = new Date(r.timestamp).getHours();
      if (h >= 6 && h < 12) s[0].count++;
      else if (h >= 12 && h < 17) s[1].count++;
      else if (h >= 17 && h < 21) s[2].count++;
      else s[3].count++;
    }
    return s;
  }, [history]);

  const max = Math.max(...slots.map(s => s.count), 1);
  const peakIdx = slots.reduce((pi, s, i) => s.count > slots[pi].count ? i : pi, 0);

  if (history.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10px] font-black text-foreground/35 uppercase tracking-widest mb-3">⏰ Study Rhythm</p>
      <div className="space-y-2.5">
        {slots.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs w-28 flex-shrink-0">
              <span className="font-bold text-foreground/70">{s.label}</span>
              <span className="text-[9px] text-foreground/25 ml-1">{s.range}</span>
            </span>
            <div className="flex-1 h-4 bg-foreground/5 rounded-full overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-700 ${i === peakIdx ? 'bg-primary' : 'bg-foreground/15'}`}
                style={{ width: `${(s.count / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-foreground/40 w-8 text-right tabular-nums">{s.count}</span>
            {i === peakIdx && s.count > 0 && (
              <span className="text-[8px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-full flex-shrink-0">PEAK</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Subject Breakdown ── */
function SubjectBreakdownSection({ history }: { history: QuizResult[] }) {
  const subjects = useMemo(() => {
    const map = new Map<string, { count: number; correct: number; total: number; lastTs: number }>();
    for (const r of history) {
      const s = r.subject?.trim() || 'General';
      const key = s.toLowerCase();
      const existing = map.get(key) || { count: 0, correct: 0, total: 0, lastTs: 0 };
      existing.count++;
      existing.correct += r.correct || 0;
      existing.total += r.totalQuestions || 0;
      if (r.timestamp > existing.lastTs) existing.lastTs = r.timestamp;
      map.set(key, existing);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({
        name: history.find(r => (r.subject?.trim() || 'General').toLowerCase() === key)?.subject?.trim() || 'General',
        ...v,
        accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
      }))
      .sort((a, b) => a.accuracy - b.accuracy); // weakest first
  }, [history]);

  if (subjects.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10px] font-black text-foreground/35 uppercase tracking-widest mb-3">📊 Learning Breakdown by Subject</p>
      <div className="space-y-2.5">
        {subjects.slice(0, 8).map(s => (
          <div key={s.name} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-foreground/70 truncate">{s.name}</span>
                {s.accuracy < 60 && <span className="text-[8px] font-black text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full flex-shrink-0">🎯 Focus Needed</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-foreground/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${s.accuracy >= 80 ? 'bg-emerald-500' : s.accuracy >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${s.accuracy}%` }}
                  />
                </div>
                <span className={`text-[10px] font-black tabular-nums w-9 text-right ${s.accuracy >= 80 ? 'text-emerald-400' : s.accuracy >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {s.accuracy}%
                </span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] font-bold text-foreground/40">{s.count} quiz{s.count !== 1 ? 'zes' : ''}</p>
              <p className="text-[8px] text-foreground/20">{new Date(s.lastTs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Question Type Breakdown ── */
function QuestionTypeBreakdownSection({ history }: { history: QuizResult[] }) {
  const types = useMemo(() => {
    const map = new Map<string, { count: number; correct: number; total: number }>();
    for (const r of history) {
      if (!r.quizData?.length) continue;
      for (let i = 0; i < r.quizData.length; i++) {
        const q = r.quizData[i];
        const t = q.questionType;
        if (!t) continue;
        const prev = map.get(t) || { count: 0, correct: 0, total: 0 };
        prev.total++;
        prev.count++;
        if (r.userAnswers[i] === q.correctAnswer) prev.correct++;
        map.set(t, prev);
      }
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        ...v,
        accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);
  }, [history]);

  if (types.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10px] font-black text-foreground/35 uppercase tracking-widest mb-3">🏷️ Breakdown by Question Type</p>
      <div className="space-y-2.5">
        {types.slice(0, 10).map(t => (
          <div key={t.name} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-foreground/70 truncate">{t.name}</span>
                {t.accuracy < 60 && <span className="text-[8px] font-black text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full flex-shrink-0">Weak</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-foreground/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${t.accuracy >= 80 ? 'bg-emerald-500' : t.accuracy >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${t.accuracy}%` }}
                  />
                </div>
                <span className={`text-[10px] font-black tabular-nums w-9 text-right ${t.accuracy >= 80 ? 'text-emerald-400' : t.accuracy >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {t.accuracy}%
                </span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] font-bold text-foreground/40">{t.total} Qs</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Streak Milestones Progress ── */
function StreakMilestonesProgress({ streak }: { streak: number }) {
  const milestones = [3, 7, 14, 30, 60, 100];
  const unachieved = milestones.filter(m => streak < m).slice(0, 3);

  if (unachieved.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10px] font-black text-foreground/35 uppercase tracking-widest mb-3">📈 Next Streak Milestones</p>
      <div className="flex gap-3 justify-center">
        {unachieved.map(m => {
          const pct = Math.min(Math.round((streak / m) * 100), 99);
          const needed = m - streak;
          const r = 22;
          const circ = 2 * Math.PI * r;
          const dash = (pct / 100) * circ;
          return (
            <div key={m} className="flex flex-col items-center gap-2">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <svg width={56} height={56} className="rotate-[-90deg]">
                  <circle cx={28} cy={28} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
                  <circle cx={28} cy={28} r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="5"
                    strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 1s ease' }} />
                </svg>
                <span className="absolute text-sm font-black text-foreground">{pct}%</span>
              </div>
              <div className="text-center">
                <p className="text-xs font-black text-foreground/60">{m}d</p>
                <p className="text-[9px] text-foreground/30">{needed} more day{needed !== 1 ? 's' : ''}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
