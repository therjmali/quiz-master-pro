import { createContext, memo, useContext, useState, type ReactNode } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@project/components/ui/alert-dialog';
import { highlightParts, SECTION_META, type SectionId } from './settingsSearch';

/* ── Search query context (only rows re-render when the debounced query changes) ── */
export const SettingsQueryContext = createContext('');

export function Highlight({ text }: { text: string }) {
  const q = useContext(SettingsQueryContext);
  if (!q) return <>{text}</>;
  return (
    <>
      {highlightParts(text, q).map((p, i) =>
        p.match ? <mark key={i} className="settings-mark">{p.text}</mark> : <span key={i}>{p.text}</span>,
      )}
    </>
  );
}

/* ── Controls ── */
export const Toggle = memo(function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${checked ? 'bg-primary' : 'bg-foreground/15'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
});

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full p-1 gap-1 rounded-xl bg-foreground/[0.05] border border-border">
      {options.map(o => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 min-w-0 truncate text-xs font-bold py-2 px-2 rounded-lg transition-all ${value === o.value ? 'bg-card text-foreground shadow-sm border border-border' : 'text-foreground/50 hover:text-foreground/80 border border-transparent'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Layout primitives ── */
export function SubHeading({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.14em] pt-4 pb-1.5 first:pt-1">{children}</p>;
}

/** A setting row. `inline` puts the control on the right; otherwise it goes below the text. */
export function SettingRow({ id, title, hint, control, inline = true, children }: {
  id: string; title: string; hint: string; control?: ReactNode; inline?: boolean; children?: ReactNode;
}) {
  return (
    <div id={`setting-${id}`} data-setting-id={id} className="setting-row py-3 border-b border-border/70 last:border-0 scroll-mt-28 rounded-lg">
      <div className={`flex ${inline ? 'items-center justify-between gap-4' : 'flex-col gap-2.5'}`}>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground leading-snug"><Highlight text={title} /></p>
          <p className="text-[11px] text-foreground/45 leading-snug mt-0.5"><Highlight text={hint} /></p>
        </div>
        {control && <div className={inline ? 'flex-shrink-0' : 'w-full'}>{control}</div>}
      </div>
      {children}
    </div>
  );
}

/* ── Collapsible section (grid-rows height animation, no max-height jank) ── */
export function SettingsSection({ id, icon, open, onToggle, onReset, children }: {
  id: SectionId; icon: ReactNode; open: boolean; onToggle: (id: SectionId) => void;
  onReset?: () => void; children: ReactNode;
}) {
  const meta = SECTION_META[id];
  const [confirm, setConfirm] = useState(false);
  return (
    <section id={`section-${id}`} className="glass-card overflow-hidden scroll-mt-24">
      <button
        type="button" onClick={() => onToggle(id)} aria-expanded={open} aria-controls={`section-body-${id}`}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left focus-visible:outline-none focus-visible:bg-foreground/[0.03]"
      >
        <span className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 text-primary flex items-center justify-center flex-shrink-0">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-black text-foreground leading-tight">{meta.title}</span>
          <span className="block text-[11px] text-foreground/45 leading-snug mt-0.5 truncate">{meta.desc}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-foreground/35 flex-shrink-0 settings-chevron ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={`section-body-${id}`} className="settings-collapse" data-open={open}>
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-3 border-t border-border">
            {children}
            {onReset && (
              <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogTrigger asChild>
                  <button type="button" className="mt-2 mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-foreground/45 hover:text-foreground/80 transition-colors">
                    <RotateCcw className="w-3 h-3" /> Reset {meta.title} to defaults
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset {meta.title}?</AlertDialogTitle>
                    <AlertDialogDescription>Only the settings in this section go back to their defaults. Your quizzes, history and other sections are untouched.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onReset}>Reset section</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** A row that navigates to another Profile tab. */
export function LinkRow({ id, title, hint, onClick, icon }: { id: string; title: string; hint: string; onClick: () => void; icon: ReactNode }) {
  return (
    <button type="button" id={`setting-${id}`} data-setting-id={id} onClick={onClick}
      className="setting-row w-full flex items-center gap-3 py-3 border-b border-border/70 last:border-0 text-left scroll-mt-28 rounded-lg">
      <span className="w-8 h-8 rounded-lg bg-foreground/[0.05] border border-border flex items-center justify-center text-foreground/60 flex-shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-foreground leading-snug"><Highlight text={title} /></span>
        <span className="block text-[11px] text-foreground/45 leading-snug mt-0.5"><Highlight text={hint} /></span>
      </span>
      <ChevronDown className="w-4 h-4 -rotate-90 text-foreground/30 flex-shrink-0" />
    </button>
  );
}
