/**
 * RationaleSourceControls — viewport-safe. Blue trigger + MobilePopover.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { BookOpen, ChevronDown, Sparkles, Zap } from 'lucide-react';
import { AIMode } from '../../types/quiz';
import MobilePopover from '../ui/MobilePopover';

interface Props {
  prefs: { reportHelper: AIMode };
  onChange: (p: { reportHelper: AIMode }) => void;
}

function SegmentSelect({ value, onChange }: { value: AIMode; onChange: (v: AIMode) => void }) {
  const SEGS: { val: AIMode; label: string; active: string; base: string }[] = [
    { val: 'local', label: 'Zite AI',    active: 'bg-violet-500/20 border-violet-500/30 text-violet-600 dark:text-violet-300', base: 'text-foreground/30 hover:text-violet-500' },
    { val: 'off',   label: 'Off',        active: 'bg-foreground/10 border-foreground/20 text-foreground/60',                   base: 'text-foreground/30 hover:text-foreground/60' },
    { val: 'cloud', label: 'Custom Key', active: 'bg-blue-500/20 border-blue-500/30 text-blue-600 dark:text-blue-300',         base: 'text-foreground/30 hover:text-blue-500' },
  ];
  return (
    <div className="flex gap-1 bg-foreground/5 rounded-xl p-0.5 border border-border">
      {SEGS.map(s => (
        <button key={s.val} onClick={() => onChange(s.val)}
          className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border transition-all leading-none ${
            value === s.val ? s.active : `bg-transparent border-transparent ${s.base}`
          }`}>{s.label}</button>
      ))}
    </div>
  );
}

export default function RationaleSourceControls({ prefs, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const mode = prefs.reportHelper;

  return (
    <div ref={containerRef} className="relative z-30">
      <button onClick={() => setOpen(o => !o)} aria-haspopup="true" aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all select-none ${
          open
            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30'
            : 'bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-300 hover:bg-blue-500/25'
        }`}>
        <div className="relative flex-shrink-0">
          <BookOpen className="w-3.5 h-3.5" />
          {!open && <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${mode !== 'off' ? 'bg-violet-400' : 'bg-foreground/25'}`} />}
        </div>
        <span className="hidden sm:inline leading-none tracking-wide">{mode === 'off' ? 'R.Off' : mode === 'cloud' ? 'R.Custom' : 'R.Zite'}</span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <MobilePopover open={open} onClose={close}
        title="Rationale AI" subtitle="Explanations & Reports"
        icon={<BookOpen className="w-4 h-4 text-blue-500" />}
        desktopWidth="w-[290px]">

        <div className={`mx-3 mt-3 px-3 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
          mode === 'off' ? 'bg-foreground/5 border-border text-foreground/40' :
          mode === 'cloud' ? 'bg-blue-500/8 border-blue-500/15 text-blue-600 dark:text-blue-300' :
          'bg-violet-500/8 border-violet-500/15 text-violet-600 dark:text-violet-300'
        }`}>
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="leading-snug">
            {mode === 'local' ? 'Uses pre-configured Gemini — always works' :
             mode === 'cloud' ? 'Uses your API key from Profile → API Keys' :
             'AI rationale disabled'}
          </span>
        </div>

        <div className="p-3">
          <div className="p-3 rounded-xl bg-foreground/[0.02] border border-border space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className={`w-3.5 h-3.5 ${mode !== 'off' ? 'text-violet-500' : 'text-foreground/25'}`} />
              <span className="text-xs font-black text-foreground/80">Rationale Generation AI</span>
            </div>
            <SegmentSelect value={prefs.reportHelper} onChange={v => onChange({ ...prefs, reportHelper: v })} />
          </div>
        </div>

        <div className="flex gap-2 px-3 pb-3">
          <button onClick={() => onChange({ ...prefs, reportHelper: 'local' })} disabled={mode === 'local'}
            className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all disabled:opacity-30 bg-violet-500/8 border-violet-500/15 text-violet-600 dark:text-violet-400 hover:bg-violet-500/15">
            🧠 Zite AI
          </button>
          <button onClick={() => onChange({ ...prefs, reportHelper: 'off' })} disabled={mode === 'off'}
            className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all disabled:opacity-30 bg-foreground/5 border-border text-foreground/50 hover:bg-foreground/10">
            🚫 Off
          </button>
          <button onClick={() => onChange({ ...prefs, reportHelper: 'cloud' })} disabled={mode === 'cloud'}
            className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all disabled:opacity-30 bg-blue-500/8 border-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/15">
            🔑 Custom
          </button>
        </div>

        <div className="px-3 pb-3">
          <div className="flex items-start gap-2 bg-foreground/[0.03] border border-border rounded-xl px-3 py-2.5">
            <Zap className="w-3 h-3 text-violet-500 mt-0.5 flex-shrink-0" />
            <p className="text-[9px] text-foreground/35 leading-relaxed">
              Controls AI explanations in review & reports. <span className="text-violet-500 font-bold">Zite AI</span> uses the backend Gemini key — always works.
            </p>
          </div>
        </div>
      </MobilePopover>
    </div>
  );
}
