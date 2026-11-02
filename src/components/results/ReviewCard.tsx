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

  const showAnyRationale = (showBook && !!bookRationale) || showAi;

  return (
    <div
      className="bg-card rounded-2xl border border-border p-5 md:p-6 shadow-sm hover:border-foreground/15 transition-colors relative"
      data-review-status={status}
      onClick={handleDoubleTap}
    >
      {/* Top-right action buttons: AI Chat + Bookmark */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        {onAskAI && (
          <button
            onClick={(e) => { e.stopPropagation(); hapticTap(); onAskAI({ question: q.question, options: q.options, correctAnswer: q.correctAnswer, userAnswer, rationale: q.rationale, difficulty: q.difficulty, questionType: q.questionType }); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 bg-foreground/5 text-foreground/25 hover:bg-primary/15 hover:text-primary border border-transparent hover:border-primary/20"
            title="Chat about this question"
          >
            <span className="text-sm leading-none">🤖</span>
          </button>
        )}
        {(bookmarked || onToggleBookmark) && (
          <button
            onClick={(e) => { e.stopPropagation(); hapticTap(); onToggleBookmark?.(); }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 ${
              bookmarked ? 'bg-amber-500/20 text-amber-400' : 'bg-foreground/5 text-foreground/20 hover:text-foreground/40'
            }`}
          >
            <Bookmark className="w-4 h-4" fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      {/* Bookmark burst animation */}
      {showBurst && (
        <div className="absolute top-3 right-12 z-20 pointer-events-none">
          <span className="absolute inset-0 flex items-center justify-center text-lg animate-ping">⭐</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4 pb-3 border-b border-border pr-[4.5rem]">
        {/* Stylish question number badge */}
        <div className={`flex items-center justify-center w-9 h-9 rounded-xl border-2 font-black text-sm tabular-nums flex-shrink-0 ${
          isCorrect ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' :
          isSkipped ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' :
          'border-red-500/40 bg-red-500/10 text-red-400'
        }`}>
          {index + 1}
        </div>
        <div className={`flex items-center gap-1.5 ${statusColor} font-black text-xs uppercase tracking-widest`}>
          <span className={`w-2 h-2 rounded-full ${statusDot} flex-shrink-0`} />
          {statusText}
        </div>
        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${mergedBadge.classes}`}>
          {mergedBadge.emoji} {mergedBadge.label}
        </span>
        {showBook && bookRationale && (
          <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
            📖 Source
          </span>
        )}
        {showAi && aiRationale && !loadingRat && (
          <span className="text-[9px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
            💡 AI Ready
          </span>
        )}
        {existingDispute && (
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
            existingDispute.verdict === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
            existingDispute.verdict === 'disputed' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
            'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            {existingDispute.verdict === 'confirmed' ? '✅' : existingDispute.verdict === 'disputed' ? '⚠️' : '❌'} {existingDispute.verdict}
          </span>
        )}
        <button onClick={(e) => { e.stopPropagation(); setShowDispute(true); }}
          className="text-[9px] font-bold text-foreground/25 hover:text-primary bg-foreground/5 hover:bg-primary/10 px-2 py-0.5 rounded border border-transparent hover:border-primary/20 transition-all">
          🚩 Dispute
        </button>
      </div>

      {showDispute && <DisputeModal question={q} onClose={() => setShowDispute(false)} />}

      {/* Question image */}
      {q.imageUrl && <QuestionImage url={q.imageUrl} maxHeight="180px" />}

      {/* Question text */}
      <h3 className="text-foreground/90 text-base md:text-[17px] leading-relaxed mb-5 font-medium">
        <MultilineText text={q.question} />
      </h3>

      {/* Options */}
      <div className="space-y-2 mb-4">
        {opts.map((opt, i) => {
          const isThisCorrect = opt === q.correctAnswer || q.correctAnswers?.includes(opt) || false;
          const isThisUser    = opt === userAnswer;
          let cls = 'bg-foreground/4 border-border';
          let badge: React.ReactNode = null;

          if (showAnswersInline) {
            if (isThisCorrect) {
              cls = 'bg-emerald-500/10 border-emerald-500/25';
              badge = (
                <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/25 font-bold whitespace-nowrap flex-shrink-0">
                  ✓ Correct
                </span>
              );
            } else if (isThisUser && !isCorrect) {
              cls = 'bg-red-500/10 border-red-500/25';
              badge = (
                <span className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 px-2 py-0.5 rounded border border-red-500/25 font-bold whitespace-nowrap flex-shrink-0">
                  ✗ Yours
                </span>
              );
            }
          }

          return (
            <div key={i} className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${cls}`}>
              <span className="text-sm text-foreground/80 leading-snug">
                <span className="text-foreground/30 font-bold mr-2 text-xs">({String.fromCharCode(97 + i)})</span>
                {opt}
              </span>
              {badge}
            </div>
          );
        })}
      </div>

      {/* Wrong answer note */}
      {showAnswersInline && !isSkipped && !isCorrect && (
        <div className="text-xs text-foreground/40 bg-foreground/5 px-4 py-2.5 rounded-xl border border-border mb-4 flex items-center gap-2">
          <span className="text-foreground/30">You answered:</span>
          <span className="font-bold text-red-500">{userAnswer}</span>
        </div>
      )}

      {/* Rationale section — smooth height transitions */}
      <div className="space-y-2.5 mt-4">
        {/* Book Rationale */}
        <div className={`grid transition-all duration-300 ease-in-out ${showBook ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            {bookRationale ? (
              <div className="bg-amber-500/10 border-l-4 border-amber-500/50 p-3 rounded-r-xl leading-relaxed">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <BookOpen className="w-3 h-3 text-amber-500/80 flex-shrink-0" />
                  <span className="font-black text-amber-600 dark:text-amber-300 uppercase text-[9px] tracking-widest">📖 Source</span>
                </div>
                <AiRationaleText text={bookRationale} className="text-xs text-foreground/70" />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[10px] py-2 px-3 rounded-lg bg-amber-500/5 border border-amber-500/15 text-amber-500/60">
                <BookOpen className="w-3 h-3 flex-shrink-0" />
                No source rationale — this question's source text didn't include an explanation
              </div>
            )}
          </div>
        </div>

        {/* AI Rationale */}
        <div className={`grid transition-all duration-300 ease-in-out ${showAi ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            {aiRationale ? (
              <div className="bg-violet-500/10 border-l-4 border-violet-500/50 p-3 rounded-r-xl leading-relaxed">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3 h-3 text-violet-500/90 flex-shrink-0" />
                  <span className="font-black text-violet-600 dark:text-violet-300 uppercase text-[9px] tracking-widest">💡 AI</span>
                </div>
                <AiRationaleText text={aiRationale} className="text-xs text-foreground/75" />
              </div>
            ) : aiError ? (
              <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                <span className="text-destructive text-xs leading-relaxed">{aiError}</span>
              </div>
            ) : !aiEnabled ? (
              <div className="flex items-center gap-2 text-xs py-2.5 px-5 rounded-xl bg-foreground/4 border border-border text-foreground/30">
                <BrainCircuit className="w-3.5 h-3.5 flex-shrink-0" />
                AI explanation off — enable in <span className="font-bold text-foreground/40 mx-1">📖 Rationale → AI Source</span>
              </div>
            ) : (
              <button onClick={handleAiExplain} disabled={loadingRat}
                className="flex items-center gap-2 text-xs py-2.5 px-5 rounded-xl font-bold bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 hover:border-violet-500/35 text-violet-600 dark:text-violet-300 transition-colors disabled:opacity-60">
                {loadingRat
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> AI Thinking…</>
                  : <><Sparkles className="w-3.5 h-3.5" /> 💡 Get AI Explanation</>
                }
              </button>
            )}
          </div>
        </div>
      </div>

      {!showBook && !showAi && (
        <div className="mt-3 text-[10px] text-foreground/20 text-center">
          Rationale hidden — toggle in <span className="text-foreground/30 font-bold">📖 Rationale</span> button
        </div>
      )}
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
