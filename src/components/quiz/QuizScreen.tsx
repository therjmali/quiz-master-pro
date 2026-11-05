import { useEffect, useRef, KeyboardEvent, useMemo, useState, useCallback } from 'react';
import { totalTimerSeconds } from '../../utils/examModes';
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, BookOpen, Sparkles, Loader2, Pause, Play, Flag, Bookmark } from 'lucide-react';
import ZoomControl from './ZoomControl';
import { toast } from 'sonner';
import { hapticTap, hapticSuccess, hapticError } from '../../utils/haptics';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { QuizQuestion, QuizSettings } from '../../types/quiz';
import { getMergedBadge } from '../../utils/difficultyBadge';
import { getActiveSkin, getSkinById } from '../../utils/quizSkins';
import { formatTimeColon } from '../../utils/scoring';
import PremiumQuestionNav from './PremiumQuestionNav';
import PremiumHeader from './PremiumHeader';
import PremiumFooter from './PremiumFooter';
import CountdownCircle from './CountdownCircle';
import InlineFeedbackPanel from './InlineFeedbackPanel';
import QuestionEditModal from './QuestionEditModal';
import AiRationaleText from '../AiRationaleText';
import { useImageZoom } from './ImageWithZoom';
import { loadFileTree, saveFileTree, addBookmarkToTree, isQuestionBookmarked, getAllBookmarks, removeBookmarkNode, FileNode } from '../../utils/fileTree';

