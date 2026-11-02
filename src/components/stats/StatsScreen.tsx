import { useMemo, useState, useRef, useEffect } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
// SubjectFilterPopup handles its own portal
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell, ComposedChart, Line, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Trophy, Zap, Target, Clock, Filter, X, ChevronRight, RotateCw, Link2, Unlink2 } from 'lucide-react';
import { QuizResult } from '../../types/quiz';
import { formatTime, calculateStreak, fmtDuration } from '../../utils/scoring';
import { getMistakeCount } from '../../utils/globalMistakes';
import { formatDateTimeDMY, formatDateShort, isSameLocalDay, parseLocalDateInput, parseLocalDateInputEnd, startOfLocalDay } from '../../utils/dateFormat';
import SessionSelector, { SessionMode, filterBySession } from '../SessionSelector';
import TimeFilterPills from '../shared/TimeFilterPills';
import WeeklyHeatmap from './WeeklyHeatmap';
import StreakMilestones from './StreakMilestones';
import QuestionMasteryHeatmap from './QuestionMasteryHeatmap';
import RadarSubjectChart from './RadarSubjectChart';
import TimeOfDayChart from './TimeOfDayChart';
import StudyCalendar from '../calendar/StudyCalendar';
// AnalyticsTrends moved to DashboardScreen
import AwardsGrid from '../profile/AwardsGrid';
import ComparisonMode from './ComparisonMode';
import ConfidenceChart from './ConfidenceChart';
import PredictiveScoreCard from './PredictiveScoreCard';
import SubjectFilterPopup from '../SubjectFilterPopup';
import StreakTargetsModal from './StreakTargetsModal';

interface Props { history: QuizResult[]; onOpenChatbot?: () => void; onViewResult?: (r: QuizResult) => void; }
type Range = 'today' | 'week' | 'month' | 'all' | 'custom';
type Section = 'performance' | 'learning' | 'time' | 'achievements';

const RANGES: Range[] = ['today', 'week', 'month', 'all', 'custom'];
const RANGE_LABELS: Record<Range, string> = { today: 'Today', week: 'Week', month: 'Month', all: 'All', custom: 'Custom' };
const RANGE_DAYS: Record<Range, number> = { today: 1, week: 7, month: -1, all: Infinity, custom: 0 }; // month=-1 means calendar month

