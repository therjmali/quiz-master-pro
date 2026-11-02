import { useMemo } from 'react';
import { AlertTriangle, Dumbbell } from 'lucide-react';
import { QuizResult, QuizQuestion } from '../../types/quiz';
import { getTopWeakTopics, WeakTopic } from '../../utils/weakTopics';

interface Props {
  history: QuizResult[];
  onPractice: (questions: QuizQuestion[]) => void;
}

function WeakBar({ topic }: { topic: WeakTopic }) {
  const pct = topic.weaknessScore;
  const barColor = pct >= 70 ? 'bg-red-500' : pct >= 40 ? 'bg-amber-500' : 'bg-yellow-500';
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-foreground/70 truncate max-w-[140px]">{topic.topic}</span>
        <span className="text-[10px] font-black tabular-nums text-foreground/40">
          {topic.wrongCount}✗ / {topic.totalEncounters} total
        </span>
      </div>
      <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function WeakTopicsPanel({ history, onPractice }: Props) {
  const weakTopics = useMemo(() => getTopWeakTopics(history, 5), [history]);

  if (weakTopics.length === 0) return null;

  return (
    <div className="glass-card p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-amber-500/5 pointer-events-none rounded-[1.5rem]" />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-500/15 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h3 className="text-xs font-black text-foreground">Weak Topics</h3>
              <p className="text-[9px] text-foreground/35">Areas needing review</p>
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          {weakTopics.map(topic => (
            <div key={topic.topic} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <WeakBar topic={topic} />
              </div>
              {topic.questions.length > 0 && (
                <button
                  onClick={() => onPractice(topic.questions)}
                  className="flex-shrink-0 flex items-center gap-1 text-[9px] font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-2 py-1 rounded-lg transition-all active:scale-95"
                >
                  <Dumbbell className="w-3 h-3" /> Practice
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