interface Props {
  quizData: QuizQuestion[];
  currentIndex: number;
  userAnswers: (string | null)[];
  flaggedQuestions: boolean[];
  accumulatedTime: number;
  timeLeftPerQ: number[];
  totalTimeLeft: number;
  forcedNext: boolean[];
  settings: QuizSettings;
  rationaleCache?: Record<string, string>;
  getAiRationale?: (
    question: string, correctAnswer: string,
    userAnswer: string | null, status: 'correct' | 'wrong' | 'skipped'
  ) => Promise<string>;
  onAnswer: (idx: number, ans: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onJump: (idx: number) => void;
  onFinish: () => void;
  onTimeExpired: (idx: number) => void;
  onToggleFlag: (idx: number) => void;
  onExitQuiz: () => void;
  onSettingsChange?: (s: QuizSettings) => void;
  onEditSettings?: () => void;
  onEditQuestion?: (idx: number, updated: QuizQuestion) => void;
  isPaused?: boolean;
  saveSignal?: number;
  onPauseChange?: (paused: boolean) => void;
  confidenceLevels?: ('sure' | 'guessing' | null)[];
  onConfidenceChange?: (idx: number, level: 'sure' | 'guessing') => void;
  adaptiveDifficulty?: string;
}

/* ────────── Question Text ────────── */
function QuestionText({ text }: { text: string }) {
  return (
    <p className="text-xl sm:text-2xl font-extrabold leading-relaxed text-foreground tracking-tight">
      {text.split('\n').map((line, i) => (
        <span key={i}>{i > 0 && <br />}{line}</span>
      ))}
    </p>
  );
}

/* ────────── Back-Nav Review (Training) ────────── */
function BackNavReview({
  q, userAnswer, rationaleCache, getAiRationale,
}: {
  q: QuizQuestion;
  userAnswer: string;
  rationaleCache: Record<string, string>;
  getAiRationale?: (
    question: string, correctAnswer: string,
    userAnswer: string | null, status: 'correct' | 'wrong' | 'skipped'
  ) => Promise<string>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [aiRationale, setAiRationale] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState('');
  const autoFetchedRef = useRef(false);

  const wasCorrect = userAnswer === q.correctAnswer || q.correctAnswers?.includes(userAnswer) || false;
  const bookRat = q.rationale?.trim();
  const cachedAi = rationaleCache[q.question];

  type RatMode = 'off' | 'book' | 'ai' | 'both';
  const rationaleMode: RatMode = (() => {
    try { return (localStorage.getItem('qmp_training_rationale') as RatMode) || 'both'; }
    catch { return 'both' as RatMode; }
  })();

  const showBook = (rationaleMode === 'book' || rationaleMode === 'both') && !!bookRat;
  const showAiSection = rationaleMode === 'ai' || rationaleMode === 'both';
  const displayedAi = aiRationale || cachedAi || '';

  useEffect(() => {
    if (cachedAi && !aiRationale) setAiRationale(cachedAi);
  }, [cachedAi]); // eslint-disable-line

  // Auto-fetch AI rationale on mount if not cached
  useEffect(() => {
    if (autoFetchedRef.current || displayedAi || !showAiSection || !getAiRationale) return;
    autoFetchedRef.current = true;
    setLoadingAi(true);
    getAiRationale(q.question, q.correctAnswer, userAnswer, wasCorrect ? 'correct' : 'wrong')
      .then(r => { if (r) setAiRationale(r); })
      .catch(() => {})
      .finally(() => setLoadingAi(false));
  }, []); // eslint-disable-line

  const hasDetails = !wasCorrect || showBook || (showAiSection && (displayedAi || getAiRationale));

  const handleAiExplain = async () => {
    if (loadingAi || displayedAi || !getAiRationale) return;
    setAiError('');
    setLoadingAi(true);
    try {
      const r = await getAiRationale(q.question, q.correctAnswer, userAnswer, wasCorrect ? 'correct' : 'wrong');
      if (r) setAiRationale(r);
      else setAiError('No explanation returned.');
    } catch { setAiError('Could not load. Try again.'); }
    finally { setLoadingAi(false); }
  };

  return (
    <div className="mt-5 animate-fade-in">
      <div className="border-t-2 border-foreground/[0.08] mb-3" />
      <button
        onClick={() => hasDetails && setCollapsed(c => !c)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl border transition-all ${
          wasCorrect ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-red-500/8 border-red-500/20'
        }`}
      >
        {wasCorrect ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
        <span className={`text-sm font-black ${wasCorrect ? 'text-emerald-300' : 'text-red-300'}`}>
          {wasCorrect ? '✓ Previously correct' : '✗ Previously incorrect'}
        </span>
        <span className={`ml-auto flex items-center gap-1.5 text-[10px] font-bold ${wasCorrect ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
          ← → navigate
          {hasDetails && (collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />)}
        </span>
      </button>

      {!collapsed && (
        <>
          {!wasCorrect && (
            <div className="mt-3 bg-sky-500/10 border border-sky-500/25 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="w-3 h-3 text-sky-400" />
                <p className="text-[9px] font-black text-sky-400/70 uppercase tracking-widest">Correct Answer</p>
              </div>
              <p className="text-sm font-bold text-sky-200 leading-relaxed">{q.correctAnswer}</p>
            </div>
          )}
          {showBook && (
            <div className="mt-3 bg-amber-500/8 border border-amber-500/18 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <BookOpen className="w-3 h-3 text-amber-400" />
                <p className="text-[9px] font-black text-amber-400/70 uppercase tracking-widest">Rationale</p>
              </div>
              <AiRationaleText text={bookRat!} className="text-[13px] text-amber-200/80" />
            </div>
          )}
          {showAiSection && (
            displayedAi ? (
              <div className="mt-3 bg-violet-500/8 border border-violet-500/18 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3 h-3 text-violet-400" />
                  <p className="text-[9px] font-black text-violet-400/70 uppercase tracking-widest">AI Explanation</p>
                </div>
                <AiRationaleText text={displayedAi} className="text-[13px] text-violet-200/80" />
              </div>
            ) : aiError ? (
              <p className="mt-3 text-[11px] text-red-400/70 text-center">{aiError}</p>
            ) : getAiRationale ? (
              <button
                onClick={handleAiExplain}
                disabled={loadingAi}
                className="mt-3 flex items-center gap-2 w-full justify-center text-xs font-bold px-4 py-2.5 rounded-2xl bg-violet-500/10 border border-violet-500/18 hover:bg-violet-500/15 text-violet-300 transition-all active:scale-95 disabled:opacity-60"
              >
                {loadingAi ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</> : <><Sparkles className="w-3.5 h-3.5" /> Get AI Explanation</>}
              </button>
            ) : null
          )}
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN QUIZ SCREEN — Premium Redesign
   ════════════════════════════════════════════════════════ */
export default function QuizScreen({
  quizData, currentIndex, userAnswers, flaggedQuestions, accumulatedTime,
  timeLeftPerQ, totalTimeLeft, forcedNext, settings,
  rationaleCache = {}, getAiRationale,
  onAnswer, onNext, onPrev, onJump,
  onFinish, onTimeExpired, onToggleFlag, onExitQuiz, onSettingsChange, onEditSettings,
  onEditQuestion,
  isPaused: externalPaused, onPauseChange,
  saveSignal,
  confidenceLevels, onConfidenceChange,
  adaptiveDifficulty,
}: Props) {
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [feedbackAnswer, setFeedbackAnswer] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [editingQuestionIdx, setEditingQuestionIdx] = useState<number | null>(null);
  const [rippleIdx, setRippleIdx] = useState<number | null>(null);
  const imgZoom = useImageZoom();
  const [fileTree, setFileTree] = useState<FileNode>(() => loadFileTree());
  const paused = externalPaused ?? isPaused;

  const togglePause = useCallback(() => {
    const next = !paused;
    setIsPaused(next);
    onPauseChange?.(next);
  }, [paused, onPauseChange]);

  const doPause = useCallback(() => { setIsPaused(true); onPauseChange?.(true); }, [onPauseChange]);
  const doResume = useCallback(() => { setIsPaused(false); onPauseChange?.(false); }, [onPauseChange]);

  const q = quizData[currentIndex];

  const currentBookmarked = useMemo(() => {
    if (!q) return false;
    return isQuestionBookmarked(fileTree, q.question);
  }, [fileTree, q]);

  const handleToggleBookmark = useCallback(() => {
    if (!q) return;
    setFileTree(prev => {
      if (isQuestionBookmarked(prev, q.question)) {
        const allBm = getAllBookmarks(prev);
        const target = allBm.find(b => b.bookmarkData?.question === q.question);
        if (target) {
          const updated = removeBookmarkNode(prev, target.id);
          saveFileTree(updated);
          toast('🔖 Bookmark removed');
          return updated;
        }
        return prev;
      } else {
        const updated = addBookmarkToTree(prev, {
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          userAnswer: userAnswers[currentIndex],
          rationale: q.rationale,
          difficulty: q.difficulty,
          questionType: q.questionType,
          quizTitle: settings.quizTitle || 'Quiz',
          subject: settings.subject || 'General',
          bookmarkedAt: Date.now(),
        });
        saveFileTree(updated);
        toast.success('🔖 Bookmarked!');
        return updated;
      }
    });
  }, [q, currentIndex, userAnswers, settings]);

  const opts = q?.shuffledOpts || q?.options || [];
  const answered = userAnswers[currentIndex] !== null;
  const isForced = forcedNext[currentIndex];
  const timeLeft = timeLeftPerQ[currentIndex] ?? 0;
  const isLast = currentIndex === quizData.length - 1;
  const isFlagged = flaggedQuestions[currentIndex];
  const isLiveMode = settings.mode === 'live';

  const perQTotal = settings.timerMode === 'per-question'
    ? settings.timerValue * (settings.timerUnit === 'min' ? 60 : 1) : 0;
  const totalTimerInitial = totalTimerSeconds(settings, quizData.length);
  const totalTimerPct = totalTimerInitial > 0 ? totalTimeLeft / totalTimerInitial : 1;
  const totalTimerColor = totalTimerPct < 0.25 ? 'text-red-400' : totalTimerPct < 0.5 ? 'text-amber-400' : 'text-emerald-400';
  const totalTimerBg = totalTimerPct < 0.25 ? 'bg-red-500/10 border-red-500/25' : totalTimerPct < 0.5 ? 'bg-amber-500/10 border-amber-500/25' : 'bg-emerald-500/10 border-emerald-500/20';

  const answeredCount = useMemo(() => userAnswers.filter(a => a !== null).length, [userAnswers]);

  // Questions the student has opened — drives the navigator's "skipped" state.
  const [visited, setVisited] = useState<Set<number>>(() => new Set([currentIndex]));
  useEffect(() => {
    setVisited(prev => (prev.has(currentIndex) ? prev : new Set(prev).add(currentIndex)));
  }, [currentIndex]);

  const bookmarkedMap = useMemo(() => {
    const set = new Set(getAllBookmarks(fileTree).map(b => b.bookmarkData?.question));
    return quizData.map(qq => set.has(qq.question));
  }, [fileTree, quizData]);

  // Same rule as the Previous button: no going back in Mock Exam mode.
  const canJump = useCallback(
    (idx: number) => !(settings.mockExamMode && idx < currentIndex),
    [settings.mockExamMode, currentIndex],
  );

  const correctnessMap = useMemo(() => {
    if (!isLiveMode) return null;
    return userAnswers.map((ua, i) => {
      if (ua === null) return null;
      const q = quizData[i];
      return ua === q?.correctAnswer || q?.correctAnswers?.includes(ua) || false;
    });
  }, [isLiveMode, userAnswers, quizData]);

  // Timer effects
  useEffect(() => {
    if (settings.timerMode !== 'per-question' || timeLeft > 0 || isForced) return;
    onTimeExpired(currentIndex);
  }, [timeLeft, currentIndex, isForced, settings.timerMode]); // eslint-disable-line

  useEffect(() => {
    if (settings.timerMode === 'per-question' && timeLeft === 5 && !isForced && !paused) hapticTap();
  }, [timeLeft, settings.timerMode, isForced, paused]);

  useEffect(() => {
    if (settings.timerMode === 'total' && totalTimeLeft === 60 && !paused) {
      hapticTap(); toast.warning('⏰ 1 minute remaining!', { duration: 2000 });
    }
    if (settings.timerMode === 'total' && totalTimeLeft === 30 && !paused) {
      hapticError(); toast.error('⏰ 30 seconds left!', { duration: 2000 });
    }
  }, [totalTimeLeft, settings.timerMode, paused]);

  useEffect(() => {
    setFeedbackAnswer(null);
    imgZoom.resetZoom();
    const nextQ = quizData[currentIndex];
    setImgLoading(!!nextQ?.imageUrl);
  }, [currentIndex]); // eslint-disable-line

  const handleOptionClick = useCallback((opt: string, idx: number) => {
    if (isForced) return;
    if (isLiveMode && (feedbackAnswer !== null || answered)) return;
    hapticTap();
    setRippleIdx(idx);
    setTimeout(() => setRippleIdx(null), 400);
    onAnswer(currentIndex, opt);
    if (isLiveMode) {
      setFeedbackAnswer(opt);
      if (opt === q.correctAnswer || q.correctAnswers?.includes(opt)) hapticSuccess(); else hapticError();
    }
  }, [isForced, isLiveMode, feedbackAnswer, answered, currentIndex, onAnswer, q?.correctAnswer]);

  const handleFeedbackNext = () => { setFeedbackAnswer(null); onNext(); };

  const getOptClass = useCallback((opt: string): string => {
    const isSelected = userAnswers[currentIndex] === opt;
    const isCorrectOpt = opt === q.correctAnswer || q.correctAnswers?.includes(opt) || false;
    if (isLiveMode && answered) {
      if (isCorrectOpt) return 'prem-opt-correct';
      if (isSelected && !isCorrectOpt) return 'prem-opt-incorrect';
      return 'prem-opt-dimmed';
    }
    if (isForced) {
      if (isCorrectOpt) return 'prem-opt-correct';
      return 'prem-opt-dimmed';
    }
    if (isSelected) return 'prem-opt-selected';
    return '';
  }, [userAnswers, currentIndex, q?.correctAnswer, isLiveMode, answered, isForced]);

  const handleKey = (e: KeyboardEvent) => {
    // Allow arrow navigation even when feedback is active (clears feedback + advances)
    if (feedbackAnswer !== null) {
      if (e.key === 'ArrowRight') { setFeedbackAnswer(null); onNext(); }
      return;
    }
    if (e.key === 'ArrowRight') onNext();
    if (e.key === 'ArrowLeft') onPrev();
    if (['1', '2', '3', '4'].includes(e.key)) {
      const opt = opts[+e.key - 1];
      if (opt) handleOptionClick(opt, +e.key - 1);
    }
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); onToggleFlag(currentIndex); }
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); }
  };

  // Swipe
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);
  const touchStartTarget = useRef<EventTarget | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    touchStartTarget.current = e.target;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const elapsed = Math.max(Date.now() - touchStartTime.current, 1);
    touchStartX.current = null;
    touchStartY.current = null;
    if (touchStartTarget.current instanceof HTMLElement) {
      const el = touchStartTarget.current;
      if (el.closest('.pqn-btn') || el.closest('.q-balls-scroll-wrapper') || el.closest('.prem-footer-prev') || el.closest('.prem-footer-next') || el.closest('.prem-footer-submit') || el.closest('.prem-footer-finish') || el.closest('.prem-icon-btn') || el.closest('.prem-pause-btn')) { touchStartTarget.current = null; return; }
    }
    touchStartTarget.current = null;
    if (Math.abs(dy) > Math.abs(dx) * 0.5) return;
    const velocity = Math.abs(dx) / elapsed;
    if (velocity < 0.3 || Math.abs(dx) < 50) return;
    if (paused) return;
    // In live mode with feedback showing, swipe-left = next (clears feedback + advances)
    if (isLiveMode && feedbackAnswer !== null) {
      if (dx < -50) { setFeedbackAnswer(null); onNext(); }
      return;
    }
    if (dx < -50 && !isLast) onNext();
    else if (dx > 50 && currentIndex > 0) onPrev();
  }, [paused, isLiveMode, feedbackAnswer, isLast, currentIndex, onNext, onPrev]);

  if (!q) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center animate-fade-in">
      <div className="text-4xl mb-4">🔄</div>
      <h3 className="text-lg font-black text-foreground mb-2">Loading question…</h3>
    </div>
  );

