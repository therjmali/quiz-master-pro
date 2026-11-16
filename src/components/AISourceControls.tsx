/**
 * AISourceControls - the prominent "AI Generation" row at the top of Create Quiz.
 * The row shows the state at a glance (On with the chosen key, or Off); tapping it opens a small window with
 * the one ON/OFF switch and, while ON, only the API keys saved in Profile → API Keys (`🔑 Gemini`, `🔑 OpenAI`, …).
 * OFF hides every AI sub-setting and MCQs are parsed on the device (offline). With no saved key the window
 * shows a prompt to add one. The key you pick is the only one used (no silent fallback to the others).
 */
import { useState, useEffect, useCallback } from 'react';
import { Brain, ChevronRight, KeyRound, Check } from 'lucide-react';
import type { AIPrefs } from '../types/quiz';
import { PopupShell } from './ui/ChoicePopup';
import { getUserApiKeys } from '../utils/apiKeys';
import { getAiClientPrefs, saveAiClientPrefs } from '../platform/ai/providers';
import { KEY_PROVIDER_NAMES, isAiOn, resolveSelected, savedKeyChoices, withAiOn, type KeyProvider } from '../utils/aiChoices';

interface Props {
  prefs: AIPrefs;
  onChange: (p: AIPrefs) => void;
  /** Opens Profile → API Keys (shown when no key is saved). */
  onAddKey?: () => void;
}

export default function AISourceControls({ prefs, onChange, onAddKey }: Props) {
  const [open, setOpen] = useState(false);
  const [, setKeysVersion] = useState(0);
  const [preferred, setPreferred] = useState<string | null>(() => getAiClientPrefs().preferred);

  // Re-read the saved keys every time the window opens (keys are edited on another screen)
  useEffect(() => { if (open) { setKeysVersion(v => v + 1); setPreferred(getAiClientPrefs().preferred); } }, [open]);
  const choices = savedKeyChoices(getUserApiKeys());
  const selected = resolveSelected(choices, preferred);
  const on = isAiOn(prefs);
  const status = !on ? 'Off · MCQs load offline' : selected ? `On · 🔑 ${KEY_PROVIDER_NAMES[selected]}` : 'On · add an API key';

  const close = useCallback(() => setOpen(false), []);
  const pick = (id: KeyProvider) => {
    setPreferred(id);
    saveAiClientPrefs({ ...getAiClientPrefs(), preferred: id, only: true });
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid="ai-trigger"
        className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all active:scale-[0.99] ${on ? 'border-primary/30 bg-primary/[0.07]' : 'border-border bg-card/60'}`}
        style={{ minHeight: 0 }}>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${on ? 'bg-primary/15 text-primary' : 'bg-foreground/[0.07] text-foreground/55'}`}><Brain className="h-5 w-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black leading-tight text-foreground">AI Generation</span>
          <span className="mt-0.5 block truncate text-[11px] font-semibold text-foreground/55" data-testid="ai-status">{status}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide ${on ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-foreground/10 text-foreground/60'}`}>{on ? 'ON' : 'OFF'}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-foreground/35" aria-hidden="true" />
      </button>

      <PopupShell open={open} onClose={close} title="AI Generation" subtitle={on ? 'On · uses your API key' : 'Off · MCQs load offline'} icon={<Brain className="h-4 w-4 text-primary" />} testId="ai-panel">
        {/* The one switch */}
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-foreground/[0.03] p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black leading-tight text-foreground">AI Generation</p>
            <p className="mt-0.5 text-[11px] leading-snug text-foreground/50">{on ? 'Turns notes and files into quizzes' : 'Only ready-made MCQs are loaded'}</p>
          </div>
          <button type="button" role="switch" aria-checked={on} aria-label="AI Generation" data-testid="ai-switch"
            onClick={() => onChange(withAiOn(prefs, !on))}
            style={{ minHeight: 0, minWidth: 0 }}
            className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${on ? 'bg-primary' : 'bg-foreground/20'}`}>
            <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Everything else only exists while ON */}
        {on && (choices.length > 0 ? (
          <div role="radiogroup" aria-label="API key to use" className="grid gap-1.5" data-testid="ai-keys">
            {choices.map(c => {
              const active = c.id === selected;
              return (
                <button key={c.id} type="button" role="radio" aria-checked={active} data-testid={`ai-key-${c.id}`} onClick={() => pick(c.id)}
                  style={{ minHeight: 0 }}
                  className={`flex w-full items-center gap-2 rounded-2xl border px-3.5 py-3 text-left text-sm font-bold transition-all active:scale-[0.99] ${active ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card/60 text-foreground/75 hover:border-foreground/25'}`}>
                  <span className="flex-1 truncate">{c.label}</span>
                  {active && <Check className="h-4 w-4 flex-shrink-0 text-primary" />}
                </button>
              );
            })}
            <p className="px-1 pt-0.5 text-[10px] leading-snug text-foreground/40">Only the key you pick is used.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-3.5 text-center" data-testid="ai-no-keys">
            <KeyRound className="mx-auto h-5 w-5 text-foreground/40" />
            <p className="mt-1.5 text-sm font-bold text-foreground">No API key saved yet</p>
            <p className="mt-0.5 text-[11px] leading-snug text-foreground/50">Add a Gemini, OpenAI, Anthropic or Cohere key to use AI.</p>
            {onAddKey && (
              <button type="button" data-testid="ai-add-key" onClick={() => { close(); onAddKey(); }}
                className="mt-3 h-10 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground transition-transform active:scale-95">
                Add API key
              </button>
            )}
          </div>
        ))}
      </PopupShell>
    </>
  );
}
