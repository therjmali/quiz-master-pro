import { memo, useRef, useState } from 'react';
import { Check, Minus, Plus, Palette, BookOpenCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useProfileStore, DEFAULT_VISIBILITY } from '../../../hooks/useProfileStore';
import type { AppTheme } from '../../../types/quiz';
import ExamDatesManager from '../ExamDatesManager';
import FeatureVisibilitySettings from '../FeatureVisibilitySettings';
import { SettingsSection, SettingRow, SubHeading, Toggle, Segmented } from './controls';
import type { SectionId } from './settingsSearch';

export interface SectionProps { open: boolean; onToggle: (id: SectionId) => void }

/* ═════════ Appearance ═════════ */
const FONT_PX: Record<string, string> = { small: '14px', medium: '16px', large: '18px' };

function applyFontSize(size: string) {
  document.documentElement.style.setProperty('--font-size-base', FONT_PX[size] || '16px');
  try { localStorage.setItem('qmp_font_size', size); } catch {}
}
const readLS = (k: string, d: string) => { try { return localStorage.getItem(k) || d; } catch { return d; } };

const MODE_OPTIONS = [
  { value: 'light', emoji: '☀️', label: 'Light' },
  { value: 'dark', emoji: '🌙', label: 'Dark' },
] as const;

export const AppearanceSection = memo(function AppearanceSection({ open, onToggle, theme, onThemeChange }: SectionProps & { theme: AppTheme; onThemeChange: (t: AppTheme) => void }) {
  const [fontSize, setFontSize] = useState(() => readLS('qmp_font_size', 'medium'));
  const reset = () => {
    onThemeChange('light');
    setFontSize('medium'); applyFontSize('medium');
    toast.success('Appearance reset to defaults');
  };

  return (
    <SettingsSection id="appearance" icon={<Palette className="w-4 h-4" />} open={open} onToggle={onToggle} onReset={reset}>
      <SubHeading>Display Mode</SubHeading>
      <SettingRow id="theme" title="Display Mode" hint="Light or Dark. Styles the whole app, quiz and reports" inline={false}
        control={
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Display mode">
            {MODE_OPTIONS.map(m => {
              const active = theme === m.value;
              return (
                <button key={m.value} type="button" role="radio" aria-checked={active} data-testid={`theme-${m.value}`}
                  onClick={() => { onThemeChange(m.value); toast.success(`${m.emoji} ${m.label} mode applied`); }}
                  className={`relative flex flex-col items-center justify-center gap-1.5 min-h-[88px] rounded-3xl border-2 transition-all active:scale-[0.97] ${active ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-card/60 hover:border-foreground/25'}`}>
                  <span className="text-3xl leading-none">{m.emoji}</span>
                  <span className="text-sm font-black text-foreground">{m.label}</span>
                  {active && <Check className="absolute top-2.5 right-2.5 w-4 h-4 text-primary" />}
                </button>
              );
            })}
          </div>
        } />
      <SubHeading>Display</SubHeading>
      <SettingRow id="fontSize" title="Text size" hint="Make text smaller or larger across the app" inline={false}
        control={<Segmented label="Text size" value={fontSize as 'small' | 'medium' | 'large'}
          options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Default' }, { value: 'large', label: 'Large' }]}
          onChange={v => { setFontSize(v); applyFontSize(v); }} />} />
    </SettingsSection>
  );
});

/* ═════════ Quiz & Study ═════════ */
function Stepper({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Math.min(max, Math.max(min, Math.round(Number(draft) / step) * step || min));
    onChange(n); setDraft(null);
  };
  return (
    <div className="rounded-xl border border-border bg-card/60 p-2.5">
      <p className="text-[11px] font-bold text-foreground/60 mb-1.5 truncate">{label}</p>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - step))}
          className="w-8 h-8 rounded-lg bg-foreground/[0.06] flex items-center justify-center active:scale-90 transition-transform"><Minus className="w-3.5 h-3.5" /></button>
        <input ref={ref} inputMode="numeric" aria-label={label} value={draft ?? String(value)}
          onFocus={() => setDraft(String(value))} onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') ref.current?.blur(); }}
          className="flex-1 min-w-0 h-8 text-center text-base font-black text-primary bg-transparent rounded-lg focus:outline-none focus:bg-primary/10 tabular-nums" />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + step))}
          className="w-8 h-8 rounded-lg bg-foreground/[0.06] flex items-center justify-center active:scale-90 transition-transform"><Plus className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

export const QuizStudySection = memo(function QuizStudySection({ open, onToggle }: SectionProps) {
  const { profile, update, updateVisibility } = useProfileStore();
  const reset = () => {
    update({ dailyGoal: 5, weeklyGoal: 50, dailyQuestionGoal: 25, weeklyQuestionGoal: 150, showScoreOnCards: true, showTimeOnCards: true, showDecimalPct: false, cardDensity: 'comfortable' });
    updateVisibility({ ...DEFAULT_VISIBILITY });
    toast.success('Quiz & Study reset to defaults');
  };
  return (
    <SettingsSection id="quiz" icon={<BookOpenCheck className="w-4 h-4" />} open={open} onToggle={onToggle} onReset={reset}>
      <SubHeading>Study targets</SubHeading>
      <SettingRow id="goals" title="Study targets" hint="Daily and weekly goals drive your streaks and progress rings" inline={false}
        control={
          <div className="grid grid-cols-2 gap-2">
            <Stepper label="Quizzes / day" value={profile.dailyGoal} min={1} max={50} step={1} onChange={v => update({ dailyGoal: v })} />
            <Stepper label="Quizzes / week" value={profile.weeklyGoal} min={1} max={200} step={1} onChange={v => update({ weeklyGoal: v })} />
            <Stepper label="Questions / day" value={profile.dailyQuestionGoal} min={5} max={500} step={5} onChange={v => update({ dailyQuestionGoal: v })} />
            <Stepper label="Questions / week" value={profile.weeklyQuestionGoal} min={10} max={2000} step={10} onChange={v => update({ weeklyQuestionGoal: v })} />
          </div>
        } />
      <SubHeading>Quiz cards</SubHeading>
      <SettingRow id="scoreOnCards" title="Show scores on cards" hint="Display the percentage on quiz cards"
        control={<Toggle label="Show scores on cards" checked={profile.showScoreOnCards} onChange={v => update({ showScoreOnCards: v })} />} />
      <SettingRow id="timeOnCards" title="Show time on cards" hint="Display how long each quiz took"
        control={<Toggle label="Show time on cards" checked={profile.showTimeOnCards} onChange={v => update({ showTimeOnCards: v })} />} />
      <SettingRow id="decimalPct" title="Decimal percentages" hint="Show 76.31% instead of 76%"
        control={<Toggle label="Decimal percentages" checked={profile.showDecimalPct} onChange={v => update({ showDecimalPct: v })} />} />
      <SettingRow id="cardDensity" title="Card density" hint="Comfortable spacing or more quizzes per screen" inline={false}
        control={<Segmented label="Card density" value={profile.cardDensity}
          options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]}
          onChange={v => update({ cardDensity: v })} />} />
      <SubHeading>Exams</SubHeading>
      <SettingRow id="examDates" title="Exam dates" hint="Add exams to power countdowns and readiness" inline={false}
        control={<ExamDatesManager />} />
      <SubHeading>Features</SubHeading>
      <SettingRow id="features" title="Feature visibility" hint="Show or hide setup tools, dashboard widgets, quiz options and AI features" inline={false}
        control={<FeatureVisibilitySettings visibility={profile.featureVisibility} onUpdate={updateVisibility} />} />
    </SettingsSection>
  );
});