const SECTION_META: { key: Section; icon: typeof TrendingUp; label: string }[] = [
  { key: 'performance', icon: TrendingUp, label: 'Performance' },
  { key: 'learning',    icon: Target,     label: 'Learning'    },
  { key: 'time',        icon: Clock,      label: 'Time'        },
  { key: 'achievements',icon: Trophy,     label: 'Milestones'  },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3 text-xs shadow-2xl min-w-[140px]">
      <p className="text-foreground/60 font-bold mb-2 text-[11px] border-b border-border pb-1.5 truncate max-w-[160px]">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-foreground/50">{p.name}</span>
          </div>
          <span className="font-black" style={{ color: p.color }}>{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

/* ── Subject Filter Popup (shared component) ── */

/* ── Gradient Stat Card (polished) ── */
function GradientStatCard({ value, label, sub, gradient, icon }: {
  value: string | number; label: string; sub?: string; gradient: string; icon: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 border border-foreground/[0.08] ${gradient} animate-fade-in`}>
      <div className="absolute top-3 right-3 text-2xl opacity-15 select-none">{icon}</div>
      <div className="text-2xl font-black text-foreground leading-none mb-1">{value}</div>
      {sub && <div className="text-[10px] text-foreground/40 font-medium mb-1">{sub}</div>}
      <div className="text-[9px] text-foreground/50 uppercase tracking-[0.12em] font-bold">{label}</div>
    </div>
  );
}

/* ── Ring Chart ── */
function RingChart({ pct: rawPct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const pct = Math.max(0, Math.min(100, rawPct));
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: 'hsl(var(--border))' }} strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }} />
    </svg>
  );
}

/* ── Difficulty Bar ── */
function DiffBar({ label, correct, total, barCls, textCls }: { label: string; correct: number; total: number; barCls: string; textCls: string }) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-foreground/50 w-16 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-foreground/8 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${barCls}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-20 text-right flex items-center gap-1 justify-end">
        <span className={`text-xs font-black ${textCls}`}>{pct}%</span>
        <span className="text-[9px] text-foreground/25">({total}q)</span>
      </div>
    </div>
  );
}

/* ── Trend Indicator ── */
function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  const isUp = diff > 0;
  const isFlat = diff === 0;
  const color = isUp ? 'text-emerald-400' : isFlat ? 'text-foreground/40' : 'text-red-400';
  const bg = isUp ? 'bg-emerald-500/10 border-emerald-500/20' : isFlat ? 'bg-foreground/5 border-border' : 'bg-red-500/10 border-red-500/20';
  const Icon = isUp ? TrendingUp : isFlat ? Minus : TrendingDown;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-black ${color} ${bg}`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{isFlat ? 'No change' : `${isUp ? '+' : ''}${diff.toFixed(0)}%`}</span>
    </div>
  );
}

/* ── Score Distribution Histogram ── */
function ScoreDistribution({ data }: { data: QuizResult[] }) {
  const buckets = useMemo(() => {
    const b = [
      { range: '0-20', count: 0, color: '#ef4444' },
      { range: '21-40', count: 0, color: '#f97316' },
      { range: '41-60', count: 0, color: '#eab308' },
      { range: '61-80', count: 0, color: '#22c55e' },
      { range: '81-100', count: 0, color: '#10b981' },
    ];
    data.forEach(r => {
      const p = r.percentage;
      if (p <= 20) b[0].count++;
      else if (p <= 40) b[1].count++;
      else if (p <= 60) b[2].count++;
      else if (p <= 80) b[3].count++;
      else b[4].count++;
    });
    return b;
  }, [data]);

  const max = Math.max(...buckets.map(b => b.count), 1);

  return (
    <div className="glass-card p-4 animate-fade-in">
      <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1">Score Distribution</p>
      <p className="text-[10px] text-foreground/25 mb-4">How your scores are spread</p>
      <div className="flex items-end gap-2 h-28">
        {buckets.map(b => {
          const h = max > 0 ? (b.count / max) * 100 : 0;
          return (
            <div key={b.range} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-black text-foreground/60">{b.count}</span>
              <div className="w-full rounded-t-lg transition-all duration-700" style={{ height: `${Math.max(h, 4)}%`, backgroundColor: b.color, opacity: b.count > 0 ? 1 : 0.2 }} />
              <span className="text-[8px] font-bold text-foreground/35">{b.range}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Personal Records ── */
function PersonalRecords({ history }: { history: QuizResult[] }) {
  const records = useMemo(() => {
    if (history.length === 0) return null;
    const bestScore = Math.max(...history.map(r => r.percentage));
    const streak = calculateStreak(history.map(r => r.timestamp));
    const mostQs = Math.max(...history.map(r => r.totalQuestions));
    // Fastest perfect score
    const perfects = history.filter(r => r.percentage === 100 && r.timeTaken > 0);
    const fastestPerfect = perfects.length > 0 ? Math.min(...perfects.map(r => r.timeTaken)) : null;

    return { bestScore, streak, mostQs, fastestPerfect };
  }, [history]);

  if (!records) return null;

  const items = [
    { icon: <Trophy className="w-5 h-5 text-amber-400" />, label: 'Best Score', value: `${records.bestScore}%`, bg: 'from-amber-500/15 to-amber-900/5' },
    { icon: <Zap className="w-5 h-5 text-orange-400" />, label: 'Best Streak', value: `${records.streak}d`, bg: 'from-orange-500/15 to-orange-900/5' },
    { icon: <Target className="w-5 h-5 text-blue-400" />, label: 'Most Qs in 1 Quiz', value: `${records.mostQs}`, bg: 'from-blue-500/15 to-blue-900/5' },
    { icon: <Clock className="w-5 h-5 text-emerald-400" />, label: 'Fastest 100%', value: records.fastestPerfect ? formatTime(records.fastestPerfect) : '—', bg: 'from-emerald-500/15 to-emerald-900/5' },
  ];

  return (
    <div className="glass-card p-4 animate-fade-in">
      <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-4">🏅 Personal Records</p>
      <div className="grid grid-cols-2 gap-2.5">
        {items.map(item => (
          <div key={item.label} className={`relative overflow-hidden bg-gradient-to-br ${item.bg} rounded-xl p-3.5 border border-foreground/8`}>
            <div className="flex items-center gap-2 mb-2">{item.icon}</div>
            <div className="text-xl font-black text-foreground leading-none mb-1">{item.value}</div>
            <div className="text-[9px] text-foreground/40 font-bold uppercase tracking-wider">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTimeToggle(secs: number, mode: 'min' | 'hr'): string {
  if (mode === 'hr') {
    return fmtDuration(secs);
  }
  return formatTime(secs);
}

function scoreColor(pct: number) { return pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400'; }

function QuizAttemptCard({ result, onViewResult }: { result: QuizResult; onViewResult?: (r: QuizResult) => void }) {
  const pct = result.percentage;
  return (
    <button
      onClick={() => onViewResult?.(result)}
      className="w-full text-left flex items-center gap-3.5 bg-card border border-border rounded-2xl p-3.5 transition-all hover:border-foreground/15 active:scale-[0.98] cursor-pointer group"
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-base font-black text-white border border-white/10 ${
        pct >= 80 ? 'bg-gradient-to-br from-emerald-500/40 to-emerald-700/40' :
        pct >= 60 ? 'bg-gradient-to-br from-amber-500/40 to-amber-700/40' :
        'bg-gradient-to-br from-red-500/40 to-red-700/40'
      }`}>
        {result.quizTitle?.[0]?.toUpperCase() || '📝'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate leading-snug group-hover:text-primary transition-colors">
          {result.quizTitle || `Quiz · ${result.totalQuestions} Qs`}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {result.subject && (
            <span className="text-[9px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/20 leading-none">{result.subject}</span>
          )}
          <span className="text-[10px] text-foreground/35 font-medium">
            {formatDateTimeDMY(result.timestamp)} · {result.totalQuestions} Qs · {formatTime(result.timeTaken)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1 bg-muted/60 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[8px] font-bold text-emerald-400">✓{result.correct}</span>
            <span className="text-[8px] font-bold text-red-400">✗{result.wrong}</span>
            {result.skipped > 0 && <span className="text-[8px] font-bold text-amber-400">⏭{result.skipped}</span>}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center flex-shrink-0">
        <span className={`text-lg font-black leading-none ${scoreColor(pct)}`}>{pct}%</span>
        <span className="text-[8px] text-foreground/30 font-bold mt-0.5">{result.correct}/{result.totalQuestions}</span>
        <ChevronRight className="w-3.5 h-3.5 text-foreground/15 mt-1 group-hover:text-foreground/40 transition-colors" />
      </div>
    </button>
  );
}

function QuizAttemptsList({ data, range, onViewResult }: { data: QuizResult[]; range: string; onViewResult?: (r: QuizResult) => void }) {
  const PAGE_SIZE = 15;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset visible count when data changes (e.g. filter/range change)
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [data.length, range]);

  if (data.length === 0) return (
    <div className="glass-card p-6 text-center animate-fade-in">
      <span className="text-2xl mb-2 block">📭</span>
      <p className="text-xs text-foreground/40 font-bold">No quiz attempts in this time range</p>
    </div>
  );

  const display = data.slice(0, visibleCount);
  const remaining = data.length - visibleCount;

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Quiz Attempts</p>
          <p className="text-[10px] text-foreground/25 mt-0.5">{data.length} quiz{data.length !== 1 ? 'zes' : ''} in selected range</p>
        </div>
        {visibleCount > PAGE_SIZE && (
          <button onClick={() => setVisibleCount(PAGE_SIZE)} className="text-[10px] font-bold text-primary/60 hover:text-primary transition-colors flex items-center gap-0.5">
            Collapse
            <ChevronRight className="w-3 h-3 rotate-[-90deg]" />
          </button>
        )}
      </div>
      <div className="space-y-2 max-h-[600px] overflow-y-auto thin-scrollbar">
        {display.map((r, i) => (
          <QuizAttemptCard key={r.id || r.timestamp + '-' + i} result={r} onViewResult={onViewResult} />
        ))}
      </div>
      {remaining > 0 && (
        <button
          onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
          className="w-full py-3 rounded-2xl border border-border bg-card text-xs font-bold text-foreground/50 hover:text-foreground/80 hover:border-foreground/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <ChevronRight className="w-3.5 h-3.5 rotate-90" />
          Load More ({remaining} remaining)
        </button>
      )}
    </div>
  );
}

export default function StatsScreen({ history, onOpenChatbot, onViewResult }: Props) {
  const [range, setRange] = usePersistedState<Range>('stats_range', 'all');
  const [activeSection, setActiveSection] = usePersistedState<Section>('stats_section', 'performance');
  const [customFrom, setCustomFrom] = usePersistedState('stats_custom_from', '');
  const [customTo, setCustomTo] = usePersistedState('stats_custom_to', '');
  const [weekIndex, setWeekIndex] = usePersistedState('stats_week_idx', 0);
  const [selectedMonth, setSelectedMonth] = usePersistedState('stats_month_str', `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [difficultyOpen, setDifficultyOpen] = usePersistedState('stats_diff_open', false);
  const [analyticsOpen, setAnalyticsOpen] = usePersistedState('stats_analytics_open', true);
  const [scoreDistOpen, setScoreDistOpen] = usePersistedState('stats_score_dist_open', false);
  const [sessionMode, setSessionMode] = usePersistedState<SessionMode>('stats_session', 'main');
  const [timeDisplayMode, setTimeDisplayMode] = usePersistedState<'min' | 'hr'>('stats_time_mode', 'min');
  const [subjectFilter, setSubjectFilter] = usePersistedState('stats_subject', 'all');
  const [subjectPopupOpen, setSubjectPopupOpen] = useState(false);
  const [streakModalOpen, setStreakModalOpen] = useState(false);
  const [calendarSync, setCalendarSync] = useState(() => localStorage.getItem('nursetrack-calendar-sync') === 'true');
  const [calendarViewDate, setCalendarViewDate] = useState<Date | undefined>();
  const sessionHistory = useMemo(() => filterBySession(history, sessionMode), [history, sessionMode]);

  const earliestTimestamp = useMemo(() => {
    if (sessionHistory.length === 0) return undefined;
    return Math.min(...sessionHistory.map(r => r.timestamp));
  }, [sessionHistory]);

  // Extract unique subjects with counts
  const subjectOptions = useMemo(() => {
    const map = new Map<string, { count: number; totalPct: number }>();
    sessionHistory.forEach(r => {
      if (r.subject) {
        const prev = map.get(r.subject) || { count: 0, totalPct: 0 };
        prev.count++;
        prev.totalPct += r.percentage;
        map.set(r.subject, prev);
      }
    });
    return Array.from(map.entries())
      .map(([name, { count, totalPct }]) => ({ name, count, avg: Math.round(totalPct / count) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessionHistory]);

  // Reset subject filter if subject no longer exists
  useEffect(() => {
    if (subjectFilter !== 'all' && !subjectOptions.some(s => s.name === subjectFilter)) {
      setSubjectFilter('all');
    }
  }, [subjectOptions, subjectFilter]);

  // Swipe on range tabs
  const rangeSwipeRef = useRef<HTMLDivElement>(null);
  const rangeStartX = useRef(0);
  useEffect(() => {
    const el = rangeSwipeRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => { rangeStartX.current = e.touches[0].clientX; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - rangeStartX.current;
      if (Math.abs(dx) < 50) return;
      setRange(prev => {
        const idx = RANGES.indexOf(prev);
        if (dx < 0) return RANGES[(idx + 1) % RANGES.length];
        return RANGES[(idx - 1 + RANGES.length) % RANGES.length];
      });
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd); };
  }, []);

  const filtered = useMemo(() => {
    let result: QuizResult[];
    if (range === 'custom') {
      const from = customFrom ? parseLocalDateInput(customFrom) : 0;
      const to = customTo ? parseLocalDateInputEnd(customTo) : Infinity;
      result = sessionHistory.filter(r => r.timestamp >= from && r.timestamp <= to);
    } else {
      if (range === 'all') result = sessionHistory;
      else if (range === 'today') {
        result = sessionHistory.filter(r => isSameLocalDay(r.timestamp));
      } else if (range === 'month') {
        const [my, mm] = selectedMonth.split('-').map(Number);
        const monthStart = new Date(my, mm - 1, 1, 0, 0, 0, 0).getTime();
        const monthEnd = new Date(my, mm, 0, 23, 59, 59, 999).getTime();
        result = sessionHistory.filter(r => r.timestamp >= monthStart && r.timestamp <= monthEnd);
      } else if (range === 'week') {
        const now = new Date();
        const dow = now.getDay(); const diff = dow === 0 ? 6 : dow - 1;
        const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
        const wkStart = new Date(thisMonday); wkStart.setDate(wkStart.getDate() - weekIndex * 7);
        const wkEnd = new Date(wkStart); wkEnd.setDate(wkEnd.getDate() + 6);
        const wFrom = wkStart.getTime();
        const wTo = new Date(wkEnd.getFullYear(), wkEnd.getMonth(), wkEnd.getDate(), 23, 59, 59, 999).getTime();
        result = sessionHistory.filter(r => r.timestamp >= wFrom && r.timestamp <= wTo);
      } else {
        const cutoff = Date.now() - RANGE_DAYS[range] * 86400000;
        result = sessionHistory.filter(r => r.timestamp >= cutoff);
      }
    }
    // Apply subject filter
    if (subjectFilter !== 'all') {
      result = result.filter(r => r.subject === subjectFilter);
    }
    return result;
  }, [sessionHistory, range, customFrom, customTo, subjectFilter, weekIndex, selectedMonth]);

  // Previous period for trend comparison
  const prevFiltered = useMemo(() => {
    if (range === 'all' || range === 'custom' || filtered.length === 0) return [];
    let cutoffEnd: number, cutoffStart: number;
    if (range === 'today') {
      cutoffEnd = startOfLocalDay().getTime();
      cutoffStart = cutoffEnd - 86400000;
    } else if (range === 'month') {
      const [my, mm] = selectedMonth.split('-').map(Number);
      cutoffEnd = new Date(my, mm - 1, 1, 0, 0, 0, 0).getTime();
      const prevMon = mm - 1 <= 0 ? 12 : mm - 1;
      const prevYr = mm - 1 <= 0 ? my - 1 : my;
      cutoffStart = new Date(prevYr, prevMon - 1, 1, 0, 0, 0, 0).getTime();
    } else if (range === 'week') {
      const now = new Date();
      const dow = now.getDay(); const diff = dow === 0 ? 6 : dow - 1;
      const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      const wkStart = new Date(thisMonday); wkStart.setDate(wkStart.getDate() - weekIndex * 7);
      cutoffEnd = wkStart.getTime();
      cutoffStart = cutoffEnd - 7 * 86400000;
    } else {
      const days = RANGE_DAYS[range];
      cutoffEnd = Date.now() - days * 86400000;
      cutoffStart = cutoffEnd - days * 86400000;
    }
    let result = sessionHistory.filter(r => r.timestamp >= cutoffStart && r.timestamp < cutoffEnd);
    if (subjectFilter !== 'all') result = result.filter(r => r.subject === subjectFilter);
    return result;
  }, [sessionHistory, range, filtered, subjectFilter, weekIndex, selectedMonth]);

  // Streak counts ALL quiz attempts (main + practice) — any daily attempt keeps the streak alive
  const streak = useMemo(() => calculateStreak(history.map(r => r.timestamp)), [history]);
  const avgScore = useMemo(() => filtered.length > 0 ? Math.round(filtered.reduce((a, r) => a + r.percentage, 0) / filtered.length) : 0, [filtered]);
  const prevAvgScore = useMemo(() => prevFiltered.length > 0 ? Math.round(prevFiltered.reduce((a, r) => a + r.percentage, 0) / prevFiltered.length) : 0, [prevFiltered]);
  const bestScore = useMemo(() => filtered.reduce((a, r) => Math.max(a, r.percentage), 0), [filtered]);
  const totalTime = useMemo(() => filtered.reduce((a, r) => a + r.timeTaken, 0), [filtered]);
  const totCorrect = useMemo(() => filtered.reduce((a, r) => a + r.correct, 0), [filtered]);
  const totWrong = useMemo(() => filtered.reduce((a, r) => a + r.wrong, 0), [filtered]);
  const totSkipped = useMemo(() => filtered.reduce((a, r) => a + r.skipped, 0), [filtered]);
  const accuracy = (totCorrect + totWrong) > 0 ? Math.round((totCorrect / (totCorrect + totWrong)) * 100) : 0;

  const chartData = useMemo(() =>
    filtered.slice(0, 20).reverse().map((r, i) => ({
      name: r.quizTitle ? r.quizTitle.slice(0, 10) : `#${i + 1}`,
      Score: r.percentage,
      Accuracy: r.accuracy,
    })), [filtered]);

  const byDiff = useMemo(() => {
    const acc = { easy: { c: 0, t: 0 }, medium: { c: 0, t: 0 }, hard: { c: 0, t: 0 } };
    filtered.filter(r => r.quizData?.length > 0).forEach(r => {
      r.quizData.forEach((q, i) => {
        const d = (q.difficulty || 'medium') as 'easy' | 'medium' | 'hard';
        if (acc[d]) { acc[d].t++; if (r.userAnswers[i] === q.correctAnswer) acc[d].c++; }
      });
    });
    return acc;
  }, [filtered]);

  const weeklyData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = new Array(7).fill(0);
    sessionHistory.forEach(r => { counts[new Date(r.timestamp).getDay()]++; });
    return days.map((d, i) => ({ day: d, count: counts[i] }));
  }, [sessionHistory]);

  if (sessionHistory.length === 0 && history.length === 0) {
    return (
      <div className="animate-fade-in pt-2 pb-4">
        <div className="pt-2 px-1 mb-6">
          <p className="text-[10px] font-bold text-foreground/30 uppercase tracking-[0.12em] mb-0.5">Analytics</p>
          <h1 className="text-xl font-extrabold text-foreground">Statistics</h1>
        </div>
        <div className="glass-card p-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
            <span className="text-3xl">📊</span>
          </div>
          <h3 className="text-base font-black text-foreground mb-2">No data yet</h3>
          <p className="text-sm text-foreground/40 max-w-xs leading-relaxed">Complete some quizzes to see your performance analytics, streaks, and study patterns here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-4 space-y-4">
      {/* ── Header ── */}
      <div className="pt-2 px-1 space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-bold text-foreground/30 uppercase tracking-[0.12em] mb-0.5">Analytics</p>
            <h1 className="text-xl font-extrabold text-foreground">Statistics</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStreakModalOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-2 rounded-xl border transition-all active:scale-95 bg-orange-500/10 border-orange-500/25 text-orange-400 hover:bg-orange-500/20"
            >
              🔥 <span className="hidden xs:inline">Streak</span>
            </button>
            {onOpenChatbot && (
              <button
                onClick={onOpenChatbot}
                className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-base hover:border-foreground/20 transition-all active:scale-95"
                title="Ask AI"
              >
                🤖
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {subjectOptions.length >= 2 && (
            <button
              onClick={() => setSubjectPopupOpen(true)}
              className={`relative flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-2 rounded-xl border transition-all active:scale-95 ${
                subjectFilter !== 'all'
                  ? 'bg-primary/15 border-primary/30 text-primary'
                  : 'bg-card border-border text-foreground/40 hover:border-foreground/20'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              {subjectFilter !== 'all' && (
                <>
                  <span className="max-w-[70px] truncate text-[10px]">{subjectFilter}</span>
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[7px] font-black flex items-center justify-center">1</span>
                </>
              )}
            </button>
          )}
          <SessionSelector history={history} value={sessionMode} onChange={setSessionMode} compact />
          <div className="flex-1" />
        </div>
      </div>

      {/* Streak Modal */}
      {streakModalOpen && (
        <StreakTargetsModal history={history} onClose={() => setStreakModalOpen(false)} />
      )}

      {/* Subject Filter Popup */}
      {subjectPopupOpen && (
        <SubjectFilterPopup
          subjects={subjectOptions}
          value={subjectFilter}
          onChange={setSubjectFilter}
          onClose={() => setSubjectPopupOpen(false)}
        />
      )}

      {/* Active filters indicator */}
      {subjectFilter !== 'all' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/8 border border-primary/20 rounded-xl animate-fade-in">
          <Filter className="w-3 h-3 text-primary/60" />
          <p className="text-[11px] font-bold text-primary/80 flex-1">
            Subject: {subjectFilter} · {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </p>
          <button onClick={() => setSubjectFilter('all')} className="text-[10px] font-bold text-destructive/70 hover:text-destructive transition-colors">
            Clear
          </button>
        </div>
      )}

      {/* Practice mode indicator */}
      {sessionMode !== 'main' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl animate-fade-in">
          <span className="text-base">🏋️</span>
          <p className="text-[11px] font-bold text-amber-300">Showing practice session statistics</p>
        </div>
      )}

      {/* Empty state for filtered session */}
      {sessionHistory.length === 0 && history.length > 0 && (
        <div className="glass-card p-8 flex flex-col items-center text-center">
          <span className="text-3xl mb-3">🔄</span>
          <h3 className="text-base font-black text-foreground mb-2">No practice data yet</h3>
          <p className="text-sm text-foreground/40 max-w-xs">Retry a quiz from the Results screen to create practice attempts.</p>
        </div>
      )}

      {/* ── Premium Time Filter Pills ── */}
      <div ref={rangeSwipeRef} style={{ touchAction: 'pan-x' }}>
        <TimeFilterPills
          value={range}
          onChange={setRange}
          weekIndex={weekIndex}
          onWeekIndexChange={setWeekIndex}
          selectedMonth={selectedMonth}
          onSelectedMonthChange={setSelectedMonth}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
          earliestDataTimestamp={earliestTimestamp}
          totalQuizCount={sessionHistory.length}
          onRangeChange={(r, details) => {
            if (!calendarSync) return;
            if (details.month) setCalendarViewDate(details.month);
            else if (details.weekStart) setCalendarViewDate(details.weekStart);
            else if (details.customFrom) setCalendarViewDate(new Date(details.customFrom + 'T00:00:00'));
            else setCalendarViewDate(undefined);
          }}
        />
      </div>

      {/* ── Hero Summary Card (polished) ── */}
      <div className="glass-card p-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] text-foreground/40 uppercase tracking-widest font-bold">Overall Performance</p>
              {range !== 'all' && prevFiltered.length > 0 && (
                <TrendIndicator current={avgScore} previous={prevAvgScore} />
              )}
            </div>
            <div className="text-4xl font-black text-foreground leading-none">{avgScore}<span className="text-2xl text-foreground/40">%</span></div>
            <p className="text-xs text-foreground/40 mt-1">avg score · {filtered.length} quizzes</p>
          </div>
          <div className="relative flex items-center justify-center">
            <RingChart pct={accuracy} color="hsl(var(--primary))" size={96} />
            <div className="absolute flex flex-col items-center">
              <span className="text-xl font-black text-foreground">{accuracy}%</span>
              <span className="text-[8px] text-foreground/40 font-bold">accuracy</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { v: totCorrect, l: 'Correct',  c: 'text-emerald-400' },
            { v: totWrong,   l: 'Wrong',    c: 'text-red-400', sub: 'per-attempt'  },
            { v: totSkipped, l: 'Skipped',  c: 'text-amber-400'   },
            { v: `${streak}d`, l: 'Streak', c: 'text-orange-400'  },
          ].map(({ v, l, c, sub }: any) => (
            <div key={l} className="bg-foreground/5 rounded-xl p-2.5 text-center border border-border">
              <div className={`text-lg font-black ${c}`}>{v}</div>
              <div className="text-[8px] text-foreground/30 uppercase font-bold tracking-widest mt-0.5">{l}</div>
              {sub && <div className="text-[7px] text-foreground/20 mt-0.5">{sub}</div>}
            </div>
          ))}
        </div>

        {/* Mistake Book summary */}
        {(() => {
          const mc = getMistakeCount();
          if (mc.total === 0) return null;
          return (
            <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-foreground/70">📕 Mistake Book</p>
                <p className="text-[10px] text-foreground/40">
                  {mc.active} unique questions from {totWrong} wrong answers across {filtered.length} quizzes
                </p>
              </div>
              <div className="text-right">
                <span className="text-sm font-black text-red-400">{mc.active}</span>
                <span className="text-[8px] text-foreground/30 block">active</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Section Navigation ── */}
      <div className="flex gap-1 bg-muted/30 p-1 rounded-2xl border border-border">
        {SECTION_META.map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setActiveSection(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-[11px] font-semibold transition-all active:scale-95 whitespace-nowrap ${
              activeSection === key
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-foreground/40 hover:text-foreground/60 border border-transparent'
            }`}>
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════
          SECTION: PERFORMANCE
      ══════════════════════════════════════ */}
      {activeSection === 'performance' && (
        <div className="space-y-4 animate-fade-in">
          <SectionHeader icon="📊" title="Performance Overview" />

          {/* Gradient Stat Cards */}
          <div className="grid grid-cols-2 gap-3">
            <GradientStatCard value={`${bestScore}%`} label="Best Score" icon="🏆" sub={`Avg: ${avgScore}%`}
              gradient="bg-gradient-to-br from-amber-600/30 to-orange-900/20" />
            <GradientStatCard value={filtered.length} label="Quizzes Taken" icon="📝" sub={`${range === 'all' ? 'All time' : RANGE_LABELS[range]}`}
              gradient="bg-gradient-to-br from-primary/30 to-indigo-900/20" />
            <button onClick={() => setTimeDisplayMode(m => m === 'min' ? 'hr' : 'min')} className="text-left w-full">
              <GradientStatCard value={formatTimeToggle(totalTime, timeDisplayMode)} label={`Study Time · ${timeDisplayMode === 'min' ? 'tap→hr' : 'tap→min'}`} icon="⏱️" sub={filtered.length > 0 ? `~${formatTimeToggle(Math.round(totalTime / filtered.length), timeDisplayMode)} avg` : ''}
                gradient="bg-gradient-to-br from-purple-600/30 to-violet-900/20" />
            </button>
            <GradientStatCard value={`${accuracy}%`} label="Accuracy" icon="🎯" sub={`${totCorrect} of ${totCorrect + totWrong} correct`}
              gradient="bg-gradient-to-br from-emerald-600/30 to-teal-900/20" />
          </div>

          {/* Score Trend Chart */}
          {chartData.length >= 2 && (
            <div className="glass-card p-4 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Score Trend</p>
                  <p className="text-[10px] text-foreground/25 mt-0.5">Last {chartData.length} quizzes</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full block" style={{background:'#F0A500'}} /><span className="text-[9px] text-foreground/40">Score</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 rounded-full block" /><span className="text-[9px] text-foreground/40">Accuracy</span></div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gScore2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F0A500" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#F0A500" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gAcc2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--foreground) / 0.35)' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'hsl(var(--foreground) / 0.35)' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="Score" stroke="#F0A500" strokeWidth={2} fill="url(#gScore2)" dot={false} />
                  <Area type="monotone" dataKey="Accuracy" stroke="#22C55E" strokeWidth={1.5} fill="url(#gAcc2)" dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Calendar ↔ Analytics Sync Toggle */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-sm">📅</span>
              <span className="text-xs font-bold text-foreground/60">Study Calendar</span>
            </div>
            <button
              onClick={() => {
                const next = !calendarSync;
                setCalendarSync(next);
                localStorage.setItem('nursetrack-calendar-sync', String(next));
                if (!next) setCalendarViewDate(undefined);
              }}
              className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all active:scale-95 ${
                calendarSync
                  ? 'bg-primary/15 border-primary/30 text-primary'
                  : 'bg-card border-border text-foreground/40 hover:border-foreground/20'
              }`}
            >
              {calendarSync ? <Link2 className="w-3 h-3" /> : <Unlink2 className="w-3 h-3" />}
              {calendarSync ? '🔗 Sync' : '🔗'}
            </button>
          </div>
          <StudyCalendar history={filtered} externalViewDate={calendarViewDate} />

          {/* Activity Overview (default open) */}
          <AnalyticsReportSection
            filtered={filtered}
            prevFiltered={prevFiltered}
            range={range}
            customFrom={customFrom}
            customTo={customTo}
            open={analyticsOpen}
            onToggle={() => setAnalyticsOpen(o => !o)}
          />

          {/* Answer Breakdown Bar */}
          <div className="glass-card p-4 animate-fade-in">
            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-4">Answer Breakdown</p>
            <div className="space-y-3">
              {[
                { label: 'Correct', val: totCorrect, total: totCorrect + totWrong + totSkipped, bar: 'bg-emerald-500', text: 'text-emerald-400' },
                { label: 'Wrong',   val: totWrong,   total: totCorrect + totWrong + totSkipped, bar: 'bg-red-500',     text: 'text-red-400'     },
                { label: 'Skipped', val: totSkipped, total: totCorrect + totWrong + totSkipped, bar: 'bg-amber-500',   text: 'text-amber-400'   },
              ].map(({ label, val, total, bar, text }) => {
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-foreground/50 w-14 flex-shrink-0">{label}</span>
                    <div className="flex-1 h-3 bg-foreground/8 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%`, transition: 'width 0.8s ease' }} />
                    </div>
                    <span className={`text-xs font-black w-10 text-right ${text}`}>{pct}%</span>
                    <span className="text-[9px] text-foreground/25 w-6 text-right">{val}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Score Distribution (collapsed by default) */}
          {filtered.length >= 3 && (
            <>
              <button onClick={() => setScoreDistOpen(o => !o)}
                className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 transition-all active:scale-[0.99]">
                <span className="text-xs font-black text-foreground/60 uppercase tracking-widest">📊 Score Distribution</span>
                <span className={`text-foreground/40 transition-transform ${scoreDistOpen ? 'rotate-180' : ''}`}>▾</span>
              </button>
              {scoreDistOpen && <div className="-mt-1"><ScoreDistribution data={filtered} /></div>}
            </>
          )}

          {/* Predictive Score */}
          <PredictiveScoreCard history={filtered} />

          {/* Personal Records */}
          <PersonalRecords history={sessionHistory} />

          {/* Quiz Attempts List */}
          <QuizAttemptsList data={filtered} range={range} onViewResult={onViewResult} />
        </div>
      )}

      {/* ══════════════════════════════════════
          SECTION: LEARNING
      ══════════════════════════════════════ */}
      {activeSection === 'learning' && (
        <div className="space-y-4 animate-fade-in">
          <SectionHeader icon="🎓" title="Learning Breakdown" />

          {/* Difficulty Breakdown (Collapsible) */}
          <button onClick={() => setDifficultyOpen(o => !o)}
            className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 transition-all active:scale-[0.99]">
            <span className="text-xs font-black text-foreground/60 uppercase tracking-widest">📊 Difficulty Breakdown</span>
            <span className={`text-foreground/40 transition-transform ${difficultyOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {difficultyOpen && (byDiff.easy.t + byDiff.medium.t + byDiff.hard.t) > 0 && (
            <div className="glass-card p-4 space-y-3 animate-fade-in -mt-1 rounded-t-none border-t-0">
              <DiffBar label="Easy" correct={byDiff.easy.c} total={byDiff.easy.t} barCls="bg-emerald-500" textCls="text-emerald-400" />
              <DiffBar label="Medium" correct={byDiff.medium.c} total={byDiff.medium.t} barCls="bg-amber-500" textCls="text-amber-400" />
              <DiffBar label="Hard" correct={byDiff.hard.c} total={byDiff.hard.t} barCls="bg-red-500" textCls="text-red-400" />
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border mt-1">
                {[
                  { l: 'Easy', t: byDiff.easy.t, c: 'text-emerald-400' },
                  { l: 'Medium', t: byDiff.medium.t, c: 'text-amber-400' },
                  { l: 'Hard', t: byDiff.hard.t, c: 'text-red-400' },
                ].map(({ l, t, c }) => (
                  <div key={l} className="text-center">
                    <div className={`text-lg font-black ${c}`}>{t}</div>
                    <div className="text-[8px] text-foreground/30 uppercase tracking-widest">{l} Qs</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ComparisonMode history={filtered} />
          <ConfidenceChart />
          <QuestionMasteryHeatmap history={filtered} />
          <RadarSubjectChart history={filtered} />

          {/* Question Types Distribution */}
          <QuestionTypePills history={filtered} />

          <div className="glass-card p-4">
            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-4">Lifetime Totals</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Correct',  value: sessionHistory.reduce((a, r) => a + r.correct, 0),  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { label: 'Wrong',    value: sessionHistory.reduce((a, r) => a + r.wrong, 0),    color: 'text-red-400',     bg: 'bg-red-500/10'     },
                { label: 'Skipped',  value: sessionHistory.reduce((a, r) => a + r.skipped, 0),  color: 'text-amber-400',   bg: 'bg-amber-500/10'   },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`${bg} rounded-2xl py-4 border border-foreground/8`}>
                  <div className={`text-2xl font-black ${color}`}>{value}</div>
                  <div className="text-[9px] text-foreground/30 uppercase tracking-widest font-bold mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          SECTION: TIME
      ══════════════════════════════════════ */}
      {activeSection === 'time' && (
        <div className="space-y-4 animate-fade-in">
          <SectionHeader icon="⏰" title="Time Patterns" />

          <div className="glass-card p-4">
            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1">Day of Week Activity</p>
            <p className="text-[10px] text-foreground/25 mb-4">Which days you quiz most</p>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={weeklyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(var(--foreground) / 0.35)' }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: any) => [v, 'Quizzes']}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 10, color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {weeklyData.map((entry, i) => {
                    const max = Math.max(...weeklyData.map(d => d.count));
                    return <Cell key={i} fill={entry.count === max && max > 0 ? '#F0A500' : 'rgba(240,165,0,0.25)'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <TimeOfDayChart history={sessionHistory} />
          <WeeklyHeatmap history={sessionHistory} />

          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Time Stats</p>
              <button onClick={() => setTimeDisplayMode(m => m === 'min' ? 'hr' : 'min')}
                className="flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary transition-all active:scale-95">
                <RotateCw className="w-2.5 h-2.5" />
                {timeDisplayMode === 'min' ? 'Show Hours' : 'Show Minutes'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { l: 'Total Study Time',   v: formatTimeToggle(sessionHistory.reduce((a, r) => a + r.timeTaken, 0), timeDisplayMode), c: 'text-purple-400' },
                { l: 'Avg Per Quiz',       v: sessionHistory.length > 0 ? formatTimeToggle(Math.round(sessionHistory.reduce((a, r) => a + r.timeTaken, 0) / sessionHistory.length), timeDisplayMode) : '0m', c: 'text-primary' },
                { l: 'Fastest Quiz',       v: sessionHistory.length > 0 ? formatTimeToggle(Math.min(...sessionHistory.map(r => r.timeTaken)), timeDisplayMode) : '—', c: 'text-emerald-400' },
                { l: 'Longest Session',    v: sessionHistory.length > 0 ? formatTimeToggle(Math.max(...sessionHistory.map(r => r.timeTaken)), timeDisplayMode) : '—', c: 'text-amber-400' },
              ].map(({ l, v, c }) => (
                <div key={l} className="bg-foreground/4 rounded-xl p-3 border border-border">
                  <div className={`text-lg font-black ${c}`}>{v}</div>
                  <div className="text-[9px] text-foreground/30 uppercase tracking-widest mt-1">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          SECTION: ACHIEVEMENTS
      ══════════════════════════════════════ */}
      {activeSection === 'achievements' && (
        <div className="space-y-4 animate-fade-in">
          <SectionHeader icon="🏆" title="Milestones & Achievements" />

          <div className="glass-card p-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-600/10 to-red-900/10 pointer-events-none" />
            <div className="flex items-center gap-4">
              <div className="relative flex items-center justify-center">
                <RingChart pct={Math.min(streak * 10, 100)} color="#F97316" size={80} />
                <div className="absolute flex flex-col items-center">
                  <span className="text-xl font-black text-orange-400">{streak}</span>
                  <span className="text-[7px] text-foreground/40 font-bold">days</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-foreground/40 uppercase tracking-widest font-bold mb-1">Current Streak</p>
                <div className="text-2xl font-black text-foreground">{streak === 0 ? 'Not active' : streak === 1 ? '1 day 🔥' : `${streak} days 🔥`}</div>
                <p className="text-xs text-foreground/40 mt-1">
                  {streak >= 7 ? 'Incredible consistency! 🌟' : streak >= 3 ? 'Keep it going! 💪' : 'Start your streak today!'}
                </p>
              </div>
            </div>
          </div>

          <StreakMilestones history={sessionHistory} />
          <AwardsGrid history={sessionHistory} />

          <div className="glass-card p-4">
            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-4">Score Milestones</p>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: '🌱', label: 'First Quiz',   unlocked: sessionHistory.length >= 1,  note: '1 quiz'   },
                { icon: '📚', label: '5 Quizzes',    unlocked: sessionHistory.length >= 5,  note: '5 quizzes' },
                { icon: '⚡', label: '10 Quizzes',   unlocked: sessionHistory.length >= 10, note: '10 quizzes' },
                { icon: '🎯', label: 'Perfect 100%', unlocked: sessionHistory.some(r => r.percentage === 100), note: '100% score' },
                { icon: '🌟', label: 'High Scorer',  unlocked: sessionHistory.length > 0 && (sessionHistory.reduce((a, r) => a + r.percentage, 0) / sessionHistory.length) >= 80, note: '80%+ avg' },
                { icon: '🔥', label: '3-Day Streak', unlocked: streak >= 3, note: '3-day streak' },
                { icon: '💎', label: '50 Correct',   unlocked: sessionHistory.reduce((a, r) => a + r.correct, 0) >= 50, note: '50 correct' },
                { icon: '👑', label: 'Master',        unlocked: sessionHistory.length >= 25 && (sessionHistory.reduce((a, r) => a + r.percentage, 0) / sessionHistory.length) >= 75, note: '25+ quizzes 75%+ avg' },
              ].map((m, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  m.unlocked ? 'bg-primary/15 border-primary/30 shadow-sm' : 'bg-muted border-border'
                }`}>
                  <span className={`text-2xl ${m.unlocked ? '' : 'grayscale opacity-60'}`}>{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-black ${m.unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>{m.label}</div>
                    <div className={`text-[9px] truncate ${m.unlocked ? 'text-foreground/50' : 'text-muted-foreground/70'}`}>{m.note}</div>
                  </div>
                  {m.unlocked && <span className="text-emerald-500 text-xs font-black flex-shrink-0">✓</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionTypePills({ history }: { history: QuizResult[] }) {
  const types = useMemo(() => {
    const map = new Map<string, { total: number; correct: number; hard: number; medium: number; easy: number }>();
    history.filter(r => r.quizData?.length > 0).forEach(r => {
      r.quizData.forEach((q, i) => {
        const t = q.questionType;
        if (!t) return;
        const prev = map.get(t) || { total: 0, correct: 0, hard: 0, medium: 0, easy: 0 };
        prev.total++;
        if (r.userAnswers[i] === q.correctAnswer) prev.correct++;
        if (q.difficulty === 'hard') prev.hard++;
        else if (q.difficulty === 'easy') prev.easy++;
        else prev.medium++;
        map.set(t, prev);
      });
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [history]);

  // Also compute H/M/E totals across all questionType data
  const diffTotals = useMemo(() => {
    let h = 0, m = 0, e = 0;
    history.filter(r => r.quizData?.length > 0).forEach(r => r.quizData.forEach(q => {
      if (!q.questionType) return;
      if (q.difficulty === 'hard') h++;
      else if (q.difficulty === 'easy') e++;
      else m++;
    }));
    return { h, m, e };
  }, [history]);

  if (types.length === 0) return null;

  return (
    <div className="glass-card p-4 animate-fade-in">
      <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1">🏷️ Question Types</p>
      <p className="text-[10px] text-foreground/25 mb-3">Distribution by type & difficulty</p>

      {/* Difficulty pills */}
      {(diffTotals.h + diffTotals.m + diffTotals.e) > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {diffTotals.h > 0 && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
              🔴 Hard: {diffTotals.h}
            </span>
          )}
          {diffTotals.m > 0 && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              🟡 Medium: {diffTotals.m}
            </span>
          )}
          {diffTotals.e > 0 && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              🟢 Easy: {diffTotals.e}
            </span>
          )}
        </div>
      )}

      {/* Type pills */}
      <div className="flex flex-wrap gap-2">
        {types.map(t => (
          <div key={t.name} className="flex items-center gap-2 bg-foreground/5 border border-border rounded-xl px-3 py-2">
            <span className="text-xs font-bold text-foreground/70">{t.name}</span>
            <span className="text-[10px] font-black text-foreground/40">{t.total}</span>
            <span className={`text-[9px] font-black ${t.accuracy >= 80 ? 'text-emerald-400' : t.accuracy >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
              {t.accuracy}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsReportSection({ filtered, prevFiltered, range, customFrom = '', customTo = '', open, onToggle }: {
  filtered: QuizResult[]; prevFiltered: QuizResult[]; range: string; customFrom?: string; customTo?: string; open: boolean; onToggle: () => void;
}) {
  // Compute the date range label for display
  const dateRangeLabel = useMemo(() => {
    const fmt = (d: Date) => `${d.toLocaleDateString('en-US', { month: 'short' })} ${d.getDate()}`;
    const now = new Date();
    if (range === 'today') return fmt(now);
    if (range === 'week') {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
    }
    if (range === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
    }
    if (range === 'custom' && customFrom && customTo) {
      const s = new Date(customFrom + 'T00:00:00');
      const e = new Date(customTo + 'T00:00:00');
      return `${fmt(s)} – ${fmt(e)}, ${e.getFullYear()}`;
    }
    return '';
  }, [range, customFrom, customTo]);

  const chartData = useMemo(() => {
    if (filtered.length === 0) return [];

    const bucketMap = new Map<string, { label: string; quizzes: number; hours: number; questions: number; ts: number; sortKey: number }>();

    const getBucketKey = (ts: number): { key: string; label: string; sortKey: number } => {
      const d = new Date(ts);
      if (range === 'today') {
        const h = d.getHours();
        return { key: `h${h}`, label: `${h}:00`, sortKey: h };
      }
      // For week/month/custom, bucket by date string
      if (range === 'week' || range === 'month' || range === 'custom') {
        const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const label = `${d.getDate()} ${monthNames[d.getMonth()]}`;
        return { key: dateKey, label, sortKey: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() };
      }
      // 'all' — weekly bucketing
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const weekStart = new Date(d);
      const dow = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
      const key = weekStart.toISOString().slice(0, 10);
      const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
      const rangeLabel = sameMonth
        ? `${weekStart.getDate()}–${weekEnd.getDate()} ${monthNames[weekStart.getMonth()]}`
        : `${weekStart.getDate()} ${monthNames[weekStart.getMonth()]}–${weekEnd.getDate()} ${monthNames[weekEnd.getMonth()]}`;
      return { key, label: rangeLabel, sortKey: weekStart.getTime() };
    };

    filtered.forEach(r => {
      const { key, label, sortKey } = getBucketKey(r.timestamp);
      const prev = bucketMap.get(key) || { label, quizzes: 0, hours: 0, questions: 0, ts: r.timestamp, sortKey };
      prev.quizzes++;
      prev.hours = Math.round((prev.hours * 10 + (r.timeTaken / 3600) * 10)) / 10;
      prev.questions += r.totalQuestions;
      bucketMap.set(key, prev);
    });

    // Fill zero-activity days
    if (range === 'today') {
      for (let h = 0; h < 24; h++) {
        const key = `h${h}`;
        if (!bucketMap.has(key)) bucketMap.set(key, { label: `${h}:00`, quizzes: 0, hours: 0, questions: 0, ts: 0, sortKey: h });
      }
    } else if (range === 'week') {
      const now = new Date();
      const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (!bucketMap.has(dateKey)) {
          bucketMap.set(dateKey, { label: `${d.getDate()} ${mNames[d.getMonth()]}`, quizzes: 0, hours: 0, questions: 0, ts: 0, sortKey: d.getTime() });
        }
      }
    } else if (range === 'month') {
      const now = new Date();
      const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(now.getFullYear(), now.getMonth(), day);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (!bucketMap.has(dateKey)) {
          bucketMap.set(dateKey, { label: `${day} ${mNames[d.getMonth()]}`, quizzes: 0, hours: 0, questions: 0, ts: 0, sortKey: d.getTime() });
        }
      }
    } else if (range === 'custom' && customFrom && customTo) {
      const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const start = new Date(customFrom + 'T00:00:00');
      const end = new Date(customTo + 'T00:00:00');
      const cur = new Date(start);
      while (cur <= end) {
        const dateKey = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
        if (!bucketMap.has(dateKey)) {
          bucketMap.set(dateKey, { label: `${cur.getDate()} ${mNames[cur.getMonth()]}`, quizzes: 0, hours: 0, questions: 0, ts: 0, sortKey: cur.getTime() });
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    const sorted = Array.from(bucketMap.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(d => ({ ...d, hours: Math.round(d.hours * 10) / 10 }));

    // Smart date logic: ≤30 points show individual, >30 aggregate into weekly ranges
    if (sorted.length <= 30) return sorted;
    const mN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const bucketSz = 7;
    const sampled: typeof sorted = [];
    for (let i = 0; i < sorted.length; i += bucketSz) {
      const chunk = sorted.slice(i, i + bucketSz);
      const s0 = new Date(chunk[0].sortKey);
      const sE = new Date(chunk[chunk.length - 1].sortKey);
      const sameM = s0.getMonth() === sE.getMonth();
      const rLabel = chunk.length > 1
        ? (sameM ? `${s0.getDate()}–${sE.getDate()} ${mN[s0.getMonth()]}` : `${s0.getDate()} ${mN[s0.getMonth()]}–${sE.getDate()} ${mN[sE.getMonth()]}`)
        : chunk[0].label;
      sampled.push({
        label: rLabel,
        quizzes: chunk.reduce((s, c) => s + c.quizzes, 0),
        hours: Math.round(chunk.reduce((s, c) => s + c.hours, 0) * 10) / 10,
        questions: chunk.reduce((s, c) => s + c.questions, 0),
        ts: chunk[0].ts,
        sortKey: chunk[0].sortKey,
      });
    }
    return sampled;
  }, [filtered, range, customFrom, customTo]);

  const totals = useMemo(() => ({
    quizzes: filtered.length,
    hours: filtered.reduce((a, r) => a + r.timeTaken, 0) / 3600,
    questions: filtered.reduce((a, r) => a + r.totalQuestions, 0),
    avgScore: filtered.length > 0 ? Math.round(filtered.reduce((a, r) => a + r.percentage, 0) / filtered.length) : 0,
  }), [filtered]);

  const prevTotals = useMemo(() => ({
    quizzes: prevFiltered.length,
    hours: prevFiltered.reduce((a, r) => a + r.timeTaken, 0) / 3600,
    questions: prevFiltered.reduce((a, r) => a + r.totalQuestions, 0),
  }), [prevFiltered]);

  const trendPct = (cur: number, prev: number) => {
    if (prev === 0) return null;
    return Math.round(((cur - prev) / prev) * 100);
  };

  const UnifiedTooltip = ({ active, payload, label }: any) => {
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
              {p.dataKey === 'hours' ? fmtDuration(Math.round(Number(p.value) * 3600)) : p.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (filtered.length === 0) return null;

  const summaryCards = [
    {
      label: 'Quizzes',
      value: totals.quizzes,
      color: 'hsl(var(--primary))',
      dotCls: 'bg-primary',
      trend: trendPct(totals.quizzes, prevTotals.quizzes),
    },
    {
      label: 'Study Hours',
      value: fmtDuration(Math.round(totals.hours * 3600)),
      color: '#a855f7',
      dotCls: 'bg-purple-500',
      trend: trendPct(totals.hours, prevTotals.hours),
    },
    {
      label: 'Questions',
      value: totals.questions,
      color: '#10b981',
      dotCls: 'bg-emerald-500',
      trend: trendPct(totals.questions, prevTotals.questions),
    },
  ];

  const maxQuestions = Math.max(...chartData.map(d => d.questions), 1);

  return (
    <>
      <button onClick={onToggle}
        className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 transition-all active:scale-[0.99]">
        <span className="text-xs font-black text-foreground/60 uppercase tracking-widest">📈 Analytics Report</span>
        <span className={`text-foreground/40 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="space-y-3 animate-fade-in -mt-1">
          {/* Summary metric cards */}
          <div className="grid grid-cols-3 gap-2">
            {summaryCards.map(card => (
              <div key={card.label} className="relative overflow-hidden bg-card border border-border rounded-2xl p-3 text-center">
                <div className="absolute inset-0 opacity-[0.06]" style={{ background: `radial-gradient(ellipse at bottom, ${card.color}, transparent 70%)` }} />
                <div className="flex items-center justify-center gap-1.5 mb-1.5">
                  <span className={`w-2 h-2 rounded-full ${card.dotCls}`} />
                  <span className="text-[9px] font-bold text-foreground/40 uppercase tracking-wider">{card.label}</span>
                </div>
                <div className="text-xl font-black text-foreground leading-none">{card.value}</div>
                {card.trend !== null && prevFiltered.length > 0 && (
                  <div className={`mt-1.5 text-[9px] font-bold ${card.trend > 0 ? 'text-emerald-400' : card.trend < 0 ? 'text-red-400' : 'text-foreground/30'}`}>
                    {card.trend > 0 ? `↑ ${card.trend}%` : card.trend < 0 ? `↓ ${Math.abs(card.trend)}%` : '—'}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Unified Combined Chart */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Activity Overview</p>
                <p className="text-[10px] text-foreground/25 mt-0.5">Quizzes · Study Hours · Questions</p>
                {dateRangeLabel && (
                  <span className="inline-block mt-1 text-[9px] font-bold text-primary/70 bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md">
                    📅 {dateRangeLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mb-3 mt-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-1 rounded-full bg-primary block" />
                <span className="text-[9px] text-foreground/40 font-bold">Quizzes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-1 rounded-full bg-purple-500 block" />
                <span className="text-[9px] text-foreground/40 font-bold">Study Hours</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-1 rounded-full bg-emerald-500 block" />
                <span className="text-[9px] text-foreground/40 font-bold">Questions</span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gUnifiedQuiz" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gUnifiedHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gUnifiedQs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 8, fill: 'hsl(var(--foreground) / 0.35)' }}
                  tickLine={false}
                  axisLine={false}
                  interval={chartData.length > 12 ? Math.ceil(chartData.length / 10) - 1 : 0}
                  angle={chartData.length > 14 ? -35 : 0}
                  textAnchor={chartData.length > 14 ? 'end' : 'middle'}
                  height={chartData.length > 14 ? 50 : 30}
                />
                {/* Left axis: Quizzes & Questions */}
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 9, fill: 'hsl(var(--foreground) / 0.3)' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                {/* Right axis: Hours */}
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 9, fill: 'hsl(var(--foreground) / 0.25)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => fmtDuration(Math.round(v * 3600))}
                />
                <Tooltip content={<UnifiedTooltip />} />

                {/* Questions — filled area behind */}
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="questions"
                  name="Questions"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#gUnifiedQs)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, fill: '#10b981', stroke: '#fff' }}
                  animationDuration={1000}
                />

                {/* Study Hours — line on right axis */}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="hours"
                  name="Study Hours"
                  stroke="#a855f7"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#a855f7', strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 2, fill: '#a855f7', stroke: '#fff' }}
                  animationDuration={1000}
                />

                {/* Quizzes — bars on left axis */}
                <Bar
                  yAxisId="left"
                  dataKey="quizzes"
                  name="Quizzes"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  barSize={maxQuestions > 20 ? 8 : 16}
                  opacity={0.7}
                  animationDuration={800}
                />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Avg Score footer */}
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-[9px] font-bold text-foreground/30 uppercase tracking-widest">Avg Score in Period</span>
              <span className={`text-sm font-black ${totals.avgScore >= 80 ? 'text-emerald-400' : totals.avgScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                {totals.avgScore}%
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span className="text-base">{icon}</span>
      </div>
      <h2 className="text-sm font-extrabold text-foreground tracking-tight">{title}</h2>
      <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent ml-1" />
    </div>
  );
}
