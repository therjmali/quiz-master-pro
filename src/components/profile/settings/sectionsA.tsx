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
const ACCENT_COLORS = [
  { name: 'Indigo', value: '#6366F1' }, { name: 'Violet', value: '#8B5CF6' }, { name: 'Cyan', value: '#06B6D4' },
  { name: 'Rose', value: '#F43F5E' }, { name: 'Emerald', value: '#10B981' }, { name: 'Amber', value: '#F59E0B' },
];
const DEFAULT_ACCENT = '#6366F1';
const FONT_PX: Record<string, string> = { small: '14px', medium: '16px', large: '18px' };

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6; else if (max === g) h = ((b - r) / d + 2) / 6; else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
function applyAccent(hex: string) {
  const hsl = hexToHsl(hex);
  document.documentElement.style.setProperty('--primary', hsl);
  try { localStorage.setItem('qmp_accent_hsl', hsl); localStorage.setItem('qmp_accent_hex', hex); } catch {}
}
function applyFontSize(size: string) {
  document.documentElement.style.setProperty('--font-size-base', FONT_PX[size] || '16px');
  try { localStorage.setItem('qmp_font_size', size); } catch {}
}
function applyGlass(val: number) {
  document.documentElement.style.setProperty('--glass-blur', `${val}px`);
  document.documentElement.style.setProperty('--glass-opacity', `${Math.min(0.95, 0.5 + val / 100)}`);
  try { localStorage.setItem('qmp_glass_intensity', String(val)); } catch {}
}
const readLS = (k: string, d: string) => { try { return localStorage.getItem(k) || d; } catch { return d; } };

export const AppearanceSection = memo(function AppearanceSection({ open, onToggle, theme, onThemeChange }: SectionProps & { theme: AppTheme; onThemeChange: (t: AppTheme) => void }) {
  const { profile, update } = useProfileStore();
  const [fontSize, setFontSize] = useState(() => readLS('qmp_font_size', 'medium'));
  const [glass, setGlass] = useState(() => Number(readLS('qmp_glass_intensity', '40')));
  const accent = profile.accentColor || DEFAULT_ACCENT;

  const setAccent = (hex: string, name?: string) => { update({ accentColor: hex }); applyAccent(hex); if (name) toast.success(`Accent: ${name}`); };
  const reset = () => {
    onThemeChange('amoled'); setAccent(DEFAULT_ACCENT);
    setFontSize('medium'); applyFontSize('medium');
    setGlass(40); applyGlass(40);
    toast.success('Appearance reset to defaults');
  };

  return (
    <SettingsSection id="appearance" icon={<Palette className="w-4 h-4" />} open={open} onToggle={onToggle} onReset={reset}>
      <SubHeading>Theme</SubHeading>
      <SettingRow id="theme" title="Theme" hint="Light or AMOLED black — styles the whole app and quiz screen" inline={false}
        control={
          <div className="grid grid-cols-2 gap-2">
            {([['light', '✨', 'Light', 'Bright & clean'], ['amoled', '🖤', 'AMOLED', 'Pure black, saves battery']] as const).map(([v, e, l, d]) => (
              <button key={v} type="button" aria-pressed={theme === v}
                onClick={() => { onThemeChange(v); toast.success(`${e} ${l} theme applied`); }}
                className={`relative flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${theme === v ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-foreground/25'}`}>
                <span className="text-xl">{e}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-black text-foreground">{l}</span>
                  <span className="block text-[10px] text-foreground/45 truncate">{d}</span>
                </span>
                {theme === v && <Check className="absolute top-2 right-2 w-3.5 h-3.5 text-primary" />}
              </button>
            ))}
          </div>
        } />
      <SettingRow id="accent" title="Accent colour" hint="Highlight colour used for buttons and active states" inline={false}
        control={
          <div className="flex flex-wrap items-center gap-2.5">
            {ACCENT_COLORS.map(c => (
              <button key={c.value} type="button" title={c.name} aria-label={c.name} aria-pressed={accent === c.value}
                onClick={() => setAccent(c.value, c.name)}
                className={`relative w-9 h-9 rounded-full transition-transform active:scale-90 ${accent === c.value ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground/70' : ''}`}
                style={{ background: c.value }}>
                {accent === c.value && <Check className="w-4 h-4 text-white absolute inset-0 m-auto" />}
              </button>
            ))}
            <label title="Custom colour" className="relative w-9 h-9 rounded-full border-2 border-dashed border-foreground/25 flex items-center justify-center cursor-pointer hover:border-foreground/50">
              <Plus className="w-4 h-4 text-foreground/50" />
              <input type="color" value={accent} onChange={e => setAccent(e.target.value)} aria-label="Custom accent colour" className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
          </div>
        } />
      <SubHeading>Display</SubHeading>
      <SettingRow id="fontSize" title="Text size" hint="Make text smaller or larger across the app" inline={false}
        control={<Segmented label="Text size" value={fontSize as 'small' | 'medium' | 'large'}
          options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Default' }, { value: 'large', label: 'Large' }]}
          onChange={v => { setFontSize(v); applyFontSize(v); }} />} />
      <SettingRow id="glass" title="Glass blur intensity" hint="Lower values feel crisper and run faster on older phones" inline={false}
        control={
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={80} step={5} value={glass} aria-label="Glass blur intensity"
              onChange={e => { const v = Number(e.target.value); setGlass(v); applyGlass(v); }}
              className="settings-range flex-1" />
            <span className="w-11 text-right text-xs font-black text-primary tabular-nums">{glass}px</span>
          </div>
        } />
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
