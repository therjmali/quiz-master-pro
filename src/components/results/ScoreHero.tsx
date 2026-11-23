import { useMemo, useState } from 'react';
import { Share2, RotateCcw, Sparkles, Calculator, CheckCircle2, XCircle } from 'lucide-react';
import ResultStatsPanel from './ResultStatsPanel';
import { toast } from 'sonner';
import { formatTime, derivePercentage, precisePct as calcPrecisePct } from '../../utils/scoring';
import { QuizResult, QuizSettings, QuizQuestion } from '../../types/quiz';
import { getSubjectColors } from '../../utils/subjects';
import { isNegativeMarkingApplied, getOriginalScore, getQuizKey } from '../../utils/negativeMarkingStore';
import PremiumSpeedometer from './PremiumSpeedometer';
import ShareResultCard from './ShareResultCard';
import NegativeMarkingPanel from './NegativeMarkingPanel';

import type { FacetKey, StatusFilter } from '../../utils/attemptStats';

interface Props {
  result: QuizResult;
  settings: QuizSettings;
  /** ✅ ❌ ⏭️ tiles that are on (empty = All) */
  selected?: readonly FacetKey[];
  startAnimation?: boolean;
  onHome: () => void;
  onRetry: () => void;
  onNewQuiz: () => void;
  onPracticeMistakes: () => void;
  onRetryAll: () => void;
  onFilterReview: (f: StatusFilter) => void;
  onMoreLikeThis?: () => void;
  moreLikeThisLoading?: boolean;
  quizData?: QuizQuestion[];
  userAnswers?: (string | null)[];
  onApplyMarking?: (marksPerQ: number, negMarks: number, simResult: import('../../types/quiz').ScoreResult) => void;
  onRemoveMarking?: () => void;
  showDecimalPct?: boolean;
}

const CONFETTI_COLORS = ['#F0A500', '#34C759', '#FF3B5C', '#BF5AF2', '#F9F0DC', '#4ECDC4', '#fbbf24', '#ec4899'];

