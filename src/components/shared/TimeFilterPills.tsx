import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Calendar, Clock, Infinity as InfinityIcon, CalendarDays, CalendarRange, ChevronDown, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type TimeRange = 'today' | 'week' | 'month' | 'all' | 'custom';

interface PillConfig {
  key: TimeRange;
  label: string;
  icon: typeof Clock;
  gradient: string;
  activeGlow: string;
  backGradient: string;
}

const PILLS: PillConfig[] = [
  { key: 'today', label: 'Today', icon: Clock, gradient: 'from-sky-500/20 to-cyan-500/10', activeGlow: 'shadow-sky-500/25', backGradient: 'from-sky-500/25 to-cyan-500/15' },
  { key: 'week', label: 'Week', icon: CalendarDays, gradient: 'from-violet-500/20 to-purple-500/10', activeGlow: 'shadow-violet-500/25', backGradient: 'from-violet-500/25 to-purple-500/15' },
  { key: 'month', label: 'Month', icon: CalendarRange, gradient: 'from-amber-500/20 to-orange-500/10', activeGlow: 'shadow-amber-500/25', backGradient: 'from-amber-500/25 to-orange-500/15' },
  { key: 'all', label: 'All Time', icon: InfinityIcon, gradient: 'from-emerald-500/20 to-teal-500/10', activeGlow: 'shadow-emerald-500/25', backGradient: 'from-emerald-500/25 to-teal-500/15' },
  { key: 'custom', label: 'Custom', icon: Calendar, gradient: 'from-rose-500/20 to-pink-500/10', activeGlow: 'shadow-rose-500/25', backGradient: 'from-rose-500/25 to-pink-500/15' },
];

/* ── Dynamic Week Options ── */
function generateWeekOptions(): { label: string; value: number }[] {
  const now = new Date();
  const result: { label: string; value: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const ref = new Date(now);
    ref.setDate(ref.getDate() - i * 7);
    const dow = ref.getDay();
    const diff = dow === 0 ? 6 : dow - 1;
    const ws = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - diff);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const label = i === 0 ? `${fmt(ws)} – ${fmt(we)} (This Week)` : `${fmt(ws)} – ${fmt(we)}`;
    result.push({ label, value: i });
  }
  return result;
}

