/**
 * AISourceControls - one switch: "AI Generation: ON / OFF".
 * OFF: no AI sub-settings, MCQs are parsed on the device (offline).
 * ON: pick one of the API keys saved in Profile → API Keys (`🔑 Gemini`, `🔑 OpenAI`, ...).
 * Only keys that are really saved are offered; with none, a prompt to add one is shown.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Brain, ChevronDown, KeyRound, Check } from 'lucide-react';
import type { AIPrefs } from '../types/quiz';
import MobilePopover from './ui/MobilePopover';
import { getUserApiKeys } from '../utils/apiKeys';
import { getAiClientPrefs, saveAiClientPrefs } from '../platform/ai/providers';
import { isAiOn, resolveSelected, savedKeyChoices, withAiOn, type KeyProvider } from '../utils/aiChoices';

interface Props {
  prefs: AIPrefs;
  onChange: (p: AIPrefs) => void;
  /** Opens Profile → API Keys (shown when no key is saved). */
  onAddKey?: () => void;
}

export default function AISourceControls({ prefs, onChange, onAddKey }: Props) {
  const [open, setOpen] = useState(false);
  const [keysVersion, setKeysVersion] = useState(0);
  const [preferred, setPreferred] = useState<string | null>(() => getAiClientPrefs().preferred);
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-read the saved keys every time the panel opens (keys are edited on another screen)
  useEffect(() => { if (open) { setKeysVersion(v => v + 1); setPreferred(getAiClientPrefs().preferred); } }, [open]);
  const choices = savedKeyChoices(getUserApiKeys());
  void keysVersion;
  const selected = resolveSelected(choices, preferred);
  const on = isAiOn(prefs);

  const close = useCallback(() => setOpen(false), []);
  const pick = (id: KeyProvider) => {
    setPreferred(id);
    const current = getAiClientPrefs();
    saveAiClientPrefs({ ...current, preferred: id });
  };

  return (
    <div ref={containerRef} className="relative z-10">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open} data-testid="ai-trigger"
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all select-none ${
          open ? 'bg-primary border-primary text-primary-foreground shadow-lg' : 'bg-primary/10 border-primary/25 text-primary hover:bg-primary/15'
        }`}>
        <div className="relative flex-shrink-0">
          <Brain className="w-3.5 h-3.5" />
          {!open && <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${on ? 'bg-emerald-500' : 'bg-foreground/25'}`} />}
        </div>
        <span className="hidden sm:inline leading-none tracking-wide">{on ? 'AI On' : 'AI Off'}</span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <MobilePopover open={open} onClose={close} title="AI Generation" subtitle={on ? 'On · uses your API key' : 'Off · MCQs load offline'}
        icon={<Brain className="w-4 h-4 text-primary" />} desktopWidth="w-[320px]">
        <div className="p-3 space-y-3" data-testid="ai-panel">
          {/* The one switch */}
          <div className="flex items-center gap-3 p-3 rounded-2xl border border-border bg-foreground/[0.03]">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-foreground leading-tight">AI Generation</p>
              <p className="text-[11px] text-foreground/50 leading-snug mt-0.5">{on ? 'Turns notes and files into quizzes' : 'Only ready-made MCQs are loaded'}</p>
            </div>
            <span className={`text-[10px] font-black px-2 py-1 rounded-full ${on ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-foreground/10 text-foreground/60'}`}>{on ? 'ON' : 'OFF'}</span>
            <button type="button" role="switch" aria-checked={on} aria-label="AI Generation" data-testid="ai-switch"
              onClick={() => onChange(withAiOn(prefs, !on))}
              style={{ minHeight: 0, minWidth: 0 }}
              className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${on ? 'bg-primary' : 'bg-foreground/20'}`}>
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Everything else only exists while ON */}
          {on && (choices.length > 0 ? (
            <div role="radiogroup" aria-label="API key to use" className="space-y-1.5" data-testid="ai-keys">
              {choices.map(c => {
                const active = c.id === selected;
                return (
                  <button key={c.id} type="button" role="radio" aria-checked={active} data-testid={`ai-key-${c.id}`} onClick={() => pick(c.id)}
                    className={`w-full flex items-center gap-2 px-3.5 py-3 rounded-2xl border text-left text-sm font-bold transition-all active:scale-[0.99] ${active ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card/60 text-foreground/75 hover:border-foreground/25'}`}>
                    <span className="flex-1 truncate">{c.label}</span>
                    {active && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-3.5 text-center" data-testid="ai-no-keys">
              <KeyRound className="w-5 h-5 mx-auto text-foreground/40" />
              <p className="text-sm font-bold text-foreground mt-1.5">No API key saved yet</p>
              <p className="text-[11px] text-foreground/50 leading-snug mt-0.5">Add a Gemini, OpenAI, Anthropic or Cohere key to use AI.</p>
              {onAddKey && (
                <button type="button" data-testid="ai-add-key" onClick={() => { close(); onAddKey(); }}
                  className="mt-3 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black active:scale-95 transition-transform">
                  Add API key
                </button>
              )}
            </div>
          ))}
        </div>
      </MobilePopover>
    </div>
  );
}
