import { useState } from 'react';
import Overlay, { OverlayFooter } from '../ui/Overlay';
import { X, Settings2, ChevronDown, Target, Clock, Zap, Gauge, ZoomIn } from 'lucide-react';
import { QuizSettings } from '../../types/quiz';
import SettingsPanel from '../setup/SettingsPanel';
import { getZoom, setZoom, ZOOM_PRESETS, ZOOM_DEFAULT } from '../../platform/zoom';
import { toast } from 'sonner';

interface Props {
  settings: QuizSettings;
  open: boolean;
  onClose: () => void;
  onApply: (s: QuizSettings) => void;
}

/** Collapsible section wrapper */
function Section({ title, icon, badge, children, defaultOpen = false }: {
  title: string; icon: React.ReactNode; badge?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/[0.07] rounded-xl overflow-hidden">
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
        <div className="px-4 pb-4 pt-1 border-t border-white/[0.05] animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

export default function QuizSettingsSheet({ settings, open, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<QuizSettings>({ ...settings });

  if (!open) return null;

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = (patch: Partial<QuizSettings>) => setDraft(d => ({ ...d, ...patch }));

  return (
    <Overlay open={open} onClose={onClose} kind="center" layer="sheet" className="max-w-3xl" labelledBy="quiz-settings-title" hideClose>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/15">
            <Settings2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 id="quiz-settings-title" className="truncate text-sm font-black text-foreground">Edit Quiz Settings</h3>
            <p className="truncate text-[10px] font-medium text-foreground/35">Tap a section to expand · changes apply on resume</p>
          </div>
        </div>
        <button onClick={onClose} className="qmp-panel-close-inline" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="qmp-panel-body thin-scrollbar space-y-2.5 px-5 py-4">
          <SettingsPanel settings={draft} onChange={setDraft} collapsible />

          {/* ── Zoom Section ── */}
          <Section title="Interface Zoom" icon={<ZoomIn className="w-4 h-4 text-amber-400/70" />} badge="persisted">
            <div className="space-y-3">
              <p className="text-[11px] text-foreground/30 font-medium px-0.5">
                Scale the whole quiz screen — text, options, cards. Remembered on this device.
              </p>
              <div className="grid grid-cols-5 gap-2">
                {ZOOM_PRESETS.map(p => {
                  const active = getZoom() === p.value;
                  return (
                    <button
                      key={p.value}
                      onClick={() => { setZoom(p.value); toast.success(`Zoom: ${p.label} (${p.value}%)`); }}
                      aria-label={`Zoom: ${p.label}, ${p.value} percent`}
                      aria-pressed={active}
                      className={`relative flex flex-col items-center justify-center rounded-xl border px-2 py-3 transition-all active:scale-95 ${
                        active
                          ? 'bg-primary/15 border-primary/40 shadow-md shadow-primary/15'
                          : 'bg-foreground/5 border-border text-foreground/40 hover:bg-foreground/10 hover:text-foreground/70'
                      }`}
                    >
                      {active && (
                        <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center">
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                        </div>
                      )}
                      <span className={`text-lg font-black ${active ? 'text-primary' : 'text-foreground/50'}`}>
                        {p.value}
                      </span>
                      <span className={`text-[9px] font-bold mt-0.5 ${active ? 'text-primary/80' : 'text-foreground/25'}`}>
                        %
                      </span>
                      <span className="text-[9px] font-bold mt-1.5 text-foreground/30">{p.hint}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold text-foreground/20 px-0.5">
                <span>Min 70% · Max 150% · Step 5%</span>
                <button
                  onClick={() => { setZoom(ZOOM_DEFAULT); toast.success('Zoom reset to 100%'); }}
                  className="text-amber-400/60 hover:text-amber-400 transition-colors"
                >
                  Reset to 100%
                </button>
              </div>
            </div>
          </Section>
      </div>

      <OverlayFooter>
        <div className="flex w-full gap-2">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-border bg-foreground/5 text-foreground/50 text-sm font-bold transition-all hover:bg-foreground/10">
            Cancel
          </button>
          <button onClick={handleApply} disabled={!hasChanges}
            className="flex-1 py-3 rounded-xl bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            ✓ Apply & Resume
          </button>
        </div>
      </OverlayFooter>
    </Overlay>
  );
}
