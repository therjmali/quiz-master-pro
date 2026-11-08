import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { QuizQuestion, QuizSettings, QuizResult, AIPrefs, Screen } from '../types/quiz';
import { useQuizSession } from '../hooks/useQuizSession';
import { useRationaleCache } from '../hooks/useRationaleCache';
import { getUserApiKeys } from '../utils/apiKeys';
import { tickSeconds } from '../utils/quizNav';
import { getPracticeLabel } from '../utils/practiceNaming';
import { explainQuestion, generateQuiz } from 'zitejs/api';
import { SCREEN_PATHS } from '../utils/navigationConfig';
import { addMistakesFromResult, updateMistakesAfterPractice } from '../utils/globalMistakes';
import { loadFileTree, createFile, saveFileTree, findNode as findNodeInTree } from '../utils/fileTree';

// ── Context types ──────────────────────────────────────────────────

interface QuizContextValue {
  // Quiz session state
  quiz: ReturnType<typeof useQuizSession>;

  // Background index for dynamic backgrounds
  bgIdx: number;

  // Rationale cache
  rationaleCache: Record<string, string>;
  setRationaleCache: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  rationaleCacheRef: React.MutableRefObject<Record<string, string>>;

  // Actions
  doFinishQuiz: (save?: boolean) => void;
  getAiRationale: (
    question: string,
    correctAnswer: string,
    userAnswer: string | null,
    status: 'correct' | 'wrong' | 'skipped',
    options?: string[],
  ) => Promise<string>;
  handleMoreLikeThis: () => Promise<void>;
  moreLikeThisLoading: boolean;

  // Practice / retry helpers
  startPracticeFromResult: (
    result: QuizResult,
    history: QuizResult[],
    questions?: QuizQuestion[],
  ) => { title: string; attemptNum: number };

  /** Incremented each time auto-save fires — drives the "💾 Saved" indicator */
  saveSignal: number;
}

const QuizContext = createContext<QuizContextValue | null>(null);

