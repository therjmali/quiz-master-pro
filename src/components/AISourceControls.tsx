/**
 * AISourceControls — viewport-safe dropdown for Quiz AI + Rationale AI.
 * Blue-themed trigger. Mobile bottom-sheet / desktop dropdown via MobilePopover.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Brain, ChevronDown, Sparkles, Zap, BookOpen } from 'lucide-react';
import { AIMode, AIPrefs } from '../types/quiz';
import MobilePopover from './ui/MobilePopover';

function SegmentSelect({ value, onChange, accent = 'emerald' }: {
  value: AIMode; onChange: (v: AIMode) => void; accent?: 'emerald' | 'violet';
}) {
  const colors = accent === 'violet'
    ? { local: 'bg-violet-500/20 border-violet-500/30 text-violet-600 dark:text-violet-300', cloud: 'bg-blue-500/20 border-blue-500/30 text-blue-600 dark:text-blue-300', localHover: 'hover:text-violet-500' }
    : { local: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-600 dark:text-emerald-300', cloud: 'bg-blue-500/20 border-blue-500/30 text-blue-600 dark:text-blue-300', localHover: 'hover:text-emerald-500' };

  const SEGS: { val: AIMode; label: string; color: string; active: string }[] = [
    { val: 'local', label: 'Zite AI',   color: `text-foreground/30 ${colors.localHover}`, active: colors.local },
    { val: 'off',   label: 'Off',       color: 'text-foreground/30 hover:text-foreground/60', active: 'bg-foreground/10 border-foreground/20 text-foreground/60' },
    { val: 'cloud', label: 'Custom AI', color: 'text-foreground/30 hover:text-blue-500', active: colors.cloud },
  ];
  return (
    <div className="flex gap-1 bg-foreground/5 rounded-xl p-0.5 border border-border">
      {SEGS.map(s => (
        <button key={s.val} onClick={() => onChange(s.val)}
          className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border transition-all leading-none ${
            value === s.val ? s.active : `bg-transparent border-transparent ${s.color}`
          }`}>{s.label}</button>
      ))}
    </div>
  );
}

interface Props { prefs: AIPrefs; onChange: (p: AIPrefs) => void; }

export default function AISourceControls({ prefs, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const qMode = prefs.quizHelper;
  const rMode = prefs.reportHelper;
  const anyActive = qMode !== 'off' || rMode !== 'off';

  return (
    <div ref={containerRef} className="relative z-[60]">
      {/* ── Blue Trigger ── */}
      <button onClick={() => setOpen(o => !o)} aria-haspopup="true" aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all select-none ${
          open
            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30'
            : 'bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-300 hover:bg-blue-500/25'
        }`}>
        <div className="relative flex-shrink-0">
          <Brain className="w-3.5 h-3.5" />
          {!open && <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${anyActive ? 'bg-emerald-400' : 'bg-foreground/25'}`} />}
        </div>
        <span className="hidden sm:inline leading-none tracking-wide">{anyActive ? 'AI' : 'AI Off'}</span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* ── Popover ── */}
      <MobilePopover open={open} onClose={close}
        title="AI Controls" subtitle="Quiz & Rationale AI"
        icon={<Brain className="w-4 h-4 text-blue-500" />}
        desktopWidth="w-[320px]">

        {/* Quiz Generation AI */}
        <div className="px-3 pt-3">
          <div className="p-3 rounded-xl bg-foreground/[0.02] border border-border space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className={`w-3.5 h-3.5 ${qMode !== 'off' ? 'text-emerald-500' : 'text-foreground/25'}`} />
              <span className="text-xs font-black text-foreground/80">Quiz Generation AI</span>
              <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                qMode === 'local' ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-600 dark:text-emerald-300' :
                qMode === 'cloud' ? 'bg-blue-500/15 border-blue-500/25 text-blue-600 dark:text-blue-300' :
                'bg-foreground/5 border-border text-foreground/40'
              }`}>
                {qMode === 'local' ? '🧠 Zite' : qMode === 'cloud' ? '🔑 Custom' : '🚫 Off'}
              </span>
            </div>
            <SegmentSelect value={prefs.quizHelper} onChange={v => onChange({ ...prefs, quizHelper: v })} accent="emerald" />
          </div>
        </div>

        {/* Rationale Generation AI */}
        <div className="px-3 pt-2">
          <div className="p-3 rounded-xl bg-foreground/[0.02] border border-border space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className={`w-3.5 h-3.5 ${rMode !== 'off' ? 'text-violet-500' : 'text-foreground/25'}`} />
              <span className="text-xs font-black text-foreground/80">Rationale Generated By</span>
              <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                rMode === 'local' ? 'bg-violet-500/15 border-violet-500/25 text-violet-600 dark:text-violet-300' :
                rMode === 'cloud' ? 'bg-blue-500/15 border-blue-500/25 text-blue-600 dark:text-blue-300' :
                'bg-foreground/5 border-border text-foreground/40'
              }`}>
                {rMode === 'local' ? '🧠 Zite' : rMode === 'cloud' ? '🔑 Custom' : '🚫 Off'}
              </span>
            </div>
            <SegmentSelect value={prefs.reportHelper} onChange={v => onChange({ ...prefs, reportHelper: v })} accent="violet" />
          </div>
        </div>

        {/* Instruction */}
        <div className="px-3 pt-2 pb-3">
          <div className="flex items-start gap-2 bg-foreground/[0.03] border border-border rounded-xl px-3 py-2.5">
            <Zap className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-[9px] text-foreground/40 leading-relaxed">
              Uses your API key from Profile → API Keys. <span className="text-emerald-500 font-bold">Zite AI</span> (Gemini/Anthropic) uses the backend key — always works.
            </p>
          </div>
        </div>
      </MobilePopover>
    </div>
  );
}
