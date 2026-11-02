import { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronUp, ChevronRight, ArrowUpDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { usePersistedState } from '../../hooks/usePersistedState';
import { QuizResult } from '../../types/quiz';
import TimeFilterPills from '../shared/TimeFilterPills';
import { calculateStreak, formatTime } from '../../utils/scoring';
import { formatDateDMY } from '../../utils/dateFormat';

// ═══════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════
type TimeRange = 'all' | 'today' | 'week' | 'month' | 'custom';
type SortMode = 'newest' | 'oldest' | 'best' | 'quizzes-high' | 'quizzes-low' | 'hours-high' | 'hours-low';

const TIME_TABS: { value: TimeRange; label: string; icon: string }[] = [
  { value: 'all', label: 'All Time', icon: '∞' },
  { value: 'today', label: 'Today', icon: '📦' },
  { value: 'week', label: 'Weekly', icon: '📦' },
  { value: 'month', label: 'Monthly', icon: '📅' },
  { value: 'custom', label: 'Custom', icon: '📄' },
];

const SORT_OPTIONS: { value: SortMode; label: string; icon: string }[] = [
  { value: 'newest', label: 'Newest', icon: '🏠' },
  { value: 'oldest', label: 'Oldest', icon: '📦' },
  { value: 'best', label: 'Best', icon: '🏆' },
  { value: 'quizzes-high', label: 'Quizzes High', icon: '🎯' },
  { value: 'quizzes-low', label: 'Quizzes Low', icon: '📋' },
  { value: 'hours-high', label: 'Hours High', icon: '⏰' },
  { value: 'hours-low', label: 'Hours Low', icon: '📊' },
];

const QUOTES = [
  { text: 'The expert in anything was once a beginner.', author: 'Helen Hayes' },
  { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier' },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Education is the most powerful weapon which you can use to change the world.', author: 'Nelson Mandela' },
  { text: 'The beautiful thing about learning is that nobody can take it away from you.', author: 'B.B. King' },
  { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
  { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
];

const MOOD_LABELS: Record<string, string> = { '😢': 'Sad', '😴': 'Tired', '😐': 'Neutral', '😄': 'Happy', '🔥': 'Motivated' };

// ═══════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (cur <= end) { dates.push(fmtDate(cur)); cur.setDate(cur.getDate() + 1); }
  return dates;
}

/**
 * Resolve the time range. For 'all', uses the earliest quiz date from history
 * instead of a hardcoded 2020 date — prevents generating thousands of empty days.
 */
function resolveRange(range: TimeRange, customFrom: string, customTo: string, earliestQuizDate: string, weekIdx = 0, monthStr = ''): { from: string; to: string } {
  const now = new Date();
  const today = fmtDate(now);
  switch (range) {
    case 'today': return { from: today, to: today };
    case 'week': {
      const dow = now.getDay();
      const diff = dow === 0 ? 6 : dow - 1;
      const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      thisMonday.setDate(thisMonday.getDate() - weekIdx * 7);
      const end = new Date(thisMonday); end.setDate(thisMonday.getDate() + 6);
      return { from: fmtDate(thisMonday), to: fmtDate(end) };
    }
    case 'month': {
      if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
        const [y, m] = monthStr.split('-').map(Number);
        const s = new Date(y, m - 1, 1);
        const e = new Date(y, m, 0);
        return { from: fmtDate(s), to: fmtDate(e) };
      }
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: fmtDate(s), to: fmtDate(e) };
    }
    case 'custom': return { from: customFrom || earliestQuizDate, to: customTo || today };
    default: return { from: earliestQuizDate, to: today };
  }
}

function getPreviousPeriod(from: string, to: string): { from: string; to: string } {
  const s = new Date(from + 'T00:00:00');
  const e = new Date(to + 'T00:00:00');
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const prevEnd = new Date(s); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days + 1);
  return { from: fmtDate(prevStart), to: fmtDate(prevEnd) };
}

function fmtHours(secs: number): string {
  if (secs < 60) return secs > 0 ? '<1m' : '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function scoreColor(pct: number) {
  return pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
}

function scoreBg(pct: number) {
  return pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
}

