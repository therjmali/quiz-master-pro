import { useState, useRef, useCallback, useEffect } from 'react';
import { totalTimerSeconds } from '../utils/examModes';
import { QuizQuestion, QuizSettings, QuizResult, Screen } from '../types/quiz';
import { calculateScore } from '../utils/scoring';
import { saveConfidenceRecord } from '../utils/confidenceTracker';
import { addWrongQuestionsToSR } from '../utils/spacedRepetition';
import { toast } from 'sonner';
import { getDraft, removeDraftForQuiz, upsertDraft, type SessionBlob } from '../utils/drafts';

const SESSION_KEY = 'qmp_active_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function checkSavedSession(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!(parsed.savedAt && Date.now() - parsed.savedAt < SESSION_TTL_MS && parsed.quizData?.length > 0);
  } catch { return false; }
}

export function useQuizSession(settingsRef: React.MutableRefObject<QuizSettings>) {
  const [quizData, setQuizData] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<(string | null)[]>([]);
  const [flaggedQuestions, setFlaggedQuestions] = useState<boolean[]>([]);
  const [accumulatedTime, setAccumulatedTime] = useState(0);
  const [timeLeftPerQ, setTimeLeftPerQ] = useState<number[]>([]);
  const [forcedNext, setForcedNext] = useState<boolean[]>([]);
  const [totalTimeLeft, setTotalTimeLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [hasSavedSession, setHasSavedSession] = useState(checkSavedSession);
  const [confidenceLevels, setConfidenceLevels] = useState<('sure' | 'guessing' | null)[]>([]);
  const [adaptiveDifficulty, setAdaptiveDifficulty] = useState<string>('medium');

  const quizDataRef = useRef<QuizQuestion[]>([]);
  const userAnswersRef = useRef<(string | null)[]>([]);
  const flaggedRef = useRef<boolean[]>([]);
  const accTimeRef = useRef(0);
  const currentIdxRef = useRef(0);
  const forcedNextRef = useRef<boolean[]>([]);
  const isPausedRef = useRef(false);
  const totalTimeLeftRef = useRef(0);
  const timeLeftPerQRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionTimingsRef = useRef<number[]>([]);
  const questionStartAccRef = useRef<number>(0);
  const doFinishQuizRef = useRef<(save?: boolean) => void>(() => {});

  // Keep refs in sync
  useEffect(() => { quizDataRef.current = quizData; }, [quizData]);
  useEffect(() => { userAnswersRef.current = userAnswers; }, [userAnswers]);
  useEffect(() => { flaggedRef.current = flaggedQuestions; }, [flaggedQuestions]);
  useEffect(() => { accTimeRef.current = accumulatedTime; }, [accumulatedTime]);
  useEffect(() => { currentIdxRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { forcedNextRef.current = forcedNext; }, [forcedNext]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { timeLeftPerQRef.current = timeLeftPerQ; }, [timeLeftPerQ]);

  // Cleanup timer
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const lastDraftAtRef = useRef(0);
  const sessionBlob = useCallback((): SessionBlob => ({
    quizData: quizDataRef.current, settings: settingsRef.current,
    currentIndex: currentIdxRef.current, userAnswers: userAnswersRef.current,
    flaggedQuestions: flaggedRef.current, accumulatedTime: accTimeRef.current,
    timeLeftPerQ: timeLeftPerQRef.current, forcedNext: forcedNextRef.current,
    totalTimeLeft: totalTimeLeftRef.current, savedAt: Date.now(),
    targetFolderId: targetFolderIdRef.current,
  }), [settingsRef]);
  /** Keeps the quiz in Drafts (max 5, one per quiz, synced). `force` skips the 45 s throttle used while answering. */
  const saveDraftNow = useCallback((force = false) => {
    if (!quizDataRef.current.length) return null;
    if (!force && Date.now() - lastDraftAtRef.current < 45_000) return null;
    lastDraftAtRef.current = Date.now();
    return upsertDraft(sessionBlob());
  }, [sessionBlob]);

  // Save session to localStorage during quiz — uses ONLY refs so it's never stale
  const saveSessionToStorage = useCallback((screen: Screen) => {
    if (screen !== 'quiz' || !quizDataRef.current.length) return;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        quizData: quizDataRef.current, settings: settingsRef.current,
        currentIndex: currentIdxRef.current, userAnswers: userAnswersRef.current,
        flaggedQuestions: flaggedRef.current, accumulatedTime: accTimeRef.current,
        timeLeftPerQ: timeLeftPerQRef.current, forcedNext: forcedNextRef.current,
        totalTimeLeft: totalTimeLeftRef.current, savedAt: Date.now(),
        targetFolderId: targetFolderIdRef.current,
      }));
    } catch {}
  }, [settingsRef]);

  // Immediate save helper — can be called from anywhere without screen arg
  const saveSessionNow = useCallback((forceDraft = false) => {
    if (!quizDataRef.current.length) return;
    saveDraftNow(forceDraft);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        quizData: quizDataRef.current, settings: settingsRef.current,
        currentIndex: currentIdxRef.current, userAnswers: userAnswersRef.current,
        flaggedQuestions: flaggedRef.current, accumulatedTime: accTimeRef.current,
        timeLeftPerQ: timeLeftPerQRef.current, forcedNext: forcedNextRef.current,
        totalTimeLeft: totalTimeLeftRef.current, savedAt: Date.now(),
        targetFolderId: targetFolderIdRef.current,
      }));
    } catch {}
  }, [settingsRef, saveDraftNow]);

  // Auto-pause on tab switch / app close + save before unload
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && quizDataRef.current.length > 0) {
        isPausedRef.current = true;
        setIsPaused(true);
        saveSessionNow(true);
      }
    };
    const handleBeforeUnload = () => {
      if (quizDataRef.current.length > 0) {
        saveSessionNow();
      }
    };
    // Use pagehide as well — more reliable on mobile than beforeunload
    const handlePageHide = () => {
      if (quizDataRef.current.length > 0) {
        saveSessionNow(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [saveSessionNow]);

  // ── Auto-save every 15 seconds while quiz is active (was 30s) ──
  useEffect(() => {
    const interval = setInterval(() => {
      if (quizDataRef.current.length > 0 && !isPausedRef.current) {
        saveSessionNow();
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [saveSessionNow]);

  // Practice metadata stored when startQuiz is called with practice info
  const practiceMetaRef = useRef<{ attemptType?: 'main' | 'practice'; attemptNumber?: number; parentQuizTimestamp?: number; parentQuizId?: string } | null>(null);

  // Target folder for auto-filing after quiz completion
  const targetFolderIdRef = useRef<string | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  useEffect(() => { targetFolderIdRef.current = targetFolderId; }, [targetFolderId]);

  const startQuiz = useCallback((questions: QuizQuestion[], practiceMeta?: { attemptType?: 'main' | 'practice'; attemptNumber?: number; parentQuizTimestamp?: number; parentQuizId?: string }) => {
    if (timerRef.current) clearInterval(timerRef.current);
    localStorage.removeItem(SESSION_KEY);
    setHasSavedSession(false);
    questionTimingsRef.current = [];
    questionStartAccRef.current = 0;
    practiceMetaRef.current = practiceMeta || null;
    const s = settingsRef.current;
    const tl = s.timerMode === 'per-question' ? s.timerValue * (s.timerUnit === 'min' ? 60 : 1) : 0;
    const totalSecs = totalTimerSeconds(s, questions.length);
    totalTimeLeftRef.current = totalSecs;
    setTotalTimeLeft(totalSecs);
    const processed = questions.map((q, originalIdx) => ({
      ...q, originalIndex: originalIdx,
      shuffledOpts: s.shuffleOptions ? [...q.options].sort(() => Math.random() - 0.5) : [...q.options],
    }));
    const ordered = s.shuffleQuestions ? [...processed].sort(() => Math.random() - 0.5) : processed;
    const initialTimePerQ = new Array(ordered.length).fill(tl);
    setQuizData(ordered);
    setCurrentIndex(0);
    setUserAnswers(new Array(ordered.length).fill(null));
    setFlaggedQuestions(new Array(ordered.length).fill(false));
    setAccumulatedTime(0);
    setTimeLeftPerQ(initialTimePerQ);
    timeLeftPerQRef.current = initialTimePerQ;
    setForcedNext(new Array(ordered.length).fill(false));
    setConfidenceLevels(new Array(ordered.length).fill(null));
    setIsPaused(false);
    setAdaptiveDifficulty('medium');
  }, [settingsRef]);

  const handleResumeSession = useCallback(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const { quizData: qd, settings: qs, currentIndex: ci, userAnswers: ua,
        flaggedQuestions: fq, accumulatedTime: at, timeLeftPerQ: tl,
        forcedNext: fn, totalTimeLeft: ttl, targetFolderId: savedFolderId } = JSON.parse(raw);
      if (savedFolderId) { setTargetFolderId(savedFolderId); targetFolderIdRef.current = savedFolderId; }
      const currentSettings = settingsRef.current;
      // The quiz's OWN saved settings win (timer, marks, mode…); app-wide settings only fill in what the
      // saved quiz did not record. (It used to be the other way round, so a resumed timed quiz could
      // silently lose or change its timer.)
      const mergedSettings = {
        ...currentSettings, ...qs,
        timerMode: qs.timerMode || (qs.timerEnabled ? 'per-question' : currentSettings.timerMode || 'off'),
      };
      // Update settings through ref (caller should sync)
      Object.assign(settingsRef.current, mergedSettings);
      setQuizData(qd); setCurrentIndex(ci);
      totalTimeLeftRef.current = ttl ?? 0;
      setTotalTimeLeft(ttl ?? 0);
      setUserAnswers(ua); setFlaggedQuestions(fq || new Array(qd.length).fill(false));
      setAccumulatedTime(at);
      setTimeLeftPerQ(tl);
      timeLeftPerQRef.current = tl || [];
      setForcedNext(fn);
      setConfidenceLevels(new Array(qd.length).fill(null));
      setHasSavedSession(false);
      setIsPaused(false);
      toast.success('Quiz resumed! ✅');
      return true;
    } catch { toast.error('Could not resume session.'); return false; }
  }, [settingsRef]);

  const recordCurrentQuestionTime = useCallback(() => {
    const elapsed = accTimeRef.current - questionStartAccRef.current;
    const idx = currentIdxRef.current;
    questionTimingsRef.current[idx] = (questionTimingsRef.current[idx] || 0) + Math.max(0, elapsed);
    questionStartAccRef.current = accTimeRef.current;
  }, []);

  const handleToggleFlag = useCallback((idx: number) => {
    setFlaggedQuestions(prev => { const next = [...prev]; next[idx] = !next[idx]; return next; });
  }, []);

  const handleExitQuiz = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    // Leaving a quiz never loses it: it goes to Drafts (max 5, one per quiz) and can be resumed on any device.
    const draft = saveDraftNow(true);
    localStorage.removeItem(SESSION_KEY);
    setHasSavedSession(false);
    setQuizData([]); setUserAnswers([]); setFlaggedQuestions([]);
    setCurrentIndex(0); setAccumulatedTime(0); setIsPaused(false);
    if (draft) toast.success('Saved to Drafts', { description: `${draft.answered}/${draft.total} answered · resume it from the home screen` });
    else toast('Quiz exited.');
  }, [saveDraftNow]);

  /** Opens a draft (from this or another device) as the running quiz. */
  const resumeFromDraft = useCallback((id: string): boolean => {
    const d = getDraft(id);
    if (!d) { toast.error('That draft is no longer available.'); return false; }
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...d.session, savedAt: Date.now() })); } catch { /* storage full */ }
    lastDraftAtRef.current = Date.now();
    return handleResumeSession();
  }, [handleResumeSession]);

  const discardSession = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setHasSavedSession(false);
  }, []);

  const buildResult = useCallback((confidences: ('sure' | 'guessing' | null)[]): QuizResult => {
    const lastElapsed = accTimeRef.current - questionStartAccRef.current;
    const lastIdx = currentIdxRef.current;
    questionTimingsRef.current[lastIdx] = (questionTimingsRef.current[lastIdx] || 0) + Math.max(0, lastElapsed);

    const qd = quizDataRef.current;
    const ua = userAnswersRef.current;
    const fq = flaggedRef.current;
    const s = settingsRef.current;
    const scored = calculateScore(qd, ua, s.marksPerQuestion, s.negativeMarking, s.negativeMarks);

    const rawTimings = [...questionTimingsRef.current];
    const totalTracked = rawTimings.reduce((a, b) => a + (b || 0), 0);
    const avgT = qd.length > 0 ? accTimeRef.current / qd.length : 0;
    const questionTimings = qd.map((_, i) => {
      const t = rawTimings[i];
      return t && t > 0 ? t : (totalTracked > 0 ? 0 : avgT);
    });

    const result: QuizResult = {
      ...scored, totalQuestions: qd.length, quizData: qd, userAnswers: ua,
      flaggedQuestions: fq, score: scored.netScore, timeTaken: accTimeRef.current,
      difficulty: s.difficulty, timestamp: Date.now(),
      quizTitle: s.quizTitle?.trim() || undefined,
      subject: s.subject?.trim() || undefined,
      passMark: s.passMark, questionTimings,
      confidenceLevels: confidences.some(c => c !== null) ? [...confidences] : undefined,
      attemptType: practiceMetaRef.current?.attemptType || 'main',
      attemptNumber: practiceMetaRef.current?.attemptNumber,
      parentQuizTimestamp: practiceMetaRef.current?.parentQuizTimestamp,
      parentQuizId: practiceMetaRef.current?.parentQuizId,
      isMockExam: s.mockExamMode || undefined,
      isAdaptive: s.adaptiveMode || undefined,
      adaptiveSkillLevel: s.adaptiveMode ? (() => {
        const diffs = qd.map(q => q.difficulty || 'medium');
        const scores: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
        const avg = diffs.reduce((a, d) => a + (scores[d] || 2), 0) / diffs.length;
        return avg >= 2.5 ? 'Advanced' : avg >= 1.5 ? 'Intermediate' : 'Beginner';
      })() : undefined,
    };

    // Save confidence calibration
    if (confidences.some(c => c !== null)) {
      let confident = 0, confidentCorrect = 0, confidentWrong = 0;
      let guessing = 0, guessingCorrect = 0, guessingWrong = 0;
      qd.forEach((q, i) => {
        const correct = ua[i] === q.correctAnswer;
        if (confidences[i] === 'sure') { confident++; if (correct) confidentCorrect++; else confidentWrong++; }
        if (confidences[i] === 'guessing') { guessing++; if (correct) guessingCorrect++; else guessingWrong++; }
      });
      if (confident + guessing > 0) {
        saveConfidenceRecord({ confident, confidentCorrect, confidentWrong, guessing, guessingCorrect, guessingWrong });
      }
    }

    // Feed wrong questions into Spaced Repetition
    if (scored.wrong > 0) {
      const wrongQs = qd.filter((q, i) => ua[i] !== null && ua[i] !== q.correctAnswer);
      const added = addWrongQuestionsToSR(wrongQs);
      if (added > 0) toast(`📅 ${added} question${added > 1 ? 's' : ''} added to spaced review`, { duration: 3000 });
    }

    return result;
  }, [settingsRef]);

  /** Marks a question as expired (locked). Moving on is handled by QuizScreen so it also works after a resume. */
  const handleTimeExpired = useCallback((idx: number) => {
    setForcedNext(prev => { if (prev[idx]) return prev; const n = [...prev]; n[idx] = true; return n; });
  }, []);

  return {
    // State
    quizData, currentIndex, userAnswers, flaggedQuestions, accumulatedTime,
    timeLeftPerQ, forcedNext, totalTimeLeft, isPaused, hasSavedSession,
    confidenceLevels, adaptiveDifficulty,
    // Setters
    setQuizData, setCurrentIndex, setUserAnswers, setFlaggedQuestions,
    setAccumulatedTime, setTimeLeftPerQ, setForcedNext, setTotalTimeLeft,
    setIsPaused, setHasSavedSession, setConfidenceLevels, setAdaptiveDifficulty,
    // Refs
    quizDataRef, userAnswersRef, flaggedRef, accTimeRef, currentIdxRef,
    forcedNextRef, isPausedRef, totalTimeLeftRef, timeLeftPerQRef, timerRef,
    questionTimingsRef, questionStartAccRef, doFinishQuizRef,
    // Actions
    startQuiz, handleResumeSession, resumeFromDraft, saveDraftNow, handleExitQuiz, handleToggleFlag,
    handleTimeExpired, recordCurrentQuestionTime, buildResult,
    saveSessionToStorage, saveSessionNow, discardSession,
    SESSION_KEY,
    // Target folder
    targetFolderId, setTargetFolderId, targetFolderIdRef,
  };
}