  const mergedBadge = getMergedBadge(q.difficulty, q.questionType);
  const isBackNavReview = isLiveMode && answered && feedbackAnswer === null;
  const activeSkin = getSkinById(getActiveSkin());

  const handleSubmitAll = () => {
    if (answeredCount === 0) {
      toast.error('Answer at least one question before submitting');
      return;
    }
    setShowSubmitDialog(true);
  };

  return (
    <>
      {/* Exit Dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent className="bg-card border-border mx-4 rounded-2xl top-[12%] translate-y-0">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold text-lg">Exit without saving?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Your progress will be lost. This quiz will <strong className="text-red-500 font-bold">not</strong> be saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={doResume} className="bg-muted border-border text-foreground hover:bg-muted/80 w-full sm:w-auto">Continue</AlertDialogCancel>
            <AlertDialogAction onClick={onExitQuiz} className="bg-red-600 hover:bg-red-500 text-white border-none w-full sm:w-auto">Yes, Exit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit Confirmation Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent className="bg-card border-border mx-4 rounded-2xl top-[12%] translate-y-0">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold text-lg">Submit All Answers?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              You've answered <strong className="text-primary font-bold">{answeredCount}</strong> of <strong>{quizData.length}</strong> questions.
              {answeredCount < quizData.length && (
                <span className="block mt-1 text-amber-400 font-semibold">
                  ⚠️ {quizData.length - answeredCount} question{quizData.length - answeredCount > 1 ? 's' : ''} unanswered
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="bg-muted border-border text-foreground hover:bg-muted/80 w-full sm:w-auto">Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={onFinish} className="bg-primary hover:brightness-110 text-primary-foreground border-none w-full sm:w-auto font-black">Submit Quiz</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── QUIZ CARD ── */}
      <div
        className={`relative glass-card quiz-screen-card glass-liquid animate-fade-in ${activeSkin.bgClass}`}
        tabIndex={0}
        onKeyDown={handleKey}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ outline: 'none' }}
      >
        {/* ═══ PREMIUM HEADER ═══ */}
        <PremiumHeader
          currentIndex={currentIndex}
          totalQuestions={quizData.length}
          answeredCount={answeredCount}
          settings={settings}
          isLiveMode={isLiveMode}
          timeLeft={timeLeft}
          perQTotal={perQTotal}
          accumulatedTime={accumulatedTime}
          totalTimeLeft={totalTimeLeft}
          totalTimerColor={totalTimerColor}
          totalTimerBg={totalTimerBg}
          totalTimerPct={totalTimerPct}
          isFlagged={isFlagged}
          onToggleFlag={() => onToggleFlag(currentIndex)}
          isBookmarked={currentBookmarked}
          onToggleBookmark={handleToggleBookmark}
          isPaused={paused}
          onTogglePause={togglePause}
          onPause={doPause}
          onFinish={handleSubmitAll}
          onExit={() => { doPause(); setShowExitDialog(true); }}
          onEditSettings={onEditSettings}
          onEditQuestion={onEditQuestion ? () => { doPause(); setEditingQuestionIdx(currentIndex); } : undefined}
          currentDifficulty={q?.difficulty}
          saveSignal={saveSignal}
        />

        {/* ═══ CONTENT SCROLL ═══ */}
        <div
          ref={scrollRef}
          className="quiz-content-scroll px-4 sm:px-6 md:px-10 pt-4"
        >
          {/* Pause Overlay */}
          {paused && (
            <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mb-5">
                <Pause className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-2xl font-black text-foreground mb-2">Quiz Paused</h3>
              <p className="text-sm text-foreground/40 mb-6 text-center max-w-xs">Take a breather! Timer stopped.</p>
              <button onClick={doResume} className="flex items-center gap-2.5 bg-primary hover:brightness-110 text-primary-foreground font-black text-sm px-8 py-3.5 rounded-2xl shadow-lg shadow-primary/25 transition-all active:scale-[0.97]">
                <Play className="w-5 h-5" /> Resume Quiz
              </button>
              <p className="text-[10px] text-foreground/20 mt-4">Q {currentIndex + 1}/{quizData.length} · {answeredCount} answered</p>
            </div>
          )}

          {!paused && (
            <>
              {/* Premium Question Navigator */}
              <PremiumQuestionNav
                total={quizData.length}
                currentIndex={currentIndex}
                userAnswers={userAnswers}
                flaggedQuestions={flaggedQuestions}
                visited={visited}
                bookmarked={bookmarkedMap}
                canJump={canJump}
                onJump={idx => {
                  if (isLiveMode && feedbackAnswer !== null) setFeedbackAnswer(null);
                  onJump(idx);
                }}
                mode={settings.mode}
                correctnessMap={correctnessMap}
              />

              {/* ─── QUESTION CARD ─── */}
              <div className="prem-question-card animate-slide-in">
                {/* Question text */}
                <QuestionText text={q.question} />

                {/* Image */}
                {q.imageUrl && (
                  <div className="mt-4 mb-2 animate-fade-in">
                    <div className="overflow-auto rounded-2xl border border-border/30 bg-black/20 max-h-[300px] flex items-center justify-center relative">
                      {imgLoading && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/30 rounded-2xl">
                          <div className="qmp-spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
                        </div>
                      )}
                      <img
                        src={q.imageUrl}
                        alt="Question"
                        className={`rounded-xl object-contain transition-opacity duration-200 ${imgLoading ? 'opacity-0' : 'opacity-100'}`}
                        style={{
                          transform: `scale(${imgZoom.scale})`,
                          transformOrigin: 'center center',
                          transition: 'transform 0.2s ease',
                          maxWidth: imgZoom.scale <= 1 ? '100%' : undefined,
                          maxHeight: imgZoom.scale <= 1 ? '280px' : undefined,
                        }}
                        onLoad={() => setImgLoading(false)}
                        onError={() => setImgLoading(false)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ─── ANSWER OPTIONS ─── */}
              <div className="space-y-3 mt-5 pb-2" role="radiogroup" aria-label={`Options for Q${currentIndex + 1}`}>
                {opts.map((opt, i) => {
                  const isSelected = userAnswers[currentIndex] === opt;
                  const optClass = getOptClass(opt);
                  return (
                    <button
                      key={`${currentIndex}-${i}`}
                      onClick={() => handleOptionClick(opt, i)}
                      disabled={paused || isForced || (isLiveMode && (feedbackAnswer !== null || answered))}
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`Option ${String.fromCharCode(97 + i)}: ${opt}`}
                      className={`prem-option-btn ${optClass} ${rippleIdx === i ? 'prem-ripple' : ''}`}
                    >
                      <span className={`prem-option-letter ${
                        optClass === 'prem-opt-selected' ? 'prem-letter-selected' :
                        optClass === 'prem-opt-correct' ? 'prem-letter-correct' :
                        optClass === 'prem-opt-incorrect' ? 'prem-letter-incorrect' : ''
                      }`}>
                        {String.fromCharCode(97 + i)}
                      </span>
                      <span className="leading-relaxed text-left text-[15px] sm:text-base break-words min-w-0 font-semibold">
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Inline Feedback (Live mode) */}
              {isLiveMode && feedbackAnswer !== null && (
                <InlineFeedbackPanel
                  q={q}
                  userAnswer={feedbackAnswer}
                  delay={settings.instantFeedbackDelay ?? 3}
                  onNext={handleFeedbackNext}
                  isLast={isLast}
                  questionNumber={currentIndex + 1}
                  total={quizData.length}
                  rationaleCache={rationaleCache}
                  getAiRationale={getAiRationale}
                  aiEnabled={!!getAiRationale}
                />
              )}

              {/* Back-nav review */}
              {isBackNavReview && !settings.mockExamMode && (
                <BackNavReview
                  q={q}
                  userAnswer={userAnswers[currentIndex] as string}
                  rationaleCache={rationaleCache}
                  getAiRationale={getAiRationale}
                />
              )}
            </>
          )}

          <div className="h-4" />
        </div>

        {/* ═══ PREMIUM FOOTER ═══ */}
        <PremiumFooter
          currentIndex={currentIndex}
          totalQuestions={quizData.length}
          isLast={isLast}
          isLiveMode={isLiveMode}
          isPaused={paused}
          feedbackActive={feedbackAnswer !== null}
          showMockExamMode={!!settings.mockExamMode}
          answeredCount={answeredCount}
          onPrev={onPrev}
          onNext={onNext}
          onFinish={handleSubmitAll}
        />
      </div>

      {/* Question Edit Modal */}
      {editingQuestionIdx !== null && onEditQuestion && (
        <QuestionEditModal
          question={quizData[editingQuestionIdx]}
          questionIndex={editingQuestionIdx}
          onSave={(idx, updated) => {
            onEditQuestion(idx, updated);
            setEditingQuestionIdx(null);
            doResume();
            toast.success('✏️ Question updated');
          }}
          onClose={() => { setEditingQuestionIdx(null); doResume(); }}
        />
      )}

      {/* Floating Zoom Control — fixed outside quiz card, above bottom nav */}
      <ZoomControl />
    </>
  );
}
