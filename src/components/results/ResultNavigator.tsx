import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { QuizResult } from '../../types/quiz';
import { getSubjectColors } from '../../utils/subjects';
import { subjectOf } from '../../utils/quizSwitcher';
import QuizSwitcherSheet from './QuizSwitcherSheet';

interface Props {
  index: number;
  total: number;
  current: QuizResult;
  /** every quiz of the history (used by the "Jump to a quiz" popup); without it the strip is just Prev / Next */
  list?: readonly QuizResult[];
  onPrev: () => void;
  onNext: () => void;
  onOpen?: (r: QuizResult) => void;
}

/** The strip on top of a quiz dashboard: Prev | which quiz (tap = jump to any quiz with filters) | Next. */
export default function ResultNavigator({ index, total, current, list, onPrev, onNext, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const canJump = !!list && list.length > 1 && !!onOpen;
  const sub = subjectOf(current);
  const c = getSubjectColors(sub);
  const dots = Math.min(total, 8);

  const Centre = (
    <>
      <span className={`h-9 w-1.5 shrink-0 rounded-full ${c.dot}`} aria-hidden />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[0.9rem] font-extrabold leading-tight text-foreground" data-testid="result-nav-title">{current.quizTitle || 'Untitled quiz'}</span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] font-bold text-foreground/55">
          <span data-testid="result-nav-position">{index + 1} of {total}</span>
          <span className="flex items-center gap-1" aria-hidden>
            {Array.from({ length: dots }).map((_, i) => {
              const at = total <= 8 ? index : Math.round((index / Math.max(1, total - 1)) * (dots - 1));
              return <span key={i} className={`h-1 rounded-full transition-all duration-300 ${i === at ? 'w-4 bg-primary' : 'w-1.5 bg-foreground/20'}`} />;
            })}
          </span>
        </span>
      </span>
      {canJump && <ChevronDown className="h-4 w-4 shrink-0 text-foreground/50" aria-hidden />}
    </>
  );

  return (
    <nav className="qmp-result-nav mb-3" aria-label="Quiz results" data-testid="result-nav">
      <button type="button" onClick={onPrev} disabled={index <= 0} aria-label="Previous quiz" data-testid="result-nav-prev" className="qmp-result-nav__btn">
        <ChevronLeft className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Prev</span>
      </button>
      {canJump ? (
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Jump to a quiz. Now showing ${current.quizTitle || 'untitled quiz'}, ${index + 1} of ${total}`}
          data-testid="result-switcher-open" className="qmp-result-nav__centre">{Centre}</button>
      ) : (
        <div className="qmp-result-nav__centre" data-testid="result-nav-centre">{Centre}</div>
      )}
      <button type="button" onClick={onNext} disabled={index >= total - 1} aria-label="Next quiz" data-testid="result-nav-next" className="qmp-result-nav__btn">
        <span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" aria-hidden />
      </button>
      {open && canJump && <QuizSwitcherSheet list={list!} current={current} onOpen={r => { setOpen(false); onOpen!(r); }} onClose={() => setOpen(false)} />}
    </nav>
  );
}
