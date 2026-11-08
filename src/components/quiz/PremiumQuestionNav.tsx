import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface Props {
  total: number;
  currentIndex: number;
  userAnswers: (string | null)[];
  flaggedQuestions?: boolean[];
  /** Indices the student has already opened (used for the "skipped" state). */
  visited?: Set<number>;
  /** Per-question bookmark state. */
  bookmarked?: boolean[];
  /** Returns false when a jump is not allowed (follows the Previous-button rules). */
  canJump?: (idx: number) => boolean;
  onJump: (idx: number) => void;
  /** Controlled mode: the merged quiz header owns the toggle, this component only renders the grid. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Expired (time-up) questions — shown locked. */
  expired?: boolean[];
  mode: 'submit' | 'live';
  /** Practice mode only — never passed in Exam mode. */
  correctnessMap?: (boolean | null)[] | null;
}

const OPEN_KEY = 'qmp_qnav_open';
const readOpen = () => { try { return sessionStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } };
const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

type Status = 'current' | 'correct' | 'wrong' | 'answered' | 'skipped' | 'unanswered';

const STATUS_CLASS: Record<Status, string> = {
  current: 'bg-primary text-primary-foreground border-2 border-primary ring-4 ring-primary/30 shadow-lg shadow-primary/30',
  correct: 'bg-emerald-500/90 text-white border-2 border-emerald-500',
  wrong: 'bg-red-500/90 text-white border-2 border-red-500',
  answered: 'bg-emerald-500/90 text-white border-2 border-emerald-500',
  skipped: 'bg-transparent text-foreground/70 border-2 border-dashed border-foreground/40',
  unanswered: 'bg-transparent text-foreground/60 border-2 border-foreground/15',
};

const STATUS_LABEL: Record<Status, string> = {
  current: 'current', correct: 'answered, correct', wrong: 'answered, wrong',
  answered: 'answered', skipped: 'visited, not answered', unanswered: 'not answered',
};

