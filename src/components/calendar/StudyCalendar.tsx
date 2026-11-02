import { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Flame, Save, CalendarRange } from 'lucide-react';
import { toast } from 'sonner';
import { QuizResult } from '../../types/quiz';
import { formatTime, calculateStreak } from '../../utils/scoring';

interface DayEntry { date: Date; key: string; quizzes: QuizResult[]; avgAcc: number; isStreakDay: boolean; totalTime: number; mood?: string; note?: string; }
interface Props { history: QuizResult[]; externalViewDate?: Date; }

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MOODS = ['😢', '😴', '😐', '😄', '🔥'];
const MOOD_LABELS: Record<string, string> = { '😢': 'Sad', '😴': 'Tired', '😐': 'Neutral', '😄': 'Happy', '🔥': 'Motivated' };

function getMoodData(dateKey: string): { mood?: string; note?: string } {
  try {
    const raw = localStorage.getItem(`qmp_calendar_mood_${dateKey}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveMoodData(dateKey: string, mood?: string, note?: string) {
  try {
    localStorage.setItem(`qmp_calendar_mood_${dateKey}`, JSON.stringify({ mood, note }));
  } catch { /* */ }
}

function accBadge(acc: number) {
  if (acc >= 80) return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-300';
  if (acc >= 60) return 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-300';
  return 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-300';
}

function fmtHours(secs: number) {
  if (secs < 60) return '<1m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`;
}

function isSameDateKey(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ── Weekly Summary Row ── */
function WeeklySummaryRow({ quizzes, hours }: { quizzes: number; hours: number }) {
  if (quizzes === 0) return null;
  return (
    <div className="col-span-7 flex items-center gap-2 px-2 py-1.5 rounded-xl bg-primary/5 border border-primary/10 my-0.5">
      <div className="flex-1 flex items-center gap-3">
        <span className="text-[9px] font-black text-primary/70 uppercase tracking-wider">Week</span>
        <span className="text-[10px] font-bold text-foreground/60">
          📝 {quizzes} quiz{quizzes !== 1 ? 'zes' : ''}
        </span>
        <span className="text-[10px] font-bold text-foreground/60">
          ⏱ {fmtHours(hours)}
        </span>
      </div>
    </div>
  );
}

function MoodSelector({ value, onChange }: { value?: string; onChange: (m: string) => void }) {
  const MOOD_COLORS = ['#ef4444', '#f97316', '#a3a3a3', '#22c55e', '#f59e0b'];
  return (
    <div className="relative">
      {/* Connecting gradient line behind the emojis */}
      <div className="absolute top-5 left-[10%] right-[10%] h-1 rounded-full bg-gradient-to-r from-red-500/40 via-neutral-400/30 to-amber-500/40" />
      <div className="relative flex items-start justify-between">
        {MOODS.map((m, i) => {
          const isActive = value === m;
          return (
            <button key={m} onClick={() => onChange(m)}
              className="flex flex-col items-center gap-1 group relative z-10 transition-all"
              style={{ flex: '1 1 0%' }}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all duration-200 ${
                isActive
                  ? 'scale-125 shadow-lg ring-2 ring-offset-2 ring-offset-card'
                  : 'hover:scale-110'
              }`}
                style={{
                  background: isActive ? `${MOOD_COLORS[i]}20` : 'hsl(var(--foreground) / 0.05)',
                  boxShadow: isActive ? `0 4px 20px ${MOOD_COLORS[i]}30, 0 0 0 2px ${MOOD_COLORS[i]}` : undefined,
                }}
              >
                {m}
              </div>
              <span className={`text-[9px] font-bold transition-colors ${isActive ? 'text-foreground' : 'text-foreground/35'}`}>
                {MOOD_LABELS[m]}
              </span>
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full mt-0.5" style={{ backgroundColor: MOOD_COLORS[i] }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StudyCalendar({ history, externalViewDate }: Props) {
  const [viewDate, setViewDate] = useState(() => new Date());

  // Sync with external view date (from analytics filter sync)
  useEffect(() => {
    if (externalViewDate) {
      setViewDate(new Date(externalViewDate.getFullYear(), externalViewDate.getMonth(), 1));
    }
  }, [externalViewDate]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editMood, setEditMood] = useState<string | undefined>();
  const [editNote, setEditNote] = useState('');
  const [moodRefreshKey, setMoodRefreshKey] = useState(0);

  // Filter mode — the main calendar becomes the date range picker
  const [filterMode, setFilterMode] = useState(false);
  const [pickStep, setPickStep] = useState<'start' | 'end'>('start');
  const [selectingStart, setSelectingStart] = useState<Date | null>(null);
  const [selectingEnd, setSelectingEnd] = useState<Date | null>(null);
  const [activeFilter, setActiveFilter] = useState<{ from: Date; to: Date } | null>(null);

  const toggleFilterMode = useCallback(() => {
    setFilterMode(prev => {
      if (!prev) {
        // Entering filter mode — reset picking state
        setPickStep('start');
        setSelectingStart(null);
        setSelectingEnd(null);
      }
      return !prev;
    });
  }, []);

  const handleCellTapInFilterMode = useCallback((date: Date) => {
    if (pickStep === 'start') {
      setSelectingStart(date);
      setSelectingEnd(null);
      setPickStep('end');
    } else {
      if (selectingStart && date < selectingStart) {
        setSelectingEnd(selectingStart);
        setSelectingStart(date);
      } else {
        setSelectingEnd(date);
      }
      setPickStep('start');
    }
  }, [pickStep, selectingStart]);

  const applyFilter = useCallback(() => {
    if (selectingStart && selectingEnd) {
      setActiveFilter({ from: selectingStart, to: selectingEnd });
    } else if (selectingStart) {
      setActiveFilter({ from: selectingStart, to: selectingStart });
    }
    setFilterMode(false);
  }, [selectingStart, selectingEnd]);

  const clearFilter = useCallback(() => {
    setActiveFilter(null);
    setSelectingStart(null);
    setSelectingEnd(null);
    setPickStep('start');
    setFilterMode(false);
  }, []);

  const applyPreset = useCallback((days: number | 'thisMonth') => {
    const now = new Date();
    let from: Date, to: Date;
    if (days === 'thisMonth') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else {
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      from = new Date(to);
      from.setDate(from.getDate() - days + 1);
    }
    setSelectingStart(from);
    setSelectingEnd(to);
    setActiveFilter({ from, to });
    setPickStep('start');
    setFilterMode(false);
  }, []);

  const filterRange = useMemo(() => {
    if (!activeFilter) return null;
    const from = new Date(activeFilter.from.getFullYear(), activeFilter.from.getMonth(), activeFilter.from.getDate(), 0, 0, 0, 0).getTime();
    const to = new Date(activeFilter.to.getFullYear(), activeFilter.to.getMonth(), activeFilter.to.getDate(), 23, 59, 59, 999).getTime();
    return { from, to };
  }, [activeFilter]);

  const filterBadgeLabel = useMemo(() => {
    if (!activeFilter) return '';
    const s = activeFilter.from;
    const e = activeFilter.to;
    if (isSameDateKey(s, e)) return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()}`;
    return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()}–${s.getMonth() === e.getMonth() ? '' : MONTHS_SHORT[e.getMonth()] + ' '}${e.getDate()}`;
  }, [activeFilter]);

  const filterStats = useMemo(() => {
    if (!filterRange) return null;
    const inRange = history.filter(r => r.timestamp >= filterRange.from && r.timestamp <= filterRange.to);
    if (inRange.length === 0) return { quizzes: 0, hours: 0, avgAcc: 0, best: 0 };
    return {
      quizzes: inRange.length,
      hours: inRange.reduce((s, r) => s + r.timeTaken, 0) / 3600,
      avgAcc: Math.round(inRange.reduce((s, r) => s + r.accuracy, 0) / inRange.length),
      best: Math.max(...inRange.map(r => r.percentage)),
    };
  }, [history, filterRange]);

  // Helper: is a date within the SELECTING range (live preview while picking)
  const isInSelectingRange = useCallback((date: Date) => {
    if (!selectingStart) return false;
    if (!selectingEnd) return isSameDateKey(date, selectingStart);
    const t = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const s = new Date(selectingStart.getFullYear(), selectingStart.getMonth(), selectingStart.getDate()).getTime();
    const e = new Date(selectingEnd.getFullYear(), selectingEnd.getMonth(), selectingEnd.getDate()).getTime();
    return t >= s && t <= e;
  }, [selectingStart, selectingEnd]);

  const isSelectStart = useCallback((date: Date) => selectingStart ? isSameDateKey(date, selectingStart) : false, [selectingStart]);
  const isSelectEnd = useCallback((date: Date) => selectingEnd ? isSameDateKey(date, selectingEnd) : false, [selectingEnd]);

  const quizByDate = useMemo(() => {
    const map = new Map<string, QuizResult[]>();
    history.forEach(r => {
      const k = new Date(r.timestamp).toDateString();
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    return map;
  }, [history]);

  const streakDays = useMemo(() => {
    const set = new Set<string>();
    const toKey = (d: Date) => d.toDateString();
    const daySet = new Set(history.map(r => toKey(new Date(r.timestamp))));
    const check = new Date();
    if (!daySet.has(toKey(check))) check.setDate(check.getDate() - 1);
    while (daySet.has(toKey(check))) { set.add(toKey(check)); check.setDate(check.getDate() - 1); }
    return set;
  }, [history]);

  const streak = useMemo(() => calculateStreak(history.map(r => r.timestamp)), [history]);

  const moodMap = useMemo(() => {
    const map = new Map<string, { mood?: string; note?: string }>();
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = new Date(year, month, d).toDateString();
      const data = getMoodData(key);
      if (data.mood || data.note) map.set(key, data);
    }
    return map;
  }, [viewDate, selectedKey, moodRefreshKey]);

  const calendarDays = useMemo((): (DayEntry | null)[] => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result: (DayEntry | null)[] = [];
    for (let i = 0; i < firstDay; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const key = date.toDateString();
      const quizzes = quizByDate.get(key) || [];
      const avgAcc = quizzes.length ? Math.round(quizzes.reduce((s, r) => s + r.accuracy, 0) / quizzes.length) : 0;
      const isStreakDay = streakDays.has(key);
      const totalTime = quizzes.reduce((s, r) => s + r.timeTaken, 0);
      const md = moodMap.get(key);
      result.push({ date, key, quizzes, avgAcc, isStreakDay, totalTime, mood: md?.mood, note: md?.note });
    }
    return result;
  }, [viewDate, quizByDate, streakDays, moodMap]);

  const selectedQuizzes = useMemo(() => selectedKey ? (quizByDate.get(selectedKey) || []) : [], [selectedKey, quizByDate]);
  const today = new Date().toDateString();
  const totalDaysWithQuizzes = useMemo(() => quizByDate.size, [quizByDate]);
  const monthQuizzes = calendarDays.filter(d => d && d.quizzes.length > 0) as DayEntry[];
  const monthTotal = monthQuizzes.reduce((s, d) => s + d.quizzes.length, 0);
  const monthHours = monthQuizzes.reduce((s, d) => s + d.totalTime, 0);

  const jumpToToday = () => setViewDate(new Date());
  const isCurrentMonth = viewDate.getMonth() === new Date().getMonth() && viewDate.getFullYear() === new Date().getFullYear();

  const handleSelectDay = useCallback((key: string, isSelected: boolean) => {
    if (isSelected) { setSelectedKey(null); return; }
    setSelectedKey(key);
    const md = getMoodData(key);
    setEditMood(md.mood);
    setEditNote(md.note || '');
  }, []);

  const handleSaveMood = useCallback(() => {
    if (!selectedKey) return;
    saveMoodData(selectedKey, editMood, editNote);
    setMoodRefreshKey(k => k + 1);
    toast('✓ Mood saved!');
  }, [selectedKey, editMood, editNote]);

  const weeklyRows = useMemo(() => {
    const rows: { afterIdx: number; quizzes: number; hours: number }[] = [];
    let weekQuizzes = 0, weekHours = 0, cellCount = 0;
    for (let i = 0; i < calendarDays.length; i++) {
      cellCount++;
      const d = calendarDays[i];
      if (d) { weekQuizzes += d.quizzes.length; weekHours += d.totalTime; }
      if (cellCount % 7 === 0) {
        rows.push({ afterIdx: i, quizzes: weekQuizzes, hours: weekHours });
        weekQuizzes = 0; weekHours = 0;
      }
    }
    if (cellCount % 7 !== 0 && (weekQuizzes > 0 || weekHours > 0)) {
      rows.push({ afterIdx: calendarDays.length - 1, quizzes: weekQuizzes, hours: weekHours });
    }
    return rows;
  }, [calendarDays]);

  // Format a date for display chips
  const fmtChip = (d: Date) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;

  return (
    <div className="space-y-4">
      {/* Streak banner */}
      {streak > 0 && (
        <div className="glass-card p-3 flex items-center gap-3 bg-gradient-to-r from-orange-500/10 to-red-500/5 border-orange-500/20">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center flex-shrink-0">
            <Flame className="w-5 h-5 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black text-orange-400">{streak} Day Streak 🔥</div>
            <p className="text-[10px] text-foreground/40 mt-0.5">
              {streak >= 7 ? 'Incredible consistency!' : streak >= 3 ? 'Keep it going!' : 'Building momentum!'}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[9px] text-foreground/30 uppercase tracking-wider">Today</div>
            <div className={`text-sm font-black ${history.some(r => new Date(r.timestamp).toDateString() === today) ? 'text-emerald-400' : 'text-foreground/25'}`}>
              {history.some(r => new Date(r.timestamp).toDateString() === today) ? '✓' : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Month stats (or filtered stats) */}
      <div className="grid grid-cols-4 gap-2">
        {(activeFilter && filterStats ? [
          { label: 'Range Quizzes', value: filterStats.quizzes, color: 'text-primary' },
          { label: 'Range Time', value: fmtHours(Math.round(filterStats.hours * 3600)), color: 'text-violet-500' },
          { label: 'Avg Accuracy', value: `${filterStats.avgAcc}%`, color: 'text-emerald-400' },
          { label: 'Best Score', value: `${filterStats.best}%`, color: 'text-orange-400' },
        ] : [
          { label: 'All-Time Days',  value: totalDaysWithQuizzes, color: 'text-primary'      },
          { label: 'Month Quizzes',  value: monthTotal,           color: 'text-violet-500'   },
          { label: 'Month Time',     value: fmtHours(monthHours), color: 'text-purple-400'   },
          { label: 'Streak',         value: `${streak}d`,         color: 'text-orange-400'   },
        ]).map((s, i) => (
          <div key={i} className="glass-card p-2.5 text-center">
            <div className={`font-black text-sm ${s.color}`}>{s.value}</div>
            <div className="text-[8px] text-foreground/30 uppercase tracking-wider mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="glass-card p-4">
        {/* Month nav header */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="p-2 rounded-xl bg-foreground/5 hover:bg-foreground/10 border border-border transition-colors">
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>

          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent" style={{ fontFamily: "'Georgia', serif" }}>
              {MONTHS[viewDate.getMonth()]} <span className="font-medium text-foreground/40 text-sm">{viewDate.getFullYear()}</span>
            </h3>

            {/* 🗓️ Filter button — centered next to month name */}
            <div className="relative">
              <button
                onClick={toggleFilterMode}
                className={`p-1.5 rounded-lg border transition-all active:scale-90 ${
                  filterMode
                    ? 'bg-primary/25 border-primary/50 text-primary ring-2 ring-primary/30 shadow-md shadow-primary/15'
                    : activeFilter
                      ? 'bg-primary/20 border-primary/40 text-primary shadow-sm shadow-primary/10'
                      : 'bg-foreground/5 border-border text-foreground/50 hover:bg-foreground/10 hover:text-foreground/70'
                }`}
                title="Filter date range"
              >
                <CalendarRange className="w-4 h-4" />
              </button>
              {activeFilter && !filterMode && (
                <span className="absolute -top-2 -right-2 text-[7px] font-black bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap shadow-md pointer-events-none">
                  {filterBadgeLabel}
                </span>
              )}
            </div>

            {!isCurrentMonth && !filterMode && (
              <button onClick={jumpToToday} className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-lg hover:bg-primary/20 transition-all active:scale-95">
                Today
              </button>
            )}
          </div>

          <button onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="p-2 rounded-xl bg-foreground/5 hover:bg-foreground/10 border border-border transition-colors">
            <ChevronRight className="w-4 h-4 text-foreground" />
          </button>
        </div>

        {/* ── Filter Mode Instruction Strip (inline, above calendar grid) ── */}
        {filterMode && (
          <div className="mb-3 space-y-2 animate-fade-in">
            {/* Instruction + date chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black text-primary/80">
                📅 {pickStep === 'start' ? 'Tap start date' : 'Tap end date'}
              </span>
              <span className="text-foreground/20">→</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                selectingStart ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-foreground/5 border-border text-foreground/30'
              }`}>
                {selectingStart ? fmtChip(selectingStart) : 'Start'}
              </span>
              <span className="text-foreground/20 text-[10px]">→</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                selectingEnd ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-foreground/5 border-border text-foreground/30'
              }`}>
                {selectingEnd ? fmtChip(selectingEnd) : 'End'}
              </span>
            </div>

            {/* Quick presets + Apply/Clear */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { label: '7D', val: 7 as number | 'thisMonth' },
                { label: '15D', val: 15 as number | 'thisMonth' },
                { label: '30D', val: 30 as number | 'thisMonth' },
                { label: 'Month', val: 'thisMonth' as number | 'thisMonth' },
              ]).map(p => (
                <button key={p.label} onClick={() => applyPreset(p.val)}
                  className="text-[9px] font-bold px-2 py-1 rounded-lg bg-foreground/5 border border-border text-foreground/50 hover:border-primary/30 hover:bg-primary/10 hover:text-primary transition-all active:scale-95">
                  {p.label}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={applyFilter}
                disabled={!selectingStart}
                className="text-[9px] font-bold px-3 py-1 rounded-lg bg-primary text-primary-foreground disabled:opacity-30 transition-all active:scale-95"
              >
                ✓ Apply
              </button>
              {activeFilter && (
                <button onClick={clearFilter}
                  className="text-[9px] font-bold px-2.5 py-1 rounded-lg border border-destructive/30 text-destructive/60 hover:text-destructive transition-all active:scale-95">
                  Clear
                </button>
              )}
              <button onClick={() => setFilterMode(false)}
                className="text-[9px] font-bold px-2 py-1 rounded-lg border border-border text-foreground/40 hover:text-foreground/70 transition-all active:scale-95">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Filter summary strip (when applied & filter mode is OFF) */}
        {activeFilter && !filterMode && (
          <div className="mb-3 flex items-center gap-2 flex-wrap px-2.5 py-2 rounded-xl bg-primary/8 border border-primary/20 animate-fade-in">
            <CalendarRange className="w-3 h-3 text-primary/60 flex-shrink-0" />
            <span className="text-[10px] font-black text-primary/80">{filterBadgeLabel}</span>
            {filterStats && (
              <>
                <span className="text-foreground/15">|</span>
                <span className="text-[10px] text-foreground/50 font-bold">📝 {filterStats.quizzes}</span>
                <span className="text-[10px] text-foreground/50 font-bold">⏱ {fmtHours(Math.round(filterStats.hours * 3600))}</span>
                <span className="text-[10px] text-foreground/50 font-bold">🎯 {filterStats.avgAcc}%</span>
                <span className="text-[10px] text-foreground/50 font-bold">🏆 {filterStats.best}%</span>
              </>
            )}
            <button onClick={clearFilter} className="ml-auto text-[9px] font-bold text-destructive/60 hover:text-destructive transition-colors flex items-center gap-0.5">
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
        )}

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map(d => <div key={d} className="text-center text-[9px] font-bold text-foreground/30 uppercase tracking-wider py-1">{d}</div>)}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {(() => {
            const elements: React.ReactNode[] = [];
            let cellIdx = 0;
            for (let i = 0; i < calendarDays.length; i++) {
              const day = calendarDays[i];
              if (!day) {
                elements.push(<div key={`e-${i}`} />);
              } else {
                const isToday = day.key === today;
                const isSelected = selectedKey === day.key;
                const hasQ = day.quizzes.length > 0;
                const hasMood = !!day.mood;
                const isDimmed = filterRange && !filterMode ? (day.date.getTime() < filterRange.from || day.date.getTime() > filterRange.to) : false;

                // Filter mode: highlight selecting range on main cells
                const inPickRange = filterMode && isInSelectingRange(day.date);
                const isPickStart = filterMode && isSelectStart(day.date);
                const isPickEnd = filterMode && isSelectEnd(day.date);
                const isFuture = day.date > new Date();

                const handleClick = () => {
                  if (filterMode) {
                    if (!isFuture) handleCellTapInFilterMode(day.date);
                    return;
                  }
                  handleSelectDay(day.key, isSelected);
                };

                elements.push(
                  <button key={day.key} onClick={handleClick}
                    disabled={filterMode && isFuture}
                    className={`aspect-square flex flex-col items-center justify-center rounded-xl border text-xs transition-all relative overflow-hidden
                      ${filterMode && isFuture ? 'opacity-20 cursor-not-allowed' : ''}
                      ${isDimmed ? 'opacity-25' : ''}
                      ${/* Filter mode range highlighting */''}
                      ${isPickStart || isPickEnd ? 'bg-primary text-primary-foreground ring-2 ring-primary/50 shadow-lg shadow-primary/20 z-10 border-primary' : ''}
                      ${inPickRange && !isPickStart && !isPickEnd ? 'bg-primary/20 border-primary/30' : ''}
                      ${/* Normal mode styling (only when NOT filter-highlighted) */''}
                      ${!filterMode && isSelected ? 'ring-2 ring-primary scale-105 z-10' : ''}
                      ${!isPickStart && !isPickEnd && !inPickRange && isToday && !hasQ ? 'ring-1 ring-foreground/20' : ''}
                      ${!isPickStart && !isPickEnd && !inPickRange && day.isStreakDay && hasQ ? 'ring-1 ring-orange-500/30' : ''}
                      ${!isPickStart && !isPickEnd && !inPickRange ? (hasQ ? accBadge(day.avgAcc) : 'border-transparent text-foreground/35 hover:bg-foreground/5') : ''}
                      ${!isPickStart && !isPickEnd && !inPickRange && hasQ ? 'shadow-sm' : ''}
                      ${filterMode ? 'cursor-pointer active:scale-90' : ''}`}
                    style={!isPickStart && !isPickEnd && !inPickRange && hasQ ? { textShadow: '0 0 8px rgba(255,255,255,0.15)' } : undefined}>
                    <span className={`leading-none ${
                      isPickStart || isPickEnd ? 'font-black text-[14px]'
                      : isToday ? 'text-foreground font-black text-[14px]'
                      : hasQ ? 'font-black text-[13px]'
                      : 'font-semibold text-[12px]'
                    }`}>
                      {day.date.getDate()}
                    </span>
                    {/* Only show mood/activity indicators when NOT in filter picking mode */}
                    {!isPickStart && !isPickEnd && (
                      <>
                        {hasMood && hasQ ? (
                          <div className="flex items-center gap-0.5 mt-0.5">
                            <span className="text-[8px] leading-none">{day.mood}</span>
                            <span className="text-[7px] font-black leading-none bg-primary/30 text-primary rounded-full w-3.5 h-3.5 flex items-center justify-center">{day.quizzes.length}</span>
                          </div>
                        ) : hasMood ? (
                          <span className="text-[8px] leading-none mt-0.5">{day.mood}</span>
                        ) : hasQ ? (
                          <div className="flex gap-0.5 mt-0.5">
                            {day.isStreakDay
                              ? <span className="text-[7px] leading-none">🔥</span>
                              : day.quizzes.slice(0, 3).map((_, qi) => (
                                <span key={qi} className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                              ))
                            }
                          </div>
                        ) : null}
                        {hasQ && (
                          <span className="text-[6px] font-bold text-current/60 leading-none mt-0.5 whitespace-nowrap">
                            {day.quizzes.length}q·{fmtHours(day.totalTime)}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              }
              cellIdx++;
              if (cellIdx % 7 === 0) {
                const weekRow = weeklyRows.find(w => w.afterIdx === i);
                if (weekRow) {
                  elements.push(<WeeklySummaryRow key={`week-${i}`} quizzes={weekRow.quizzes} hours={weekRow.hours} />);
                }
              }
            }
            if (cellIdx % 7 !== 0) {
              const weekRow = weeklyRows.find(w => w.afterIdx === calendarDays.length - 1);
              if (weekRow) {
                elements.push(<WeeklySummaryRow key="week-last" quizzes={weekRow.quizzes} hours={weekRow.hours} />);
              }
            }
            return elements;
          })()}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-border text-[9px] text-foreground/40">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/40 block" />≥80%</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/15 border border-amber-500/40 block" />60–79%</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/10 border border-red-500/30 block" />&lt;60%</span>
          <span className="flex items-center gap-1">🔥 Streak</span>
          <span className="flex items-center gap-1">😄 Mood</span>
        </div>
      </div>

      {/* Day detail panel — only when NOT in filter mode */}
      {selectedKey && !filterMode && (
        <div className="glass-card p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-foreground">
              📅 {new Date(selectedKey).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <button onClick={() => setSelectedKey(null)} className="text-foreground/30 hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {selectedQuizzes.length === 0 ? (
            <p className="text-foreground/30 text-sm text-center py-4">No quizzes on this day.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-foreground/5 rounded-xl p-2.5 text-center border border-border">
                  <div className="text-primary font-black text-lg">{selectedQuizzes.length}</div>
                  <div className="text-[9px] text-foreground/30 uppercase">Quizzes</div>
                </div>
                <div className="bg-foreground/5 rounded-xl p-2.5 text-center border border-border">
                  <div className="text-emerald-500 font-black text-lg">
                    {Math.round(selectedQuizzes.reduce((s, r) => s + r.accuracy, 0) / selectedQuizzes.length)}%
                  </div>
                  <div className="text-[9px] text-foreground/30 uppercase">Avg Accuracy</div>
                </div>
                <div className="bg-foreground/5 rounded-xl p-2.5 text-center border border-border">
                  <div className="text-violet-500 font-black text-lg">{formatTime(selectedQuizzes.reduce((s, r) => s + r.timeTaken, 0))}</div>
                  <div className="text-[9px] text-foreground/30 uppercase">Time Spent</div>
                </div>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto thin-scrollbar">
                {selectedQuizzes.map((r, i) => (
                  <div key={i} className="bg-foreground/5 rounded-xl p-3 border border-border">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <span className="text-xs font-bold text-foreground line-clamp-1">
                        {r.quizTitle || r.quizData?.[0]?.question?.slice(0, 45) || 'Quiz'}
                      </span>
                      <span className={`text-sm font-black shrink-0 ${r.percentage >= 70 ? 'text-emerald-500' : r.percentage >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                        {r.percentage}%
                      </span>
                    </div>
                    <div className="flex gap-3 text-[10px]">
                      <span className="text-emerald-500 font-bold">✓{r.correct}</span>
                      <span className="text-red-500 font-bold">✗{r.wrong}</span>
                      <span className="text-amber-500 font-bold">⏭{r.skipped}</span>
                      {r.subject && <span className="text-primary">🏷 {r.subject}</span>}
                      <span className="text-foreground/30 ml-auto">{formatTime(r.timeTaken)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Mood & Notes */}
          <div className="mt-4 pt-4 border-t border-border space-y-3">
            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">💭 Mood & Notes</p>
            <MoodSelector value={editMood} onChange={m => setEditMood(prev => prev === m ? undefined : m)} />
            <textarea
              value={editNote}
              onChange={e => setEditNote(e.target.value)}
              placeholder="How was your study day? Any thoughts..."
              className="w-full bg-foreground/5 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/25 resize-none focus:outline-none focus:border-primary/40 transition-colors"
              rows={3}
            />
            <button
              onClick={handleSaveMood}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/15 border border-primary/25 text-primary text-xs font-bold transition-all active:scale-95 hover:bg-primary/25"
            >
              <Save className="w-3.5 h-3.5" /> Save Mood & Notes
            </button>
            {(editMood || editNote) && getMoodData(selectedKey).mood === editMood && getMoodData(selectedKey).note === editNote && (
              <p className="text-[10px] text-emerald-400 font-bold">✓ Saved</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
