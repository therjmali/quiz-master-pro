import { useMemo, useState } from 'react';
import { Share2, RotateCcw, Sparkles, Calculator } from 'lucide-react';
import { QuestionBreakdownStrip } from './ScoreAnalyticsStrip';
import { toast } from 'sonner';
import { formatTime, derivePercentage, precisePct as calcPrecisePct } from '../../utils/scoring';
import { QuizResult, QuizSettings, QuizQuestion } from '../../types/quiz';
import { getSubjectColors } from '../../utils/subjects';
import { isNegativeMarkingApplied, getOriginalScore, getQuizKey } from '../../utils/negativeMarkingStore';
import PremiumSpeedometer from './PremiumSpeedometer';
import ShareResultCard from './ShareResultCard';
import NegativeMarkingPanel from './NegativeMarkingPanel';

type FilterKey = 'all' | 'correct' | 'wrong' | 'skipped' | 'bookmarked';

interface Props {
  result: QuizResult;
  settings: QuizSettings;
  activeFilter?: FilterKey;
  startAnimation?: boolean;
  onHome: () => void;
  onRetry: () => void;
  onNewQuiz: () => void;
  onPracticeMistakes: () => void;
  onRetryAll: () => void;
  onFilterReview: (f: FilterKey) => void;
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
  result, settings, activeFilter, startAnimation = true,
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

  const stats: { label: string; value: string | number; color: string; filter: FilterKey | null; hoverBg: string; activeRing: string; subtitle?: string }[] = [
    { label: 'Total Qs',  value: totalQuestions, color: 'speedo-stat-blue',    filter: 'all',     hoverBg: 'hover:bg-blue-500/10 hover:border-blue-500/25',       activeRing: 'ring-blue-500/50 bg-blue-500/10 border-blue-500/35'    },
    { label: 'Correct ✓', value: correct,        color: 'speedo-stat-green', filter: 'correct', hoverBg: 'hover:bg-emerald-500/10 hover:border-emerald-500/25', activeRing: 'ring-emerald-500/50 bg-emerald-500/10 border-emerald-500/35' },
    { label: 'Wrong ✗',   value: wrong,          color: 'speedo-stat-red',     filter: 'wrong',   hoverBg: 'hover:bg-red-500/10 hover:border-red-500/25',         activeRing: 'ring-red-500/50 bg-red-500/10 border-red-500/35', subtitle: 'Per-attempt wrong answers' },
    { label: 'Skipped ⏭', value: skipped,        color: 'speedo-stat-amber',   filter: 'skipped', hoverBg: 'hover:bg-amber-500/10 hover:border-amber-500/25',     activeRing: 'ring-amber-500/50 bg-amber-500/10 border-amber-500/35' },
    { label: 'Time',       value: formatTime(timeTaken), color: 'speedo-stat-purple',  filter: null, hoverBg: '', activeRing: '' },
    { label: 'Accuracy',   value: `${accuracy}%`,        color: 'speedo-stat-pink', filter: null, hoverBg: '', activeRing: '' },
  ];

