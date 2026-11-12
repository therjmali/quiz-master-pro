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
    if (!aiEnabled) { setAiError('AI is off — enable it in the 📖 Rationale button above.'); return; }
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
  const diffEmoji = (q.difficulty || 'medium').toLowerCase() === 'easy' ? '🟢' : (q.difficulty || 'medium').toLowerCase() === 'hard' ? '🔴' : '🟡';
  const statusEmoji = isCorrect ? '✅' : isSkipped ? '⏭️' : '❌';
  const tint = isCorrect ? 'bg-emerald-500/[0.09] border-emerald-500/25' : isSkipped ? 'bg-amber-500/[0.10] border-amber-500/25' : 'bg-red-500/[0.08] border-red-500/25';
  const correctIdx = opts.findIndex(o => o === q.correctAnswer || q.correctAnswers?.includes(o));
  const answerTitle = correctIdx >= 0 ? `Ans. - (${String.fromCharCode(97 + correctIdx)}) ${opts[correctIdx]}` : `Ans. - ${q.correctAnswer}`;
  const shortOpts = opts.every(o => String(o).length <= 14);
  const disputeDot = existingDispute ? (existingDispute.verdict === 'confirmed' ? 'bg-emerald-500' : existingDispute.verdict === 'disputed' ? 'bg-amber-500' : 'bg-red-500') : '';

  const act = 'relative flex h-10 min-w-0 items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-bold transition-all active:scale-95 whitespace-nowrap';

  return (
    <div
      className={`${tint} rounded-3xl border p-4 md:p-6 shadow-[0_4px_15px_rgba(0,0,0,0.04)] transition-colors relative`}
      data-review-status={status}
      onClick={handleDoubleTap}
    >
      {/* Bookmark burst animation */}
      {showBurst && (
        <div className="absolute top-3 right-12 z-20 pointer-events-none">
          <span className="absolute inset-0 flex items-center justify-center text-lg animate-ping">⭐</span>
        </div>
      )}

      {/* Header: number · attempt status · difficulty - one straight line, emoji only */}
      <div className="mb-3 flex flex-nowrap items-center gap-2.5 border-b border-foreground/10 pb-3" data-testid="review-card-header">
        <div className={`flex h-9 min-w-9 items-center justify-center rounded-xl border-2 px-1.5 text-sm font-black tabular-nums ${
          isCorrect ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' : isSkipped ? 'border-amber-500/40 bg-amber-500/10 text-amber-500' : 'border-red-500/40 bg-red-500/10 text-red-500'
        }`}>{index + 1}</div>
        <span className="text-xl leading-none" role="img" aria-label={statusText}>{statusEmoji}</span>
        <span className="text-xl leading-none" role="img" aria-label={`${mergedBadge.label} difficulty`}>{diffEmoji}</span>
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
                <span className="mr-1.5 text-xs font-bold text-foreground/35">({String.fromCharCode(97 + i)})</span>
                {opt}
              </span>
              {badge}
            </div>
          );
        })}
      </div>

      {/* Wrong answer note */}
      {showAnswersInline && !isSkipped && !isCorrect && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-xs text-foreground/50">
          <span>You answered:</span>
          <span className="font-bold text-red-500">{userAnswer}</span>
        </div>
      )}

      {/* Rationale: white box, purple left bar, "Ans. - (x) text", bullet body */}
      <div className={`grid transition-all duration-300 ease-in-out ${ratOpen ? 'mb-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="rounded-xl border-l-4 border-[#7c3aed] bg-card p-3 shadow-sm" data-testid="rationale-box">
            <p className="mb-1.5 text-[13px] font-black leading-snug text-foreground">{answerTitle}</p>
            {effBook && (bookRationale
              ? <div className="flex gap-1.5 text-xs text-foreground/75"><span className="font-black text-[#7c3aed]">•</span><AiRationaleText text={bookRationale} className="text-xs text-foreground/75" /></div>
              : <p className="text-[11px] text-foreground/40">• No explanation came with this question.</p>)}
            {effAi && (
              <div className={effBook ? 'mt-2 border-t border-border pt-2' : ''}>
                {aiRationale ? (
                  <div className="flex gap-1.5 text-xs text-foreground/75"><span className="font-black text-violet-500">•</span><div className="min-w-0"><span className="mb-0.5 block text-[9px] font-black uppercase tracking-widest text-violet-500">💡 AI</span><AiRationaleText text={aiRationale} className="text-xs text-foreground/75" /></div></div>
                ) : aiError ? (
                  <p className="text-xs leading-relaxed text-destructive">{aiError}</p>
                ) : !aiEnabled ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-foreground/40"><BrainCircuit className="h-3.5 w-3.5 flex-shrink-0" /> AI explanation is off - turn it on in Rationale settings.</p>
                ) : (
                  <button type="button" onClick={(e) => { e.stopPropagation(); void handleAiExplain(); }} disabled={loadingRat}
                    className="flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2 text-xs font-bold text-violet-600 transition-all hover:bg-violet-500/20 dark:text-violet-300">
                    {loadingRat ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> AI thinking…</> : <><Sparkles className="h-3.5 w-3.5" /> Get AI explanation</>}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom action bar: one straight line */}
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Question actions" data-testid="review-card-actions">
        <button type="button" aria-pressed={ratOpen} aria-label="Rationale" onClick={(e) => { e.stopPropagation(); hapticTap(); setRatOverride(ratOpen ? false : true); }}
          className={`${act} ${ratOpen ? 'border-[#7c3aed]/40 bg-[#7c3aed]/12 text-[#7c3aed]' : 'border-border bg-background/60 text-foreground/65'}`}>
          <span className="text-sm leading-none">📖</span><span>Rational</span>
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
