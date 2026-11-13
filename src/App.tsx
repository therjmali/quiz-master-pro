import UpdateBanner from './components/update/UpdateBanner';
import { OPEN_UPDATES_EVENT, hasUpdate, scheduleUpdateCheck, useUpdateState } from './platform/updater';
import { requestOpenSettingsSection } from './components/cloud/CloudGate';
import { initReportNotificationTap, pruneMissingReports } from './platform/reportFiles';
import { nextOpenIndex, prevOpenIndex, canEnterQuestion } from './utils/quizNav';
import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense, startTransition } from 'react';
import { BrowserRouter, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, logout } from 'zitejs/auth';
import { Toaster } from '@project/components/ui/sonner';
import { toast } from 'sonner';
import { useShakeDetection } from './hooks/useShakeDetection';
import PullToRefresh from './components/PullToRefresh';
import GestureShortcutsPanel from './components/GestureShortcutsPanel';
import { hapticHeavy, hapticTap } from './utils/haptics';
import { useSwipeNavigation } from './hooks/useSwipeNavigation';
import { useOverlayCount } from './lib/overlayStack';
import { useScreenLocked } from './lib/screenLock';
import { registerBackHandler } from './platform/backButton';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineIndicator from './components/OfflineIndicator';
import { FloatingProgressProvider } from './components/FloatingProgressPopup';
import CloudGate from './components/cloud/CloudGate';
import SignInWindow from './components/cloud/SignInWindow';
import ZoomShortcuts from './components/accessibility/ZoomShortcuts';
import { openSignIn } from './platform/cloud/signInWindow';
import { useAccount } from './platform/cloud/useAccount';
import { DashboardSkeleton, LibrarySkeleton } from './components/ScreenSkeleton';
import type { ReportPreviewData } from './components/reports/ReportPreviewPage';

// Retry wrapper for lazy imports — handles stale chunk URLs after deployments
function lazyRetry<T extends { default: React.ComponentType<any> }>(
  importFn: () => Promise<T>,
): React.LazyExoticComponent<T['default']> {
  return lazy(() =>
    importFn().catch(() =>
      // First retry: re-attempt the import (browser may have cached the failure)
      new Promise<T>((resolve) => setTimeout(resolve, 500)).then(() => importFn())
    ).catch(() => {
      // Second retry: force a full page reload to get fresh chunk URLs
      const key = 'chunk_reload';
      const reloaded = sessionStorage.getItem(key);
      if (!reloaded) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return new Promise<T>(() => {});
      }
      sessionStorage.removeItem(key);
      // Final fallback: show an error message so the user knows something went wrong
      return { default: (() => {
        return (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <p className="text-foreground/70 text-sm">Failed to load this section.</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
              Reload Page
            </button>
          </div>
        );
      }) as any } as T;
    })
  );
}

const OnboardingModal = lazyRetry(() => import('./components/onboarding/OnboardingModal'));
const SetupScreen = lazyRetry(() => import('./components/setup/SetupScreen'));
const QuizScreen = lazyRetry(() => import('./components/quiz/QuizScreen'));
const ResultsScreen = lazyRetry(() => import('./components/results/ResultsScreen'));
const SummaryModal = lazyRetry(() => import('./components/SummaryModal'));
const ProgressScreen = lazyRetry(() => import('./components/profile/ProgressScreen'));
const SettingsScreen = lazyRetry(() => import('./components/settings/SettingsScreen'));
const DashboardScreen = lazyRetry(() => import('./components/dashboard/DashboardScreen'));
const LibraryScreen = lazyRetry(() => import('./components/library/LibraryScreen'));
const StatsScreen = lazyRetry(() => import('./components/stats/StatsScreen'));
const ReportPreviewPage = lazyRetry(() => import('./components/reports/ReportPreviewPage'));
const FlashcardScreen = lazyRetry(() => import('./components/flashcards/FlashcardScreen'));
const AIChatbot = lazyRetry(() => import('./components/AIChatbot'));
const PracticeDashboardScreen = lazyRetry(() => import('./components/practice/PracticeDashboardScreen'));
const SyncCenter = lazyRetry(() => import('./components/cloud/SyncCenter'));
const NotificationCenter = lazyRetry(() => import('./components/NotificationCenter'));
const WidgetManagerModal = lazyRetry(() => import('./components/widgets/WidgetManagerModal'));

// Warm the chunks of frequently-opened screens once the browser is idle, so the
// first visit renders instantly instead of flashing the Suspense skeleton.
// Same specifiers as the lazy() calls above, so the module cache is shared.
const PREFETCH_SCREENS: Array<() => Promise<unknown>> = [
  () => import('./components/library/LibraryScreen'),
  () => import('./components/stats/StatsScreen'),
  () => import('./components/profile/ProgressScreen'),
  () => import('./components/settings/SettingsScreen'),
  () => import('./components/setup/SetupScreen'),
  () => import('./components/results/ResultsScreen'),
  () => import('./components/flashcards/FlashcardScreen'),
];

function prefetchScreensWhenIdle(): () => void {
  let cancelled = false;
  const handles: number[] = [];
  const ric: (cb: () => void) => number =
    (window as any).requestIdleCallback
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 4000 })
      : (cb) => window.setTimeout(cb, 1500);
  const cic: (h: number) => void =
    (window as any).cancelIdleCallback ? (h) => (window as any).cancelIdleCallback(h) : (h) => clearTimeout(h);
  // Respect data-saver / very slow connections
  const conn = (navigator as any).connection;
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || '')) return () => {};
  // One chunk per idle slot so we never monopolise the main thread
  const next = (i: number) => {
    if (cancelled || i >= PREFETCH_SCREENS.length) return;
    handles.push(ric(() => {
      if (cancelled) return;
      PREFETCH_SCREENS[i]().catch(() => {}).finally(() => next(i + 1));
    }));
  };
  const start = () => next(0);
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener('load', start);
    handles.forEach(cic);
  };
}
import {
  QuizSettings, QuizResult, Screen,
  AIPrefs, AppTheme, DEFAULT_AI_PREFS,
  RationalePrefs, DEFAULT_RATIONALE_PREFS,
} from './types/quiz';
import { getHistorySync, setHistory as setHistoryStore } from './utils/historyStore';
import { updateQuizMeta } from 'zitejs/api';

// Context
import { QuizProvider, useQuiz } from './contexts/QuizProvider';
import { useProfileStore } from './hooks/useProfileStore';
import { usePersistedState } from './hooks/usePersistedState';
import type { SessionMode } from './components/SessionSelector';
import { filterBySession } from './components/SessionSelector';
import { loadMistakeStore, addMistakesFromResult } from './utils/globalMistakes';
import { loadFileTree, saveFileTree, getAllFiles, updateNode as updateNodeInTree, FileNode } from './utils/fileTree';

// Hooks
import { useHistorySync } from './hooks/useHistorySync';
import { initLocalStores } from './utils/localStores';
import { loadTheme, persistTheme } from './utils/theme';
import { useCloudSync } from './hooks/useCloudSync';
import { SyncStatus } from './components/Navbar';
import { useTodos } from './hooks/useTodos';
import { updateNativeWidgets, subscribeWidgetActions } from './platform/widgetSync';
import { calculateStreak } from './utils/scoring';
import { getUpcomingExams, getExamDates } from './utils/examDates';
import { REMINDER_CHANGED_EVENT } from './utils/studyReminders';
import type { SubjectStats } from './components/widgets/WidgetManagerModal';

// Navigation config
import {
  SCREEN_PATHS, pathToScreen, SWIPEABLE_SCREENS,
  TAB_LABELS, BG_THEMES,
} from './utils/navigationConfig';

// Navigation stack
import { useNavigationStack } from './hooks/useNavigationStack';

export const DEFAULT_SETTINGS: QuizSettings = {
  difficulty: 'all', mode: 'submit',
  timerMode: 'off', timerEnabled: false,
  timerValue: 30, timerUnit: 'sec',
  totalTimerValue: 30, totalTimerUnit: 'min',
  instantFeedbackDelay: 3,
  marksPerQuestion: 1, negativeMarking: false,
  negativeMarks: 0.25, shuffleQuestions: false, shuffleOptions: true,
  quizTitle: '', passMark: 50, subject: '',
};