export function useQuiz(): QuizContextValue {
  const ctx = useContext(QuizContext);
  if (!ctx) throw new Error('useQuiz must be used within <QuizProvider>');
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────────

interface QuizProviderProps {
  children: ReactNode;
  settingsRef: React.MutableRefObject<QuizSettings>;
  aiPrefs: AIPrefs;
  /** Called when quiz finishes — should save to history and return cloud ID */
  onSaveResult: (result: QuizResult) => Promise<string | undefined>;
  /** Called to set the current result for the results screen */
  onResultReady: (result: QuizResult, id?: string) => void;
  /** Current screen for timer/session guards */
  screen: Screen;
}

export function QuizProvider({
  children,
  settingsRef,
  aiPrefs,
  onSaveResult,
  onResultReady,
  screen,
}: QuizProviderProps) {
  const navigate = useNavigate();
  const quiz = useQuizSession(settingsRef);
  const { rationaleCache, setRationaleCache, rationaleCacheRef } = useRationaleCache();
  const [bgIdx, setBgIdx] = useState(0);
  const [moreLikeThisLoading, setMoreLikeThisLoading] = useState(false);

  const bgGenActiveRef = useRef(false);
  const screenRef = useRef<Screen>('dashboard');

  useEffect(() => { screenRef.current = screen; }, [screen]);

  // ── Background gradient cycling ──
  useEffect(() => { setBgIdx(quiz.currentIndex % 6); }, [quiz.currentIndex]);

  // ── Record question time on index change ──
  useEffect(() => {
    if (screen !== 'quiz') return;
    quiz.questionStartAccRef.current = quiz.accumulatedTime;
  }, [quiz.currentIndex]); // eslint-disable-line

  // ── Session persistence — save immediately on any meaningful state change ──
  useEffect(() => {
    quiz.saveSessionToStorage(screen);
  }, [screen, quiz.currentIndex, quiz.userAnswers, quiz.flaggedQuestions, quiz.forcedNext]); // eslint-disable-line

  // ── Save signal counter — triggers "💾 Saved" indicator in PremiumHeader ──
  const [saveSignal, setSaveSignal] = useState(0);

  // ── Extra: save immediately on every answer (critical for mobile session recovery) ──
  const prevAnswersRef = useRef(quiz.userAnswers);
  useEffect(() => {
    if (screen !== 'quiz' || quiz.userAnswers === prevAnswersRef.current) return;
    prevAnswersRef.current = quiz.userAnswers;
    // Immediate save — don't wait for the 15s auto-save
    quiz.saveSessionNow();
    setSaveSignal(s => s + 1);
  }, [screen, quiz.userAnswers, quiz.saveSessionNow]);

  // ── Timer — uses refs exclusively to avoid stale closures ──
  useEffect(() => {
    if (screen !== 'quiz' || !quiz.quizData.length) return;
    // Clear any existing timer first to prevent double-intervals
    if (quiz.timerRef.current) clearInterval(quiz.timerRef.current);
    // Measure against the clock, not tick counts: Android freezes/throttles timers when the screen is
    // off or the app is in the background, which used to leave question timers stuck or too slow.
    let last = Date.now();
    quiz.timerRef.current = setInterval(() => {
      const now = Date.now();
      const tMode = settingsRef.current.timerMode;
      const raw = tickSeconds(now, last, Number.MAX_SAFE_INTEGER);
      if (raw <= 0) return;
      // No timer: idle/background time must not inflate "time taken" (cap one catch-up at 2 s).
      const cap = tMode === 'off' ? 2 : 3600;
      const secs = Math.min(raw, cap);
      last = raw > cap ? now : last + raw * 1000;
      if (quiz.isPausedRef.current) return;
      quiz.setAccumulatedTime((p) => p + secs);
      if (tMode === 'per-question') {
        const st = settingsRef.current;
        const full = st.timerValue * (st.timerUnit === 'min' ? 60 : 1);
        quiz.setTimeLeftPerQ((prev) => {
          const idx = quiz.currentIdxRef.current;
          if (quiz.forcedNextRef.current[idx]) return prev;
          const cur = prev[idx] ?? full;
          if (cur <= 0) return prev;
          const next = [...prev];
          next[idx] = Math.max(0, cur - secs);
          return next;
        });
      } else if (tMode === 'total') {
        quiz.totalTimeLeftRef.current = Math.max(0, quiz.totalTimeLeftRef.current - secs);
        quiz.setTotalTimeLeft(quiz.totalTimeLeftRef.current);
        if (quiz.totalTimeLeftRef.current <= 0) quiz.doFinishQuizRef.current(true);
      }
    }, 1000);
    return () => {
      if (quiz.timerRef.current) {
        clearInterval(quiz.timerRef.current);
        quiz.timerRef.current = null;
      }
    };
  }, [screen, quiz.quizData.length]); // eslint-disable-line

  // ── Finish quiz ──
  const doFinishQuiz = useCallback(
    (save = true) => {
      if (quiz.timerRef.current) clearInterval(quiz.timerRef.current);
      localStorage.removeItem(quiz.SESSION_KEY);
      quiz.setHasSavedSession(false);
      const result = quiz.buildResult(quiz.confidenceLevels);
      onResultReady(result);
      // Add wrong answers to global mistake pool
      if (result.attemptType === 'practice') {
        updateMistakesAfterPractice(result);
      } else {
        addMistakesFromResult(result);
      }
      if (save) {
        onSaveResult(result).then((id) => {
          if (id) onResultReady({ ...result, id }, id);
          // Auto-save to selected folder
          const folderId = quiz.targetFolderIdRef.current;
          if (folderId) {
            try {
              const tree = loadFileTree();
              const folder = findNodeInTree(tree, folderId);
              if (folder && folder.type === 'folder') {
                const name = result.quizTitle || `Quiz · ${result.totalQuestions} Questions`;
                const resultId = id || String(result.timestamp);
                createFile(tree, folderId, name, result.quizData, result.subject ? [result.subject] : [], '📄', result.timestamp, resultId, result.timestamp);
                saveFileTree(tree);
              }
            } catch {}
            // Clear the target folder after use
            quiz.setTargetFolderId(null);
          }
        });
      }
      navigate(SCREEN_PATHS.results);
      requestAnimationFrame(() => window.scrollTo(0, 0));
    },
    [quiz, onSaveResult, onResultReady, navigate],
  );

  useEffect(() => {
    quiz.doFinishQuizRef.current = doFinishQuiz;
  }, [doFinishQuiz, quiz]);

  // ── Background rationale pre-generation ──
  useEffect(() => {
    if (screen !== 'quiz' || quiz.quizData.length === 0) {
      bgGenActiveRef.current = false;
      return;
    }
    if (bgGenActiveRef.current) return;
    bgGenActiveRef.current = true;
    let active = true;
    (async () => {
      await new Promise((r) => setTimeout(r, 800));
      const rh = aiPrefs.reportHelper;
      if (rh === 'off') { bgGenActiveRef.current = false; return; }
      for (const q of [...quiz.quizDataRef.current]) {
        if (!active || screenRef.current !== 'quiz') break;
        if (rationaleCacheRef.current[q.question]) continue;
        try {
          const userKeys = getUserApiKeys();
          const useCloud = rh === 'cloud';
          const data = await explainQuestion({
            question: q.question,
            correctAnswer: q.correctAnswer,
            options: q.options,
            userAnswer: undefined,
            status: 'correct',
            userGeminiKey: useCloud ? (userKeys.gemini || undefined) : undefined,
            userCohereKey: useCloud ? (userKeys.cohere || undefined) : undefined,
            userOpenaiKey: useCloud ? (userKeys.openai || undefined) : undefined,
          });
          if (active) setRationaleCache((prev) => ({ ...prev, [q.question]: data.rationale }));
        } catch {}
        if (active) await new Promise((r) => setTimeout(r, 800));
      }
      bgGenActiveRef.current = false;
    })();
    return () => { active = false; bgGenActiveRef.current = false; };
  }, [screen, quiz.quizData.length, aiPrefs.reportHelper]); // eslint-disable-line

  // ── In-flight deduplication map — prevents duplicate API calls for the same question ──
  const inFlightRef = useRef<Map<string, Promise<string>>>(new Map());

  // ── AI rationale getter — uses ref for cache check to avoid stale closures ──
  const reportHelperRef = useRef(aiPrefs.reportHelper);
  useEffect(() => { reportHelperRef.current = aiPrefs.reportHelper; }, [aiPrefs.reportHelper]);

  const getAiRationale = useCallback(
    async (
      question: string,
      correctAnswer: string,
      userAnswer: string | null,
      status: 'correct' | 'wrong' | 'skipped',
      options?: string[],
    ) => {
      // Use ref for instant cache check — avoids stale closure issue
      const cached = rationaleCacheRef.current[question];
      if (cached) return cached;
      if (reportHelperRef.current === 'off') return '';

      // Deduplicate in-flight requests — if already fetching this question, await the same promise
      const existing = inFlightRef.current.get(question);
      if (existing) return existing;

      const promise = (async () => {
        try {
          const userKeys = getUserApiKeys();
          const useCloud = reportHelperRef.current === 'cloud';
          const data = await explainQuestion({
            question,
            correctAnswer,
            options,
            userAnswer: userAnswer ?? undefined,
            status,
            userGeminiKey: useCloud ? (userKeys.gemini || undefined) : undefined,
            userCohereKey: useCloud ? (userKeys.cohere || undefined) : undefined,
            userOpenaiKey: useCloud ? (userKeys.openai || undefined) : undefined,
          });
          setRationaleCache((prev) => ({ ...prev, [question]: data.rationale }));
          return data.rationale;
        } finally {
          inFlightRef.current.delete(question);
        }
      })();

      inFlightRef.current.set(question, promise);
      return promise;
    },
    [rationaleCacheRef, setRationaleCache],
  );

  // ── More Like This (uses last quiz data from the session or passed result) ──
  const lastQuizDataRef = useRef<QuizQuestion[]>([]);
  useEffect(() => {
    if (quiz.quizData.length > 0) lastQuizDataRef.current = quiz.quizData;
  }, [quiz.quizData]);

  const handleMoreLikeThis = useCallback(async () => {
    const currentResult = lastQuizDataRef.current;
    if (!currentResult.length) return;
    setMoreLikeThisLoading(true);
    try {
      const sample = currentResult.slice(0, 12);
      const topicLines = sample
        .map((q, i) => `Q${i + 1}: ${q.question}\nAnswer: ${q.correctAnswer}`)
        .join('\n\n');
      const prompt = `Generate 10 fresh new MCQ questions on the SAME topics and subject matter as these sample questions. The new questions must be DIFFERENT from the samples. Keep the same difficulty level.\n\n${topicLines}`;
      const userKeys = getUserApiKeys();
      const data = await generateQuiz({
        text: prompt,
        difficulty: settingsRef.current.difficulty,
        userGeminiKey: userKeys.gemini || undefined,
        userCohereKey: userKeys.cohere || undefined,
        userOpenaiKey: userKeys.openai || undefined,
      });
      const questions = data.questions as QuizQuestion[];
      if (!questions.length) {
        toast.error('Could not generate questions. Try again.');
        return;
      }
      toast.success(`✨ Generated ${questions.length} new questions!`);
      quiz.startQuiz(questions);
      navigate(SCREEN_PATHS.quiz);
    } catch (e: any) {
      toast.error(
        e?.message?.includes('quota')
          ? '🚫 AI quota exceeded.'
          : 'Failed to generate. Please try again.',
      );
    } finally {
      setMoreLikeThisLoading(false);
    }
  }, [quiz, settingsRef, navigate]);

  // ── Practice helper ──
  const startPracticeFromResult = useCallback(
    (result: QuizResult, history: QuizResult[], questions?: QuizQuestion[]) => {
      const parentTs =
        result.attemptType === 'practice'
          ? result.parentQuizTimestamp || result.timestamp
          : result.timestamp;
      const existingCount = history.filter(
        (r) => r.attemptType === 'practice' && r.parentQuizTimestamp === parentTs,
      ).length;
      const attemptNum = existingCount + 1;
      const label = getPracticeLabel(attemptNum);
      const practiceTitle = result.quizTitle
        ? `${result.quizTitle} — ${label}`
        : label;

      const qs = questions || result.quizData;
      quiz.startQuiz(qs, {
        attemptType: 'practice',
        attemptNumber: attemptNum,
        parentQuizTimestamp: parentTs,
        parentQuizId: result.id,
      });

      return { title: practiceTitle, attemptNum };
    },
    [quiz],
  );

  const value: QuizContextValue = {
    quiz,
    bgIdx,
    rationaleCache,
    setRationaleCache,
    rationaleCacheRef,
    doFinishQuiz,
    getAiRationale,
    handleMoreLikeThis,
    moreLikeThisLoading,
    startPracticeFromResult,
    saveSignal,
  };

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}
