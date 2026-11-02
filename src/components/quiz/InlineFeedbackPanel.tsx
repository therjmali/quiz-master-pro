/**
 * InlineFeedbackPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown after selecting an answer in Instant Feedback (Training) mode.
 *
 * Layout — clean 3-zone separation:
 *
 *   ══════ ZONE 1: OPTIONS (rendered above in QuizScreen) ══════
 *   ─── separator ───────────────────────────────────────────────
 *   [auto-advance progress bar]
 *
 *   ══════ ZONE 2: ACTION ══════════════════════════════════════
 *   [▶ Next Question]                       [⏱ 3s]
 *
 *   ─── separator ───────────────────────────────────────────────
 *
 *   ══════ ZONE 3: INFORMATION (verdict + learning) ════════════
 *   [✓ Correct! / ✗ Incorrect]              [Q10/57  green/red]
 *   [Correct Answer]  ← sky/teal, ONLY when wrong
 *   [Rationale]
 *   [AI Explanation]
 *
 * Design rules:
 *   • Next button is always the FIRST thing after the separator — instantly
 *     tappable without needing to read anything.
 *   • Verdict + rationale live BELOW the Next button — optional reading.
 *   • Countdown chip is beside the Next button — visible without cluttering it.
 *   • "Correct Answer" uses sky/teal (vs. option's emerald green) — visually
 *     distinct even when both reference the same answer.
 */
import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2, XCircle, ChevronRight, BookOpen, Sparkles,
  Loader2, Clock, Trophy, ChevronDown, ChevronUp,
} from 'lucide-react';
import { QuizQuestion } from '../../types/quiz';
import AiRationaleText from '../AiRationaleText';

type TrainingRationaleMode = 'off' | 'book' | 'ai' | 'both';
const RATIONALE_MODE_KEY = 'qmp_training_rationale';

function getRationaleMode(): TrainingRationaleMode {
  try { return (localStorage.getItem(RATIONALE_MODE_KEY) as TrainingRationaleMode) || 'both'; }
  catch { return 'both'; }
}

interface Props {
  q: QuizQuestion;
  userAnswer: string;
  delay: number;
  onNext: () => void;
  isLast: boolean;
  questionNumber: number;
  total: number;
  rationaleCache?: Record<string, string>;
  getAiRationale?: (
    question: string, correctAnswer: string,
    userAnswer: string | null, status: 'correct' | 'wrong' | 'skipped'
  ) => Promise<string>;
  aiEnabled?: boolean;
}

