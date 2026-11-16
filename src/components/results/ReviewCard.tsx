import { useState, useEffect, useRef, memo } from 'react';
import React from 'react';
import { Loader2, Sparkles, BookOpen, BrainCircuit, Bookmark, Shield } from 'lucide-react';
import { hapticTap } from '../../utils/haptics';
import { QuizQuestion } from '../../types/quiz';
import { getMergedBadge } from '../../utils/difficultyBadge';
import AiRationaleText from '../AiRationaleText';
import QuestionImage from '../QuestionImage';
import DisputeModal from './DisputeModal';
import { getDispute } from '../../utils/disputes';

interface Props {
  q: QuizQuestion;
  index: number;
  userAnswer: string | null;
  rationaleCache: Record<string, string>;
  getAiRationale: (question: string, correctAnswer: string, userAnswer: string | null, status: 'correct' | 'wrong' | 'skipped') => Promise<string>;
  showBook?: boolean;
  showAi?: boolean;
  showAnswersInline?: boolean;
  aiEnabled?: boolean;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
  onAskAI?: (context: { question: string; options: string[]; correctAnswer: string; userAnswer: string | null; rationale?: string; difficulty?: string; questionType?: string }) => void;
}

function MultilineText({ text }: { text: string }) {
  return <>{text.split('\n').map((line, i) => (<span key={i}>{i > 0 && <br />}{line}</span>))}</>;
}

