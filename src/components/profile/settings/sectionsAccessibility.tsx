import { memo, useCallback, useEffect, useState } from 'react';
import { Accessibility, Activity, ClipboardCheck, Gauge, Minus, Plus, RotateCcw, Trash2, Zap } from 'lucide-react';
import { collectDiagnostics, formatDiagnostics, getErrorLog, clearErrorLog, type DiagnosticsReport } from '../../../platform/diagnostics';
import { getPerfChoice, setPerfMode, type PerfMode } from '../../../platform/perfMode';
import { Btn, Card, Pill } from './platformUi';
import { toast } from 'sonner';
import { SettingsSection, SettingRow } from './controls';
import type { SectionProps } from './sectionsA';
import {
  ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_PRESETS, ZOOM_STEP,
  clampZoom, resetZoom, setZoom, useZoom, zoomIn, zoomOut,
} from '../../../platform/zoom';

/**
 * Settings -> Accessibility: zoom the whole app in or out (70-150 %), saved on this device.
 * The slider only applies on release - the page rescales under your finger otherwise, which makes
 * dragging jump around. Buttons and presets apply instantly.
 */
export const AccessibilitySection = memo(function AccessibilitySection({ open, onToggle }: SectionProps) {
  const zoom = useZoom();
  const [choice, setChoice] = useState<PerfMode>(() => (typeof localStorage === 'undefined' ? 'auto' : getPerfChoice()));
  const current = typeof document !== 'undefined' && document.documentElement.classList.contains('qmp-perf-low') ? 'low' : 'high';
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? zoom;
  const atMin = zoom <= ZOOM_MIN;
  const atMax = zoom >= ZOOM_MAX;

  const commit = () => { if (drag !== null) { setZoom(drag); setDrag(null); } };
  const reset = () => { resetZoom(); toast.success('Zoom reset to 100%'); };
  const btn = 'w-11 h-11 rounded-xl bg-foreground/[0.07] flex items-center justify-center active:scale-90 transition disabled:opacity-35 disabled:active:scale-100';

  return (
    <SettingsSection id="accessibility" icon={<Accessibility className="w-[18px] h-[18px]" />} open={open} onToggle={onToggle} onReset={zoom !== ZOOM_DEFAULT ? reset : undefined}>
      <SettingRow id="zoom" title="Zoom" hint="Make everything in the app smaller or larger. Saved on this device." inline={false}
        control={
          <div className="space-y-3.5">
            <div className="flex items-center gap-3">
              <button type="button" className={btn} onClick={() => zoomOut()} disabled={atMin} aria-label="Zoom out"><Minus className="w-4 h-4" /></button>
              <div className="flex-1 text-center">
                <span className="text-2xl font-black text-primary tabular-nums" aria-live="polite">{shown}%</span>
                <span className="block text-[10px] font-semibold text-foreground/40">{shown === ZOOM_DEFAULT ? 'Default size' : shown < ZOOM_DEFAULT ? 'Smaller than default' : 'Larger than default'}</span>
              </div>
              <button type="button" className={btn} onClick={() => zoomIn()} disabled={atMax} aria-label="Zoom in"><Plus className="w-4 h-4" /></button>
            </div>

            <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} value={shown} aria-label="Zoom level" aria-valuetext={`${shown} percent`}
              onChange={e => setDrag(clampZoom(Number(e.target.value)))}
              onPointerUp={commit} onTouchEnd={commit} onKeyUp={commit} onBlur={commit}
              className="settings-range w-full" />

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {ZOOM_PRESETS.map(p => (
                <button key={p.value} type="button" aria-pressed={zoom === p.value} title={p.hint}
                  onClick={() => setZoom(p.value)}
                  className={`min-h-11 rounded-xl border px-1 py-1.5 text-center transition active:scale-95 ${zoom === p.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground/70 hover:border-foreground/25'}`}>
                  <span className="block text-[11px] font-black leading-tight">{p.label}</span>
                  <span className="block text-[9px] font-semibold opacity-60 tabular-nums">{p.value}%</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] text-foreground/40 leading-snug">Keyboard: Ctrl/Cmd + <kbd className="inline-block min-w-[1.25rem] px-1 rounded border border-border bg-foreground/[0.06] text-center font-mono text-[10px] leading-4">+</kbd> / <kbd className="inline-block min-w-[1.25rem] px-1 rounded border border-border bg-foreground/[0.06] text-center font-mono text-[10px] leading-4">-</kbd>, <kbd className="inline-block min-w-[1.25rem] px-1 rounded border border-border bg-foreground/[0.06] text-center font-mono text-[10px] leading-4">0</kbd> to reset. Also on the quiz screen.</p>
              <button type="button" onClick={reset} disabled={zoom === ZOOM_DEFAULT}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[11px] font-bold text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] transition disabled:opacity-35 flex-shrink-0">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
          </div>
        } />

      <SettingRow id="performance" title="Smoothness" hint="Full glass and animation, or a lighter mode that saves battery on slower phones"
        inline={false}
        control={
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              {([['auto', 'Auto', 'Detect this phone'], ['high', 'Full', 'Glass + motion'], ['low', 'Light', 'Blur off']] as const).map(([value, label, hint]) => {
                const active = choice === value;
                return (
                  <button key={value} type="button" aria-pressed={active}
                    onClick={() => { const next = setPerfMode(value as PerfMode); setChoice(value as PerfMode); toast.success(value === 'auto' ? `Auto: ${next === 'low' ? 'light mode' : 'full glass'}` : `${label} mode on`); }}
                    className={`min-h-11 rounded-xl border px-1 py-1.5 text-center transition active:scale-95 ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground/70 hover:border-foreground/25'}`}>
                    <span className="block text-[11px] font-black leading-tight">{label}</span>
                    <span className="block text-[9px] font-semibold opacity-60">{hint}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-foreground/40 leading-snug">
              Light mode removes the frosted-glass blur and freezes decorative animation. It looks the same in daylight and
              keeps scrolling smooth on phones with 4 cores or less. Currently: <b>{current === 'low' ? 'Light' : 'Full glass'}</b>.
            </p>
          </div>
        } />

      <DiagnosticsPanel />
    </SettingsSection>
  );
});


/**
 * "Something is lagging / it crashed" - answered from inside the app.
 * Reads the on-device error log and the device facts, and copies a short report. Nothing is uploaded.
 */
export function DiagnosticsPanel() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const errors = getErrorLog();
  const problems = errors.length;

  const load = useCallback(async () => {
    setBusy(true);
    try { setReport(await collectDiagnostics()); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const copy = async () => {
    const text = formatDiagnostics(report ?? await collectDiagnostics());
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Report copied - paste it in a message');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy. Try again from the app (clipboard needs the installed app).');
    }
  };

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  return (
    <SettingRow id="diagnostics" title="Diagnostics" hint="What this phone is doing, and the last problems the app hit"
      inline={false}
      control={
        <div className="space-y-2.5">
          <Card tone={problems ? 'warn' : 'plain'}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-bold text-foreground flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-primary" /> App health
              </p>
              <Pill tone={problems ? 'warn' : 'good'}>{problems ? `${problems} recorded` : 'No problems'}</Pill>
            </div>
            <ul className="text-[11px] text-foreground/60 mt-2 space-y-1">
              <li className="flex justify-between gap-3"><span>Version</span><b className="text-foreground/80">v{report?.appVersion ?? '—'}</b></li>
              <li className="flex justify-between gap-3"><span>Rendering</span><b className="text-foreground/80">{report?.perfMode === 'low' ? 'Light (blur off)' : 'Full glass'}</b></li>
              <li className="flex justify-between gap-3"><span>Cores / RAM</span><b className="text-foreground/80">{report?.cores ?? '?'} / {report?.deviceMemoryGb ?? '?'} GB</b></li>
              <li className="flex justify-between gap-3"><span>Storage used</span><b className="text-foreground/80">{report ? mb(report.storage.usedBytes) : '—'}</b></li>
              <li className="flex justify-between gap-3"><span>Network</span><b className="text-foreground/80">{report?.online ? 'Online' : 'Offline'}</b></li>
            </ul>
            {problems > 0 && (
              <ul className="mt-2 space-y-1 max-h-28 overflow-y-auto thin-scrollbar">
                {errors.slice(-4).reverse().map(e => (
                  <li key={`${e.at}-${e.message}`} className="text-[10px] text-foreground/55 leading-snug">
                    <b className="text-foreground/70">{new Date(e.at).toLocaleString()}</b> — {e.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <Btn small tone="primary" icon={copied ? <ClipboardCheck className="w-3.5 h-3.5" /> : <Gauge className="w-3.5 h-3.5" />} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy report'}</Btn>
              <Btn small busy={busy} icon={<Zap className="w-3.5 h-3.5" />} onClick={() => void load()}>Refresh</Btn>
              {problems > 0 && <Btn small tone="danger" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => { clearErrorLog(); toast.success('Problem log cleared'); void load(); }}>Clear log</Btn>}
            </div>
          </Card>
          <p className="text-[10px] text-foreground/40 leading-snug">
            The report stays on this phone until you copy it. It never includes your quizzes, notes or password.
          </p>
        </div>
      } />
  );
}
