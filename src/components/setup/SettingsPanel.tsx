import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Target, Zap, Info, Clock, Timer, AlarmClock, BookOpen, Sparkles } from 'lucide-react';
import { QuizSettings } from '../../types/quiz';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@project/components/ui/select';

interface SettingsPanelProps {
  settings: QuizSettings;
  onChange: (s: QuizSettings) => void;
  /** When true, wraps each settings group in a collapsible accordion */
  collapsible?: boolean;
}

// ─── Slider ──────────────────────────────────────────────────────────────────
function PremiumSlider({ value, min, max, step, onChange, accentClass = 'bg-primary' }: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; accentClass?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const isDestructive = accentClass.includes('destructive') || accentClass.includes('red');

  const computeValue = useCallback((clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const raw = min + (x / rect.width) * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(parseFloat(Math.max(min, Math.min(max, stepped)).toFixed(4)));
  }, [min, max, step, onChange]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
      computeValue(x);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, computeValue]);

  return (
    <div className="pt-2 pb-1 select-none">
      <div
        ref={trackRef}
        className="relative w-full h-2 bg-foreground/10 rounded-full cursor-pointer"
        onMouseDown={e => { setDragging(true); computeValue(e.clientX); }}
        onTouchStart={e => { setDragging(true); computeValue(e.touches[0].clientX); }}
      >
        <div className={`absolute left-0 top-0 h-full rounded-full ${accentClass}`} style={{ width: `${pct}%` }} />
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-lg border-2 transition-transform cursor-grab active:cursor-grabbing ${isDestructive ? 'border-destructive' : 'border-primary'} ${dragging ? 'scale-125' : 'scale-100 hover:scale-110'}`}
          style={{ left: `calc(${pct}% - 10px)` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-foreground/20 mt-1 font-mono">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

// ─── Preset chips ─────────────────────────────────────────────────────────────
function Presets({ values, current, onSelect, isCustom, onCustom, format = (v: number) => String(v), hideCustom }: {
  values: number[]; current: number; onSelect: (v: number) => void;
  isCustom: boolean; onCustom: () => void; format?: (v: number) => string; hideCustom?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {values.map(v => (
        <button key={v} onClick={() => onSelect(v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all ${
            !isCustom && current === v
              ? 'bg-primary/20 border-primary/40 text-primary-foreground shadow-md scale-105'
              : 'bg-foreground/[0.04] border-foreground/10 text-foreground/60 hover:border-foreground/25 hover:text-foreground hover:bg-foreground/[0.08]'
          }`}
        >{format(v)}</button>
      ))}
      {!hideCustom && (
        <button onClick={onCustom}
          className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all ${
            isCustom
              ? 'bg-purple-600 border-purple-400 text-white shadow-md shadow-purple-900/40 scale-105'
              : 'bg-foreground/[0.04] border-foreground/10 text-foreground/50 hover:border-purple-400/40 hover:text-purple-300'
          }`}
        >Custom</button>
      )}
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} role="switch" aria-checked={checked}
      className={`relative w-12 h-6 rounded-full border-2 transition-all flex-shrink-0 focus:outline-none ${
        checked ? 'bg-primary border-primary/70 shadow-lg shadow-primary/30' : 'bg-foreground/10 border-foreground/20'
      }`}
    >
      <span className={`absolute w-4 h-4 bg-white rounded-full top-0.5 shadow-md transition-all ${checked ? 'left-[26px]' : 'left-0.5'}`} />
    </button>
  );
}

// ─── Score Preview ────────────────────────────────────────────────────────────
function ScorePreview({ settings }: { settings: QuizSettings }) {
  const exQ = 10;
  const gain = (settings.marksPerQuestion * exQ).toFixed(1);
  const pen = settings.negativeMarking ? (settings.negativeMarks * exQ).toFixed(2) : '0';
  return (
    <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-xl">
      <div className="flex items-center gap-1.5 mb-2">
        <Info className="w-3 h-3 text-primary" />
        <span className="text-[9px] font-black text-foreground/40 uppercase tracking-widest">Score preview (10 Qs)</span>
      </div>
      <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
        <span className="text-emerald-400">+{gain} gain</span>
        {settings.negativeMarking && <><span className="text-foreground/30">−</span><span className="text-red-400">{pen} penalty</span></>}
        <span className="text-foreground/30">=</span>
        <span className="text-foreground font-black">
          {settings.negativeMarking
            ? Math.max(0, parseFloat(gain) - parseFloat(pen)).toFixed(2)
            : gain} net
        </span>
      </div>
    </div>
  );
}

// ─── Styled Select ────────────────────────────────────────────────────────────
function DarkSelect({ value, onValueChange, options, compact }: {
  value: string; onValueChange: (v: string) => void;
  options: { value: string; label: string }[]; compact?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={`${compact ? 'flex-1 min-w-0' : 'w-full'} h-auto ${compact ? 'py-2.5 px-3' : 'py-3.5 px-4'} bg-foreground/[0.06] border-foreground/[0.08] text-foreground text-sm rounded-xl focus:ring-primary focus:ring-1 focus:border-primary hover:bg-foreground/[0.08] transition-colors`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-card border-border text-foreground shadow-2xl">
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} className="text-foreground/80 hover:text-foreground focus:bg-foreground/10 focus:text-foreground cursor-pointer py-2.5">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Timer Mode Segment ───────────────────────────────────────────────────────
function TimerModeSegment({ value, onChange }: {
  value: QuizSettings['timerMode'];
  onChange: (v: QuizSettings['timerMode']) => void;
}) {
  const modes: { val: QuizSettings['timerMode']; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { val: 'off',          label: 'Off',          Icon: ({ className }) => <span className={className}>📵</span> },
    { val: 'per-question', label: 'Per Question',  Icon: Timer },
    { val: 'total',        label: 'Total Quiz',    Icon: AlarmClock },
  ];
  return (
    <div className="flex gap-0.5 bg-foreground/[0.04] rounded-xl p-0.5 border border-foreground/[0.06]">
      {modes.map(({ val, label, Icon }) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] text-[11px] font-black border transition-all leading-none ${
            value === val
              ? 'bg-primary/15 border-primary/25 text-foreground shadow-sm'
              : 'bg-transparent border-transparent text-foreground/35 hover:text-foreground/60 hover:bg-foreground/[0.04]'
          }`}
        >
          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[10px] sm:text-[11px] truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Training Rationale 4-Pill ────────────────────────────────────────────────
type TrainingRationaleMode = 'off' | 'book' | 'ai' | 'both';
const RATIONALE_MODE_KEY = 'qmp_training_rationale';

interface RationaleModeOpt {
  val: TrainingRationaleMode;
  emoji: string;
  label: string;
  activeBg: string;
  activeBorder: string;
  activeText: string;
}
const RATIONALE_MODE_OPTS: RationaleModeOpt[] = [
  { val: 'off',  emoji: '🙈', label: 'Off',  activeBg: 'bg-foreground/10',  activeBorder: 'border-foreground/30',  activeText: 'text-foreground/75' },
  { val: 'book', emoji: '📖', label: 'Book', activeBg: 'bg-amber-500/20',   activeBorder: 'border-amber-400/50',   activeText: 'text-amber-300'  },
  { val: 'ai',   emoji: '💡', label: 'AI',   activeBg: 'bg-violet-500/20',  activeBorder: 'border-violet-400/50',  activeText: 'text-violet-300' },
  { val: 'both', emoji: '✨', label: 'Both', activeBg: 'bg-primary/20',     activeBorder: 'border-primary/50',     activeText: 'text-primary'    },
];

function TrainingFeedbackCard({
  settings,
  set,
}: {
  settings: QuizSettings;
  set: (patch: Partial<QuizSettings>) => void;
}) {
  const [rationaleMode, setRationaleModeState] = useState<TrainingRationaleMode>(() => {
    try { return (localStorage.getItem(RATIONALE_MODE_KEY) as TrainingRationaleMode) || 'both'; }
    catch { return 'both'; }
  });

  const setRationaleMode = (mode: TrainingRationaleMode) => {
    setRationaleModeState(mode);
    try { localStorage.setItem(RATIONALE_MODE_KEY, mode); } catch {}
  };

  const activeOpt = RATIONALE_MODE_OPTS.find(o => o.val === rationaleMode)!;

  return (
    <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="text-sm font-black text-amber-300">Feedback Popup</span>
        <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full font-bold flex-shrink-0">⚡ Training Mode</span>
      </div>

      {/* ── Rationale Selector ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3 h-3 text-foreground/30" />
            <span className="text-[9px] font-black text-foreground/30 uppercase tracking-widest">Rationale</span>
          </div>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all ${activeOpt.activeBg} ${activeOpt.activeBorder} ${activeOpt.activeText}`}>
            {activeOpt.emoji} {activeOpt.label} active
          </span>
        </div>
        <div className="flex bg-foreground/[0.05] rounded-2xl p-1 border border-foreground/[0.07] gap-1">
          {RATIONALE_MODE_OPTS.map(opt => {
            const isActive = rationaleMode === opt.val;
            return (
              <button
                key={opt.val}
                onClick={() => setRationaleMode(opt.val)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl border transition-all duration-200 select-none focus:outline-none active:scale-95 ${
                  isActive
                    ? `${opt.activeBg} ${opt.activeBorder} ${opt.activeText} shadow-md`
                    : 'bg-transparent border-transparent text-foreground/22 hover:bg-foreground/[0.04] hover:text-foreground/45'
                }`}
              >
                <span className={`leading-none transition-all duration-200 ${isActive ? 'text-base' : 'text-sm'}`}>
                  {opt.emoji}
                </span>
                <span className={`text-[9px] font-black uppercase tracking-wider leading-none mt-0.5 ${isActive ? 'opacity-100' : 'opacity-50'}`}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Auto-Advance Delay + Mark (2-col grid) ── */}
      <div className="grid grid-cols-2 gap-3">

        {/* Left: Auto-Advance Delay */}
        <div>
          <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">Auto-Advance Delay</p>
          <div className="flex flex-wrap gap-1">
            {[0, 2, 3, 5, 8, 10].map(s => (
              <button
                key={s}
                onClick={() => set({ instantFeedbackDelay: s })}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-black border transition-all ${
                  (settings.instantFeedbackDelay ?? 3) === s
                    ? 'bg-amber-500/20 border-amber-500/30 text-amber-300 shadow-sm scale-105'
                    : 'bg-foreground/[0.04] border-foreground/10 text-foreground/50 hover:border-amber-500/25 hover:text-amber-300'
                }`}
              >
                {s === 0 ? '✋' : `${s}s`}
              </button>
            ))}
          </div>
          <p className={`text-[9px] mt-1.5 font-medium leading-tight ${(settings.instantFeedbackDelay ?? 3) === 0 ? 'text-foreground/25' : 'text-amber-400/55'}`}>
            {(settings.instantFeedbackDelay ?? 3) === 0
              ? 'Manual — tap Next to skip'
              : `Auto after ${settings.instantFeedbackDelay ?? 3}s`}
          </p>
        </div>

        {/* Right: Show Marks during Quiz toggle */}
        <div>
          <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">Show Marks</p>
          <div className="flex items-center gap-2.5 mt-1">
            <Toggle
              checked={settings.showMarksInQuiz !== false}
              onChange={v => set({ showMarksInQuiz: v })}
            />
            <span className={`text-sm font-black transition-colors ${settings.showMarksInQuiz !== false ? 'text-emerald-400' : 'text-foreground/25'}`}>
              {settings.showMarksInQuiz !== false ? 'On' : 'Off'}
            </span>
          </div>
          <p className="text-[9px] mt-1.5 text-foreground/25 font-medium leading-tight">
            {settings.showMarksInQuiz !== false ? '+/− score shown in header' : 'Score hidden in header'}
          </p>
        </div>

      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const MARKS_PRESETS = [1, 2, 3, 4];
const NEG_PRESETS = [0.25, 0.5, 0.75, 1.0];

function CollapsibleSection({ title, icon, badge, children, defaultOpen = false, collapsible = false }: {
  title: string; icon: React.ReactNode; badge?: string; children: React.ReactNode; defaultOpen?: boolean; collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible || defaultOpen);
  if (!collapsible) return <>{children}</>;
  return (
    <div className="border border-foreground/[0.07] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-sm font-black text-foreground/80 hover:bg-foreground/[0.03] transition-colors"
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {badge && (
          <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md">
            {badge}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-foreground/30 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-foreground/[0.05]">
          {children}
        </div>
      )}
    </div>
  );
}

export default function SettingsPanel({ settings, onChange, collapsible = false }: SettingsPanelProps) {
  const [scoringOpen, setScoringOpen] = useState(false);
  const [customMarks, setCustomMarks] = useState(!MARKS_PRESETS.includes(settings.marksPerQuestion));
  const [customNeg, setCustomNeg] = useState(!NEG_PRESETS.includes(settings.negativeMarks));

  const set = (patch: Partial<QuizSettings>) => onChange({ ...settings, ...patch });

  const handleTimerMode = (mode: QuizSettings['timerMode']) => {
    // Manual timer changes leave the NORCET/AAO "1 min × questions" auto-clock behind
    set({ timerMode: mode, timerEnabled: mode === 'per-question', totalMinutesPerQuestion: undefined });
  };

  const autoTotal = settings.timerMode === 'total' && (settings.totalMinutesPerQuestion ?? 0) > 0;

  const perQSecs = settings.timerMode === 'per-question'
    ? settings.timerValue * (settings.timerUnit === 'min' ? 60 : 1)
    : 0;

  const totalSecs = settings.timerMode === 'total' && !autoTotal
    ? settings.totalTimerValue * (settings.totalTimerUnit === 'min' ? 60 : 1)
    : 0;

  const difficultyOptions = [
    { value: 'all',    label: '🎲 Mixed (Auto-detect)' },
    { value: 'easy',   label: '🟢 Easy Only' },
    { value: 'medium', label: '🟡 Medium Only' },
    { value: 'hard',   label: '🔴 Hard Only' },
  ];

  const modeOptions = [
    { value: 'submit', label: '📋 Classic Exam (Submit at end)' },
    { value: 'live',   label: '⚡ Instant Feedback (Training)' },
  ];

  // Adaptive CAT mode (separate from quiz mode)
  const isAdaptive = settings.adaptiveMode === true;

  const timerUnitOptions = [
    { value: 'sec', label: 'Seconds' },
    { value: 'min', label: 'Minutes' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Zap className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-black text-foreground/35 uppercase tracking-[0.12em]">Settings &amp; Rules</span>
      </div>

      {/* ── Live Mode Active Banner ── */}
      {settings.mode === 'live' && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3">
          <span className="text-lg leading-none flex-shrink-0">⚡</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-amber-300 leading-tight">LIVE MODE</p>
            <p className="text-[10px] text-amber-400/60 mt-0.5">Instant Feedback active — answers revealed per question</p>
          </div>
          <span className="text-[9px] font-black px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 flex-shrink-0 whitespace-nowrap">
            ON
          </span>
        </div>
      )}

      <div className={collapsible ? 'space-y-2.5' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        {/* ── Left column ── */}
        <CollapsibleSection title="Mode & Difficulty" icon={<Sparkles className="w-3.5 h-3.5 text-primary" />} badge={`${settings.mode === 'live' ? '⚡ Live' : '📋 Exam'} · ${settings.difficulty}`} collapsible={collapsible} defaultOpen>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-foreground/35 mb-2 uppercase tracking-widest">Difficulty</label>
            <DarkSelect value={settings.difficulty} onValueChange={v => set({ difficulty: v as QuizSettings['difficulty'] })} options={difficultyOptions} />
          </div>

          <div>
            <label className="block text-[10px] font-black text-foreground/35 mb-2 uppercase tracking-widest">Quiz Mode</label>
            <DarkSelect value={settings.mode} onValueChange={v => set({ mode: v as QuizSettings['mode'] })} options={modeOptions} />
          </div>

          {/* ── Adaptive CAT Mode ── */}
          <div className="bg-purple-500/5 border border-purple-500/15 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🧠</span>
                <div>
                  <span className="text-xs font-black text-purple-300">Adaptive (CAT)</span>
                  <p className="text-[9px] text-foreground/30 mt-0.5">AI adjusts difficulty based on your answers</p>
                </div>
              </div>
              <Toggle checked={isAdaptive} onChange={v => set({ adaptiveMode: v })} />
            </div>
            {isAdaptive && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {['📈 Escalates on correct streak', '📉 Drops on wrong streak', '🎯 Calibrates skill level'].map(r => (
                  <span key={r} className="text-[9px] font-bold text-purple-400/60 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md">{r}</span>
                ))}
              </div>
            )}
          </div>

          {/* ── Mock Exam Mode ── */}
          {settings.mode === 'submit' && (
            <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏛️</span>
                  <div>
                    <span className="text-xs font-black text-blue-300">Mock Exam Mode</span>
                    <p className="text-[9px] text-foreground/30 mt-0.5">Strict exam simulation — no going back, no rationale</p>
                  </div>
                </div>
                <Toggle checked={settings.mockExamMode === true} onChange={v => set({ mockExamMode: v })} />
              </div>
              {settings.mockExamMode && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {['🔒 No back navigation', '🙈 No rationale', '⏰ Auto-submit on timeout'].map(r => (
                    <span key={r} className="text-[9px] font-bold text-blue-400/60 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md">{r}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Instant Feedback Popup — shown only in 'live' mode ── */}
          {settings.mode === 'live' && (
            <TrainingFeedbackCard settings={settings} set={set} />
          )}
        </div>
        </CollapsibleSection>

        {/* ── Right column ── */}
        <CollapsibleSection title="Timer" icon={<Clock className="w-3.5 h-3.5 text-primary" />} badge={settings.timerMode === 'off' ? 'Off' : settings.timerMode === 'per-question' ? `Per Q` : autoTotal ? `${settings.totalMinutesPerQuestion}m × Q` : 'Total'} collapsible={collapsible}>
        <div className="space-y-4">

          {/* ══ TIMER SECTION — Two modes: Per Question & Total Quiz ══ */}
          <div className={collapsible ? '' : 'bg-foreground/[0.03] rounded-xl border border-foreground/[0.07] p-4'}>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-black text-foreground/80">Quiz Timer</span>
            </div>

            {/* 3-way mode selector */}
            <TimerModeSegment value={settings.timerMode ?? 'off'} onChange={handleTimerMode} />

            {/* ─ Per Question settings ─ */}
            {settings.timerMode === 'per-question' && (
              <div className="mt-3 space-y-2 pl-1 border-l-2 border-primary/30">
                <p className="text-[9px] font-black text-foreground/35 uppercase tracking-widest px-2">
                  ⏱ Time per question
                  {perQSecs > 0 && (
                    <span className="text-emerald-400 ml-2 normal-case font-bold">
                      {perQSecs >= 60
                        ? `${Math.floor(perQSecs / 60)}m ${perQSecs % 60 > 0 ? `${perQSecs % 60}s` : ''}`
                        : `${perQSecs}s`}
                    </span>
                  )}
                </p>
                <div className="flex gap-2 px-2">
                  <input
                    type="number" min="5" max="600" value={settings.timerValue}
                    onChange={e => set({ timerValue: Math.max(1, Math.min(600, +e.target.value)) })}
                    className="bg-foreground/[0.06] border border-foreground/10 rounded-lg px-3 py-2.5 text-sm text-center focus:border-primary focus:outline-none text-foreground font-black w-20"
                  />
                  <DarkSelect value={settings.timerUnit} onValueChange={v => set({ timerUnit: v as QuizSettings['timerUnit'] })} options={timerUnitOptions} compact />
                </div>
                <div className="flex gap-1.5 flex-wrap px-2">
                  {(settings.timerUnit === 'sec' ? [15, 30, 45, 60, 90] : [1, 2, 3, 5]).map(v => (
                    <button key={v} onClick={() => set({ timerValue: v })}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all ${
                        settings.timerValue === v
                          ? 'bg-primary/20 border-primary/40 text-primary-foreground'
                          : 'bg-foreground/[0.04] border-foreground/10 text-foreground/50 hover:border-foreground/20 hover:text-foreground'
                      }`}
                    >{v}{settings.timerUnit === 'sec' ? 's' : 'm'}</button>
                  ))}
                </div>
              </div>
            )}

            {/* ─ Total Quiz settings ─ */}
            {autoTotal && (
              <div className="mt-3 space-y-2 pl-1 border-l-2 border-amber-500/40">
                <p className="text-[9px] font-black text-foreground/35 uppercase tracking-widest px-2">
                  ⏳ Exam clock
                  <span className="text-amber-400 ml-2 normal-case font-bold">{settings.totalMinutesPerQuestion} min × number of questions</span>
                </p>
                <p className="text-[10px] text-foreground/50 px-2 leading-relaxed">
                  One timer for the whole quiz, calculated from the question count when you start. Free navigation between questions.
                </p>
                <p className="text-[9px] text-amber-400/60 px-2 font-medium leading-relaxed">
                  ⚠️ Quiz auto-submits when the time expires. Answers, rationales and score are shown after submission.
                </p>
                <button
                  onClick={() => set({ totalMinutesPerQuestion: undefined })}
                  className="mx-2 text-[10px] font-bold text-amber-300/80 hover:text-amber-300 underline underline-offset-2"
                >
                  Use a fixed total time instead
                </button>
              </div>
            )}

            {settings.timerMode === 'total' && !autoTotal && (
              <div className="mt-3 space-y-2 pl-1 border-l-2 border-amber-500/40">
                <p className="text-[9px] font-black text-foreground/35 uppercase tracking-widest px-2">
                  ⏳ Total quiz time
                  {totalSecs > 0 && (
                    <span className="text-amber-400 ml-2 normal-case font-bold">
                      {totalSecs >= 60
                        ? `${Math.floor(totalSecs / 60)}m ${totalSecs % 60 > 0 ? `${totalSecs % 60}s` : ''}`
                        : `${totalSecs}s`}
                    </span>
                  )}
                </p>
                <div className="flex gap-2 px-2">
                  <input
                    type="number" min="1" max="300" value={settings.totalTimerValue ?? 30}
                    onChange={e => set({ totalTimerValue: Math.max(1, Math.min(300, +e.target.value)) })}
                    className="bg-foreground/[0.06] border border-amber-500/20 rounded-lg px-3 py-2.5 text-sm text-center focus:border-amber-500/50 focus:outline-none text-foreground font-black w-20"
                  />
                  <DarkSelect
                    value={settings.totalTimerUnit ?? 'min'}
                    onValueChange={v => set({ totalTimerUnit: v as QuizSettings['totalTimerUnit'] })}
                    options={timerUnitOptions}
                    compact
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap px-2">
                  {(settings.totalTimerUnit === 'min' ? [10, 15, 20, 30, 45, 60] : [60, 120, 180, 300]).map(v => (
                    <button key={v} onClick={() => set({ totalTimerValue: v })}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all ${
                        settings.totalTimerValue === v
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          : 'bg-foreground/[0.04] border-foreground/10 text-foreground/50 hover:border-amber-500/20 hover:text-amber-300'
                      }`}
                    >{v}{settings.totalTimerUnit === 'min' ? 'm' : 's'}</button>
                  ))}
                </div>
                <p className="text-[9px] text-amber-400/60 px-2 font-medium leading-relaxed">
                  ⚠️ Quiz auto-submits when total time expires
                </p>
              </div>
            )}

            {settings.timerMode === 'off' && (
              <p className="text-[9px] text-foreground/25 mt-2 font-medium">No timer — attempt at your own pace</p>
            )}
          </div>

        </div>
        </CollapsibleSection>

          {/* Scoring Accordion */}
          <CollapsibleSection title="Scoring & Marks" icon={<Target className="w-3.5 h-3.5 text-primary" />} badge={`${settings.marksPerQuestion}/Q${settings.negativeMarking ? ` · -${settings.negativeMarks}` : ''}`} collapsible={collapsible}>
          <div className={collapsible ? '' : 'bg-foreground/[0.03] rounded-xl border border-foreground/[0.07] overflow-hidden'}>
            <button onClick={() => setScoringOpen(o => !o)}
              className="w-full flex items-center justify-between p-4 text-sm text-foreground/80 font-black focus:outline-none hover:bg-foreground/[0.04] transition-colors">
              <span className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-primary" /> Scoring &amp; Marks
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                  {settings.marksPerQuestion}/Q {settings.negativeMarking ? `· -${settings.negativeMarks} pen` : ''}
                </span>
                {scoringOpen ? <ChevronUp className="w-4 h-4 text-foreground/40" /> : <ChevronDown className="w-4 h-4 text-foreground/40" />}
              </div>
            </button>

            {scoringOpen && (
              <div className="px-4 pb-5 pt-4 border-t border-foreground/[0.05] space-y-5">
                {/* Marks per question */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-foreground/60">Marks per Question</span>
                    <span className="text-lg font-black text-primary tabular-nums">{settings.marksPerQuestion}</span>
                  </div>
                  <Presets
                    values={MARKS_PRESETS} current={settings.marksPerQuestion}
                    onSelect={v => { set({ marksPerQuestion: v }); setCustomMarks(false); }}
                    isCustom={customMarks} onCustom={() => setCustomMarks(true)}
                  />
                  {customMarks ? (
                    <input type="number" min="0.5" max="50" step="0.5" value={settings.marksPerQuestion}
                      onChange={e => set({ marksPerQuestion: parseFloat(e.target.value) || 1 })}
                      className="mt-2 w-full bg-foreground/[0.06] border border-purple-500/40 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-400 font-bold"
                      placeholder="e.g. 2.5" autoFocus />
                  ) : (
                    <PremiumSlider value={Math.min(settings.marksPerQuestion, 4)} min={1} max={4} step={0.5}
                      onChange={v => { set({ marksPerQuestion: v }); setCustomMarks(false); }} />
                  )}
                </div>

                {/* Negative marking */}
                <div className="border-t border-foreground/[0.05] pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-foreground/60">Negative Marking</span>
                    <Toggle checked={settings.negativeMarking} onChange={v => set({ negativeMarking: v })} />
                  </div>
                  {settings.negativeMarking && (
                    <div className="mt-3 pl-3 border-l-2 border-destructive/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-foreground/50 font-bold uppercase tracking-wider">Deduction per wrong</span>
                        <span className="text-lg font-black text-red-400 tabular-nums">−{settings.negativeMarks}</span>
                      </div>
                      <Presets values={NEG_PRESETS} current={settings.negativeMarks}
                        onSelect={v => { set({ negativeMarks: v }); setCustomNeg(false); }}
                        isCustom={customNeg} onCustom={() => setCustomNeg(true)} format={v => `${v}`} />
                      {customNeg ? (
                        <input type="number" min="0.05" max="20" step="0.05" value={settings.negativeMarks}
                          onChange={e => set({ negativeMarks: parseFloat(e.target.value) || 0.25 })}
                          className="w-full bg-foreground/[0.06] border border-destructive/40 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-destructive font-bold"
                          placeholder="e.g. 0.33" autoFocus />
                      ) : (
                        <PremiumSlider value={Math.min(settings.negativeMarks, 1)} min={0.25} max={1} step={0.25}
                          onChange={v => { set({ negativeMarks: v }); setCustomNeg(false); }}
                          accentClass="bg-destructive" />
                      )}
                    </div>
                  )}
                </div>

                {/* Pass Mark */}
                <div className="border-t border-foreground/[0.05] pt-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-foreground/60">Pass Mark</span>
                    <span className={`text-lg font-black tabular-nums ${settings.passMark >= 75 ? 'text-red-400' : settings.passMark >= 50 ? 'text-amber-400' : 'text-emerald-400'}`}>{settings.passMark}%</span>
                  </div>
                  <Presets values={[33, 40, 50, 60, 75]} current={settings.passMark}
                    onSelect={v => set({ passMark: v })} isCustom={false} onCustom={() => {}}
                    format={v => `${v}%`} hideCustom />
                  <PremiumSlider value={settings.passMark} min={0} max={100} step={5}
                    onChange={v => set({ passMark: v })} />
                </div>

                <ScorePreview settings={settings} />
              </div>
            )}
          </div>
      </CollapsibleSection>
      </div>
    </div>
  );
}
