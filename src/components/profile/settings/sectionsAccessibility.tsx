import { memo, useState } from 'react';
import { Accessibility, Minus, Plus, RotateCcw } from 'lucide-react';
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
    </SettingsSection>
  );
});
