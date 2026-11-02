import { useRef, useCallback, useEffect } from 'react';

interface QuestionBallsProps {
  total: number;
  currentIndex: number;
  userAnswers: (string | null)[];
  flaggedQuestions?: boolean[];
  onJump: (idx: number) => void;
  mode: 'submit' | 'live';
  correctnessMap?: (boolean | null)[] | null;
}

export default function QuestionBalls({
  total, currentIndex, userAnswers, flaggedQuestions,
  onJump, mode, correctnessMap,
}: QuestionBallsProps) {
  const ballRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll active ball into view when currentIndex changes
  useEffect(() => {
    const el = ballRefs.current.get(currentIndex);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [currentIndex]);

  /** Also scroll on manual click */
  const handleJump = useCallback((idx: number) => {
    onJump(idx);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      const el = ballRefs.current.get(idx);
      el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 100);
  }, [onJump]);

  return (
    <div
      className="relative bg-background/20 rounded-2xl p-2 mb-5 border border-foreground/5 q-balls-scroll-wrapper"
      role="tablist"
      aria-label={`Quiz navigation — ${total} questions`}
    >
      <div className="flex gap-2 overflow-x-auto py-2.5 px-3 no-scrollbar items-center">
        {Array.from({ length: total }, (_, i) => {
          const isAttempted = userAnswers[i] !== null;
          const isActive    = i === currentIndex;
          const isFlagged   = flaggedQuestions?.[i];

          let colorClass: string;
          if (!isAttempted) {
            colorClass = 'unattempted';
          } else if (correctnessMap != null && correctnessMap[i] === true) {
            colorClass = 'q-correct';
          } else if (correctnessMap != null && correctnessMap[i] === false) {
            colorClass = 'q-wrong';
          } else {
            colorClass = 'attempted';
          }

          const statusLabel = isAttempted
            ? correctnessMap != null
              ? correctnessMap[i] === true ? 'correct' : correctnessMap[i] === false ? 'incorrect' : 'answered'
              : 'answered'
            : 'unanswered';

          return (
            <button
              key={i}
              ref={el => {
                if (el) ballRefs.current.set(i, el);
                else ballRefs.current.delete(i);
              }}
              onClick={() => handleJump(i)}
              role="tab"
              aria-selected={isActive}
              aria-label={`Question ${i + 1}, ${statusLabel}${isFlagged ? ', flagged' : ''}`}
              className={`q-ball flex-shrink-0 relative ${colorClass} ${isActive ? 'q-active' : ''}`}
              title={`Q${i + 1}${isAttempted ? ' (answered)' : ''}${isFlagged ? ' 🚩' : ''}`}
            >
              {i + 1}
              {isFlagged && (
                <span className="absolute -top-1 -right-1 text-[8px] leading-none select-none pointer-events-none" aria-hidden="true">🚩</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="absolute top-0 left-0 bottom-0 w-6 qball-fade-left pointer-events-none rounded-l-2xl" aria-hidden="true" />
      <div className="absolute top-0 right-0 bottom-0 w-6 qball-fade-right pointer-events-none rounded-r-2xl" aria-hidden="true" />
    </div>
  );
}
