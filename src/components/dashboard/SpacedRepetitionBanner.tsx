import { useMemo } from 'react';
import { CalendarClock, Play, Layers } from 'lucide-react';
import { getDueItems, srItemsToQuizQuestions } from '../../utils/spacedRepetition';
import { QuizQuestion } from '../../types/quiz';

interface Props {
  onStartReview: (questions: QuizQuestion[]) => void;
  onFlashcards?: (filter?: 'review') => void;
}

export default function SpacedRepetitionBanner({ onStartReview, onFlashcards }: Props) {
  const dueItems = useMemo(() => getDueItems(), []);
  const dueCount = dueItems.length;

  if (dueCount === 0) return null;

  const handlePractice = () => {
    const questions = srItemsToQuizQuestions(dueItems.slice(0, 20));
    onStartReview(questions);
  };

  return (
    <div className="flex items-center gap-3 bg-violet-500/8 border border-violet-500/20 rounded-2xl px-4 py-3 animate-slide-up">
      <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
        <CalendarClock className="w-5 h-5 text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-foreground">
          {dueCount} question{dueCount !== 1 ? 's' : ''} due for review
        </p>
        <p className="text-[10px] text-foreground/40 mt-0.5">
          Spaced repetition — review to strengthen memory
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {onFlashcards && (
          <button
            onClick={() => onFlashcards?.('review')}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-md shadow-violet-900/30 transition-all active:scale-[0.97]"
          >
            <Layers className="w-3.5 h-3.5" /> Review
          </button>
        )}
        <button
          onClick={handlePractice}
          className={`flex items-center gap-1.5 text-sm font-bold px-3 py-2.5 rounded-xl transition-all active:scale-[0.97] ${
            onFlashcards
              ? 'bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20'
              : 'bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-900/30'
          }`}
          title="Start practice quiz"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          {!onFlashcards && <span>Review</span>}
        </button>
      </div>
    </div>
  );
}
