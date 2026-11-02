import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { QuizResult } from '../../types/quiz';
import { generateNudge } from '../../utils/studyNudges';

interface Props {
  history: QuizResult[];
  onAction?: () => void;
}

export default function SmartNudgeBanner({ history, onAction }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const nudge = useMemo(() => generateNudge(history), [history]);

  if (!nudge || dismissed) return null;

  const bgMap: Record<string, string> = {
    'streak-risk': 'from-orange-500/10 to-red-500/10 border-orange-500/20',
    'exam-approaching': 'from-red-500/10 to-pink-500/10 border-red-500/20',
    'spaced-rep': 'from-violet-500/10 to-purple-500/10 border-violet-500/20',
    'weak-topic': 'from-blue-500/10 to-indigo-500/10 border-blue-500/20',
    'improvement': 'from-emerald-500/10 to-teal-500/10 border-emerald-500/20',
    'consistency': 'from-amber-500/10 to-yellow-500/10 border-amber-500/20',
  };

  return (
    <div className={`relative bg-gradient-to-r ${bgMap[nudge.type] || 'from-primary/10 to-accent/10 border-primary/20'} border rounded-2xl p-4 animate-slide-up`}>
      <button onClick={() => setDismissed(true)} className="absolute top-2 right-2 text-foreground/20 hover:text-foreground/50 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-center gap-3">
        <span className="text-2xl flex-shrink-0">{nudge.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground leading-snug">{nudge.message}</p>
        </div>
        {nudge.actionLabel && onAction && (
          <button onClick={onAction}
            className="flex-shrink-0 bg-primary/15 hover:bg-primary/25 text-primary text-[10px] font-bold px-3 py-2 rounded-xl border border-primary/25 transition-all active:scale-95">
            {nudge.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
