/**
 * RationaleControlsButton — viewport-safe popover for rationale settings.
 * Uses MobilePopover for mobile bottom-sheet / desktop dropdown.
 * Blue-themed trigger button for consistency.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { BookOpen, Sparkles, ChevronDown, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { RationalePrefs, AIMode } from '../types/quiz';
import MobilePopover from './ui/MobilePopover';
import { getUserApiKeys } from '../utils/apiKeys';
import { getAiClientPrefs } from '../platform/ai/providers';
import { KEY_PROVIDER_NAMES, resolveSelected, savedKeyChoices } from '../utils/aiChoices';

interface Props {
  prefs: RationalePrefs;
  onChange: (p: RationalePrefs) => void;
  reportHelper: AIMode;
  onReportHelperChange: (m: AIMode) => void;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      role="switch"
      aria-checked={checked}
      className={`relative w-11 h-6 rounded-full border-2 transition-all flex-shrink-0 focus:outline-none cursor-pointer ${
        checked ? 'bg-primary border-primary/60 shadow-md shadow-primary/20' : 'bg-foreground/10 border-foreground/20'
      }`}
    >
      <motion.span layout className="absolute w-4 h-4 bg-white rounded-full top-[3px] shadow-sm"
        animate={{ left: checked ? '23px' : '3px' }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
    </button>
  );
}

export default function RationaleControlsButton({ prefs, onChange, reportHelper, onReportHelperChange }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const bothOff  = !prefs.showBook && !prefs.showAi;
  const bothOn   =  prefs.showBook &&  prefs.showAi;

  // AI explanations use the same switch + saved keys as Create Quiz → AI Generation (no Zite / Custom modes)
  const keyChoices = savedKeyChoices(getUserApiKeys());
  const chosenKey = resolveSelected(keyChoices, getAiClientPrefs().preferred);
  const aiOn = reportHelper !== 'off';
  const aiLine = !aiOn ? "Off · explanations won't generate" : chosenKey ? `🔑 ${KEY_PROVIDER_NAMES[chosenKey]}` : 'Add an API key in Profile → API Keys';

  return (
    <div className="relative z-30">
      {/* ── Blue Trigger Button ── */}
      <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} aria-haspopup="true" aria-expanded={open}
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
          <span className="text-base leading-none flex-shrink-0">{bothOff ? '🚫' : bothOn ? '📖' : prefs.showBook ? '📖' : '💡'}</span>
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
          <div
            role="button"
            tabIndex={0}
            onClick={() => onChange({ ...prefs, showBook: !prefs.showBook })}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange({ ...prefs, showBook: !prefs.showBook }); } }}
            className={`p-3 rounded-xl border cursor-pointer select-none transition-all ${
              prefs.showBook ? 'bg-amber-500/8 border-amber-500/18' : 'bg-foreground/[0.02] border-border hover:bg-foreground/[0.04]'
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
          <div
            role="button"
            tabIndex={0}
            onClick={() => onChange({ ...prefs, showAi: !prefs.showAi })}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange({ ...prefs, showAi: !prefs.showAi }); } }}
            className={`p-3 rounded-xl border cursor-pointer select-none transition-all ${
              prefs.showAi ? 'bg-purple-500/8 border-purple-500/18' : 'bg-foreground/[0.02] border-border hover:bg-foreground/[0.04]'
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
                  <div className="text-[9px] text-foreground/40 mt-0.5 leading-snug">Explanations written by your AI key</div>
                </div>
              </div>
              <Toggle checked={prefs.showAi} onChange={() => onChange({ ...prefs, showAi: !prefs.showAi })} />
            </div>

            {prefs.showAi && (
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onReportHelperChange(aiOn ? 'off' : 'cloud');
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onReportHelperChange(aiOn ? 'off' : 'cloud'); } }}
                className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 cursor-pointer select-none">
                <div className="min-w-0">
                  <div className="text-xs font-black text-foreground/90">AI Generation</div>
                  <div className="mt-0.5 text-[9px] leading-snug text-foreground/40" data-testid="rationale-ai-line">{aiLine}</div>
                </div>
                <Toggle checked={aiOn} onChange={() => onReportHelperChange(aiOn ? 'off' : 'cloud')} />
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
            🚫 All Off
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
