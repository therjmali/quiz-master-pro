import { useMemo, useState } from 'react';
import { AlertTriangle, Dumbbell, ChevronDown, ChevronUp } from 'lucide-react';
import { QuizResult, QuizQuestion } from '../../types/quiz';
import { getWeakQuestions, WeakQuestion } from '../../utils/practiceUtils';

interface Props {
  history: QuizResult[];
  onPractice?: (questions: QuizQuestion[]) => void;
}

function WeakQuestionRow({ wq }: { wq: WeakQuestion }) {
  const [showAnswer, setShowAnswer] = useState(false);
  return (
    <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-black text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded border border-red-500/25 flex-shrink-0 mt-0.5">
          ✗{wq.timesWrong}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground leading-snug line-clamp-2">{wq.question}</p>
          {wq.quizTitle && (
            <span className="text-[9px] text-foreground/25 mt-0.5 block truncate">from: {wq.quizTitle}</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[9px]">
          <span className="text-foreground/30">{wq.timesWrong}/{wq.timesAttempted} wrong</span>
          {wq.lastUserAnswer && (
            <span className="text-red-400/60">Last: {wq.lastUserAnswer.slice(0, 30)}</span>
          )}
        </div>
        <button
          onClick={() => setShowAnswer(s => !s)}
          className="text-[9px] font-bold text-emerald-400/60 hover:text-emerald-400 transition-colors"
        >
          {showAnswer ? 'Hide' : 'Answer'}
        </button>
      </div>
      {showAnswer && (
        <div className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 animate-fade-in">
          ✓ {wq.correctAnswer}
        </div>
      )}
    </div>
  );
}

export default function WeakQuestionsPanel({ history, onPractice }: Props) {
  const [expanded, setExpanded] = useState(false);
  const weakQuestions = useMemo(() => getWeakQuestions(history, 15), [history]);

  if (weakQuestions.length === 0) return null;

  const visible = expanded ? weakQuestions : weakQuestions.slice(0, 4);

  // Build QuizQuestion array from weak questions for practice
  const buildPracticeQuestions = (): QuizQuestion[] => {
    return weakQuestions.map(wq => {
      // Try to find the full question data from history
      for (const r of history) {
        if (!r.quizData?.length) continue;
        const found = r.quizData.find(q => q.question === wq.question);
        if (found) return found;
      }
      return {
        question: wq.question,
        correctAnswer: wq.correctAnswer,
        options: wq.options.length > 0 ? wq.options : [wq.correctAnswer],
        difficulty: 'medium' as const,
      };
    });
  };

  return (
    <div className="glass-card p-4 border-amber-500/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Weak Questions</p>
        </div>
        <span className="text-[9px] text-red-400/60 font-bold">{weakQuestions.length} questions</span>
      </div>

      <div className="space-y-1.5">
        {visible.map(wq => <WeakQuestionRow key={wq.question.slice(0, 50)} wq={wq} />)}
      </div>

      {weakQuestions.length > 4 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-center gap-1 text-[10px] font-bold text-foreground/30 hover:text-foreground/50 transition-colors py-1"
        >
          {expanded ? <><ChevronUp className="w-3 h-3" /> Show Less</> : <><ChevronDown className="w-3 h-3" /> Show All ({weakQuestions.length})</>}
        </button>
      )}

      {onPractice && weakQuestions.length > 0 && (
        <button
          onClick={() => onPractice(buildPracticeQuestions())}
          className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-300 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-[0.98]"
        >
          <Dumbbell className="w-3.5 h-3.5" />
          Practice All {weakQuestions.length} Weak Questions
        </button>
      )}
    </div>
  );
}
