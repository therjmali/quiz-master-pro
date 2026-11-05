import { useState } from 'react';
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
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-12 sm:pt-16 p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl animate-fade-in glass-card rounded-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Settings2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-black text-foreground">Edit Quiz Settings</h3>
              <p className="text-[10px] text-foreground/35 font-medium">Tap a section to expand · changes apply on resume</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-destructive" />
          </button>
        </div>

        {/* Content — collapsible accordion sections */}
        <div className="flex-1 overflow-y-auto px-5 py-4 thin-scrollbar space-y-2.5">
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

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-border bg-foreground/5 text-foreground/50 text-sm font-bold transition-all hover:bg-foreground/10">
            Cancel
          </button>
          <button onClick={handleApply} disabled={!hasChanges}
            className="flex-1 py-3 rounded-xl bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            ✓ Apply & Resume
          </button>
        </div>
      </div>
    </div>
  );
}