/* ── Dynamic Month Options ── */
function generateMonthOptions(earliestTs?: number): { label: string; value: string }[] {
  const now = new Date();
  const MNAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let sy: number, sm: number;
  if (earliestTs) {
    const d = new Date(earliestTs);
    sy = d.getFullYear(); sm = d.getMonth();
  } else {
    sy = now.getFullYear(); sm = Math.max(0, now.getMonth() - 5);
  }
  const endDate = new Date(now.getFullYear(), now.getMonth() + 3, 1);
  const opts: { label: string; value: string }[] = [];
  let y = sy, m = sm;
  while (new Date(y, m, 1) < endDate) {
    const value = `${y}-${String(m + 1).padStart(2, '0')}`;
    const isCurrent = y === now.getFullYear() && m === now.getMonth();
    const label = isCurrent ? `${MNAMES[m]} ${y} (This Month)` : `${MNAMES[m]} ${y}`;
    opts.push({ label, value });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return opts;
}

/* ── Back-face label ── */
function getBackLabel(key: TimeRange, weekIdx: number, month: string, totalCount?: number, cFrom?: string, cTo?: string): string {
  const now = new Date();
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  switch (key) {
    case 'today': return fmt(now);
    case 'week': {
      const ref = new Date(now); ref.setDate(ref.getDate() - weekIdx * 7);
      const dow = ref.getDay(); const diff = dow === 0 ? 6 : dow - 1;
      const ws = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - diff);
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      return `${fmt(ws)} – ${fmt(we)}`;
    }
    case 'month': {
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const [y, m] = month.split('-').map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
      return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    case 'all': return totalCount !== undefined ? `${totalCount} quizzes` : 'All data';
    case 'custom': {
      if (cFrom && cTo) return `${fmt(new Date(cFrom + 'T00:00:00'))} – ${fmt(new Date(cTo + 'T00:00:00'))}`;
      return 'Select dates';
    }
    default: return '';
  }
}

/* ═══════════════════════════════════════════
   Props
   ═══════════════════════════════════════════ */
export interface Props {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  weekIndex?: number;
  onWeekIndexChange?: (idx: number) => void;
  selectedMonth?: string;
  onSelectedMonthChange?: (month: string) => void;
  customFrom?: string;
  customTo?: string;
  onCustomFromChange?: (v: string) => void;
  onCustomToChange?: (v: string) => void;
  earliestDataTimestamp?: number;
  totalQuizCount?: number;
  onRangeChange?: (range: TimeRange, details: { month?: Date; weekStart?: Date; customFrom?: string }) => void;
}

/* ═══════════════════════════════════════════
   3D Flip Pill
   ═══════════════════════════════════════════ */
function FlipPill({ pill, active, onClick, backLabel, hasDropdown, dropdownOpen, onDropdownToggle }: {
  pill: PillConfig; active: boolean; onClick: () => void; backLabel: string;
  hasDropdown?: boolean; dropdownOpen?: boolean; onDropdownToggle?: () => void;
}) {
  const Icon = pill.icon;
  const handleClick = () => {
    if (active && hasDropdown) { onDropdownToggle?.(); return; }
    onClick();
  };

  return (
    <div className="relative" style={{ perspective: '900px' }}>
      <motion.button
        onClick={handleClick}
        className="relative select-none block"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: active ? 180 : 0, scale: active ? 1.04 : 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        whileTap={{ scale: 0.92 }}
      >
        {/* Front Face */}
        <div
          className={`
            relative flex flex-col items-center justify-center gap-1.5 min-w-[76px] min-h-[72px] px-2
            rounded-2xl border-2 transition-colors duration-300 overflow-hidden
            ${active
              ? `bg-gradient-to-b ${pill.gradient} border-primary/40 shadow-lg ${pill.activeGlow}`
              : 'bg-card border-border hover:border-foreground/15 hover:bg-card'
            }
          `}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {active && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-primary/10 blur-xl" />
            </div>
          )}
          <Icon className={`w-6 h-6 transition-colors duration-200 ${active ? 'text-primary' : 'text-foreground/35'}`} strokeWidth={active ? 2.2 : 1.8} />
          <span className={`text-xs font-bold tracking-tight leading-none transition-colors duration-200 ${active ? 'text-foreground' : 'text-foreground/45'}`}>
            {pill.label}
          </span>
        </div>

        {/* Back Face */}
        <div
          className={`
            absolute inset-0 flex flex-col items-center justify-center gap-0.5 min-w-[76px] min-h-[72px] px-1.5
            rounded-2xl border-2 overflow-hidden
            bg-gradient-to-b ${pill.backGradient} border-primary/50 shadow-lg ${pill.activeGlow}
          `}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-14 h-14 rounded-full bg-primary/10 blur-2xl" />
          </div>
          <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary shadow-sm shadow-primary/50 animate-pulse" />
          <span className="text-[7px] font-black text-primary/50 uppercase tracking-[0.18em] leading-none">{pill.label}</span>
          <span className="text-[11px] font-black text-foreground leading-tight text-center px-0.5 line-clamp-2">{backLabel}</span>
          {hasDropdown && (
            <ChevronDown className={`absolute bottom-1 w-3 h-3 text-primary/50 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
          )}
        </div>
      </motion.button>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Dropdown Panel
   ═══════════════════════════════════════════ */
function DropdownPanel<T extends string | number>({ options, value, onChange, onClose, title }: {
  options: { label: string; value: T }[]; value: T;
  onChange: (v: T) => void; onClose: () => void; title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="bg-card border border-border rounded-2xl shadow-2xl shadow-black/25 p-2 min-w-[260px]"
    >
      <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-border">
        <span className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">{title || 'Select Range'}</span>
        <button onClick={onClose} className="w-5 h-5 rounded-lg bg-foreground/5 flex items-center justify-center hover:bg-foreground/10 transition-colors">
          <X className="w-3 h-3 text-foreground/40" />
        </button>
      </div>
      <div className="space-y-0.5 max-h-[280px] overflow-y-auto thin-scrollbar">
        {options.map(opt => (
          <button
            key={String(opt.value)}
            onClick={() => { onChange(opt.value); onClose(); }}
            className={`w-full text-left text-xs font-semibold py-2.5 px-3 rounded-xl transition-all ${
              value === opt.value
                ? 'bg-primary/15 text-primary border border-primary/25'
                : 'text-foreground/60 hover:bg-foreground/5 border border-transparent'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════ */
export default function TimeFilterPills({
  value, onChange,
  weekIndex = 0, onWeekIndexChange,
  selectedMonth, onSelectedMonthChange,
  customFrom = '', customTo = '', onCustomFromChange, onCustomToChange,
  earliestDataTimestamp, totalQuizCount,
  onRangeChange,
}: Props) {
  const [weekDropdownOpen, setWeekDropdownOpen] = useState(false);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);

  const effectiveMonth = useMemo(() => {
    if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) return selectedMonth;
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedMonth]);

  const weekOptions = useMemo(() => generateWeekOptions(), []);
  const monthOptions = useMemo(() => generateMonthOptions(earliestDataTimestamp), [earliestDataTimestamp]);

  const closeAll = useCallback(() => { setWeekDropdownOpen(false); setMonthDropdownOpen(false); }, []);

  const fireRangeChange = useCallback((range: TimeRange, wIdx?: number, mStr?: string, cf?: string) => {
    if (!onRangeChange) return;
    const now = new Date();
    if (range === 'month') {
      const ms = mStr || effectiveMonth;
      const [y, m] = ms.split('-').map(Number);
      onRangeChange(range, { month: new Date(y, m - 1, 1) });
    } else if (range === 'week') {
      const idx = wIdx ?? weekIndex;
      const dow = now.getDay(); const diff = dow === 0 ? 6 : dow - 1;
      const ws = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff - idx * 7);
      onRangeChange(range, { weekStart: ws });
    } else if (range === 'custom') {
      onRangeChange(range, { customFrom: cf || customFrom });
    } else {
      onRangeChange(range, {});
    }
  }, [onRangeChange, effectiveMonth, weekIndex, customFrom]);

  const handlePillClick = (key: TimeRange) => {
    closeAll();
    onChange(key);
    fireRangeChange(key);
  };

  const handleWeekChange = (idx: number) => {
    onWeekIndexChange?.(idx);
    fireRangeChange('week', idx);
  };

  const handleMonthChange = (month: string) => {
    onSelectedMonthChange?.(month);
    fireRangeChange('month', undefined, month);
  };

  const anyDropdownOpen = weekDropdownOpen || monthDropdownOpen;

  return (
    <div className="relative" style={{ zIndex: anyDropdownOpen ? 50 : 2 }}>
      {/* Pills Row — NO overflow clipping so dropdowns can escape */}
      <div className="flex gap-2 pb-1 -mx-1 px-1 overflow-x-auto no-scrollbar" style={{ overflow: 'visible' }}>
        {PILLS.map(pill => {
          const isWeek = pill.key === 'week';
          const isMonth = pill.key === 'month';
          const hasDropdown = (isWeek && !!onWeekIndexChange) || (isMonth && !!onSelectedMonthChange);
          const dropdownOpen = (isWeek && weekDropdownOpen) || (isMonth && monthDropdownOpen);
          const backLabel = getBackLabel(pill.key, weekIndex, effectiveMonth, totalQuizCount, customFrom, customTo);

          return (
            <div key={pill.key} className="relative flex-shrink-0">
              <FlipPill
                pill={pill}
                active={value === pill.key}
                onClick={() => handlePillClick(pill.key)}
                backLabel={backLabel}
                hasDropdown={hasDropdown}
                dropdownOpen={dropdownOpen}
                onDropdownToggle={() => {
                  if (isWeek) { setMonthDropdownOpen(false); setWeekDropdownOpen(o => !o); }
                  if (isMonth) { setWeekDropdownOpen(false); setMonthDropdownOpen(o => !o); }
                }}
              />
            </div>
          );
        })}
      </div>

      {/* ── Dropdowns rendered OUTSIDE the scroll container ── */}
      <AnimatePresence>
        {weekDropdownOpen && onWeekIndexChange && (
          <div className="absolute left-0 right-0 mt-2" style={{ zIndex: 100 }}>
            <DropdownPanel
              options={weekOptions}
              value={weekIndex}
              onChange={handleWeekChange}
              onClose={() => setWeekDropdownOpen(false)}
              title="Select Week"
            />
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {monthDropdownOpen && onSelectedMonthChange && (
          <div className="absolute left-0 right-0 mt-2" style={{ zIndex: 100 }}>
            <DropdownPanel
              options={monthOptions}
              value={effectiveMonth}
              onChange={handleMonthChange}
              onClose={() => setMonthDropdownOpen(false)}
              title="Select Month"
            />
          </div>
        )}
      </AnimatePresence>

      {/* Custom Date Range */}
      <AnimatePresence>
        {value === 'custom' && onCustomFromChange && onCustomToChange && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden mt-3"
          >
            <div className="flex gap-3 bg-card border border-border rounded-2xl p-4">
              <div className="flex-1">
                <label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1.5 block">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => { onCustomFromChange(e.target.value); fireRangeChange('custom', undefined, undefined, e.target.value); }}
                  className="w-full bg-foreground/5 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1.5 block">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => onCustomToChange(e.target.value)}
                  className="w-full bg-foreground/5 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
