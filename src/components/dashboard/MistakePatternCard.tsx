import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { QuizResult } from '../../types/quiz';
import { detectMistakePatterns, MistakePattern } from '../../utils/mistakePatterns';

interface Props { history: QuizResult[]; }

const SEV_STYLES = {
  high: 'border-red-500/25 bg-red-500/5',
  medium: 'border-amber-500/25 bg-amber-500/5',
  low: 'border-foreground/10 bg-foreground/[0.02]',
};
const SEV_DOT = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-foreground/30' };

function PatternRow({ p }: { p: MistakePattern }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button onClick={() => setExpanded(e => !e)}
      className={`w-full text-left border rounded-xl p-3.5 transition-all active:scale-[0.99] ${SEV_STYLES[p.severity]}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none mt-0.5 flex-shrink-0">{p.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEV_DOT[p.severity]}`} />
            <span className="text-xs font-black text-foreground leading-snug">{p.title}</span>
          </div>
          <p className="text-[11px] text-foreground/50 leading-relaxed">{p.description}</p>
          {expanded && (
            <div className="mt-2 bg-primary/5 border border-primary/15 rounded-lg px-3 py-2 animate-fade-in">
              <p className="text-[10px] font-bold text-primary/70 uppercase tracking-wider mb-1">💡 Tip</p>
              <p className="text-[11px] text-foreground/60 leading-relaxed">{p.tip}</p>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 mt-1">
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-foreground/25" /> : <ChevronDown className="w-3.5 h-3.5 text-foreground/25" />}
        </div>
      </div>
    </button>
  );
}

export default function MistakePatternCard({ history }: Props) {
  const patterns = useMemo(() => detectMistakePatterns(history), [history]);

  if (patterns.length === 0) return null;

  return (
    <div className="glass-card p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🔍</span>
        <h3 className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.12em]">
          Mistake Patterns
        </h3>
        <span className="text-[9px] font-bold text-foreground/20 bg-foreground/5 px-1.5 py-0.5 rounded-md">
          {patterns.length} found
        </span>
      </div>
      <div className="space-y-2">
        {patterns.map(p => <PatternRow key={p.id} p={p} />)}
      </div>
    </div>
  );
}
