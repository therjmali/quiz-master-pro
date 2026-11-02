import { useState, useRef, useEffect, useCallback } from 'react';
import { Shuffle, BookOpen, ChevronDown } from 'lucide-react';
import MobilePopover from './ui/MobilePopover';

interface Props {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  onToggleQuestions: (v: boolean) => void;
  onToggleOptions: (v: boolean) => void;
}

function ToggleSwitch({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  return (
    <button type="button" id={id} onClick={() => onChange(!checked)} role="switch" aria-checked={checked}
      className={`relative w-11 h-6 rounded-full border-2 transition-all flex-shrink-0 focus:outline-none ${
        checked ? 'bg-primary border-primary/60 shadow-md shadow-primary/25' : 'bg-foreground/10 border-foreground/20'
      }`}>
      <span className={`absolute w-4 h-4 bg-white rounded-full top-[3px] shadow transition-all duration-200 ${checked ? 'left-[23px]' : 'left-[3px]'}`} />
    </button>
  );
}

export default function ShuffleControlsButton({ shuffleQuestions, shuffleOptions, onToggleQuestions, onToggleOptions }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const isOriginal = !shuffleQuestions && !shuffleOptions;
  const isFullShuffle = shuffleQuestions && shuffleOptions;

  const bannerConfig = isOriginal
    ? { icon: '📖', text: 'Original order — matches physical book', cls: 'bg-emerald-500/8 border-emerald-500/15 text-emerald-600 dark:text-emerald-300' }
    : isFullShuffle
    ? { icon: '🔀', text: 'Fully shuffled — random order each time', cls: 'bg-blue-500/8 border-blue-500/15 text-blue-600 dark:text-blue-300' }
    : { icon: '⚡', text: `${shuffleQuestions ? 'Questions' : 'Options'} shuffled only`, cls: 'bg-amber-500/8 border-amber-500/15 text-amber-600 dark:text-amber-300' };

  return (
    <div ref={containerRef} className="relative z-30">
      {/* ── Blue Trigger ── */}
      <button onClick={() => setOpen(o => !o)} aria-haspopup="true" aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all select-none ${
          open
            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30'
            : 'bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-300 hover:bg-blue-500/25'
        }`}>
        {isOriginal ? <BookOpen className="w-3.5 h-3.5 flex-shrink-0" /> : <Shuffle className="w-3.5 h-3.5 flex-shrink-0" />}
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* ── Popover ── */}
      <MobilePopover open={open} onClose={close}
        title="Order Controls" subtitle="Question & Option Ordering"
        icon={<Shuffle className="w-4 h-4 text-blue-500" />}
        desktopWidth="w-[300px]">

        {/* Status banner */}
        <div className={`mx-3 mt-3 px-3 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${bannerConfig.cls}`}>
          <span className="text-base leading-none flex-shrink-0">{bannerConfig.icon}</span>
          <span className="leading-snug">{bannerConfig.text}</span>
        </div>

        {/* Controls */}
        <div className="p-3 space-y-2">
          <label htmlFor="toggle-shuffle-q"
            className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              shuffleQuestions ? 'bg-blue-500/8 border-blue-500/15' : 'bg-foreground/[0.02] border-border hover:bg-foreground/[0.04]'
            }`}>
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                shuffleQuestions ? 'bg-blue-500/20 border border-blue-500/25' : 'bg-foreground/5 border border-border'
              }`}><span className="text-sm leading-none">🔀</span></div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground/90 leading-tight">Shuffle Questions</div>
                <div className="text-[10px] text-foreground/40 mt-0.5">
                  {shuffleQuestions ? 'Random order' : 'Original order'}
                </div>
              </div>
            </div>
            <ToggleSwitch id="toggle-shuffle-q" checked={shuffleQuestions} onChange={onToggleQuestions} />
          </label>

          <label htmlFor="toggle-shuffle-o"
            className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              shuffleOptions ? 'bg-blue-500/8 border-blue-500/15' : 'bg-foreground/[0.02] border-border hover:bg-foreground/[0.04]'
            }`}>
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                shuffleOptions ? 'bg-blue-500/20 border border-blue-500/25' : 'bg-foreground/5 border border-border'
              }`}><span className="text-sm leading-none">🎲</span></div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground/90 leading-tight">Shuffle Options</div>
                <div className="text-[10px] text-foreground/40 mt-0.5">
                  {shuffleOptions ? 'A/B/C/D randomized' : 'Original A/B/C/D order'}
                </div>
              </div>
            </div>
            <ToggleSwitch id="toggle-shuffle-o" checked={shuffleOptions} onChange={onToggleOptions} />
          </label>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 px-3 pb-3">
          <button onClick={() => { onToggleQuestions(false); onToggleOptions(false); }} disabled={isOriginal}
            className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-emerald-500/8 border-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15">
            📖 Original
          </button>
          <button onClick={() => { onToggleQuestions(true); onToggleOptions(true); }} disabled={isFullShuffle}
            className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-blue-500/8 border-blue-500/15 text-blue-600 dark:text-blue-300 hover:bg-blue-500/15">
            🔀 Full Shuffle
          </button>
        </div>

        <div className="px-3 pb-3">
          <div className="flex items-start gap-2 bg-foreground/[0.03] border border-border rounded-xl px-3 py-2.5">
            <span className="text-sm mt-0.5 flex-shrink-0">💡</span>
            <p className="text-[10px] text-foreground/35 leading-relaxed">
              Set to <span className="text-foreground/55 font-bold">Original Order</span> when reviewing with your physical book.
            </p>
          </div>
        </div>
      </MobilePopover>
    </div>
  );
}
