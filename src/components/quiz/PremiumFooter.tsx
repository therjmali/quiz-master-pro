import { ChevronLeft, ChevronRight, Send } from 'lucide-react';

interface Props {
  currentIndex: number;
  totalQuestions: number;
  isLast: boolean;
  isLiveMode: boolean;
  isPaused: boolean;
  feedbackActive: boolean;
  showMockExamMode: boolean;
  answeredCount: number;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
}

export default function PremiumFooter({
  currentIndex, totalQuestions, isLast, isLiveMode, isPaused,
  feedbackActive, showMockExamMode, answeredCount, onPrev, onNext, onFinish,
}: Props) {
  const showFooterNav = !isLiveMode || !feedbackActive;
  const disabled = isPaused || (isLiveMode && feedbackActive);

  return (
    <div className="premium-quiz-footer flex-shrink-0">
      <div className="flex items-center gap-2 px-3 sm:px-5 py-2.5">
        {/* Previous */}
        {!showMockExamMode && showFooterNav && (
          <button
            onClick={onPrev}
            disabled={disabled || currentIndex === 0}
            aria-label="Previous"
            className="prem-footer-prev"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-bold">Previous</span>
          </button>
        )}

        {/* Submit All — center dominant */}
        <button
          onClick={onFinish}
          disabled={disabled}
          className="prem-footer-submit"
        >
          <span className="font-black text-sm">Submit All</span>
          <Send className="w-4 h-4" />
        </button>

        {/* Next / Finish */}
        {showFooterNav && (
          <button
            onClick={isLast ? onFinish : onNext}
            disabled={disabled}
            aria-label={isLast ? 'Finish' : 'Next'}
            className={`prem-footer-next ${isLast ? 'prem-footer-finish' : ''}`}
          >
            <span className="text-sm font-bold">{isLast ? 'Finish' : 'Next'}</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {!showFooterNav && (
          <div className="flex-1 flex items-center justify-center text-foreground/20 text-xs font-bold h-12 rounded-2xl border border-foreground/[0.06]">
            ↓ See result below
          </div>
        )}
      </div>
    </div>
  );
}
