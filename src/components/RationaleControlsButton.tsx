/**
 * RationaleControlsButton — viewport-safe popover for rationale settings.
 * Uses MobilePopover for mobile bottom-sheet / desktop dropdown.
 * Blue-themed trigger button for consistency.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { BookOpen, Sparkles, ChevronDown, Zap, Brain } from 'lucide-react';
import { motion } from 'framer-motion';
import { RationalePrefs, AIMode } from '../types/quiz';
import MobilePopover from './ui/MobilePopover';

interface Props {
  prefs: RationalePrefs;
  onChange: (p: RationalePrefs) => void;
  reportHelper: AIMode;
  onReportHelperChange: (m: AIMode) => void;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} role="switch" aria-checked={checked}
      className={`relative w-11 h-6 rounded-full border-2 transition-all flex-shrink-0 focus:outline-none ${
        checked ? 'bg-primary border-primary/60 shadow-md shadow-primary/20' : 'bg-foreground/10 border-foreground/20'
      }`}>
      <motion.span layout className="absolute w-4 h-4 bg-white rounded-full top-[3px] shadow-sm"
        animate={{ left: checked ? '23px' : '3px' }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
    </button>
  );
}

function AISegment({ value, onChange }: { value: AIMode; onChange: (v: AIMode) => void }) {
  const SEGS: { val: AIMode; label: string; active: string; base: string }[] = [
    { val: 'local', label: 'Zite AI',    active: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-600 dark:text-emerald-300', base: 'text-foreground/30 hover:text-emerald-500' },
    { val: 'off',   label: 'Off',        active: 'bg-foreground/10 border-foreground/20 text-foreground/60',                       base: 'text-foreground/30 hover:text-foreground/60' },
    { val: 'cloud', label: 'Custom Key', active: 'bg-blue-500/20 border-blue-500/30 text-blue-600 dark:text-blue-300',             base: 'text-foreground/30 hover:text-blue-500' },
  ];
  return (
    <div className="flex gap-1 bg-foreground/5 rounded-xl p-0.5 border border-border mt-2">
      {SEGS.map(s => (
        <button key={s.val} onClick={() => onChange(s.val)}
          className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border transition-all leading-none ${
            value === s.val ? s.active : `bg-transparent border-transparent ${s.base}`
          }`}>{s.label}</button>
      ))}
    </div>
  );
}

export default function RationaleControlsButton({ prefs, onChange, reportHelper, onReportHelperChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Desktop outside-click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const bothOff  = !prefs.showBook && !prefs.showAi;
  const bothOn   =  prefs.showBook &&  prefs.showAi;

  const aiSourceBadge =
    reportHelper === 'local' ? { label: 'Zite AI', cls: 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/15 border-emerald-500/25' } :
    reportHelper === 'cloud' ? { label: 'Custom Key', cls: 'text-blue-600 dark:text-blue-300 bg-blue-500/15 border-blue-500/25' } :
    { label: 'AI Off', cls: 'text-foreground/35 bg-foreground/5 border-border' };

  return (
    <div ref={ref} className="relative z-30">
      {/* ── Blue Trigger Button ── */}
      <button onClick={() => setOpen(o => !o)} aria-haspopup="true" aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all select-none ${
          open
            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30'
            : 'bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-300 hover:bg-blue-500/25'
        }`}>
        <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* ── Popover ── */}
      <MobilePopover open={open} onClose={close}
        title="Rationale" subtitle="Report Explanations"
        icon={<BookOpen className="w-4 h-4 text-blue-500" />}
        desktopWidth="w-[310px]">

        {/* Status banner */}
        <div className={`mx-3 mt-3 px-3 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
          bothOff ? 'bg-foreground/5 border-border text-foreground/40'
          : 'bg-amber-500/8 border-amber-500/15 text-amber-600 dark:text-amber-300'
        }`}>
          <span className="text-base leading-none flex-shrink-0">{bothOff ? '🙈' : bothOn ? '📖' : prefs.showBook ? '📖' : '💡'}</span>
          <span className="leading-snug">
            {bothOff ? 'All rationale hidden in reports'
             : bothOn ? 'Book + AI rationale shown in reports'
             : prefs.showBook ? 'Book rationale only (AI hidden)'
             : 'AI rationale only (Book hidden)'}
          </span>
        </div>

        {/* Controls */}
        <div className="p-3 space-y-2">
          {/* Book Rationale */}
          <div className={`p-3 rounded-xl border transition-all ${
            prefs.showBook ? 'bg-amber-500/8 border-amber-500/18' : 'bg-foreground/[0.02] border-border'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  prefs.showBook ? 'bg-amber-500/20 border border-amber-500/25' : 'bg-foreground/5 border border-border'
                }`}>
                  <BookOpen className={`w-3.5 h-3.5 ${prefs.showBook ? 'text-amber-500' : 'text-foreground/25'}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-foreground/90">📖 Book Rationale</div>
                  <div className="text-[9px] text-foreground/40 mt-0.5 leading-snug">Embedded notes from source text</div>
                </div>
              </div>
              <Toggle checked={prefs.showBook} onChange={() => onChange({ ...prefs, showBook: !prefs.showBook })} />
            </div>
          </div>

          {/* AI Rationale */}
          <div className={`p-3 rounded-xl border transition-all ${
            prefs.showAi ? 'bg-purple-500/8 border-purple-500/18' : 'bg-foreground/[0.02] border-border'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  prefs.showAi ? 'bg-purple-500/20 border border-purple-500/25' : 'bg-foreground/5 border border-border'
                }`}>
                  <Sparkles className={`w-3.5 h-3.5 ${prefs.showAi ? 'text-purple-500' : 'text-foreground/25'}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-foreground/90">💡 AI Rationale</div>
                  <div className="text-[9px] text-foreground/40 mt-0.5 leading-snug">Gemini / Claude explanations</div>
                </div>
              </div>
              <Toggle checked={prefs.showAi} onChange={() => onChange({ ...prefs, showAi: !prefs.showAi })} />
            </div>

            {prefs.showAi && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-1.5 mb-1">
                  <Brain className="w-3 h-3 text-foreground/30" />
                  <span className="text-[9px] font-black text-foreground/35 uppercase tracking-wider">AI Source</span>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${aiSourceBadge.cls}`}>
                    {aiSourceBadge.label}
                  </span>
                </div>
                <AISegment value={reportHelper} onChange={onReportHelperChange} />
                {reportHelper === 'off' && (
                  <p className="text-[9px] text-amber-500/60 mt-1.5 px-0.5">⚠️ AI is off — explanations won't generate</p>
                )}
                {reportHelper === 'cloud' && (
                  <p className="text-[9px] text-blue-500/60 mt-1.5 px-0.5">🔑 Using your API key from Profile → API Keys</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 px-3 pb-3">
          <button onClick={() => onChange({ showBook: true, showAi: true })} disabled={bothOn}
            className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-amber-500/8 border-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15">
            📖 All On
          </button>
          <button onClick={() => onChange({ showBook: false, showAi: false })} disabled={bothOff}
            className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-foreground/5 border-border text-foreground/40 hover:bg-foreground/10 hover:text-foreground/60">
            🙈 All Off
          </button>
        </div>

        {/* Footer hint */}
        <div className="px-3 pb-3">
          <div className="flex items-start gap-2 bg-foreground/[0.03] border border-border rounded-xl px-3 py-2.5">
            <Zap className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-[9px] text-foreground/35 leading-relaxed">
              These settings apply to <span className="text-foreground/55 font-bold">all review sections</span> — Full Report, Correct, Mistakes &amp; Skipped.
            </p>
          </div>
        </div>
      </MobilePopover>
    </div>
  );
}