  return (
    <div className="glass-card p-6 md:p-10 mb-6 flex flex-col items-center relative overflow-hidden animate-fade-in">
      <Confetti show={showConfetti} />

      {/* Perfect score banner */}
      {isPerfect && (
        <div className="relative z-10 w-full mb-4 py-2.5 px-4 bg-yellow-500/10 border border-yellow-500/25 rounded-2xl text-center backdrop-blur-sm">
          <span className="text-yellow-600 dark:text-yellow-300 font-black text-sm">🌟 PERFECT SCORE! Every single answer correct! 🌟</span>
        </div>
      )}

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

      <div className="relative z-10 text-5xl mb-2 hover:scale-110 transition-transform cursor-default select-none animate-float">{emoji}</div>
      <h2 className="relative z-10 text-3xl md:text-4xl font-black mb-2 text-foreground tracking-tight text-center font-display">{title}</h2>

      {/* Pass / Fail badge */}
      <div className={`relative z-10 mb-5 px-5 py-1.5 rounded-full border font-black text-sm tracking-widest uppercase backdrop-blur-sm ${
        isPassed
          ? 'score-badge-pass'
          : 'score-badge-fail'
      }`}>
        {isPassed ? '✓ PASSED' : '✗ FAILED'}
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
                    <span className="hidden xs:inline">➖🎯</span>
                  </span>
                )}
              </button>
            </div>
          );
        })()}
        <PremiumSpeedometer percentage={percentage} precisePct={precisePercentage} netScore={netScore} maxScore={maxScore} startAnimation={startAnimation} showDecimal={showDecimalPct} />
      </div>

      {/* Score formula */}
      <div className="speedo-formula flex flex-wrap items-center justify-center gap-4 text-xs font-mono px-6 py-4 rounded-2xl border mb-6 max-w-sm w-full">
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
        {maxScore > 0 && (() => {
          const rawPct = Math.max(0, Math.min(100, Math.round((netScore / maxScore) * 100)));
          const rawPctDecimal = Math.max(0, Math.min(100, Math.round(((netScore / maxScore) * 100) * 100) / 100));
          return (
            <div className="flex flex-col items-center ml-1 pl-3 border-l border-border/40">
              <span className="font-black text-lg" style={{ color: rawPct >= 67 ? '#34C759' : rawPct >= 40 ? '#F0A500' : '#FF3B5C' }}>
                {showDecimalPct ? `${rawPctDecimal}%` : `${rawPct}%`}
              </span>
              <span className="speedo-formula-label text-[8px] uppercase tracking-widest mt-0.5">Raw Score</span>
            </div>
          );
        })()}
      </div>

      {/* Question Breakdown */}
      <div className="relative z-10 w-full max-w-sm space-y-3 mb-6">
        <QuestionBreakdownStrip
          totalQ={totalQuestions}
          correct={correct}
          wrong={wrong}
          skipped={skipped}
        />
      </div>

      {/* Stat cards */}
      <div className="text-[10px] text-foreground/30 font-bold tracking-widest uppercase mb-2 self-start ml-1">👆 Tap card to filter review</div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-2xl mb-6">
        {stats.map(({ label, value, color, filter, hoverBg, activeRing, subtitle }) => {
          const isActive = filter && activeFilter === filter;
          return (
            <div key={label}
              onClick={() => filter && onFilterReview(filter)}
              className={`border rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center transition-all duration-300 active:scale-95 backdrop-blur-sm premium-card-hover
                ${filter ? `cursor-pointer ${isActive ? `ring-2 ${activeRing}` : `speedo-stat-card ${hoverBg}`}` : 'speedo-stat-card'}`}>
              <span className={`text-xl sm:text-2xl md:text-3xl font-black ${color}`}>{value}</span>
              <span className="speedo-stat-label text-[9px] sm:text-[10px] uppercase tracking-widest mt-1.5 font-bold text-center">{label}</span>
              {subtitle && <span className="text-[7px] text-foreground/25 mt-0.5 text-center leading-tight">{subtitle}</span>}
              {filter && <span className="text-[8px] text-foreground/20 mt-1">{isActive ? '▲ Active' : '↓ Filter'}</span>}
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col xs:flex-row justify-center flex-wrap gap-2.5 w-full max-w-2xl">
        <ActionBtn onClick={onHome} cls="speedo-btn-default">🏠 Home</ActionBtn>
        <ActionBtn onClick={() => setShowShare(true)} cls="speedo-btn-subtle"><Share2 className="w-4 h-4" /> Share</ActionBtn>
        <ActionBtn onClick={onRetry} cls="speedo-btn-purple">🔄 Retry</ActionBtn>
        {(wrong > 0 || skipped > 0) && (
          <ActionBtn onClick={onRetryAll} cls="speedo-btn-amber">🔁 Retry ({wrong + skipped})</ActionBtn>
        )}
        {wrong > 0 && (
          <ActionBtn onClick={onPracticeMistakes} cls="speedo-btn-red">🎯 Practice</ActionBtn>
        )}
        <ActionBtn onClick={onNewQuiz} cls="speedo-btn-blue">➕ New Quiz</ActionBtn>
        {onMoreLikeThis && (
          <button
            onClick={onMoreLikeThis}
            disabled={moreLikeThisLoading}
            className="speedo-btn-gradient flex-1 xs:flex-none flex items-center justify-center gap-2 font-bold text-sm py-3.5 px-5 rounded-2xl transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed backdrop-blur-sm"
          >
            {moreLikeThisLoading
              ? <><span className="qmp-spinner" style={{ width: 14, height: 14 }} /> Generating…</>
              : <><Sparkles className="w-4 h-4" /> More Like This</>
            }
          </button>
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

function ActionBtn({ onClick, cls, children }: { onClick: () => void; cls: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex-1 xs:flex-none flex items-center justify-center gap-2 border font-bold text-sm py-3.5 px-5 rounded-2xl transition-all active:scale-[0.97] backdrop-blur-sm ${cls}`}>
      {children}
    </button>
  );
}
