import { ChevronLeft, ChevronRight, Square } from 'lucide-react';
import { formatTimeColon } from '../../utils/scoring';

interface Props {
  currentIndex: number;
  totalQuestions: number;
  isLast: boolean;
  isLiveMode: boolean;
  isPaused: boolean;
  feedbackActive: boolean;
  showMockExamMode: boolean;
  accumulatedTime: number;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
  // Confidence
  confidenceLevels?: ('sure' | 'guessing' | null)[];
  onConfidenceChange?: (idx: number, level: 'sure' | 'guessing') => void;
}

export default function QuizFooter({
  currentIndex, totalQuestions, isLast, isLiveMode, isPaused,
  feedbackActive, showMockExamMode, onPrev, onNext, onFinish,
  confidenceLevels, onConfidenceChange,
}: Props) {
  const showFooterNext = !isLiveMode || !feedbackActive;

  return (
    <div className="quiz-footer flex items-center gap-2.5 px-4 sm:px-6 md:px-10 pt-4 pb-5 border-t border-foreground/[0.06]">
      {/* Prev */}
      {!showMockExamMode && (
        <button
          onClick={onPrev}
          disabled={isPaused || currentIndex === 0 || (isLiveMode && feedbackActive)}
          aria-label="Previous question"
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-foreground/5 border border-foreground/10 text-foreground/70 font-bold text-sm px-5 h-14 sm:h-12 rounded-2xl hover:bg-foreground/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          <span className="hidden xs:inline">Prev</span>
        </button>
      )}

      {/* Confidence toggle */}
      {onConfidenceChange && confidenceLevels && (
        <div className="flex gap-0.5 bg-background/30 rounded-xl border border-foreground/[0.06] p-0.5 flex-shrink-0" role="radiogroup" aria-label="Confidence level">
          {([['sure', '💪', 'Sure'], ['guessing', '🤔', 'Guess']] as const).map(([level, emoji, label]) => (
            <button key={level} onClick={() => onConfidenceChange(currentIndex, level)}
              role="radio"
              aria-checked={confidenceLevels[currentIndex] === level}
              aria-label={`Confidence: ${label}`}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-[10px] text-[10px] font-black transition-all ${
                confidenceLevels[currentIndex] === level
                  ? level === 'sure' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' : 'bg-amber-500/20 border border-amber-500/30 text-amber-300'
                  : 'text-foreground/25 hover:text-foreground/50 border border-transparent'
              }`}>
              <span className="text-xs" aria-hidden="true">{emoji}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Mobile progress */}
      <div className="flex sm:hidden flex-col items-center justify-center gap-1 min-w-[42px]">
        <span className="text-[10px] font-black text-foreground/60 tabular-nums" aria-label={`Question ${currentIndex + 1} of ${totalQuestions}`}>
          {currentIndex + 1}/{totalQuestions}
        </span>
        <div className="w-full bg-foreground/5 rounded-full h-1 overflow-hidden" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={totalQuestions}>
          <div
            className="h-full bg-primary/60 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
          />
        </div>
      </div>

      {/* Submit All */}
      <button
        onClick={onFinish}
        disabled={isPaused || (isLiveMode && feedbackActive)}
        aria-label="Submit all answers"
        className="flex items-center justify-center gap-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 font-black text-xs px-4 h-14 sm:h-12 rounded-2xl hover:bg-amber-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
      >
        <Square className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Submit</span>
      </button>

      {/* Desktop progress */}
      <div className="flex-1 hidden sm:flex flex-col items-center gap-1">
        <div className="w-full bg-foreground/5 rounded-full h-1.5 overflow-hidden" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={totalQuestions}>
          <div
            className="h-full bg-primary/60 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
          />
        </div>
        <span className="text-[9px] text-foreground/20 font-bold">{currentIndex + 1} of {totalQuestions}</span>
      </div>

      {/* Next / Finish */}
      {showFooterNext ? (
        <button
          onClick={isLast ? onFinish : onNext}
          disabled={isPaused || (isLiveMode && feedbackActive)}
          aria-label={isLast ? 'Finish quiz' : 'Next question'}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 font-black text-sm px-8 h-14 sm:h-12 rounded-2xl transition-all active:scale-[0.97] border ${
            isLast
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/20 shadow-lg shadow-emerald-900/40'
              : 'bg-primary hover:brightness-110 text-primary-foreground border-primary/20 shadow-lg shadow-primary/25'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isLast ? <>Finish ✓</> : <>Next <ChevronRight className="w-5 h-5" aria-hidden="true" /></>}
        </button>
      ) : (
        <div className="flex-1 sm:flex-none flex items-center justify-center gap-2 h-14 sm:h-12 rounded-2xl border border-foreground/[0.08] text-foreground/25 text-xs font-bold">
          ↓ See result below
        </div>
      )}
    </div>
  );
}