function Confetti({ show }: { show: boolean }) {
  const particles = useMemo(() =>
    Array.from({ length: show ? 60 : 0 }, (_, i) => ({
      id: i,
      left: (i * 11.7 + Math.random() * 8) % 100,
      delay: (i * 0.06) % 2.8,
      duration: 2.2 + (i * 0.07) % 2.8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 4 + (i * 0.11) % 7,
      isCircle: i % 3 !== 0,
      xDrift: ((i * 17) % 60) - 30,
    })), [show]);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.5rem]" aria-hidden>
      {particles.map(p => (
        <div
          key={p.id}
          className="confetti-particle absolute"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            backgroundColor: p.color,
            width: p.size,
            height: p.size,
            borderRadius: p.isCircle ? '50%' : '2px',
            '--x-drift': `${p.xDrift}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export default function ScoreHero({
  result, settings, selected = [], startAnimation = true,
  onHome, onRetry, onNewQuiz, onPracticeMistakes, onRetryAll, onFilterReview,
  onMoreLikeThis, moreLikeThisLoading,
  quizData, userAnswers, onApplyMarking, onRemoveMarking, showDecimalPct = false,
}: Props) {
  const { netScore, maxScore, gain, penalty, correct, wrong, skipped, accuracy, timeTaken, totalQuestions } = result;
  // Always derive percentage from netScore/maxScore — never trust stored percentage which can be stale
  const percentage = derivePercentage(netScore, maxScore);
  const precisePercentage = calcPrecisePct(netScore, maxScore);

  const passMark = result.passMark ?? settings.passMark ?? 50;
  const isPassed = percentage >= passMark;
  const isPerfect = percentage === 100;
  const showConfetti = percentage >= 50;

  const [showShare, setShowShare] = useState(false);
  const [showNegPanel, setShowNegPanel] = useState(false);

  const emoji = isPerfect ? '🌟' : percentage >= 90 ? '🏆' : percentage >= 70 ? '🌟' : percentage >= 50 ? '👍' : '📚';
  const title = isPerfect ? 'Perfect Score! 🎊' : percentage >= 90 ? 'Outstanding!' : percentage >= 70 ? 'Great Job!' : percentage >= 50 ? 'Good Effort!' : 'Keep Practicing!';

  // outcome palette for the hero glow and the headline
  const tone = isPerfect || percentage >= 90 ? { a: '#d4a017', b: '#34C759', text: 'from-amber-500 to-emerald-500' }
    : percentage >= 70 ? { a: '#10b981', b: '#6366f1', text: 'from-emerald-500 to-indigo-500' }
    : percentage >= passMark ? { a: '#f59e0b', b: '#6366f1', text: 'from-amber-500 to-orange-500' }
    : { a: '#ef4444', b: '#8b5cf6', text: 'from-rose-500 to-violet-500' };
  const when = new Date(result.timestamp);
  const whenLabel = Number.isNaN(when.getTime()) ? '' : `${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  const rawPctValue = maxScore > 0 ? (showDecimalPct ? Math.max(0, Math.min(100, Math.round((netScore / maxScore) * 10000) / 100)) : Math.max(0, Math.min(100, Math.round((netScore / maxScore) * 100)))) : undefined;

  return (
    <div className="glass-card rh-card rx-hero p-4 md:p-7 mb-4 flex flex-col items-center relative overflow-hidden animate-fade-in" style={{ ['--rx-a' as string]: tone.a, ['--rx-b' as string]: tone.b }} data-testid="result-hero">
      <Confetti show={showConfetti} />

      {/* Perfect score banner */}
      {isPerfect && (
        <div className="relative z-10 w-full mb-4 py-2.5 px-4 bg-yellow-500/10 border border-yellow-500/25 rounded-2xl text-center backdrop-blur-sm">
          <span className="text-yellow-600 dark:text-yellow-300 font-black text-sm">🌟 PERFECT SCORE! Every single answer correct! 🌟</span>
        </div>
      )}

      <div className="rh-grid">
      <div className="rh-left">
      {/* Quiz title & subject */}
      {(result.quizTitle || result.subject) && (
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 mb-3">
          {result.quizTitle && (
            <span className="text-sm font-black text-foreground/80 bg-foreground/6 border border-border px-3 py-1 rounded-xl backdrop-blur-sm">
              {result.quizTitle}
            </span>
          )}
          {result.subject && (() => {
            const c = getSubjectColors(result.subject!);
            return <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${c.badge}`}>{result.subject}</span>;
          })()}
          {result.isRetrySession && (
            <span className="text-xs font-bold bg-purple-500/12 text-purple-400 border border-purple-500/20 px-2 py-1 rounded-lg flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Retry
            </span>
          )}
        </div>
      )}

      {whenLabel && <p className="relative z-10 -mt-1 mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/45" data-testid="result-date">{whenLabel}</p>}
      <div className="rx-emoji relative z-10 mb-3 select-none" aria-hidden="true">{emoji}</div>
      <h2 className={`relative z-10 mb-2 bg-gradient-to-r ${tone.text} bg-clip-text text-center text-[2rem] font-black leading-[1.05] tracking-tight text-transparent md:text-[2.75rem]`} data-testid="result-headline">{title}</h2>

      {/* Pass / Fail badge */}
      <div className={`relative z-10 mb-5 px-5 py-1.5 rounded-full border font-black text-sm tracking-widest uppercase backdrop-blur-sm ${
        isPassed
          ? 'score-badge-pass'
          : 'score-badge-fail'
      }`}>
        {isPassed ? <CheckCircle2 className="mr-1.5 inline h-4 w-4 -mt-0.5" aria-hidden /> : <XCircle className="mr-1.5 inline h-4 w-4 -mt-0.5" aria-hidden />}{isPassed ? 'PASSED' : 'FAILED'}
        <span className="text-[10px] opacity-50 ml-2 normal-case font-semibold">Pass mark: {passMark}%</span>
      </div>

      {/* Premium Speedometer gauge */}
      <div className="relative w-full flex flex-col items-center">
        {quizData && userAnswers && (() => {
          const qId = result.id || String(result.timestamp);
          const nmApplied = isNegativeMarkingApplied(qId);
          const origScore = nmApplied ? getOriginalScore(qId) : null;
          const pctDiff = nmApplied && origScore ? percentage - origScore.percentage : 0;

          return (
            <div className="absolute top-0 right-2 sm:right-4 z-20 flex flex-col items-end gap-1">
              <button
                onClick={() => setShowNegPanel(true)}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 backdrop-blur-sm ${
                  nmApplied ? 'bg-red-500/20 border-red-500/40 text-red-400 shadow-sm shadow-red-500/10' : 'bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500/15'
                }`}
                title="Negative Marking Simulator"
              >
                {nmApplied && origScore ? (
                  <>
                    <span className="flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5" />
                      <span>➖ Negative Marking</span>
                    </span>
                    <span className="flex items-center gap-1 text-[9px] normal-case tracking-normal">
                      <span className="text-emerald-400 font-black">Without {origScore.percentage}%</span>
                      <span className="text-foreground/30">→</span>
                      <span className="text-red-400 font-black">With {percentage}%</span>
                      <span className={`font-black px-1.5 py-0.5 rounded-md ${
                        pctDiff < 0 ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
                      }`}>
                        {pctDiff < 0 ? '' : '+'}{pctDiff}%
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5" />
                    <span>➖🎯</span>
                  </span>
                )}
              </button>
            </div>
          );
        })()}
        <PremiumSpeedometer percentage={percentage} precisePct={precisePercentage} netScore={netScore} maxScore={maxScore} startAnimation={startAnimation} showDecimal={showDecimalPct} />
      </div>

      </div>
      <div className="rh-right">
      {/* Score formula */}
      <div className="speedo-formula flex flex-wrap items-center justify-center gap-4 text-xs font-mono px-4 py-3 rounded-2xl border mb-4 max-w-md w-full">
        <div className="flex flex-col items-center">
          <span className="speedo-stat-green font-black text-lg">{gain}</span>
          <span className="speedo-formula-label text-[9px] uppercase tracking-widest mt-0.5">Gain</span>
        </div>
        <span className="speedo-formula-op text-lg">−</span>
        <div className="flex flex-col items-center">
          <span className="speedo-stat-red font-black text-lg">{penalty}</span>
          <span className="speedo-formula-label text-[9px] uppercase tracking-widest mt-0.5">Penalty</span>
        </div>
        <span className="speedo-formula-op text-lg">=</span>
        <div className="flex flex-col items-center">
          <span className="speedo-stat-blue font-black text-xl">{netScore}</span>
          <span className="text-[9px] text-blue-500/60 uppercase tracking-widest mt-0.5">Net Score</span>
        </div>
      </div>

      {/* One merged stats panel: the numbers ARE the filter for the review below */}
      <div className="relative z-10 w-full max-w-md">
        <ResultStatsPanel totalQuestions={totalQuestions} correct={correct} wrong={wrong} skipped={skipped} timeTaken={timeTaken} accuracy={accuracy}
          rawPct={rawPctValue} selected={selected} onToggle={onFilterReview} />
      </div>

      </div>
      </div>

      {/* Action buttons — compact tiles: one row in landscape, a 2-row grid in portrait */}
      <div className="res-actions" style={{ ['--n' as string]: 4 + (wrong + skipped > 0 ? 1 : 0) + (wrong > 0 ? 1 : 0) + (onMoreLikeThis ? 1 : 0) }}>
        <ActionBtn onClick={onHome} cls="speedo-btn-default" icon={<span aria-hidden="true">🏠</span>} label="Home" />
        <ActionBtn onClick={() => setShowShare(true)} cls="speedo-btn-subtle" icon={<Share2 className="w-[18px] h-[18px]" />} label="Share" />
        <ActionBtn onClick={onRetry} cls="speedo-btn-purple" icon={<span aria-hidden="true">🔄</span>} label="Retry" />
        {(wrong > 0 || skipped > 0) && (
          <ActionBtn onClick={onRetryAll} cls="speedo-btn-amber" icon={<span aria-hidden="true">🔁</span>} label={`Retry (${wrong + skipped})`} />
        )}
        {wrong > 0 && (
          <ActionBtn onClick={onPracticeMistakes} cls="speedo-btn-red" icon={<span aria-hidden="true">🎯</span>} label="Practice" />
        )}
        <ActionBtn onClick={onNewQuiz} cls="speedo-btn-blue" icon={<span aria-hidden="true">➕</span>} label="New Quiz" />
        {onMoreLikeThis && (
          <ActionBtn onClick={onMoreLikeThis} disabled={moreLikeThisLoading} cls="speedo-btn-gradient"
            icon={moreLikeThisLoading ? <span className="qmp-spinner" style={{ width: 16, height: 16 }} /> : <Sparkles className="w-[18px] h-[18px]" />}
            label={moreLikeThisLoading ? 'Generating…' : 'More Like This'} />
        )}
      </div>

      {showShare && <ShareResultCard result={result} onClose={() => setShowShare(false)} />}

      {showNegPanel && quizData && userAnswers && (
        <NegativeMarkingPanel
          quizData={quizData}
          userAnswers={userAnswers}
          originalMarksPerQ={maxScore > 0 && totalQuestions > 0 ? maxScore / totalQuestions : 1}
          originalNegMarking={penalty > 0}
          originalNegMarks={wrong > 0 && penalty > 0 ? parseFloat((penalty / wrong).toFixed(4)) : 0}
          originalResult={{ correct, wrong, skipped, gain, penalty, netScore, maxScore, percentage, accuracy }}
          passMark={passMark}
          quizId={result.id || String(result.timestamp)}
          onClose={() => setShowNegPanel(false)}
          onApplyMarking={onApplyMarking}
          onRemoveMarking={onRemoveMarking}
        />
      )}
    </div>
  );
}

function ActionBtn({ onClick, cls, icon, label, disabled }: { onClick: () => void; cls: string; icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`res-btn border font-bold backdrop-blur-sm transition-all active:scale-[0.96] disabled:opacity-60 ${cls}`}>
      <span className="res-btn-icon">{icon}</span>
      <span className="res-btn-label">{label}</span>
    </button>
  );
}