function ReviewCardInner({
  q, index, userAnswer, rationaleCache, getAiRationale,
  showBook = true, showAi = true, showAnswersInline = true, aiEnabled = true,
  bookmarked = false, onToggleBookmark, onAskAI,
}: Props) {
  // Double-tap to bookmark
  const lastTapRef = useRef(0);
  const [showBurst, setShowBurst] = useState(false);
  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      hapticTap();
      onToggleBookmark?.();
      setShowBurst(true);
      setTimeout(() => setShowBurst(false), 600);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };
  const bookRationale = q.rationale?.trim() || '';
  const [aiRationale, setAiRationale] = useState(rationaleCache[q.question] || '');
  const [loadingRat, setLoadingRat] = useState(false);
  const [aiError, setAiError] = useState('');
  const [showDispute, setShowDispute] = useState(false);
  const existingDispute = getDispute(q.question);

  useEffect(() => {
    const cached = rationaleCache[q.question];
    if (cached && cached !== aiRationale) setAiRationale(cached);
  }, [rationaleCache, q.question]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCorrect = userAnswer === q.correctAnswer || (userAnswer !== null && q.correctAnswers?.includes(userAnswer)) || false;
  const isSkipped = userAnswer === null;
  const status    = isCorrect ? 'correct' : isSkipped ? 'skipped' : 'wrong';
  const opts      = q.shuffledOpts || q.options;

  const statusColor = isCorrect ? 'text-emerald-500' : isSkipped ? 'text-amber-500' : 'text-red-500';
  const statusDot   = isCorrect ? 'bg-emerald-500' : isSkipped ? 'bg-amber-500' : 'bg-red-500';
  const statusText  = isCorrect ? 'Correct' : isSkipped ? 'Skipped' : 'Wrong';
  const mergedBadge = getMergedBadge(q.difficulty, q.questionType);

  const handleAiExplain = async () => {
    if (loadingRat) return;
    if (!aiEnabled) { setAiError('AI is off. Turn it on from Create Quiz.'); return; }
    if (aiRationale) return;
    setAiError(''); setLoadingRat(true);
    try {
      const r = await getAiRationale(q.question, q.correctAnswer, userAnswer, status);
      if (r) setAiRationale(r);
      else setAiError('AI returned an empty response. Check your AI source settings.');
    } catch {
      setAiError('Could not load explanation. Please try again.');
    } finally { setLoadingRat(false); }
  };

  // "📖 Rational" on the card overrides the global Book / AI switches for this one question.
  const [ratOverride, setRatOverride] = useState<boolean | null>(null);
  const effBook = ratOverride ?? showBook;
  const effAi = ratOverride ?? showAi;
  const ratOpen = effBook || effAi;
  // difficulty icon only when the question has a known level
  const lvl = String(q.difficulty ?? '').trim().toLowerCase();
  const diffEmoji = lvl === 'easy' ? '🟢' : lvl === 'hard' ? '🔴' : lvl === 'medium' ? '🟡' : '';
  const statusEmoji = isCorrect ? '✅' : isSkipped ? '⏭️' : '❌';
  // status tint: green / red / yellow (Tailwind 50 on light, 950 at 30% on dark)
  const tint = isCorrect ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-500/25' : isSkipped ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-500/25' : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-500/25';
  const shortOpts = opts.every(o => String(o).length <= 14);
  const disputeDot = existingDispute ? (existingDispute.verdict === 'confirmed' ? 'bg-emerald-500' : existingDispute.verdict === 'disputed' ? 'bg-amber-500' : 'bg-red-500') : '';

  const act = 'relative flex h-10 min-w-0 items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-bold transition-all duration-200 ease-in-out active:scale-95 whitespace-nowrap cursor-pointer';

  return (
    <div
      className={`${tint} rounded-3xl border p-4 md:p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] transition-all duration-200 ease-in-out relative`}
      data-review-status={status}
      onClick={handleDoubleTap}
    >
      {/* Bookmark burst animation */}
      {showBurst && (
        <div className="absolute top-3 right-12 z-20 pointer-events-none">
          <span className="absolute inset-0 flex items-center justify-center text-lg animate-ping">⭐</span>
        </div>
      )}

      {/* Header: [status] Q1. [difficulty] - one straight line, emoji only */}
      <div className="mb-3 flex flex-nowrap items-center gap-2 border-b border-foreground/10 pb-3" data-testid="review-card-header">
        <span className="text-xl leading-none" role="img" aria-label={statusText}>{statusEmoji}</span>
        <span className="text-base font-black tabular-nums text-foreground">Q{index + 1}.</span>
        {diffEmoji && <span className="text-lg leading-none" role="img" aria-label={`${mergedBadge.label || lvl} difficulty`}>{diffEmoji}</span>}
        {mergedBadge.label && !/^(easy|medium|hard)$/i.test(mergedBadge.label) && (
          <span className={`truncate rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${mergedBadge.classes}`}>{mergedBadge.label}</span>
        )}
      </div>

      {/* Question image */}
      {q.imageUrl && <QuestionImage url={q.imageUrl} maxHeight="180px" />}

      {/* Question text */}
      <h3 className="mb-4 text-base font-semibold leading-relaxed text-foreground/90 md:text-[17px]">
        <MultilineText text={q.question} />
      </h3>

      {/* Options: 2x2 when short, stacked when long */}
      <div className={`mb-4 ${shortOpts && opts.length === 4 ? 'grid grid-cols-2 gap-2' : 'space-y-2'}`}>
        {opts.map((opt, i) => {
          const isThisCorrect = opt === q.correctAnswer || q.correctAnswers?.includes(opt) || false;
          const isThisUser    = opt === userAnswer;
          let cls = 'bg-background/60 border-border';
          let badge: React.ReactNode = null;

          if (showAnswersInline) {
            if (isThisCorrect) {
              cls = 'bg-emerald-500/15 border-emerald-500/35';
              badge = <span className="flex-shrink-0 whitespace-nowrap text-[11px] font-black text-emerald-600 dark:text-emerald-400" aria-label="Correct answer">✓</span>;
            } else if (isThisUser && !isCorrect) {
              cls = 'bg-red-500/15 border-red-500/35';
              badge = <span className="flex-shrink-0 whitespace-nowrap text-[11px] font-black text-red-600 dark:text-red-400" aria-label="Your answer">✗</span>;
            }
          }

          return (
            <div key={i} className={`flex items-center justify-between gap-2 rounded-xl border p-3 ${cls}`}>
              <span className="text-sm leading-snug text-foreground/85">
                <span className="mr-1.5 text-xs font-bold text-foreground">({String.fromCharCode(65 + i)})</span>
                {opt}
              </span>
              {badge}
            </div>
          );
        })}
      </div>

      {/* Inline Answer Line: immediately below options, bold, color-coded */}
      {showAnswersInline && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-xs">
          <span className={`font-bold ${isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            Ans. - ({String.fromCharCode(65 + Math.max(0, opts.indexOf(q.correctAnswer)))}) {q.correctAnswer}.
          </span>
          {!isCorrect && !isSkipped && (
            <span className="text-[11px] text-foreground/50 ml-auto">
              (You answered: <span className="font-semibold text-red-500">{userAnswer}</span>)
            </span>
          )}
        </div>
      )}

      {/* Rationale */}
      <div className={`grid transition-all duration-300 ease-in-out ${ratOpen ? 'mb-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          {/* divider, then 📖 + the original bullets (and 🤖 + the AI bullets); no "Ans." line and no text labels */}
          <div className="border-t border-foreground/10 pt-3" data-testid="rationale-box">
            {effBook && (
              <div className="flex items-start gap-2">
                <span className="pt-0.5 text-base leading-none" role="img" aria-label="Book rationale">📖</span>
                <div className="min-w-0 flex-1">
                  {bookRationale
                    ? <AiRationaleText text={bookRationale} className="text-xs text-foreground/75" />
                    : <p className="text-[11px] text-foreground/45">No explanation came with this question.</p>}
                </div>
              </div>
            )}
            {effAi && (
              <div className={`flex items-start gap-2 ${effBook ? 'mt-2.5' : ''}`}>
                <span className="pt-0.5 text-base leading-none" role="img" aria-label="AI rationale">🤖</span>
                <div className="min-w-0 flex-1">
                  {aiRationale ? (
                    <AiRationaleText text={aiRationale} className="text-xs text-foreground/75" />
                  ) : aiError ? (
                    <p className="text-xs leading-relaxed text-destructive">{aiError}</p>
                  ) : !aiEnabled ? (
                    <p className="flex items-center gap-1.5 text-[11px] text-foreground/45"><BrainCircuit className="h-3.5 w-3.5 flex-shrink-0" /> AI is off. Turn it on from Create Quiz.</p>
                  ) : (
                    <button type="button" onClick={(e) => { e.stopPropagation(); void handleAiExplain(); }} disabled={loadingRat}
                      className="flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2 text-xs font-bold text-violet-700 transition-all hover:bg-violet-500/20 dark:text-violet-300">
                      {loadingRat ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> AI thinking…</> : <><Sparkles className="h-3.5 w-3.5" /> Get AI explanation</>}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom action bar: one straight line */}
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Question actions" data-testid="review-card-actions">
        <button type="button" aria-pressed={ratOpen} aria-label="Rationale" onClick={(e) => { e.stopPropagation(); hapticTap(); setRatOverride(ratOpen ? false : true); }}
          className={`${act} ${ratOpen ? 'border-[#7c3aed]/40 bg-[#7c3aed]/12 text-[#7c3aed]' : 'border-border bg-background/60 text-foreground/65'}`}>
          <span className="text-sm leading-none">📖</span><span>Rationale</span>
        </button>
        <button type="button" aria-label="Dispute this question" onClick={(e) => { e.stopPropagation(); setShowDispute(true); }}
          className={`${act} border-border bg-background/60 text-foreground/65`}>
          <span className="text-sm leading-none">⚖️</span><span>Dispute</span>
          {disputeDot && <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${disputeDot}`} aria-hidden="true" />}
        </button>
        <button type="button" aria-pressed={bookmarked} aria-label={bookmarked ? 'Saved' : 'Save'} onClick={(e) => { e.stopPropagation(); hapticTap(); onToggleBookmark?.(); }} disabled={!onToggleBookmark && !bookmarked}
          className={`${act} ${bookmarked ? 'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'border-border bg-background/60 text-foreground/65'}`}>
          <span className="text-sm leading-none">💾</span><span>{bookmarked ? 'Saved' : 'Save'}</span>
        </button>
        <button type="button" aria-label="Ask AI about this question" disabled={!onAskAI}
          onClick={(e) => { e.stopPropagation(); hapticTap(); onAskAI?.({ question: q.question, options: q.options, correctAnswer: q.correctAnswer, userAnswer, rationale: q.rationale, difficulty: q.difficulty, questionType: q.questionType }); }}
          className={`${act} border-border bg-background/60 text-foreground/65 disabled:opacity-40`}>
          <span className="text-sm leading-none">🤖</span><span>AI</span>
        </button>
      </div>

      {showDispute && <DisputeModal question={q} onClose={() => setShowDispute(false)} />}
    </div>
  );
}

const ReviewCard = memo(ReviewCardInner, (prev, next) => {
  return (
    prev.q === next.q &&
    prev.index === next.index &&
    prev.userAnswer === next.userAnswer &&
    prev.showBook === next.showBook &&
    prev.showAi === next.showAi &&
    prev.showAnswersInline === next.showAnswersInline &&
    prev.aiEnabled === next.aiEnabled &&
    prev.bookmarked === next.bookmarked &&
    // Compare only this question's cache entry instead of entire object reference
    prev.rationaleCache[prev.q.question] === next.rationaleCache[next.q.question]
  );
});

export default ReviewCard;