function getMoodData(dateKey: string): { mood?: string; note?: string } {
  try {
    const raw = localStorage.getItem(`qmp_calendar_mood_${dateKey}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function dayLabel(date: string, todayStr: string): string {
  if (date === todayStr) return 'Today';
  const d = new Date(date + 'T00:00:00');
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (fmtDate(yesterday) === date) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtDMY(s: string) {
  const d = new Date(s + 'T00:00:00');
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ═══════════════════════════════════════════
//  Live Clock
// ═══════════════════════════════════════════
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  const h = time.getHours() % 12 || 12;
  const m = String(time.getMinutes()).padStart(2, '0');
  const s = String(time.getSeconds()).padStart(2, '0');
  const ampm = time.getHours() >= 12 ? 'PM' : 'AM';
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 border border-primary/20">
      <span className="text-[10px]">⏰</span>
      <span className="font-mono text-[11px] font-black text-primary">
        {String(h).padStart(2, '0')}<span className="animate-pulse">:</span>{m}<span className="animate-pulse">:</span>{s}
      </span>
      <span className="text-[8px] font-bold text-primary/60">{ampm}</span>
    </div>
  );
}

// ═══════════════════════════════════════════
//  Chart Tooltip
// ═══════════════════════════════════════════
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3 text-xs shadow-2xl min-w-[160px]">
      <p className="text-foreground/60 font-bold mb-2 text-[11px] border-b border-border pb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-foreground/50">{p.name}</span>
          </div>
          <span className="font-black" style={{ color: p.color }}>
            {p.dataKey === 'hours' ? fmtHours(Math.round(Number(p.value) * 3600)) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════
//  Stat Cell
// ═══════════════════════════════════════════
function StatCell({ icon, iconBg, value, label, trend, trendLabel, isEmoji }: {
  icon: string; iconBg: string; value: string; label: string;
  trend?: number; trendLabel?: string; isEmoji?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-3.5 border border-border relative overflow-hidden ${isEmoji ? 'bg-orange-500/8' : 'bg-foreground/[0.03]'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <span className="text-lg">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-black text-foreground leading-none mb-1 ${isEmoji ? 'text-2xl' : 'text-xl font-mono'}`}>
            {value}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-foreground/40 font-semibold">{label}</span>
            {trend !== undefined && trendLabel && (
              <span className={`text-[10px] font-bold flex items-center gap-0.5 ${trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-foreground/30'}`}>
                {trend > 0 ? '↗' : trend < 0 ? '↘' : '→'} {trendLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  Mini Stat
// ═══════════════════════════════════════════
function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-foreground/[0.03] rounded-xl p-3 text-center border border-border">
      <div className="text-[9px] text-foreground/35 uppercase tracking-wider font-bold mb-1">{label}</div>
      <div className="text-sm font-black text-foreground font-mono">{value}</div>
      {sub && <div className="text-[8px] text-foreground/25 mt-0.5">{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════
//  Day Quiz Card (premium expanded view)
// ═══════════════════════════════════════════
function DayQuizCard({ quiz, onViewResult }: { quiz: QuizResult; onViewResult?: (r: QuizResult) => void }) {
  const pct = quiz.percentage;
  const initial = quiz.quizTitle?.[0]?.toUpperCase() || '📝';
  const gradientBg = pct >= 80
    ? 'bg-gradient-to-br from-emerald-500/40 to-emerald-700/40'
    : pct >= 60
      ? 'bg-gradient-to-br from-amber-500/40 to-amber-700/40'
      : 'bg-gradient-to-br from-red-500/40 to-red-700/40';

  return (
    <button
      onClick={() => onViewResult?.(quiz)}
      className="w-full text-left flex items-center gap-3 bg-card border border-border rounded-2xl p-3 transition-all hover:border-foreground/15 active:scale-[0.98] cursor-pointer group"
    >
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black text-white border border-white/10 ${gradientBg}`}>
        {initial !== '📝' ? initial : '📝'}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-foreground truncate leading-snug group-hover:text-primary transition-colors">
          {quiz.quizTitle || `Quiz · ${quiz.totalQuestions} Qs`}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {quiz.subject && (
            <span className="text-[8px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/20 leading-none">
              {quiz.subject}
            </span>
          )}
          <span className="text-[9px] text-foreground/35 font-medium">
            {formatDateDMY(quiz.timestamp)} · {formatTime(quiz.timeTaken)}
          </span>
        </div>
        {/* Progress bar + counts */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1 bg-muted/60 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreBg(pct)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[8px] font-bold text-emerald-400">✓{quiz.correct}</span>
            <span className="text-[8px] font-bold text-red-400">✗{quiz.wrong}</span>
            {quiz.skipped > 0 && <span className="text-[8px] font-bold text-amber-400">⏭{quiz.skipped}</span>}
          </div>
        </div>
      </div>

      {/* Score + Qs + Arrow */}
      <div className="flex flex-col items-center flex-shrink-0">
        <span className={`text-base font-black leading-none ${scoreColor(pct)}`}>{pct}%</span>
        <span className="text-[8px] text-foreground/30 font-bold mt-0.5">{quiz.totalQuestions} Qs</span>
        <ChevronRight className="w-3 h-3 text-foreground/15 mt-0.5 group-hover:text-foreground/40 transition-colors" />
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════
interface Props { history: QuizResult[]; onViewResult?: (r: QuizResult) => void; }

export default function AnalyticsTrends({ history, onViewResult }: Props) {
  const [sectionOpen, setSectionOpen] = usePersistedState('st_section_open', true);
  const [trendOpen, setTrendOpen] = usePersistedState('st_trend_open', true);
  const [dayByDayOpen, setDayByDayOpen] = usePersistedState('st_dbd_open', true);
  const [timeRange, setTimeRange] = usePersistedState<TimeRange>('st_time', 'all');
  const [subjectFilter, setSubjectFilter] = usePersistedState('st_subj', 'all');
  const [customFrom, setCustomFrom] = usePersistedState('st_cfrom', '');
  const [customTo, setCustomTo] = usePersistedState('st_cto', '');
  const [weekIndex, setWeekIndex] = usePersistedState('st_week_idx', 0);
  const [selectedMonth, setSelectedMonth] = usePersistedState('st_month_str', `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [sortMode, setSortMode] = usePersistedState<SortMode>('st_sort', 'newest');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const todayStrVal = fmtDate(new Date());

  // ═══════════════════════════════════════
  //  BUG FIX #1: "All Time" starts from first quiz date, not 2020
  // ═══════════════════════════════════════
  const earliestQuizDate = useMemo(() => {
    if (history.length === 0) return todayStrVal;
    const minTs = Math.min(...history.map(r => r.timestamp));
    return fmtDate(new Date(minTs));
  }, [history, todayStrVal]);

  // Extract unique subjects from quiz history
  const subjects = useMemo(() => {
    const map = new Map<string, number>();
    history.forEach(r => { if (r.subject) map.set(r.subject, (map.get(r.subject) || 0) + 1); });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [history]);

  // ═══════════════════════════════════════
  //  BUG FIX #4: Auto-reset subject filter when it no longer exists
  // ═══════════════════════════════════════
  useEffect(() => {
    if (subjectFilter !== 'all' && !subjects.some(s => s.name === subjectFilter)) {
      setSubjectFilter('all');
    }
  }, [subjects, subjectFilter, setSubjectFilter]);

  // Resolve time range — now passes earliest quiz date for 'all'
  const earliestTimestamp = useMemo(() => history.length > 0 ? Math.min(...history.map(r => r.timestamp)) : undefined, [history]);

  const resolved = useMemo(() => resolveRange(timeRange, customFrom, customTo, earliestQuizDate, weekIndex, selectedMonth), [timeRange, customFrom, customTo, earliestQuizDate, weekIndex, selectedMonth]);

  const rangeLabel = useMemo(() => {
    const range = TIME_TABS.find(r => r.value === timeRange);
    if (timeRange === 'all') return `All Time (${fmtDMY(resolved.from)} – ${fmtDMY(resolved.to)})`;
    return `${range?.label || ''} (${fmtDMY(resolved.from)} – ${fmtDMY(resolved.to)})`;
  }, [timeRange, resolved]);

  // Filter history by time range & subject
  const filtered = useMemo(() => {
    const from = new Date(resolved.from + 'T00:00:00').getTime();
    const to = new Date(resolved.to + 'T23:59:59').getTime();
    let result = history.filter(r => r.timestamp >= from && r.timestamp <= to);
    if (subjectFilter !== 'all') result = result.filter(r => r.subject === subjectFilter);
    return result;
  }, [history, resolved, subjectFilter]);

  // ═══════════════════════════════════════
  //  BUG FIX #8: Skip previous period comparison for 'all' (nonsensical)
  // ═══════════════════════════════════════
  const hasPrevPeriod = timeRange !== 'all';
  const prev = useMemo(() => {
    if (!hasPrevPeriod) return { from: '', to: '' };
    return getPreviousPeriod(resolved.from, resolved.to);
  }, [resolved, hasPrevPeriod]);

  const prevFiltered = useMemo(() => {
    if (!hasPrevPeriod || !prev.from) return [];
    const from = new Date(prev.from + 'T00:00:00').getTime();
    const to = new Date(prev.to + 'T23:59:59').getTime();
    let result = history.filter(r => r.timestamp >= from && r.timestamp <= to);
    if (subjectFilter !== 'all') result = result.filter(r => r.subject === subjectFilter);
    return result;
  }, [history, prev, subjectFilter, hasPrevPeriod]);

  // Stats
  const totalSeconds = useMemo(() => filtered.reduce((a, r) => a + r.timeTaken, 0), [filtered]);
  const prevSeconds = useMemo(() => prevFiltered.reduce((a, r) => a + r.timeTaken, 0), [prevFiltered]);
  const totalHours = totalSeconds / 3600;
  const prevHours = prevSeconds / 3600;
  const hoursDiff = hasPrevPeriod ? totalHours - prevHours : 0;
  const quizzesDiff = hasPrevPeriod ? filtered.length - prevFiltered.length : 0;

  const avgScore = useMemo(() =>
    filtered.length > 0 ? Math.round(filtered.reduce((a, r) => a + r.percentage, 0) / filtered.length) : 0
  , [filtered]);

  // Streak (all history, not filtered)
  const streak = useMemo(() => calculateStreak(history.map(r => r.timestamp)), [history]);

  // ═══════════════════════════════════════
  //  BUG FIX #2: Mood scanning — only scan days that have quiz activity
  //  instead of iterating every single calendar day in range
  // ═══════════════════════════════════════
  const bestMood = useMemo(() => {
    // Get unique dates that had quiz activity in range
    const activeDates = new Set<string>();
    filtered.forEach(r => {
      const d = new Date(r.timestamp);
      activeDates.add(d.toDateString());
    });
    // Also check a small window around today for mood even without quiz activity
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      activeDates.add(d.toDateString());
    }

    const moodCounts = new Map<string, number>();
    activeDates.forEach(dateStr => {
      const data = getMoodData(dateStr);
      if (data.mood) moodCounts.set(data.mood, (moodCounts.get(data.mood) || 0) + 1);
    });
    if (moodCounts.size === 0) return undefined;

    // Find most frequent mood overall
    let best: string | undefined;
    let bestCount = 0;
    for (const [mood, c] of moodCounts) {
      if (c > bestCount) { best = mood; bestCount = c; }
    }
    return best;
  }, [filtered]);

  // ═══════════════════════════════════════
  //  BUG FIX #6: Consistency — only count days from first quiz to today
  //  not entire range (avoids counting future days in month/week view)
  // ═══════════════════════════════════════
  const consistency = useMemo(() => {
    if (filtered.length === 0) return 0;
    const rangeFrom = new Date(resolved.from + 'T00:00:00');
    const rangeTo = new Date(resolved.to + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Cap the end at today — don't count future days
    const effectiveTo = rangeTo > today ? today : rangeTo;
    if (effectiveTo < rangeFrom) return 0;

    const totalDays = Math.round((effectiveTo.getTime() - rangeFrom.getTime()) / 86400000) + 1;
    if (totalDays <= 0) return 0;

    const quizDays = new Set<string>();
    filtered.forEach(r => quizDays.add(fmtDate(new Date(r.timestamp))));
    return Math.round((quizDays.size / totalDays) * 100);
  }, [resolved, filtered]);

  // ═══════════════════════════════════════
  //  BUG FIX #7: Chart data — build from quiz dates directly for 'all'
  //  to avoid generating thousands of empty day entries
  // ═══════════════════════════════════════
  const chartData = useMemo(() => {
    if (filtered.length === 0) return [];

    const dates = getDateRange(resolved.from, resolved.to);
    const byDate = new Map<string, { quizzes: number; seconds: number }>();
    filtered.forEach(r => {
      const d = fmtDate(new Date(r.timestamp));
      const prev = byDate.get(d) || { quizzes: 0, seconds: 0 };
      prev.quizzes++;
      prev.seconds += r.timeTaken;
      byDate.set(d, prev);
    });

    // For ranges > 90 days, only include days with activity (skip empty days)
    // This prevents rendering hundreds of zero-value points
    const useActivityOnly = dates.length > 90;

    let raw: { date: string; label: string; quizzes: number; hours: number }[];
    const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (useActivityOnly) {
      const sortedDates = Array.from(byDate.keys()).sort();
      raw = sortedDates.map(d => {
        const dt = new Date(d + 'T00:00:00');
        const data = byDate.get(d)!;
        return {
          date: d,
          label: `${dt.getDate()} ${mNames[dt.getMonth()]}`,
          quizzes: data.quizzes,
          hours: Math.round((data.seconds / 3600) * 10) / 10,
        };
      });
    } else {
      raw = dates.map(d => {
        const dt = new Date(d + 'T00:00:00');
        const data = byDate.get(d) || { quizzes: 0, seconds: 0 };
        return {
          date: d,
          label: `${dt.getDate()} ${mNames[dt.getMonth()]}`,
          quizzes: data.quizzes,
          hours: Math.round((data.seconds / 3600) * 10) / 10,
        };
      });
    }

    // Smart date logic: ≤30 days = show every date, >30 = aggregate into weekly ranges
    if (raw.length <= 30) return raw;
    const bucketSize = 7;
    const sampled: typeof raw = [];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let i = 0; i < raw.length; i += bucketSize) {
      const chunk = raw.slice(i, i + bucketSize);
      const startDt = new Date(chunk[0].date + 'T00:00:00');
      const endDt = new Date(chunk[chunk.length - 1].date + 'T00:00:00');
      const sameMonth = startDt.getMonth() === endDt.getMonth();
      const rangeLabel = sameMonth
        ? `${startDt.getDate()}–${endDt.getDate()} ${monthNames[startDt.getMonth()]}`
        : `${startDt.getDate()} ${monthNames[startDt.getMonth()]}–${endDt.getDate()} ${monthNames[endDt.getMonth()]}`;
      sampled.push({
        date: chunk[0].date,
        label: chunk.length > 1 ? rangeLabel : chunk[0].label,
        quizzes: chunk.reduce((s, c) => s + c.quizzes, 0),
        hours: Math.round(chunk.reduce((s, c) => s + c.hours, 0) * 10) / 10,
      });
    }
    return sampled;
  }, [resolved, filtered]);

  // Best day & avg per day
  const avgPerDay = useMemo(() => {
    if (filtered.length === 0) return 0;
    // Count only days with activity for a meaningful average
    const quizDays = new Set<string>();
    filtered.forEach(r => quizDays.add(fmtDate(new Date(r.timestamp))));
    const days = quizDays.size || 1;
    return Math.round((filtered.length / days) * 10) / 10;
  }, [filtered]);

  const bestDay = useMemo(() => {
    if (!chartData.length) return null;
    const best = chartData.reduce((a, b) => a.quizzes > b.quizzes ? a : b);
    return best.quizzes > 0 ? best : null;
  }, [chartData]);

  // Random quote
  const [quoteIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const quote = QUOTES[quoteIdx];

  // ═══════════════════════════════════════
  //  BUG FIX #3: Day-by-Day — only show days with activity for 'all' range
  //  For shorter ranges (today/week/month), show all days in range
  // ═══════════════════════════════════════
  interface DayData {
    date: string; label: string; isToday: boolean;
    quizCount: number; seconds: number; avgScore: number;
    mood?: string; isActive: boolean; quizzes: QuizResult[];
  }

  const dayByDayData = useMemo((): DayData[] => {
    const byDate = new Map<string, QuizResult[]>();
    filtered.forEach(r => {
      const d = fmtDate(new Date(r.timestamp));
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(r);
    });

    const dates = getDateRange(resolved.from, resolved.to);

    // For ranges > 60 days, only show days with activity to avoid massive DOM
    const showOnlyActive = dates.length > 60;

    const buildDay = (date: string): DayData => {
      const quizzes = byDate.get(date) || [];
      const key = new Date(date + 'T00:00:00').toDateString();
      const moodData = getMoodData(key);
      const secs = quizzes.reduce((s, r) => s + r.timeTaken, 0);
      const avg = quizzes.length > 0 ? Math.round(quizzes.reduce((s, r) => s + r.percentage, 0) / quizzes.length) : 0;
      return {
        date,
        label: dayLabel(date, todayStrVal),
        isToday: date === todayStrVal,
        quizCount: quizzes.length,
        seconds: secs,
        avgScore: avg,
        mood: moodData.mood,
        isActive: quizzes.length > 0,
        quizzes,
      };
    };

    if (showOnlyActive) {
      // Only render days that had quiz activity
      const activeDates = Array.from(byDate.keys()).sort();
      return activeDates.map(buildDay);
    }

    return dates.map(buildDay);
  }, [resolved, filtered, todayStrVal]);

  const activeDaysCount = useMemo(() => dayByDayData.filter(d => d.isActive).length, [dayByDayData]);
  const totalDaysInRange = useMemo(() => {
    const dates = getDateRange(resolved.from, resolved.to);
    return dates.length;
  }, [resolved]);

  // Sort day-by-day
  const sortedDays = useMemo(() => {
    const copy = [...dayByDayData];
    switch (sortMode) {
      case 'newest': return copy.reverse();
      case 'oldest': return copy;
      case 'best': return copy.sort((a, b) => b.avgScore - a.avgScore);
      case 'quizzes-high': return copy.sort((a, b) => b.quizCount - a.quizCount);
      case 'quizzes-low': return copy.sort((a, b) => a.quizCount - b.quizCount);
      case 'hours-high': return copy.sort((a, b) => b.seconds - a.seconds);
      case 'hours-low': return copy.sort((a, b) => a.seconds - b.seconds);
      default: return copy.reverse();
    }
  }, [dayByDayData, sortMode]);

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  // ═══════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════
  return (
    <div className="space-y-3 animate-fade-in">
      {/* SECTION 1: Header */}
      <div className="glass-card overflow-hidden">
        <button
          onClick={() => setSectionOpen(o => !o)}
          className="w-full flex items-center gap-3 p-4 text-left transition-all active:scale-[0.995]"
        >
          <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">📊</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black text-foreground">Analytics & Trends</h2>
            <p className="text-[10px] text-foreground/40 font-semibold mt-0.5">
              📊 {timeRange === 'all' ? 'All Time' : TIME_TABS.find(t => t.value === timeRange)?.label}: {filtered.length} quizzes · {fmtHours(totalSeconds)} | Consistency: {consistency}%
            </p>
          </div>
          {sectionOpen
            ? <ChevronUp className="w-5 h-5 text-foreground/30 flex-shrink-0" />
            : <ChevronDown className="w-5 h-5 text-foreground/30 flex-shrink-0" />}
        </button>
      </div>

      {sectionOpen && (
        <div className="space-y-3 animate-fade-in">

          {/* Time Filter Pills */}
          <TimeFilterPills
            value={timeRange}
            onChange={setTimeRange}
            weekIndex={weekIndex}
            onWeekIndexChange={setWeekIndex}
            selectedMonth={selectedMonth}
            onSelectedMonthChange={setSelectedMonth}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
            earliestDataTimestamp={earliestTimestamp}
            totalQuizCount={history.length}
          />

          {/* Subject Dropdown */}
          {subjects.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] font-bold text-foreground/50 flex items-center gap-1">
                <span>🎨</span> Subject:
              </span>
              <div className="flex-1 relative">
                <select
                  value={subjectFilter}
                  onChange={e => setSubjectFilter(e.target.value)}
                  className="w-full appearance-none bg-card border border-border rounded-xl px-3 py-2.5 pr-8 text-sm font-semibold text-foreground focus:outline-none focus:border-primary/50 cursor-pointer"
                >
                  <option value="all">All Subjects</option>
                  {subjects.map(s => (
                    <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Date Range Label */}
          <p className="text-center text-[11px] font-bold text-primary/70">
            📊 {fmtDMY(resolved.from)} — {fmtDMY(resolved.to)}
          </p>

          {/* SECTION 2: Quiz Report */}
          <div className="glass-card p-5 space-y-4 relative overflow-hidden">
            <div className="absolute -top-20 -left-20 w-40 h-40 bg-primary/8 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">📊</span>
                <div>
                  <h3 className="text-sm font-black text-foreground">Quiz Report</h3>
                  <p className="text-[10px] text-foreground/40 font-bold">{rangeLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <LiveClock />
                {streak > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <span className="text-sm">🔥</span>
                    <span className="text-[11px] font-black text-orange-400">{streak}d</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2×2 Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCell
                icon="⏱️"
                iconBg="bg-accent/10"
                value={fmtHours(totalSeconds)}
                label="Study Hours"
                trend={hasPrevPeriod ? hoursDiff : undefined}
                trendLabel={hasPrevPeriod ? `${hoursDiff >= 0 ? '+' : '-'}${fmtHours(Math.round(Math.abs(hoursDiff) * 3600))}` : undefined}
              />
              <StatCell
                icon="📝"
                iconBg="bg-primary/10"
                value={String(filtered.length)}
                label="Quizzes Done"
                trend={hasPrevPeriod ? quizzesDiff : undefined}
                trendLabel={hasPrevPeriod ? `${quizzesDiff >= 0 ? '+' : ''}${Math.abs(quizzesDiff)}` : undefined}
              />
              <StatCell
                icon="🎯"
                iconBg="bg-emerald-500/10"
                value={`${avgScore}%`}
                label="Avg Score"
              />
              <StatCell
                icon="😊"
                iconBg="bg-orange-500/15"
                value={bestMood || '—'}
                label={bestMood ? (MOOD_LABELS[bestMood] || 'Mood') : 'Mood'}
                isEmoji
              />
            </div>
          </div>

          {/* SECTION 3: Trend */}
          <div className="glass-card overflow-hidden">
            <button
              onClick={() => setTrendOpen(o => !o)}
              className="w-full flex items-center gap-3 p-4 text-left transition-all active:scale-[0.995]"
            >
              <span className="text-lg">📈</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-foreground">Trend</h3>
                <p className="text-[10px] text-foreground/40 font-semibold">
                  {filtered.length} quizzes · {fmtHours(totalSeconds)}
                </p>
              </div>
              {trendOpen
                ? <ChevronUp className="w-5 h-5 text-foreground/30 flex-shrink-0" />
                : <ChevronDown className="w-5 h-5 text-foreground/30 flex-shrink-0" />}
            </button>

            {trendOpen && (
              <div className="px-4 pb-5 space-y-4 animate-fade-in border-t border-border pt-4">
                {chartData.length > 1 ? (
                  <>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gQuizzesAT" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gHoursAT" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--foreground) / 0.3)' }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--foreground) / 0.25)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="quizzes" name="Quizzes" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#gQuizzesAT)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: 'hsl(var(--chart-1))', stroke: '#fff' }} />
                        <Area type="monotone" dataKey="hours" name="Hours" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#gHoursAT)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: 'hsl(var(--chart-2))', stroke: '#fff' }} />
                      </AreaChart>
                    </ResponsiveContainer>

                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label="AVG/DAY" value={String(avgPerDay)} sub="quizzes" />
                      <MiniStat label="TOTAL" value={fmtHours(totalSeconds)} sub="studied" />
                      <MiniStat label="BEST DAY" value={bestDay ? bestDay.label : '—'} sub={bestDay ? `${bestDay.quizzes} quiz${bestDay.quizzes !== 1 ? 'zes' : ''}` : ''} />
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <span className="text-2xl mb-1 block">📭</span>
                    <p className="text-[11px] text-foreground/40">Need at least 2 days of data for trend chart</p>
                  </div>
                )}

                <div className="pt-3 border-t border-border">
                  <p className="text-[11px] text-foreground/35 italic leading-relaxed">"{quote.text}"</p>
                  <p className="text-[9px] text-foreground/20 font-bold mt-1">— {quote.author}</p>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 4: Day-by-Day */}
          <div className="glass-card overflow-hidden">
            <button
              onClick={() => setDayByDayOpen(o => !o)}
              className="w-full flex items-center gap-3 p-4 text-left transition-all active:scale-[0.995]"
            >
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">📅</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-foreground">Day-by-Day</h3>
                <p className="text-[10px] text-foreground/40 font-semibold">
                  📝 {filtered.length} quizzes · {fmtHours(totalSeconds)} · {activeDaysCount}/{totalDaysInRange} active
                </p>
              </div>
              {dayByDayOpen
                ? <ChevronUp className="w-5 h-5 text-foreground/30 flex-shrink-0" />
                : <ChevronDown className="w-5 h-5 text-foreground/30 flex-shrink-0" />}
            </button>

            {dayByDayOpen && (
              <div className="px-4 pb-4 space-y-3 animate-fade-in border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-primary/70">
                    📊 {fmtDMY(resolved.from)} → {fmtDMY(resolved.to)}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-foreground/35">
                    <ArrowUpDown className="w-3 h-3" />
                    {SORT_OPTIONS.find(s => s.value === sortMode)?.label || 'Sort'}
                  </div>
                </div>

                {/* Active-only indicator for large ranges */}
                {totalDaysInRange > 60 && (
                  <p className="text-[9px] text-foreground/25 italic px-1">
                    Showing {activeDaysCount} active day{activeDaysCount !== 1 ? 's' : ''} only (range has {totalDaysInRange} days)
                  </p>
                )}

                {/* Sort chips */}
                <div>
                  <p className="text-[9px] font-black text-foreground/35 uppercase tracking-widest mb-2">SORT BY</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SORT_OPTIONS.map(s => (
                      <button key={s.value} onClick={() => setSortMode(s.value)}
                        className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all active:scale-95 flex items-center gap-1 ${
                          sortMode === s.value
                            ? 'bg-primary/15 border-primary/30 text-primary'
                            : 'bg-card border-border text-foreground/40 hover:border-foreground/20'
                        }`}>
                        <span className="text-xs">{s.icon}</span>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Day rows */}
                <div className="space-y-1">
                  {sortedDays.map(day => {
                    const isExpanded = expandedDays.has(day.date);
                    return (
                      <div key={day.date}>
                        <button
                          onClick={() => day.isActive && toggleDay(day.date)}
                          className={`w-full flex items-center gap-3 py-3 px-2 rounded-xl text-left transition-all ${
                            day.isToday ? 'bg-primary/5' : ''
                          } ${day.isActive ? 'hover:bg-foreground/[0.03] active:scale-[0.99]' : ''}`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            day.isActive ? 'bg-primary' : 'bg-foreground/15'
                          }`} />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${day.isActive ? 'text-foreground' : 'text-foreground/30'}`}>
                                {day.label}
                              </span>
                              {day.mood && <span className="text-xs">{day.mood}</span>}
                            </div>
                            {day.isActive ? (
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-foreground/40 font-medium flex items-center gap-1">
                                  📝 {day.quizCount} quiz{day.quizCount !== 1 ? 'zes' : ''}
                                </span>
                                <span className="text-[10px] text-foreground/40 font-medium flex items-center gap-1">
                                  ⏱️ {fmtHours(day.seconds)}
                                </span>
                                <span className={`text-[10px] font-bold ${scoreColor(day.avgScore)}`}>
                                  🎯 {day.avgScore}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-foreground/20 italic block mt-0.5">No activity</span>
                            )}
                          </div>

                          {day.isActive && (
                            <div className="flex-shrink-0">
                              {isExpanded
                                ? <ChevronUp className="w-4 h-4 text-foreground/30" />
                                : <ChevronDown className="w-4 h-4 text-foreground/30" />}
                            </div>
                          )}
                        </button>

                        {/* Expanded quiz list */}
                        {isExpanded && day.isActive && (
                          <div className="ml-4 pl-3 border-l-2 border-primary/15 space-y-2 pb-3 pt-1 animate-fade-in">
                            {day.quizzes.map((quiz, qi) => (
                              <DayQuizCard key={quiz.id || `${quiz.timestamp}-${qi}`} quiz={quiz} onViewResult={onViewResult} />
                            ))}
                            <div className="flex items-center justify-between pt-2 border-t border-border mt-1 px-1">
                              <span className="text-[10px] font-bold text-foreground/40">📊 Day Total</span>
                              <span className="text-[10px] font-bold text-foreground/50">
                                {day.quizCount} quiz{day.quizCount !== 1 ? 'zes' : ''} · {fmtHours(day.seconds)} · avg {day.avgScore}%
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {sortedDays.length === 0 && (
                    <p className="text-[11px] text-foreground/30 text-center py-4">No days in selected range</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