// ═══════════════════════════════════════════════════════════════
//  AppScreens — renders all screens, consumes QuizProvider context
// ═══════════════════════════════════════════════════════════════

function AppScreens({
  history, setHistory, syncStatus, historyRef, userRef,
  refreshHistory, saveResult, trashResult, undoLastTrash, markDirty,
  loadingOlder,
  settings, setSettings, currentResult, setCurrentResult,
  theme, setTheme, aiPrefs, setAiPrefs,
  rationalePrefs, setRationalePrefs, dataLoaded, onCloudDirty,
  fetchFullDetail, cacheDetail, invalidateDetail,
}: {
  history: QuizResult[];
  setHistory: React.Dispatch<React.SetStateAction<QuizResult[]>>;
  syncStatus: SyncStatus;
  historyRef: React.MutableRefObject<QuizResult[]>;
  userRef: React.MutableRefObject<any>;
  refreshHistory: () => Promise<void>;
  saveResult: (r: QuizResult) => Promise<string | undefined>;
  trashResult: (id: string) => Promise<void>;
  undoLastTrash: () => void;
  markDirty: () => void;
  loadingOlder: boolean;
  settings: QuizSettings;
  setSettings: React.Dispatch<React.SetStateAction<QuizSettings>>;
  currentResult: QuizResult | null;
  setCurrentResult: React.Dispatch<React.SetStateAction<QuizResult | null>>;
  theme: AppTheme;
  setTheme: React.Dispatch<React.SetStateAction<AppTheme>>;
  aiPrefs: AIPrefs;
  setAiPrefs: React.Dispatch<React.SetStateAction<AIPrefs>>;
  rationalePrefs: RationalePrefs;
  setRationalePrefs: React.Dispatch<React.SetStateAction<RationalePrefs>>;
  dataLoaded: boolean;
  onCloudDirty: (category: 'settings' | 'quiz' | 'flashcards' | 'filemanager' | 'library', priority?: 'background' | 'immediate' | 'critical') => void;
  fetchFullDetail: (id: string) => Promise<QuizResult | null>;
  cacheDetail: (id: string, result: QuizResult) => void;
  invalidateDetail: (id: string) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const screen = useMemo(() => pathToScreen(location.pathname), [location.pathname]);

  const {
    quiz, bgIdx, rationaleCache,
    doFinishQuiz, getAiRationale, handleMoreLikeThis, moreLikeThisLoading,
    startPracticeFromResult,
    saveSignal,
  } = useQuiz();

  const { profile } = useProfileStore();

  // Lifted dashboard state (shared between Navbar and DashboardScreen)
  const [dashSubjectFilter, setDashSubjectFilter] = usePersistedState('dash_subject', 'all');
  const [dashSessionMode, setDashSessionMode] = usePersistedState<SessionMode>('dash_session', 'main');
  const [dashSubjectPopupOpen, setDashSubjectPopupOpen] = useState(false);

  const account = useAccount();
  const authName = account.name || user?.firstName || user?.email?.split('@')[0] || 'Guest';
  const dashDisplayName = profile.displayName || authName;

  const dashSessionHistory = useMemo(() => filterBySession(history, dashSessionMode), [history, dashSessionMode]);

  const dashSubjectOptions = useMemo(() => {
    const map = new Map<string, { count: number; totalPct: number }>();
    dashSessionHistory.forEach(r => {
      if (r.subject) {
        const prev = map.get(r.subject) || { count: 0, totalPct: 0 };
        prev.count++;
        prev.totalPct += r.percentage;
        map.set(r.subject, prev);
      }
    });
    return Array.from(map.entries())
      .map(([name, { count, totalPct }]) => ({ name, count, avg: Math.round(totalPct / count) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dashSessionHistory]);
  const [resultOrigin, setResultOrigin] = useState<Screen | null>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const navStack = useNavigationStack();
  /** Sub-state metadata for current screen (e.g. profile tab, library folder) */
  const screenMetaRef = useRef<Record<string, string>>({});
  const [reportPreviewData, setReportPreviewData] = useState<ReportPreviewData | null>(null);
  /** True while the preview is being closed: the route guard must not bounce to the dashboard mid-transition. */
  const previewClosingRef = useRef(false);
  const [chatbotState, setChatbotState] = useState<{ open: boolean; questionContext?: import('./components/AIChatbot').QuestionContext }>({ open: false });
  const [flashcardInitFilter, setFlashcardInitFilter] = useState<'all' | 'known' | 'review' | 'unmarked'>('all');
  const [detailLoading, setDetailLoading] = useState(false);
  const swipeRef = useRef<HTMLDivElement>(null);
  const [editingActiveQuiz, setEditingActiveQuiz] = useState(false);
  const reportPreviewOriginRef = useRef<Screen>('results');
  const screenRef = useRef<Screen>('dashboard');

  const [hideBadge, setHideBadge] = useState(() => {
    try { return localStorage.getItem('qmp_hide_zite_badge') === 'true'; } catch { return false; }
  });

  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem('qmp_onboarding_done'); } catch { return false; }
  });

  // Modals for Cloud Sync, Notifications, and Android Home Screen Widgets
  const [syncCenterOpen, setSyncCenterOpen] = useState(false);
  const [notifCenterOpen, setNotifCenterOpen] = useState(false);
  const [widgetModalOpen, setWidgetModalOpen] = useState(false);

  // To-Do / Task Management
  const { todos, addTodo, toggleTodo, deleteTodo, updateTodo } = useTodos();
  const pendingTaskCount = useMemo(() => todos.filter(t => !t.completed).length, [todos]);

  // Overall question stats & streak calculation
  const totalQuestionsSolved = useMemo(() => history.reduce((sum, r) => sum + (r.totalQuestions || 0), 0), [history]);
  const streak = useMemo(() => calculateStreak(history.map(r => r.timestamp)), [history]);
  const todayQuestionCount = useMemo(() => {
    const today = new Date().toDateString();
    return history
      .filter(r => new Date(r.timestamp).toDateString() === today)
      .reduce((sum, r) => sum + (r.totalQuestions || 0), 0);
  }, [history]);
  const avgScore = useMemo(() => {
    if (history.length === 0) return 0;
    return Math.round(history.reduce((a, r) => a + (r.percentage || 0), 0) / history.length);
  }, [history]);

  const [examTick, setExamTick] = useState(0);
  useEffect(() => {
    const onRemChange = () => setExamTick(t => t + 1);
    window.addEventListener(REMINDER_CHANGED_EVENT, onRemChange);
    return () => window.removeEventListener(REMINDER_CHANGED_EVENT, onRemChange);
  }, []);

  const subjectStats = useMemo<SubjectStats[]>(() => {
    const map = new Map<string, { correct: number; attempted: number; total: number; lastTitle: string; lastTs: number }>();
    for (const r of history) {
      const name = (r.subject || '').trim();
      if (!name) continue;
      const cur = map.get(name) || { correct: 0, attempted: 0, total: 0, lastTitle: '', lastTs: 0 };
      cur.correct += r.correct || 0;
      cur.attempted += (r.correct || 0) + (r.wrong || 0);
      cur.total += r.totalQuestions || 0;
      if (r.timestamp >= cur.lastTs) {
        cur.lastTs = r.timestamp;
        cur.lastTitle = r.quizTitle || '';
      }
      map.set(name, cur);
    }
    const palette = ['#38BDF8', '#34D399', '#FB7185', '#FBBF24', '#A78BFA', '#F472B6'];
    return [...map.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)
      .map(([name, s], idx) => {
        const words = name.split(/[\s/&_-]+/).filter(Boolean);
        const shortName = (words.length > 1 ? words.map(w => w[0]).join('') : name.slice(0, 4)).toUpperCase().slice(0, 5);
        const accuracy = s.attempted > 0 ? Math.round((s.correct / s.attempted) * 100) : 0;
        return {
          id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name,
          shortName: shortName || 'SUBJ',
          color: palette[idx % palette.length],
          solvedQuestions: s.attempted,
          totalQuestions: s.total,
          accuracy,
          activeUnitName: s.lastTitle || `${s.total} Qs practiced`,
        };
      });
  }, [history]);

  const userExams = useMemo(() => { void examTick; return getExamDates(); }, [examTick]);
  const nextExam = useMemo(() => { void examTick; return getUpcomingExams(1)[0] ?? null; }, [examTick]);

  // Keep Android Home Screen Widgets synced with real user history & exam schedule
  useEffect(() => {
    const topSubj = subjectStats[0];
    const dailyTarget = profile.dailyQuestionGoal || 50;
    const examPace = nextExam && nextExam.daysLeft > 0
      ? Math.max(20, Math.round(1500 / nextExam.daysLeft))
      : dailyTarget;
    updateNativeWidgets({
      todayQuestions: todayQuestionCount,
      targetQuestions: dailyTarget,
      streakDays: streak,
      masteryPercent: avgScore,
      activeSubject: topSubj
        ? {
            id: topSubj.id,
            name: topSubj.name,
            shortName: topSubj.shortName,
            color: topSubj.color,
            percent: topSubj.accuracy,
            solvedQuestions: topSubj.solvedQuestions,
            totalQuestions: topSubj.totalQuestions,
            activeUnitName: topSubj.activeUnitName,
          }
        : {
            id: 'general',
            name: 'Subject Mastery',
            shortName: 'QUIZ',
            percent: avgScore,
            solvedQuestions: todayQuestionCount,
            totalQuestions: dailyTarget,
            activeUnitName: history.length > 0 ? `${history.length} quizzes completed` : 'Complete a quiz to track subjects',
          },
      examTarget: nextExam
        ? {
            title: nextExam.title || nextExam.label || nextExam.subject,
            date: nextExam.date,
            daysRemaining: nextExam.daysLeft,
            targetPace: nextExam.daysLeft > 0 ? `⚡ Target: ${examPace} Qs / day` : '⚡ Exam Day!',
          }
        : {
            title: 'Upcoming Exam',
            date: 'Not set',
            daysRemaining: -1,
            targetPace: `⚡ Daily Goal: ${dailyTarget} Qs / day`,
          },
    });
  }, [history, streak, todayQuestionCount, avgScore, profile.dailyQuestionGoal, subjectStats, nextExam]);

  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => prefetchScreensWhenIdle(), []);

  // ── Browser back button interception with navigation stack ──
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      const cur = screenRef.current;

      // Try popping the navigation stack first
      const prev = navStack.pop();
      if (prev) {
        // Restore to exact previous screen + scroll + sub-state
        if (prev.meta) screenMetaRef.current = prev.meta;
        scrollPositionsRef.current[prev.screen] = prev.scrollY;
        if (cur === 'report-preview') { previewClosingRef.current = true; setReportPreviewData(null); }
        if (cur === 'results') setResultOrigin(null);
        navigate(SCREEN_PATHS[prev.screen], { replace: true });
        // Restore scroll after render
        requestAnimationFrame(() => {
          requestAnimationFrame(() => window.scrollTo(0, prev.scrollY));
        });
      } else {
        // Fallback for empty stack
        if (cur === 'summary') {
          navigate(SCREEN_PATHS['quiz'], { replace: true });
        } else if (cur !== 'dashboard') {
          navigate(SCREEN_PATHS['dashboard'], { replace: true });
        }
      }
      // Re-push state for next interception
      window.history.pushState({ intercepted: true }, '');
    };
    window.history.pushState({ intercepted: true }, '');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigate]); // eslint-disable-line
  // Track feature usage for getting-started checklist
  useEffect(() => {
    if (screen === 'flashcards') { try { localStorage.setItem('qmp_used_flashcards', 'true'); } catch {} }
  }, [screen]);
  useEffect(() => {
    const handler = () => { setHideBadge(localStorage.getItem('qmp_hide_zite_badge') === 'true'); };
    window.addEventListener('qmp-badge-change', handler);
    return () => window.removeEventListener('qmp-badge-change', handler);
  }, []);

  // Redirect guards
  useEffect(() => {
    const shouldRedirect =
      (screen === 'quiz' && !quiz.quizData.length && !quiz.hasSavedSession) ||
      (screen === 'results' && !currentResult) ||
      (screen === 'summary' && !quiz.quizData.length) ||
      (screen === 'report-preview' && !reportPreviewData && !previewClosingRef.current);
    if (shouldRedirect) {
      startTransition(() => { navigate('/', { replace: true }); });
    }
  }, [screen, quiz.quizData.length, quiz.hasSavedSession, currentResult, reportPreviewData, navigate]);

  // Scroll restoration
  useEffect(() => { restoreScrollPosition(screen); }, [location.pathname]); // eslint-disable-line

  // ── Navigation helpers ──
  const scrollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Cleanup scroll timers on unmount
  useEffect(() => { return () => { scrollTimersRef.current.forEach(clearTimeout); }; }, []);
  const restoreScrollPosition = useCallback((targetScreen: Screen) => {
    // Clear any pending scroll timers to prevent memory leaks
    scrollTimersRef.current.forEach(clearTimeout);
    scrollTimersRef.current = [];
    const saved = scrollPositionsRef.current[targetScreen];
    const y = (saved != null && saved > 0) ? saved : 0;
    const doScroll = () => { window.scrollTo(0, y); };
    requestAnimationFrame(() => { requestAnimationFrame(doScroll); });
    [80, 200, 400].forEach(ms => {
      scrollTimersRef.current.push(setTimeout(doScroll, ms));
    });
  }, []);
  const goTo = useCallback((target: Screen) => { startTransition(() => { navigate(SCREEN_PATHS[target]); }); }, [navigate]);
  const setScreen = goTo;

  const navigateTo = useCallback((targetScreen: Screen) => {
    const currentScreen = screenRef.current;
    // Capture scroll NOW before any async work
    const currentScrollY = window.scrollY;
    // Push current screen + scroll + sub-state onto stack before leaving
    navStack.push({
      screen: currentScreen,
      scrollY: currentScrollY,
      meta: { ...screenMetaRef.current },
    });
    scrollPositionsRef.current[currentScreen] = currentScrollY;
    startTransition(() => { navigate(SCREEN_PATHS[targetScreen]); });
    requestAnimationFrame(() => restoreScrollPosition(targetScreen));
  }, [navigate, restoreScrollPosition, navStack]);

  /** Opens the Settings hub (profile photo, status tiles, update banner); `section` jumps to one group of settings. */
  const openSettings = useCallback((section?: string) => {
    if (screenRef.current !== 'settings') {
      screenMetaRef.current = { ...screenMetaRef.current, settingsView: 'main' };
      navigateTo('settings');
    }
    if (section) requestOpenSettingsSection(section);
  }, [navigateTo]);

  /** Back from a screen that was opened on top of another: restores the previous screen, its scroll and sub-state. */
  const goBackFromScreen = useCallback(() => {
    const prev = navStack.pop();
    if (prev) {
      if (prev.meta) screenMetaRef.current = prev.meta;
      scrollPositionsRef.current[prev.screen] = prev.scrollY;
      navigate(SCREEN_PATHS[prev.screen], { replace: true });
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, prev.scrollY)));
    } else {
      navigate(SCREEN_PATHS['dashboard'], { replace: true });
      requestAnimationFrame(() => window.scrollTo(0, 0));
    }
  }, [navigate, navStack]);

  // In-app updates: quiet check on start-up (installed app), and "open the updates" requests from banners and toasts.
  useEffect(() => { initReportNotificationTap(); pruneMissingReports(); }, []);
  const updateState = useUpdateState();
  const updateAvailable = hasUpdate(updateState);
  useEffect(() => scheduleUpdateCheck(info => {
    toast.info(`Update available · v${info.version}`, {
      id: 'app-update', duration: 12000, description: 'Download and install it without leaving the app.',
      action: { label: 'View', onClick: () => openSettings('updates') },
    });
  }), [openSettings]);
  useEffect(() => {
    const open = () => openSettings('updates');
    window.addEventListener(OPEN_UPDATES_EVENT, open);
    return () => window.removeEventListener(OPEN_UPDATES_EVENT, open);
  }, [openSettings]);

  // Handle Android home-screen widget taps (Quick Quiz, Subject Mastery, Exam Countdown)
  useEffect(() => {
    return subscribeWidgetActions(({ action }) => {
      if (action === 'quick-quiz') navigateTo('practice-dashboard');
      else if (action === 'open-subject') navigateTo('setup');
      else if (action === 'open-exam') navigateTo('dashboard');
    });
  }, [navigateTo]);

  /** Load full quiz detail and navigate to results */
  const viewResultWithDetail = useCallback(async (summary: QuizResult, origin?: Screen) => {
    // If currentResult already matches, just navigate
    if (currentResult && ((summary.id && currentResult.id === summary.id) || currentResult.timestamp === summary.timestamp)) {
      if (origin) setResultOrigin(origin);
      navigateTo('results');
      return;
    }
    // If it's a full QuizResult already (has quizData), use directly
    if (summary.quizData?.length) {
      setCurrentResult(summary);
      if (origin) setResultOrigin(origin);
      navigateTo('results');
      return;
    }
    // Fetch full detail from server/cache
    if (summary.id) {
      setDetailLoading(true);
      let full = await fetchFullDetail(summary.id);
      if (!full) {
        // Retry once after 1 second
        await new Promise(res => setTimeout(res, 1000));
        full = await fetchFullDetail(summary.id);
      }
      setDetailLoading(false);
      if (full) {
        setCurrentResult(full);
        if (origin) setResultOrigin(origin);
        navigateTo('results');
      } else {
        // Server failed — try IDB fallback by timestamp and cloud id
        try {
          const { getQuizDetailFromIDB } = await import('./hooks/useHistorySync');
          const local = await getQuizDetailFromIDB(String(summary.timestamp))
            || await getQuizDetailFromIDB(summary.id!);
          if (local && local.quizData?.length) {
            setCurrentResult(local);
            if (origin) setResultOrigin(origin);
            navigateTo('results');
            return;
          }
        } catch {}
        toast.error('Could not load quiz details. Please check your connection and try again.');
      }
    } else {
      // No cloud id — try loading full detail from local IDB cache (e.g. guest-mode imported backup)
      setDetailLoading(true);
      try {
        const { getQuizDetailFromIDB } = await import('./hooks/useHistorySync');
        const local = await getQuizDetailFromIDB(String(summary.timestamp));
        if (local && local.quizData?.length) {
          setCurrentResult(local);
          if (origin) setResultOrigin(origin);
          navigateTo('results');
          setDetailLoading(false);
          return;
        }
      } catch {}
      setDetailLoading(false);
      toast.error('Quiz details not available. The full question data may not have been included in the backup.');
    }
  }, [currentResult, fetchFullDetail, navigateTo, setCurrentResult]);

  /** Load full detail for practice */
  const loadDetailForPractice = useCallback(async (summary: QuizResult): Promise<QuizResult | null> => {
    if (summary.quizData?.length) return summary;
    if (summary.id) {
      const serverResult = await fetchFullDetail(summary.id);
      if (serverResult) return serverResult;
    }
    // Try IDB by timestamp for guest/offline data or server failure fallback
    try {
      const { getQuizDetailFromIDB } = await import('./hooks/useHistorySync');
      const local = await getQuizDetailFromIDB(String(summary.timestamp));
      if (local?.quizData?.length) return local;
    } catch {}
    return null;
  }, [fetchFullDetail]);

  // Pull-to-refresh
  const handlePullRefresh = useCallback(async () => {
    if (!userRef.current) return;
    await refreshHistory();
    toast.success('✅ Refreshed!');
  }, [refreshHistory, userRef]);

  // ── Edit Settings mid-quiz ──
  const handleEditQuizSettings = useCallback(() => {
    quiz.saveSessionToStorage('quiz');
    if (quiz.timerRef.current) clearInterval(quiz.timerRef.current);
    setEditingActiveQuiz(true);
    quiz.setHasSavedSession(true);
    navigateTo('setup');
    toast('⚙️ Edit your settings — then return to your quiz', { duration: 3000 });
  }, [quiz, navigateTo]);

  const handleResumeAfterEdit = useCallback(() => {
    quiz.handleResumeSession();
    setEditingActiveQuiz(false);
    setScreen('quiz');
  }, [quiz, setScreen]);

  const handleHistoryChanged = useCallback(async () => {
    if (!userRef.current) return;
    await refreshHistory();
  }, [refreshHistory, userRef]);

  const handleOpenReportPreview = useCallback((data: ReportPreviewData) => {
    reportPreviewOriginRef.current = screenRef.current;
    // Push current screen + full sub-state onto nav stack so back restores everything
    navStack.push({
      screen: screenRef.current,
      scrollY: window.scrollY,
      meta: { ...screenMetaRef.current },
    });
    previewClosingRef.current = false;
    setReportPreviewData(data); setScreen('report-preview');
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }, [setScreen, navStack]);

  const handleCloseReportPreview = useCallback(() => {
    previewClosingRef.current = true;
    setReportPreviewData(null);
    // Pop from nav stack to restore exact previous screen + scroll + sub-state
    const prev = navStack.pop();
    if (prev) {
      if (prev.meta) screenMetaRef.current = prev.meta;
      scrollPositionsRef.current[prev.screen] = prev.scrollY;
      navigate(SCREEN_PATHS[prev.screen], { replace: true });
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, prev.scrollY)));
    } else {
      const origin = reportPreviewOriginRef.current;
      setScreen(origin);
      requestAnimationFrame(() => { restoreScrollPosition(origin); });
    }
  }, [restoreScrollPosition, setScreen, navStack, navigate]);

  // Hardware back: close panels and popups first, then walk the app's own screen stack, then leave the app.
  useEffect(() => {
    return registerBackHandler(() => {
      if (syncCenterOpen) { setSyncCenterOpen(false); return true; }
      if (notifCenterOpen) { setNotifCenterOpen(false); return true; }
      if (widgetModalOpen) { setWidgetModalOpen(false); return true; }
      if (chatbotState.open) { setChatbotState({ open: false }); return true; }
      if (screenRef.current === 'report-preview') { handleCloseReportPreview(); return true; }
      if (screenRef.current !== 'dashboard') { goBackFromScreen(); return true; }
      return false;
    });
  }, [syncCenterOpen, notifCenterOpen, widgetModalOpen, chatbotState.open, handleCloseReportPreview, goBackFromScreen]);


  const handleReportHelperChange = useCallback((mode: AIPrefs['reportHelper']) => { setAiPrefs(prev => ({ ...prev, reportHelper: mode })); }, [setAiPrefs]);

  const handleUpdateQuizMeta = useCallback((title: string, subject: string, newTimestamp?: number) => {
    const oldTs = currentResult?.timestamp;
    const cloudId = currentResult?.id;
    const tsUpdate = newTimestamp ? { timestamp: newTimestamp } : {};
    setCurrentResult(prev => prev ? { ...prev, quizTitle: title || prev.quizTitle, subject: subject || prev.subject, ...tsUpdate } : prev);
    setHistory(prev => {
      const updated = prev.map(r => {
        if (cloudId ? r.id === cloudId : r.timestamp === oldTs) {
          return { ...r, quizTitle: title || r.quizTitle, subject: subject || r.subject, ...tsUpdate };
        }
        return r;
      }).sort((a, b) => b.timestamp - a.timestamp);
      if (!userRef.current) { try { setHistoryStore(updated); } catch {} }
      return updated;
    });
    if (userRef.current && cloudId) {
      updateQuizMeta({ id: cloudId, quizTitle: title || undefined, subject: subject || undefined, ...(newTimestamp ? { localTimestamp: newTimestamp } : {}) })
        .catch(() => toast.error('Cloud update failed — change saved locally'));
    }
    markDirty();
    onCloudDirty('quiz', 'immediate');
    toast.success('Quiz info updated ✓');
  }, [currentResult, setHistory, userRef, markDirty, setCurrentResult, onCloudDirty]);

  // ── Practice/retry helpers ──
  const handleRetry = useCallback(() => {
    if (!currentResult) return;
    const { title } = startPracticeFromResult(currentResult, history);
    setSettings(prev => ({ ...prev, quizTitle: title, subject: currentResult.subject || prev.subject }));
    setScreen('quiz');
  }, [currentResult, history, startPracticeFromResult, setScreen, setSettings]);

  const handlePracticeMistakes = useCallback(() => {
    if (!currentResult) return;
    const m = currentResult.quizData.filter((q, i) => currentResult.userAnswers[i] !== null && currentResult.userAnswers[i] !== q.correctAnswer);
    if (!m.length) { toast('No mistakes! Perfect! 🎉'); return; }
    const { title } = startPracticeFromResult(currentResult, history, m);
    setSettings(prev => ({ ...prev, quizTitle: title, subject: currentResult.subject || prev.subject }));
    setScreen('quiz');
  }, [currentResult, history, startPracticeFromResult, setScreen, setSettings]);

  const handleRetryAll = useCallback(() => {
    if (!currentResult) return;
    const m = currentResult.quizData.filter((q, i) => currentResult.userAnswers[i] !== q.correctAnswer);
    if (!m.length) { toast('Everything correct! Amazing! 🎉'); return; }
    const { title } = startPracticeFromResult(currentResult, history, m);
    setSettings(prev => ({ ...prev, quizTitle: title, subject: currentResult.subject || prev.subject }));
    setScreen('quiz');
    toast(`🔁 ${title}: ${m.length} question${m.length !== 1 ? 's' : ''}…`);
  }, [currentResult, history, startPracticeFromResult, setScreen, setSettings]);

  // Popups own the screen while they are open: swipe-navigation and shortcuts stay out of the way.
  const overlayCount = useOverlayCount();
  const screenLocked = useScreenLocked();
  // ── Keyboard ──
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (overlayCount > 0) return;                 // a popup is open: it handles Escape itself
      if (e.key === 'Escape' && screenRef.current === 'report-preview') handleCloseReportPreview();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleCloseReportPreview, overlayCount]);

  // ── Swipe ──
  const swipeEnabled = SWIPEABLE_SCREENS.includes(screen) && overlayCount === 0 && !screenLocked;
  useSwipeNavigation(swipeRef, {
    onSwipeLeft: useCallback(() => { const idx = SWIPEABLE_SCREENS.indexOf(screenRef.current); if (idx < 0) return; const next = SWIPEABLE_SCREENS[(idx + 1) % SWIPEABLE_SCREENS.length]; hapticTap(); navigateTo(next); toast(`${TAB_LABELS[next]} →`, { duration: 1200 }); }, [navigateTo]),
    onSwipeRight: useCallback(() => { const idx = SWIPEABLE_SCREENS.indexOf(screenRef.current); if (idx < 0) return; const prev = SWIPEABLE_SCREENS[(idx - 1 + SWIPEABLE_SCREENS.length) % SWIPEABLE_SCREENS.length]; hapticTap(); navigateTo(prev); toast(`← ${TAB_LABELS[prev]}`, { duration: 1200 }); }, [navigateTo]),
    enabled: swipeEnabled,
    edgeOnly: true,
    headerZone: 60,
    footerZone: 70,
  });

  // Shake to undo
  useShakeDetection({ onShake: () => { hapticHeavy(); undoLastTrash(); }, enabled: true });

  const bgTheme = screen === 'quiz' && bgIdx > 0 ? `bg-gradient-to-br ${BG_THEMES[bgIdx]}` : 'bg-background';
  const showBottomNav = screen !== 'quiz' && screen !== 'summary' && screen !== 'report-preview' && screen !== 'flashcards';

  return (
    <div
      ref={swipeRef}
      className={`qmp-app-root ${bgTheme} ${theme === 'light' ? 'app-light' : ''} ${theme === 'amoled' ? 'app-amoled' : ''} transition-colors duration-300 overflow-x-hidden`}
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {hideBadge && <style>{`[data-zite-badge], .zite-badge, [class*="zite-badge"] { display: none !important; }`}</style>}
      <Toaster position={screen === 'quiz' ? 'bottom-center' : 'top-center'} offset={screen === 'quiz' ? 96 : 56} mobileOffset={screen === 'quiz' ? 96 : 56} />
      <OfflineIndicator />
      <CloudGate onSignIn={openSignIn} />
      <SignInWindow />
      <ZoomShortcuts />
      {showOnboarding && screen === 'dashboard' && (
        <Suspense fallback={null}>
          <OnboardingModal onComplete={() => {
            setShowOnboarding(false);
            try { localStorage.setItem('qmp_onboarding_done', 'true'); } catch {}
          }} />
        </Suspense>
      )}
      {chatbotState.open && (
        <Suspense fallback={null}>
          <AIChatbot onClose={() => setChatbotState({ open: false })} questionContext={chatbotState.questionContext} />
        </Suspense>
      )}

      <div
        className={`qmp-shell ${screen === 'quiz' ? 'qmp-shell-quiz' : ''} ${showBottomNav ? 'qmp-has-nav' : ''}`}
        style={{ touchAction: 'pan-y' }}
      >
        {screen !== 'quiz' && screen !== 'report-preview' && (
          <Navbar
            onHome={() => navigateTo('dashboard')}
            onOpenSettings={() => openSettings()}
            settingsActive={screen === 'settings'}
            updateAvailable={updateAvailable}
            syncStatus={syncStatus}
            quizCount={history.length}
            theme={theme}
            onToggleTheme={() => setTheme(t => t === 'amoled' ? 'light' : t === 'light' ? 'ancient' : t === 'ancient' ? 'glass' : 'amoled')}
            onOpenNotifications={() => setNotifCenterOpen(true)}
            unreadNotificationCount={pendingTaskCount}
            onOpenWidgets={() => setWidgetModalOpen(true)}
            onOpenSyncCenter={() => setSyncCenterOpen(true)}
            isDashboard={screen === 'dashboard'}
            profileAvatarEmoji={profile.avatarEmoji}
            profileAvatarUrl={profile.avatarUrl}
            displayName={dashDisplayName}
            subjectOptions={dashSubjectOptions}
            subjectFilter={dashSubjectFilter}
            onSubjectPopupOpen={() => setDashSubjectPopupOpen(true)}
            sessionMode={dashSessionMode}
            onSessionModeChange={setDashSessionMode}
            sessionHistory={history}
            onOpenChatbot={screen === 'dashboard' ? () => startTransition(() => setChatbotState({ open: true })) : undefined}
          />
        )}

        <Suspense fallback={<DashboardSkeleton />}>
        <div key={screen} className="animate-screen-enter">


        {/* Dashboard */}
        {screen === 'dashboard' && (
          <ErrorBoundary screenName="Dashboard" onReset={() => navigateTo('dashboard')}>
            <UpdateBanner />
            {!dataLoaded && !history.length ? <DashboardSkeleton /> : (
              <PullToRefresh onRefresh={handlePullRefresh} enabled={!!user}>
                <DashboardScreen
                  history={history} hasSavedSession={quiz.hasSavedSession}
                  onResumeDraft={id => { if (quiz.resumeFromDraft(id)) setScreen('quiz'); }}
                  onResumeSession={() => { quiz.handleResumeSession(); setScreen('quiz'); }}
                  onDiscardSession={quiz.discardSession}
                  onStartCreate={() => navigateTo('setup')}
                  onViewResult={r => viewResultWithDetail(r, 'dashboard')}
                  onLibrary={() => navigateTo('library')}
                  onPractice={qs => { quiz.startQuiz(qs); setScreen('quiz'); }}
                  onFlashcards={(filter?: 'review') => { if (filter) setFlashcardInitFilter(filter); else setFlashcardInitFilter('all'); navigateTo('flashcards'); }}
                  onOpenChatbot={() => startTransition(() => setChatbotState({ open: true }))}
                  onPracticeDashboard={() => navigateTo('practice-dashboard')}
                  loadingOlder={loadingOlder}
                  subjectFilter={dashSubjectFilter}
                  onSubjectFilterChange={setDashSubjectFilter}
                  sessionMode={dashSessionMode}
                  subjectPopupOpen={dashSubjectPopupOpen}
                  onSubjectPopupOpen={() => setDashSubjectPopupOpen(true)}
                  onSubjectPopupClose={() => setDashSubjectPopupOpen(false)}
                />
              </PullToRefresh>
            )}
          </ErrorBoundary>
        )}

        {/* Practice Dashboard */}
        {screen === 'practice-dashboard' && (
          <ErrorBoundary screenName="Practice Dashboard" onReset={() => navigateTo('dashboard')}>
            <PracticeDashboardScreen
              history={history}
              setHistory={setHistory}
              onViewResult={r => viewResultWithDetail(r, 'practice-dashboard')}
              onStartCreate={() => navigateTo('setup')}
              onPractice={qs => { quiz.startQuiz(qs); setScreen('quiz'); }}
              onBack={() => navigateTo('dashboard')}
            />
          </ErrorBoundary>
        )}

        {/* Setup */}
        {screen === 'setup' && (
          <ErrorBoundary screenName="Quiz Setup" onReset={() => navigateTo('dashboard')}>
            <SetupScreen
              settings={settings} onSettingsChange={setSettings}
              onStartQuiz={(qs, folderId) => { if (folderId) quiz.setTargetFolderId(folderId); quiz.startQuiz(qs); setScreen('quiz'); }}
              history={history} hasSavedSession={quiz.hasSavedSession}
              onResumeSession={editingActiveQuiz ? handleResumeAfterEdit : () => { quiz.handleResumeSession(); setScreen('quiz'); }}
              onDiscardSession={() => { quiz.discardSession(); setEditingActiveQuiz(false); }}
              aiPrefs={aiPrefs} onAiPrefsChange={setAiPrefs}
              rationalePrefs={rationalePrefs} onRationalePrefsChange={setRationalePrefs}
              onReportHelperChange={handleReportHelperChange}
              isEditingActiveQuiz={editingActiveQuiz} onReturnToQuiz={handleResumeAfterEdit}
              featureVisibility={profile.featureVisibility}
            />
          </ErrorBoundary>
        )}

        {/* Library */}
        {screen === 'library' && (
          <ErrorBoundary screenName="Library" onReset={() => navigateTo('dashboard')}>
            {!dataLoaded && !history.length ? <LibrarySkeleton /> : (
              <PullToRefresh onRefresh={handlePullRefresh} enabled={!!user}>
                <LibraryScreen
                  history={history}
                  onViewResult={r => viewResultWithDetail(r, 'library')}
                  onDeleteHistory={id => {
                    // Library and Organizer are independent: deleting a quiz from the Library
                    // never touches Organizer files (and the reverse). The link is read-only.
                    trashResult(id); onCloudDirty('quiz', 'critical');
                  }}
                  onPracticeMistakes={qs => { quiz.startQuiz(qs); setScreen('quiz'); }}
                  onHistoryChanged={() => { if (userRef.current) handleHistoryChanged(); else { try { setHistory(getHistorySync()); } catch {} } }}
                  onOpenReportPreview={handleOpenReportPreview}
                  onOpenTrash={() => {
                    // Navigate first (it snapshots the Library's meta), then open Settings on its Trash page
                    navigateTo('settings');
                    screenMetaRef.current = { ...screenMetaRef.current, settingsView: 'trash' };
                  }}
                  onEditQuiz={(id, title, subject, notes, timestamp) => {
                    const matchedRecord = historyRef.current.find(r => (r.id && r.id === id) || (!r.id && String(r.timestamp) === id));
                    if (!matchedRecord) { toast.error('Quiz not found'); return; }
                    const cloudId = matchedRecord.id;
                    const matchTs = matchedRecord.timestamp;
                    setHistory(prev => {
                      const updated = prev.map(r => {
                        const isMatch = cloudId ? r.id === cloudId : (!r.id && r.timestamp === matchTs);
                        if (!isMatch) return r;
                        return { ...r, quizTitle: title || r.quizTitle, subject: subject || r.subject, notes: notes !== undefined ? notes : r.notes, ...(timestamp ? { timestamp } : {}) };
                      }).sort((a, b) => b.timestamp - a.timestamp);
                      if (!userRef.current) { try { setHistoryStore(updated); } catch {} }
                      return updated;
                    });
                    if (userRef.current && cloudId) {
                      updateQuizMeta({ id: cloudId, quizTitle: title || undefined, subject: subject || undefined, notes: notes !== undefined ? notes : undefined, ...(timestamp ? { localTimestamp: timestamp } : {}) })
                        .then(res => { if (!res.success) toast.error('Cloud update failed'); })
                        .catch(() => toast.error('Cloud update failed — change saved locally'));
                    }
                    // Sync folder entries — update any FileNode linked to this quiz result
                    try {
                      const tree = loadFileTree();
                      const allFiles = getAllFiles(tree);
                      const resultIdStr = cloudId || String(matchTs);
                      for (const f of allFiles) {
                        if (f.sourceResultId === resultIdStr || f.sourceResultId === cloudId || (f.sourceTimestamp && f.sourceTimestamp === matchTs)) {
                          const patch: Partial<Pick<FileNode, 'name' | 'tags' | 'sourceResultId' | 'sourceTimestamp'>> = {};
                          if (title) patch.name = title;
                          if (subject) patch.tags = [subject];
                          // Keep the hard link valid: the quiz may have gained a cloud id or a new date
                          if (cloudId && f.sourceResultId !== cloudId) patch.sourceResultId = cloudId;
                          const newTs = timestamp || matchTs;
                          if (f.sourceTimestamp !== newTs) patch.sourceTimestamp = newTs;
                          if (Object.keys(patch).length > 0) updateNodeInTree(tree, f.id, patch);
                        }
                      }
                    } catch {}
                    markDirty(); onCloudDirty('library', 'immediate'); toast.success('Updated ✓');
                  }}
                />
              </PullToRefresh>
            )}
          </ErrorBoundary>
        )}

        {/* Statistics */}
        {screen === 'stats' && (
          <ErrorBoundary screenName="Statistics" onReset={() => navigateTo('dashboard')}>
            <StatsScreen history={history} onOpenChatbot={() => startTransition(() => setChatbotState({ open: true }))} onViewResult={r => viewResultWithDetail(r, 'stats')} />
          </ErrorBoundary>
        )}

        {/* Quiz */}
        {screen === 'quiz' && quiz.quizData.length > 0 && (
          <ErrorBoundary screenName="Quiz" onReset={() => { quiz.handleExitQuiz(); navigateTo('dashboard'); }}>
            <QuizScreen
              quizData={quiz.quizData} currentIndex={quiz.currentIndex}
              userAnswers={quiz.userAnswers} flaggedQuestions={quiz.flaggedQuestions}
              accumulatedTime={quiz.accumulatedTime} timeLeftPerQ={quiz.timeLeftPerQ}
              totalTimeLeft={quiz.totalTimeLeft} forcedNext={quiz.forcedNext}
              settings={settings} rationaleCache={rationaleCache} getAiRationale={getAiRationale}
              onAnswer={(idx, ans) => {
                quiz.setUserAnswers(prev => { const n = [...prev]; n[idx] = ans; return n; });
                if (settings.adaptiveMode && ans !== null) {
                  const isCorrect = ans === quiz.quizData[idx]?.correctAnswer;
                  quiz.setAdaptiveDifficulty(prev => {
                    const recent = [...quiz.userAnswers.slice(Math.max(0, idx - 1), idx), isCorrect ? 'c' : 'w'];
                    const lastTwo = recent.slice(-2);
                    if (lastTwo.length >= 2 && lastTwo.every(r => r === 'c')) return prev === 'easy' ? 'medium' : 'hard';
                    if (lastTwo.length >= 2 && lastTwo.every(r => r === 'w')) return prev === 'hard' ? 'medium' : 'easy';
                    return prev;
                  });
                }
              }}
              onNext={() => {
                quiz.recordCurrentQuestionTime();
                const n = nextOpenIndex(quiz.currentIndex, quiz.forcedNext, quiz.quizData.length);
                if (n >= 0) quiz.setCurrentIndex(n); else setScreen('summary');
              }}
              onPrev={() => {
                const n = prevOpenIndex(quiz.currentIndex, quiz.forcedNext, !settings.mockExamMode);
                if (n < 0) {
                  if (quiz.currentIndex > 0) toast(settings.mockExamMode ? '🔒 Going back is off in Mock Exam mode' : '🔒 Earlier questions are locked — their time was up');
                  return;
                }
                quiz.recordCurrentQuestionTime();
                quiz.setCurrentIndex(n);
              }}
              onJump={idx => {
                if (!canEnterQuestion(idx, quiz.currentIndex, quiz.forcedNext, !!settings.mockExamMode)) {
                  toast.error(quiz.forcedNext[idx] ? `⏱️ Time was up for Q${idx + 1} — it's locked` : 'Going back is off in Mock Exam mode');
                  return;
                }
                quiz.recordCurrentQuestionTime();
                quiz.setCurrentIndex(idx);
              }}
              onFinish={() => setScreen('summary')}
              onSubmitNow={() => doFinishQuiz(true)}
              onTimeExpired={quiz.handleTimeExpired}
              onAdvanceAfterExpiry={(idx) => {
                if (quiz.currentIdxRef.current !== idx) return;
                quiz.recordCurrentQuestionTime();
                const n = nextOpenIndex(idx, quiz.forcedNextRef.current, quiz.quizDataRef.current.length);
                if (n >= 0) quiz.setCurrentIndex(n); else quiz.doFinishQuizRef.current(true);
              }}
              onToggleFlag={quiz.handleToggleFlag}
              onExitQuiz={() => { quiz.handleExitQuiz(); navigateTo('dashboard'); }}
              isPaused={quiz.isPaused} onPauseChange={quiz.setIsPaused}
              onSettingsChange={s => { setSettings(s); toast.success('⚙️ Settings updated! Quiz continues.'); }}
              onEditSettings={handleEditQuizSettings}
              confidenceLevels={quiz.confidenceLevels}
              onConfidenceChange={(idx, level) => quiz.setConfidenceLevels(prev => { const n = [...prev]; n[idx] = level; return n; })}
              onEditQuestion={(idx, updated) => {
                quiz.setQuizData(prev => { const n = [...prev]; n[idx] = updated; return n; });
                quiz.setUserAnswers(prev => { const n = [...prev]; n[idx] = null; return n; });
                quiz.setFlaggedQuestions(prev => { const n = [...prev]; n[idx] = false; return n; });
              }}
              adaptiveDifficulty={settings.adaptiveMode ? quiz.adaptiveDifficulty : undefined}
              saveSignal={saveSignal}
            />
          </ErrorBoundary>
        )}

        {/* Summary */}
        {screen === 'summary' && (
          <SummaryModal
            total={quiz.quizData.length}
            attended={quiz.userAnswers.filter(a => a !== null).length}
            onBack={() => setScreen('quiz')}
            onSubmit={() => doFinishQuiz(true)}
          />
        )}

        {/* Results */}
        {screen === 'results' && currentResult && (() => {
          const resultIdx = resultOrigin ? history.findIndex(h => h.timestamp === currentResult.timestamp) : -1;
          const canNav = resultOrigin && resultIdx >= 0;
          return (
            <ErrorBoundary screenName="Results" onReset={() => navigateTo('dashboard')}>
              <ResultsScreen
                result={currentResult} settings={settings} rationaleCache={rationaleCache}
                history={history} rationalePrefs={rationalePrefs}
                onRationalePrefsChange={setRationalePrefs}
                reportHelper={aiPrefs.reportHelper} onReportHelperChange={handleReportHelperChange}
                onHome={() => navigateTo('dashboard')}
                onBackToProfile={resultOrigin ? () => {
                  const origin = resultOrigin;
                  setResultOrigin(null);
                  // Pop nav stack to restore exact previous screen + scroll + sub-state
                  const prev = navStack.pop();
                  if (prev) {
                    if (prev.meta) screenMetaRef.current = prev.meta;
                    scrollPositionsRef.current[prev.screen] = prev.scrollY;
                    navigate(SCREEN_PATHS[prev.screen], { replace: true });
                    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, prev.scrollY)));
                  } else {
                    navigate(SCREEN_PATHS[origin], { replace: true });
                    requestAnimationFrame(() => restoreScrollPosition(origin));
                  }
                } : undefined}
                onViewResult={r => { viewResultWithDetail(r).then(() => { scrollPositionsRef.current['results'] = 0; window.scrollTo(0, 0); }); }}
                onMoreLikeThis={handleMoreLikeThis} moreLikeThisLoading={moreLikeThisLoading}
                onUpdateMeta={handleUpdateQuizMeta}
                historyIndex={canNav ? resultIdx : undefined} historyTotal={canNav ? history.length : undefined}
                onNavigateResult={canNav ? (dir) => {
                  const newIdx = dir === 'next' ? resultIdx + 1 : resultIdx - 1;
                  if (newIdx >= 0 && newIdx < history.length) { viewResultWithDetail(history[newIdx]).then(() => { scrollPositionsRef.current['results'] = 0; window.scrollTo(0, 0); }); }
                } : undefined}
                onRetry={handleRetry} onNewQuiz={() => setScreen('setup')}
                onPracticeMistakes={handlePracticeMistakes}
                onOpenReportPreview={handleOpenReportPreview}
                onRetryAll={handleRetryAll}
                getAiRationale={getAiRationale}
                onAskAI={(ctx) => startTransition(() => setChatbotState({ open: true, questionContext: ctx }))}
              />
            </ErrorBoundary>
          );
        })()}

        {/* Flashcards */}
        {screen === 'flashcards' && (
          <ErrorBoundary screenName="Flashcards" onReset={() => navigateTo('dashboard')}>
            <FlashcardScreen history={history} onBack={() => navigateTo('dashboard')} initialProgressFilter={flashcardInitFilter} />
          </ErrorBoundary>
        )}

        {/* Report Preview */}
        {screen === 'report-preview' && reportPreviewData && (
          <ErrorBoundary screenName="Report Preview" onReset={handleCloseReportPreview}>
            <ReportPreviewPage data={reportPreviewData} onBack={handleCloseReportPreview} />
          </ErrorBoundary>
        )}

        {/* Progress (route id "profile"): lifetime score, report, overview */}
        {screen === 'profile' && (
          <ErrorBoundary screenName="Progress" onReset={() => navigateTo('dashboard')}>
            <ProgressScreen
              history={history} setHistory={setHistory} rationaleCache={rationaleCache} getAiRationale={getAiRationale}
              isSyncing={syncStatus === 'syncing'}
              onDeleteHistory={id => {
                // Independent from the Organizer - see Library delete handler.
                trashResult(id); onCloudDirty('quiz', 'critical');
              }}
              onPracticeMistakes={qs => { quiz.startQuiz(qs); setScreen('quiz'); }}
              onViewResult={r => viewResultWithDetail(r, 'profile')}
              rationalePrefs={rationalePrefs} onRationalePrefsChange={setRationalePrefs}
              reportHelper={aiPrefs.reportHelper} onReportHelperChange={handleReportHelperChange}
              onOpenReportPreview={handleOpenReportPreview}
              onOpenSettings={openSettings}
            />
          </ErrorBoundary>
        )}

        {/* Settings hub (profile photo, top right) */}
        {screen === 'settings' && (
          <ErrorBoundary screenName="Settings" onReset={() => navigateTo('dashboard')}>
            <SettingsScreen
              history={history} rationaleCache={rationaleCache}
              theme={theme} onThemeChange={setTheme}
              onBack={goBackFromScreen}
              onSignIn={() => openSignIn()}
              onHistoryChanged={handleHistoryChanged}
              initialView={screenMetaRef.current.settingsView}
              onViewChange={v => { screenMetaRef.current = { ...screenMetaRef.current, settingsView: v }; }}
            />
          </ErrorBoundary>
        )}
        </div>
        </Suspense>
      </div>

      {/* GestureShortcutsPanel moved to Settings tab */}
      {showBottomNav && (
        <BottomNav
          screen={screen} onHome={() => navigateTo('dashboard')}
          onCreate={() => navigateTo('setup')} onLibrary={() => navigateTo('library')}
          onStats={() => navigateTo('stats')} onProfile={() => navigateTo('profile')}
          quizCount={history.length}
        />
      )}

      {/* Cloud Sync Center Modal */}
      <Suspense fallback={null}>
        <SyncCenter
          open={syncCenterOpen}
          onClose={() => setSyncCenterOpen(false)}
          onTriggerAuth={() => openSignIn()}
        />
      </Suspense>

      {/* Command Center & Smart Alerts */}
      <Suspense fallback={null}>
        <NotificationCenter
          open={notifCenterOpen}
          onClose={() => setNotifCenterOpen(false)}
          todos={todos}
          onAddTodo={addTodo}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
          onUpdateTodo={updateTodo}
          streakDays={streak}
          todayQuestionsDone={todayQuestionCount}
          targetQuestions={profile.dailyQuestionGoal || 50}
          totalQuestionsSolved={totalQuestionsSolved}
          onNavigate={(target) => {
            setNotifCenterOpen(false);
            if (target === 'practice-dashboard') navigateTo('practice-dashboard');
            else if (target === 'flashcards') navigateTo('flashcards');
            else if (target === 'library') navigateTo('library');
            else if (target === 'stats') navigateTo('stats');
          }}
        />
      </Suspense>

      {/* Android Home Screen Widgets Manager */}
      <Suspense fallback={null}>
        <WidgetManagerModal
          open={widgetModalOpen}
          onClose={() => setWidgetModalOpen(false)}
          todayQuestions={todayQuestionCount}
          targetQuestions={profile.dailyQuestionGoal || 50}
          streakDays={streak}
          masteryPercent={avgScore}
          subjects={subjectStats}
          exams={userExams}
          onStartSubjectQuiz={() => {
            setWidgetModalOpen(false);
            navigateTo('setup');
          }}
          onStartQuickPractice={() => {
            setWidgetModalOpen(false);
            navigateTo('practice-dashboard');
          }}
        />
      </Suspense>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  AppContent — manages state & wraps with QuizProvider
