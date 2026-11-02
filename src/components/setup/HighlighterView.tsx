import { useState, useMemo } from 'react';
import { Highlighter, Sparkles, X } from 'lucide-react';

interface Props {
  text: string;
  onGenerate: (highlightedText: string) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function HighlighterView({ text, onGenerate, onClose, loading }: Props) {
  const paragraphs = useMemo(() =>
    text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 10),
  [text]);

  const [highlighted, setHighlighted] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setHighlighted(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const selectedText = Array.from(highlighted)
    .sort((a, b) => a - b)
    .map(i => paragraphs[i])
    .join('\n\n');

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Highlighter className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-black text-foreground">Highlight & Quiz</h3>
        </div>
        <button onClick={onClose} className="text-foreground/30 hover:text-foreground/60">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-foreground/40">
        Tap paragraphs to highlight them. Quiz will be generated from <strong>only</strong> highlighted sections.
      </p>

      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border bg-card/50 p-4 space-y-2">
        {paragraphs.map((p, i) => (
          <button key={i} onClick={() => toggle(i)}
            className={`w-full text-left p-3 rounded-xl border text-sm leading-relaxed transition-all ${
              highlighted.has(i)
                ? 'bg-amber-500/15 border-amber-500/30 text-foreground'
                : 'bg-transparent border-transparent text-foreground/60 hover:bg-foreground/5 hover:border-border'
            }`}>
            {p}
          </button>
        ))}
        {paragraphs.length === 0 && (
          <p className="text-center text-foreground/30 py-8 text-sm">No paragraphs found in text</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground/40">
          {highlighted.size > 0
            ? <span className="text-amber-400 font-bold">{highlighted.size} section{highlighted.size !== 1 ? 's' : ''} highlighted</span>
            : 'Highlight the parts you want to be quizzed on'}
        </span>
        <button
          onClick={() => onGenerate(selectedText)}
          disabled={highlighted.size === 0 || loading}
          className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-bold px-5 py-2.5 rounded-xl transition-all active:scale-[0.97] disabled:opacity-40">
          <Sparkles className="w-4 h-4" />
          {loading ? 'Generating…' : 'Generate Quiz →'}
        </button>
      </div>
    </div>
  );
}