export default function PremiumQuestionNav({
  total, currentIndex, userAnswers, flaggedQuestions, visited, bookmarked, canJump,
  onJump, mode, correctnessMap, open: openProp, onOpenChange, expired,
}: Props) {
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(readOpen);
  const open = controlled ? !!openProp : openState;
  const setOpen = useCallback((v: boolean | ((o: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(open) : v;
    if (controlled) onOpenChange?.(next); else setOpenState(next);
  }, [controlled, open, onOpenChange]);
  const ballRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const showCorrectness = mode === 'live' && !!correctnessMap;

  useEffect(() => { if (!controlled) { try { sessionStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* ignore */ } } }, [open, controlled]);

  // Keep the current number in view whenever the grid is open or the question changes.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => ballRefs.current.get(currentIndex)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), 60);
    return () => clearTimeout(t);
  }, [open, currentIndex]);

  const stats = useMemo(() => {
    let answered = 0, flagged = 0, marked = 0;
    for (let i = 0; i < total; i++) {
      if (userAnswers[i] !== null && userAnswers[i] !== undefined) answered++;
      if (flaggedQuestions?.[i]) flagged++;
      if (bookmarked?.[i]) marked++;
    }
    return { answered, unanswered: total - answered, flagged, marked };
  }, [total, userAnswers, flaggedQuestions, bookmarked]);

  const progressPct = total > 0 ? Math.round((stats.answered / total) * 100) : 0;

  const statusOf = (i: number): Status => {
    if (i === currentIndex) return 'current';
    const isAnswered = userAnswers[i] !== null && userAnswers[i] !== undefined;
    if (isAnswered) {
      if (showCorrectness && correctnessMap?.[i] === true) return 'correct';
      if (showCorrectness && correctnessMap?.[i] === false) return 'wrong';
      return 'answered';
    }
    return visited?.has(i) ? 'skipped' : 'unanswered';
  };

  const handleJump = useCallback((idx: number) => {
    if (canJump && !canJump(idx)) return;
    onJump(idx);
    if (isMobile()) setOpen(false);
  }, [onJump, canJump]);

  return (
    <div className={controlled ? (open ? 'mb-4 rounded-2xl border border-border/60 bg-card/60 px-3 py-2.5' : '') : 'mb-4 rounded-2xl border border-border/60 bg-card/60 px-3 py-2.5'}>
      {/* Header — always visible (collapsed view); the merged quiz header replaces it in controlled mode */}
      {!controlled && <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="qnav-grid"
        aria-label={open ? 'Hide question navigator' : 'Show question navigator'}
        className="w-full flex items-center gap-3 text-left min-h-[44px]"
      >
        <span className="text-sm font-black tabular-nums text-foreground whitespace-nowrap">
          Q{currentIndex + 1}<span className="text-foreground/40 font-bold">/{total}</span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="h-1.5 rounded-full bg-foreground/[0.08] overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="mt-1 text-[11px] font-semibold text-foreground/55 tabular-nums truncate">
            {stats.answered} answered · {stats.unanswered} remaining
          </p>
        </div>
        <ChevronDown className={`w-5 h-5 text-foreground/50 flex-shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>}

      {/* Expandable grid — animated with grid-rows 0fr → 1fr */}
      <div
        id="qnav-grid"
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        {...({ inert: open ? undefined : '' } as Record<string, unknown>)}
      >
        <div className="overflow-hidden">
          <div className="pt-3 max-h-[40vh] overflow-y-auto thin-scrollbar">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2 p-1">
              {Array.from({ length: total }, (_, i) => {
                const status = statusOf(i);
                const isFlagged = !!flaggedQuestions?.[i];
                const isMarked = !!bookmarked?.[i];
                const allowed = !canJump || canJump(i);
                const isAnswered = status === 'answered' || status === 'correct' || status === 'wrong';
                const label = `Question ${i + 1}, ${expired?.[i] && i !== currentIndex ? 'time up, locked, ' : ''}${STATUS_LABEL[status]}${status === 'current' && isAnsweredAt(userAnswers, i) ? ', answered' : ''}${isFlagged ? ', flagged' : ''}${isMarked ? ', bookmarked' : ''}${allowed ? '' : ', locked'}`;
                return (
                  <button
                    key={i}
                    type="button"
                    ref={el => { if (el) ballRefs.current.set(i, el); else ballRefs.current.delete(i); }}
                    onClick={() => handleJump(i)}
                    aria-label={label}
                    aria-current={status === 'current' ? 'step' : undefined}
                    aria-disabled={!allowed || undefined}
                    className={`relative h-11 min-w-[44px] rounded-xl text-sm font-black tabular-nums flex items-center justify-center transition-transform duration-150 active:scale-95 motion-reduce:transition-none ${STATUS_CLASS[status]} ${allowed ? '' : 'opacity-35 cursor-not-allowed'}`}
                  >
                    {i + 1}
                    {expired?.[i] && i !== currentIndex && <span className="absolute inset-0 rounded-xl bg-background/55 flex items-end justify-end pr-1 pb-0.5 text-[10px]" aria-hidden="true">🔒</span>}
                    {isAnswered && (
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-background border border-current flex items-center justify-center" aria-hidden="true">
                        {status === 'wrong'
                          ? <span className="text-[9px] leading-none font-black text-red-500">×</span>
                          : <Check className="w-2.5 h-2.5 text-emerald-500" strokeWidth={4} />}
                      </span>
                    )}
                    {isFlagged && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-background" aria-hidden="true" />}
                    {isMarked && (
                      <span
                        className="absolute top-0 left-0 w-0 h-0 border-t-[10px] border-r-[10px] border-t-blue-500 border-r-transparent rounded-tl-xl"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend + counts */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-foreground/55">
            <Legend swatch="bg-emerald-500 border-emerald-500" text={`Answered ${stats.answered}`} />
            <Legend swatch="border-foreground/30" text={`Unanswered ${stats.unanswered}`} />
            <Legend swatch="border-dashed border-foreground/40" text="Skipped" />
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />Flagged {stats.flagged}</span>
            <span className="flex items-center gap-1"><span className="w-0 h-0 border-t-[7px] border-r-[7px] border-t-blue-500 border-r-transparent" />Bookmarked {stats.marked}</span>
            {showCorrectness && <Legend swatch="bg-red-500 border-red-500" text="Wrong" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function isAnsweredAt(ua: (string | null)[], i: number) {
  return ua[i] !== null && ua[i] !== undefined;
}

function Legend({ swatch, text }: { swatch: string; text: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`w-2.5 h-2.5 rounded-[3px] border ${swatch}`} />
      {text}
    </span>
  );
}