// ═══════════════════════════════════════════════════════════════

function AppContent() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const screen = useMemo(() => pathToScreen(location.pathname), [location.pathname]);

  // ── Core state ──
  const [settings, setSettings] = useState<QuizSettings>(() => {
    try { const saved = localStorage.getItem('qmp_settings'); if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }; } catch {}
    return DEFAULT_SETTINGS;
  });
  const settingsRef = useRef<QuizSettings>(DEFAULT_SETTINGS);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const [currentResult, setCurrentResult] = useState<QuizResult | null>(null);
  const [theme, setTheme] = useState<AppTheme>(() => loadTheme());
  const [aiPrefs, setAiPrefs] = useState<AIPrefs>(() => {
    try { return { ...DEFAULT_AI_PREFS, ...JSON.parse(localStorage.getItem('qmp_ai_prefs') || '{}') }; } catch { return DEFAULT_AI_PREFS; }
  });
  const [rationalePrefs, setRationalePrefs] = useState<RationalePrefs>(() => {
    try { return { ...DEFAULT_RATIONALE_PREFS, ...JSON.parse(localStorage.getItem('qmp_rationale_prefs') || '{}') }; } catch { return DEFAULT_RATIONALE_PREFS; }
  });
  const [dataLoaded, setDataLoaded] = useState(false);

  // ── Hydrate IndexedDB-backed stores (history + folder tree) before any screen reads them ──
  const [storesReady, setStoresReady] = useState(false);
  useEffect(() => {
    let alive = true;
    initLocalStores().finally(() => { if (alive) setStoresReady(true); });
    return () => { alive = false; };
  }, []);

  // ── History ──
  const historySync = useHistorySync(user, isLoading);
  const cloudSync = useCloudSync(user, !!user && !isLoading);

  useEffect(() => {
    persistTheme(theme);
    document.documentElement.classList.toggle('app-light', theme === 'light');
    document.documentElement.classList.toggle('app-amoled', theme === 'amoled');
    document.documentElement.classList.toggle('app-ancient', theme === 'ancient');
    document.documentElement.classList.toggle('app-glass', theme === 'glass');
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => { try { localStorage.setItem('qmp_settings', JSON.stringify(settings)); } catch {} }, [settings]);
  useEffect(() => { try { localStorage.setItem('qmp_ai_prefs', JSON.stringify(aiPrefs)); } catch {} }, [aiPrefs]);
  useEffect(() => { try { localStorage.setItem('qmp_rationale_prefs', JSON.stringify(rationalePrefs)); } catch {} }, [rationalePrefs]);
  useEffect(() => { try { const hsl = localStorage.getItem('qmp_accent_hsl'); if (hsl) document.documentElement.style.setProperty('--primary', hsl); const fs = localStorage.getItem('qmp_font_size'); if (fs) { const map: Record<string, string> = { small: '14px', medium: '16px', large: '18px' }; document.documentElement.style.setProperty('--font-size-base', map[fs] || '16px'); } const gi = localStorage.getItem('qmp_glass_intensity'); if (gi) { const val = Number(gi); document.documentElement.style.setProperty('--glass-blur', `${val}px`); document.documentElement.style.setProperty('--glass-opacity', `${Math.min(0.95, 0.5 + val / 100)}`); } } catch {} }, []);
  useEffect(() => { historySync.userRef.current = user; }, [user, historySync.userRef]);

  // Mark data loaded
  useEffect(() => {
    if (!isLoading) { const t = setTimeout(() => setDataLoaded(true), 600); return () => clearTimeout(t); }
  }, [isLoading, historySync.history.length]);

  // Seed global mistakes store from existing history (one-time migration)
  useEffect(() => {
    if (!dataLoaded || !historySync.history.length) return;
    const store = loadMistakeStore();
    if (store.entries.length > 0) return; // already seeded
    const seeded = localStorage.getItem('qmp_mistakes_seeded');
    if (seeded) return;
    historySync.history.forEach(r => addMistakesFromResult(r));
    localStorage.setItem('qmp_mistakes_seeded', '1');
  }, [dataLoaded, historySync.history.length]);

  // QuizProvider callbacks
  const handleResultReady = useCallback((result: QuizResult, id?: string) => {
    if (id) setCurrentResult(prev => prev && prev.timestamp === result.timestamp ? { ...result, id } : result);
    else setCurrentResult(result);
    // Critical cloud sync on quiz complete — syncs history to Drive immediately
    cloudSync.markDirty('quiz', 'critical');
  }, [cloudSync]);

  if (!storesReady) return <DashboardSkeleton />;

  return (
    <QuizProvider
      settingsRef={settingsRef}
      aiPrefs={aiPrefs}
      onSaveResult={historySync.saveResult}
      onResultReady={handleResultReady}
      screen={screen}
    >
      <AppScreens
        history={historySync.history} setHistory={historySync.setHistory}
        syncStatus={historySync.syncStatus}
        historyRef={historySync.historyRef} userRef={historySync.userRef}
        refreshHistory={historySync.refreshHistory} saveResult={historySync.saveResult}
        trashResult={historySync.trashResult} undoLastTrash={historySync.undoLastTrash}
        markDirty={historySync.markDirty}
        loadingOlder={historySync.loadingOlder}
        settings={settings} setSettings={setSettings}
        currentResult={currentResult} setCurrentResult={setCurrentResult}
        theme={theme} setTheme={setTheme}
        aiPrefs={aiPrefs} setAiPrefs={setAiPrefs}
        rationalePrefs={rationalePrefs} setRationalePrefs={setRationalePrefs}
        dataLoaded={dataLoaded}
        onCloudDirty={cloudSync.markDirty}
        fetchFullDetail={historySync.fetchFullDetail}
        cacheDetail={historySync.cacheDetail}
        invalidateDetail={historySync.invalidateDetail}
      />
    </QuizProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <FloatingProgressProvider>
        <AppContent />
      </FloatingProgressProvider>
    </BrowserRouter>
  );
}