export default function InlineFeedbackPanel({
  q, userAnswer, delay, onNext, isLast,
  questionNumber, total,
  rationaleCache = {}, getAiRationale, aiEnabled = true,
}: Props) {
  const [countdown, setCountdown] = useState(delay > 0 ? delay : 0);
  const calledRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isCorrect = userAnswer === q.correctAnswer || q.correctAnswers?.includes(userAnswer) || false;
  const bookRationale = q.rationale?.trim();

  const [aiRationale, setAiRationale] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState('');
  const [infoCollapsed, setInfoCollapsed] = useState(false);
  const [userRequestedAi, setUserRequestedAi] = useState(false);
  const autoFetchedRef = useRef(false);

  const rationaleMode = getRationaleMode();
  const showBook = (rationaleMode === 'book' || rationaleMode === 'both') && !!bookRationale;
  const showAiSection = (rationaleMode === 'ai' || rationaleMode === 'both') && aiEnabled;

  // Check AI cache on mount / cache update
  useEffect(() => {
    const cached = rationaleCache[q.question];
    if (cached) setAiRationale(cached);
  }, [rationaleCache, q.question]); // eslint-disable-line

  // Auto-trigger AI explanation fetch on mount if not cached — background, non-blocking
  useEffect(() => {
    if (autoFetchedRef.current) return;
    if (aiRationale || !showAiSection || !getAiRationale) return;
    autoFetchedRef.current = true;
    setLoadingAi(true);
    getAiRationale(q.question, q.correctAnswer, userAnswer, isCorrect ? 'correct' : 'wrong')
      .then(r => { if (r) setAiRationale(r); })
      .catch(() => {}) // silent — user can still tap button
      .finally(() => setLoadingAi(false));
  }, []); // eslint-disable-line

  // Auto-scroll into view on mobile — scroll the quiz-content-scroll container
  useEffect(() => {
    if (!panelRef.current) return;
    const t = setTimeout(() => {
      // First try scrolling the quiz content container
      const scrollContainer = panelRef.current?.closest('.quiz-content-scroll');
      if (scrollContainer) {
        const panelTop = panelRef.current!.offsetTop;
        scrollContainer.scrollTo({ top: panelTop - 80, behavior: 'smooth' });
      } else {
        panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 200);
    return () => clearTimeout(t);
  }, []);

  // Only pause auto-advance when user MANUALLY requested rationale (not background pre-loaded)
  const rationaleVisible = userRequestedAi && !!aiRationale;

  // Auto-advance countdown — paused only when user manually requested explanation
  useEffect(() => {
    if (delay <= 0 || rationaleVisible) return;
    calledRef.current = false;
    setCountdown(delay);
    const iv = setInterval(() => {
      setCountdown(prev => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(iv);
          if (!calledRef.current) { calledRef.current = true; setTimeout(onNext, 0); }
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => { clearInterval(iv); calledRef.current = true; };
  }, [rationaleVisible]); // eslint-disable-line

  const progressPct = delay > 0 ? ((delay - countdown) / delay) * 100 : 0;
  const handleNext = () => { if (!calledRef.current) { calledRef.current = true; onNext(); } };

  const handleAiExplain = async () => {
    if (loadingAi || aiRationale || !getAiRationale) return;
    setUserRequestedAi(true);
    setAiError('');
    setLoadingAi(true);
    try {
      const r = await getAiRationale(q.question, q.correctAnswer, userAnswer, isCorrect ? 'correct' : 'wrong');
      if (r) setAiRationale(r);
      else setAiError('No explanation returned.');
    } catch { setAiError('Could not load. Try again.'); }
    finally { setLoadingAi(false); }
  };

  // Color helpers
  const verdictGreen = isCorrect;
  const ctChipCls = verdictGreen
    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
    : 'bg-red-500/10 border-red-500/25 text-red-300';

  return (
    <div ref={panelRef} className="mt-5 animate-slide-up">

      {/* ══════════════════════════════════════════════════════════════
          SEPARATOR — hard visual break between options zone and action zone
          ══════════════════════════════════════════════════════════════ */}
      <div className="border-t-2 border-foreground/[0.08] mb-3" />

      {/* Auto-advance progress bar — sits just above the Next button (hidden when rationale visible) */}
      {delay > 0 && !rationaleVisible && (
        <div className="h-1 mb-3 rounded-full overflow-hidden bg-foreground/[0.07]">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-linear ${verdictGreen ? 'bg-emerald-400' : 'bg-red-400'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ZONE 2 — ACTION: Next button + countdown chip (side by side)
          ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-stretch gap-2">
        {/* NEXT / FINISH button */}
        <button
          onClick={handleNext}
          className={`flex-1 flex items-center justify-center gap-2.5 font-black text-base py-4 rounded-2xl border transition-all active:scale-[0.98] shadow-lg ${
            isLast
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/20 shadow-emerald-900/40'
              : verdictGreen
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/20 shadow-emerald-900/40'
              : 'bg-primary hover:brightness-110 text-primary-foreground border-primary/20 shadow-primary/25'
          }`}
        >
          {isLast
            ? <><Trophy className="w-5 h-5 flex-shrink-0" /> Finish Quiz!</>
            : <>Next Question <ChevronRight className="w-5 h-5 flex-shrink-0" /></>
          }
        </button>

        {/* Countdown chip — only when auto-advance is active and no rationale showing */}
        {delay > 0 && !rationaleVisible && (
          <div className={`flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-4 rounded-2xl border font-black text-sm ${ctChipCls}`}>
            <Clock className="w-3.5 h-3.5" />
            <span className="tabular-nums leading-none">{countdown}s</span>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SEPARATOR + COLLAPSE TOGGLE
          ══════════════════════════════════════════════════════════════ */}
      <div className="border-t border-foreground/[0.07] mt-4 mb-3" />

      {/* Verdict + collapse toggle row */}
      <button
        onClick={() => setInfoCollapsed(c => !c)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all ${
          verdictGreen
            ? 'bg-emerald-500/8 border-emerald-500/20'
            : 'bg-red-500/8 border-red-500/20'
        }`}
      >
        {verdictGreen
          ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
        }
        <span className={`text-sm font-black leading-tight ${verdictGreen ? 'text-emerald-300' : 'text-red-300'}`}>
          {verdictGreen ? '✓ Correct!' : '✗ Incorrect'}
        </span>
        <span className={`ml-auto flex items-center gap-1.5 text-xs font-bold tabular-nums ${verdictGreen ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
          Q{questionNumber}/{total}
          {infoCollapsed
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronUp className="w-3.5 h-3.5" />
          }
        </span>
      </button>

      {/* Collapsible info zone */}
      {!infoCollapsed && (
        <>
          {/* Correct Answer — ONLY when wrong */}
          {!isCorrect && (
            <div className="mt-3 bg-sky-500/10 border border-sky-500/25 rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="w-3 h-3 text-sky-400 flex-shrink-0" />
                <p className="text-[9px] font-black text-sky-400/70 uppercase tracking-widest">Correct Answer</p>
              </div>
              <p className="text-sm font-bold text-sky-200 leading-relaxed">{q.correctAnswer}</p>
            </div>
          )}

          {/* Book Rationale */}
          {showBook && (
            <div className="mt-3 bg-amber-500/8 border border-amber-500/18 rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <BookOpen className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <p className="text-[9px] font-black text-amber-400/70 uppercase tracking-widest">Rationale</p>
              </div>
              <AiRationaleText text={bookRationale} className="text-[13px] text-amber-200/80" />
            </div>
          )}

          {/* AI Explanation */}
          {showAiSection && (
            aiRationale ? (
              <div className="mt-3 bg-violet-500/8 border border-violet-500/18 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3 h-3 text-violet-400 flex-shrink-0" />
                  <p className="text-[9px] font-black text-violet-400/70 uppercase tracking-widest">AI Explanation</p>
                </div>
                <AiRationaleText text={aiRationale} className="text-[13px] text-violet-200/80" />
              </div>
            ) : aiError ? (
              <p className="mt-3 text-[11px] text-red-400/70 text-center px-2">{aiError}</p>
            ) : getAiRationale ? (
              <button
                onClick={handleAiExplain}
                disabled={loadingAi}
                className="mt-3 flex items-center gap-2 w-full justify-center text-xs font-bold px-4 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/18 hover:bg-violet-500/15 text-violet-300 transition-all active:scale-95 disabled:opacity-60"
              >
                {loadingAi
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</>
                  : <><Sparkles className="w-3.5 h-3.5" /> Get AI Explanation</>
                }
              </button>
            ) : null
          )}
        </>
      )}

    </div>
  );
}
