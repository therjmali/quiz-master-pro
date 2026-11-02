import { useMemo, useState } from 'react';
import { useAuth } from 'zitejs/auth';
import { Plus, ChevronRight, Flame, Play, Hash, Target, Clock, ChevronDown, ChevronUp, Filter, TrendingUp, Dumbbell } from 'lucide-react';
import SubjectFilterPopup from '../SubjectFilterPopup';
import { SessionMode, filterBySession } from '../SessionSelector';
import { QuizResult, QuizQuestion } from '../../types/quiz';
import { formatTime, calculateStreak } from '../../utils/scoring';
import { formatDateShort } from '../../utils/dateFormat';
import { useProfileStore } from '../../hooks/useProfileStore';
import WeakTopicsPanel from './WeakTopicsPanel';
import SpacedRepetitionBanner from './SpacedRepetitionBanner';
import ExamReadinessCard from './ExamReadinessCard';
import MistakePatternCard from './MistakePatternCard';
import StudyPlanCard from './StudyPlanCard';
import InstallPrompt from '../InstallPrompt';
import SmartNudgeBanner from './SmartNudgeBanner';
import DailyChallengeCard from './DailyChallengeCard';
import ExamCountdownSection from './ExamCountdownSection';
import CompactPrediction from './CompactPrediction';
import PerformanceRatingCard from './PerformanceRatingCard';
import WidgetErrorBoundary from '../WidgetErrorBoundary';
import GettingStartedChecklist from './GettingStartedChecklist';
import LiveClockWidget from './LiveClockWidget';
import QuestionMasteryHeatmap from '../stats/QuestionMasteryHeatmap';
import AnalyticsTrends from '../stats/AnalyticsTrends';


interface Props {
  history: QuizResult[];
  hasSavedSession: boolean;
  onResumeSession: () => void;
  onDiscardSession: () => void;
  onStartCreate: () => void;
  onViewResult: (r: QuizResult) => void;
  onLibrary: () => void;
  onPractice?: (questions: QuizQuestion[]) => void;
  onFlashcards?: (filter?: 'review') => void;
  onOpenChatbot?: () => void;
  onPracticeDashboard?: () => void;
  loadingOlder?: boolean;
  // Lifted state from navbar consolidation
  subjectFilter: string;
  onSubjectFilterChange: (v: string) => void;
  sessionMode: SessionMode;
  subjectPopupOpen: boolean;
  onSubjectPopupOpen: () => void;
  onSubjectPopupClose: () => void;
}

function ActivityRing({ correct, wrong, skipped, total }: { correct: number; wrong: number; skipped: number; total: number }) {
  const R = 34, C = 2 * Math.PI * R, gap = 4;
  const t = Math.max(total, 1);
  const cL = Math.max(0, (correct / t) * C - gap);
  const wL = Math.max(0, (wrong   / t) * C - gap);
  const sL = Math.max(0, (skipped / t) * C - gap);
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
      <circle cx="42" cy="42" r={R} fill="none" style={{ stroke: 'hsl(var(--border))' }} strokeWidth="7" />
      {cL > 2 && <circle cx="42" cy="42" r={R} fill="none" stroke="#22C55E" strokeWidth="7" strokeDasharray={`${cL} ${C}`} strokeDashoffset="0" strokeLinecap="round" />}
      {wL > 2 && <circle cx="42" cy="42" r={R} fill="none" stroke="#EF4444" strokeWidth="7" strokeDasharray={`${wL} ${C}`} strokeDashoffset={`${-(cL + gap)}`} strokeLinecap="round" />}
      {sL > 2 && <circle cx="42" cy="42" r={R} fill="none" stroke="#F59E0B" strokeWidth="7" strokeDasharray={`${sL} ${C}`} strokeDashoffset={`${-(cL + wL + gap * 2)}`} strokeLinecap="round" />}
    </svg>
  );
}

function scoreColor(pct: number) { return pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400'; }

function DashboardDifficultyRating({ history }: { history: QuizResult[] }) {
  const [open, setOpen] = useState(false);

  const diffStats = useMemo(() => {
    const acc = { easy: { c: 0, t: 0 }, medium: { c: 0, t: 0 }, hard: { c: 0, t: 0 } };
    for (const r of history) {
      if (!r.quizData || r.quizData.length === 0) continue;
      for (let i = 0; i < r.quizData.length; i++) {
        const q = r.quizData[i];
        const d = (q.difficulty || 'medium') as 'easy' | 'medium' | 'hard';
        if (acc[d]) { acc[d].t++; if (r.userAnswers[i] === q.correctAnswer) acc[d].c++; }
      }
    }
    return acc;
  }, [history]);

  const total = diffStats.easy.t + diffStats.medium.t + diffStats.hard.t;
  if (total === 0) return null;

  const overallCorrect = diffStats.easy.c + diffStats.medium.c + diffStats.hard.c;
  const overallPct = total > 0 ? Math.round((overallCorrect / total) * 100) : 0;

  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 transition-all active:scale-[0.99]"
      >
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <span className="text-base">🎯</span>
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-xs font-black text-foreground leading-tight">Difficulty Encountered</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[9px] font-bold text-emerald-400">🟢 E: {diffStats.easy.t}</span>
            <span className="text-[9px] font-bold text-amber-400">🟡 M: {diffStats.medium.t}</span>
            <span className="text-[9px] font-bold text-red-400">🔴 H: {diffStats.hard.t}</span>
            <span className="text-[9px] text-foreground/25">· {total} Qs</span>
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-foreground/30 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-foreground/30 flex-shrink-0" />
        }
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 animate-fade-in border-t border-border pt-3">
          {([
            { label: 'Easy', emoji: '🟢', code: 'E', data: diffStats.easy, bar: 'bg-emerald-500', text: 'text-emerald-400', badgeBg: 'bg-emerald-500/15 border-emerald-500/25' },
            { label: 'Medium', emoji: '🟡', code: 'M', data: diffStats.medium, bar: 'bg-amber-500', text: 'text-amber-400', badgeBg: 'bg-amber-500/15 border-amber-500/25' },
            { label: 'Hard', emoji: '🔴', code: 'H', data: diffStats.hard, bar: 'bg-red-500', text: 'text-red-400', badgeBg: 'bg-red-500/15 border-red-500/25' },
          ] as const).map(({ label, emoji, code, data, bar, text, badgeBg }) => {
            const pct = data.t > 0 ? Math.round((data.c / data.t) * 100) : 0;
            return (
              <div key={label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border ${badgeBg} ${text}`}>
                      {emoji} {code}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${text}`}>{label}</span>
                    <span className="text-[9px] text-foreground/25">{data.t} Qs</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-black ${text}`}>{pct}%</span>
                    <span className="text-[9px] text-foreground/25">({data.c}/{data.t})</span>
                  </div>
                </div>
                <div className="h-2 bg-foreground/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}

          {/* Summary row */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-[10px] font-bold text-foreground/40">Overall Accuracy</span>
            <span className={`text-xs font-black ${overallPct >= 80 ? 'text-emerald-400' : overallPct >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
              {overallPct}% ({overallCorrect}/{total})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const THUMB_COLORS = [
  'from-primary/40 to-accent/40', 'from-emerald-500/40 to-teal-600/40',
  'from-amber-500/40 to-orange-600/40', 'from-pink-500/40 to-rose-600/40', 'from-cyan-500/40 to-blue-600/40',
];

function MiniScoreRing({ pct: rawPct }: { pct: number }) {
  const pct = Math.max(0, Math.min(100, rawPct));
  const R = 18, C = 2 * Math.PI * R;
  const fill = (pct / 100) * C;
  const strokeColor = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#EF4444';
  const glowColor = pct >= 80 ? 'rgba(34,197,94,0.3)' : pct >= 60 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)';
  return (
    <div className="relative flex-shrink-0 w-[52px] h-[52px]">
      <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
        <circle cx="26" cy="26" r={R} fill="none" stroke="currentColor" className="text-border" strokeWidth="3.5" />
        <circle cx="26" cy="26" r={R} fill="none" stroke={strokeColor} strokeWidth="3.5"
          strokeDasharray={`${fill} ${C}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${glowColor})`, transition: 'stroke-dasharray 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-[13px] font-black leading-none ${scoreColor(pct)}`}>{pct}%</span>
      </div>
    </div>
  );
}

function RecentQuizCard({ result, idx, onClick }: { result: QuizResult; idx: number; onClick: () => void }) {
  const pct = result.percentage;
  const initial = result.quizTitle?.[0]?.toUpperCase();
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3.5 bg-card border border-border hover:border-primary/20 hover:bg-card/80 rounded-2xl p-3.5 transition-all active:scale-[0.99] text-left group shadow-sm">
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${THUMB_COLORS[idx % THUMB_COLORS.length]} flex items-center justify-center flex-shrink-0 text-base font-black text-white border border-white/10`}>
        {initial || '📝'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate leading-snug">
          {result.quizTitle || `Quiz · ${result.totalQuestions} Qs`}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {result.subject && (
            <span className="text-[9px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/20 leading-none">{result.subject}</span>
          )}
          <span className="text-[10px] text-foreground/35 font-medium">{formatDateShort(result.timestamp)} · {result.totalQuestions} Qs</span>
        </div>
        <div className="mt-2 h-1 bg-muted/60 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <MiniScoreRing pct={pct} />
    </button>
  );
}

export default function DashboardScreen({ history, hasSavedSession, onResumeSession, onDiscardSession, onStartCreate, onViewResult, onLibrary, onPractice, onFlashcards, onOpenChatbot, onPracticeDashboard, loadingOlder, subjectFilter, onSubjectFilterChange, sessionMode, subjectPopupOpen, onSubjectPopupOpen, onSubjectPopupClose }: Props) {
  const { user } = useAuth();
  const { profile } = useProfileStore();
  const vis = profile.featureVisibility;

  const [checklistDismissed, setChecklistDismissed] = useState(() => {
    try { return localStorage.getItem('qmp_checklist_dismissed') === 'true'; } catch { return false; }
  });

  const sessionHistory = useMemo(() => filterBySession(history, sessionMode), [history, sessionMode]);
  const isPracticeMode = sessionMode !== 'main';

  // Extract unique subjects
  const subjectOptions = useMemo(() => {
    const map = new Map<string, { count: number; totalPct: number }>();
    sessionHistory.forEach(r => {
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
  }, [sessionHistory]);

  // Apply subject filter (auto-reset if subject no longer exists)
  const effectiveSubjectFilter = subjectFilter !== 'all' && !subjectOptions.some(s => s.name === subjectFilter) ? 'all' : subjectFilter;
  const filteredHistory = useMemo(() => {
    if (effectiveSubjectFilter === 'all') return sessionHistory;
    return sessionHistory.filter(r => r.subject === effectiveSubjectFilter);
  }, [sessionHistory, effectiveSubjectFilter]);

  // Streak counts ALL quiz attempts (main + practice) — any daily attempt keeps the streak alive
  const streak = useMemo(() => calculateStreak(history.map(r => r.timestamp)), [history]);
  const avgScore = useMemo(() => filteredHistory.length > 0 ? Math.round(filteredHistory.reduce((a, r) => a + r.percentage, 0) / filteredHistory.length) : 0, [filteredHistory]);
  const totalTime = useMemo(() => filteredHistory.reduce((a, r) => a + r.timeTaken, 0), [filteredHistory]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return filteredHistory.filter(r => new Date(r.timestamp).toDateString() === today).length;
  }, [filteredHistory]);

  const todayQuestionCount = useMemo(() => {
    const today = new Date().toDateString();
    return filteredHistory
      .filter(r => new Date(r.timestamp).toDateString() === today)
      .reduce((sum, r) => sum + r.totalQuestions, 0);
  }, [filteredHistory]);

  const ringData = useMemo(() => {
    if (!filteredHistory.length) return { correct: 0, wrong: 0, skipped: 0, total: 1 };
    const l = filteredHistory[0];
    return { correct: l.correct, wrong: l.wrong, skipped: l.skipped, total: l.totalQuestions };
  }, [filteredHistory]);

  const recent = filteredHistory.slice(0, 4);
  const dailyProgress = Math.min(todayCount / Math.max(profile.dailyGoal, 1), 1);
  const dailyDone = todayCount >= profile.dailyGoal;
  const questionProgress = Math.min(todayQuestionCount / Math.max(profile.dailyQuestionGoal, 1), 1);
  const questionDone = todayQuestionCount >= profile.dailyQuestionGoal;

  return (
    <div className="animate-fade-in space-y-3.5 pb-4">

      {/* Live Clock & Motivation Widget */}
      <LiveClockWidget streak={streak} todayCount={todayCount} avgScore={avgScore} />

      {/* Main/Practice Sub-tabs — enhanced */}
      {history.some(r => r.attemptType === 'practice') && onPracticeDashboard && (() => {
        const practiceResults = history.filter(r => r.attemptType === 'practice');
        const pCount = practiceResults.length;
        const pAvg = pCount > 0 ? Math.round(practiceResults.reduce((a, r) => a + r.percentage, 0) / pCount) : 0;
        const mainResults = history.filter(r => (r.attemptType || 'main') === 'main');
        const mAvg = mainResults.length > 0 ? Math.round(mainResults.reduce((a, r) => a + r.percentage, 0) / mainResults.length) : 0;
        const diff = pAvg - mAvg;
        // Check if there's a recent practice (within 24h) for notification dot
        const hasRecent = practiceResults.some(r => Date.now() - r.timestamp < 86400000);
        return (
          <div className="flex gap-1 bg-muted/30 border border-border rounded-2xl p-1">
            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-card text-foreground shadow-sm border border-border">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <span>Main</span>
              <span className="text-[9px] text-foreground/35 font-bold">{mAvg}%</span>
            </button>
            <button
              onClick={onPracticeDashboard}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold text-foreground/40 hover:text-amber-400 hover:bg-amber-500/5 transition-all relative"
            >
              <Dumbbell className="w-3.5 h-3.5" />
              <span>Practice</span>
              <span className="text-[9px] text-amber-400/60 font-bold">{pAvg}%</span>
              {diff !== 0 && (
                <span className={`text-[8px] font-black ${diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {diff > 0 ? '↑' : '↓'}{Math.abs(diff)}
                </span>
              )}
              {hasRecent && (
                <span className="absolute top-1.5 right-3 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
          </div>
        );
      })()}

      {/* Subject Filter Popup */}
      {subjectPopupOpen && (
        <SubjectFilterPopup
          subjects={subjectOptions}
          value={subjectFilter}
          onChange={onSubjectFilterChange}
          onClose={onSubjectPopupClose}
        />
      )}

      {/* Active subject filter indicator */}
      {subjectFilter !== 'all' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/8 border border-primary/20 rounded-xl animate-fade-in">
          <Filter className="w-3 h-3 text-primary/60" />
          <p className="text-[11px] font-bold text-primary/80 flex-1">
            Subject: {subjectFilter} · {filteredHistory.length} result{filteredHistory.length !== 1 ? 's' : ''}
          </p>
          <button onClick={() => onSubjectFilterChange('all')} className="text-[10px] font-bold text-destructive/70 hover:text-destructive transition-colors">
            Clear
          </button>
        </div>
      )}

      {/* Loading older quizzes indicator */}
      {loadingOlder && (
        <div className="flex items-center justify-center gap-2 px-3 py-2 bg-primary/5 border border-primary/15 rounded-xl animate-fade-in">
          <div className="qmp-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          <p className="text-[10px] font-bold text-primary/60">Loading older quizzes…</p>
        </div>
      )}

      {/* Getting Started Checklist — shown for new users */}
      {filteredHistory.length < 5 && !checklistDismissed && (
        <GettingStartedChecklist
          quizCount={filteredHistory.length}
          hasCompletedQuiz={filteredHistory.length > 0}
          hasViewedResults={filteredHistory.length > 0}
          hasUsedFlashcards={(() => { try { return localStorage.getItem('qmp_used_flashcards') === 'true'; } catch { return false; } })()}
          onStartCreate={onStartCreate}
          onLibrary={onLibrary}
          onStats={() => {}}
          onFlashcards={onFlashcards}
          onDismiss={() => { setChecklistDismissed(true); try { localStorage.setItem('qmp_checklist_dismissed', 'true'); } catch {} }}
        />
      )}

      {/* Smart Study Nudge */}
      {vis.dashboardWidgets && vis.smartNudge && (
        <SmartNudgeBanner history={history} onAction={onStartCreate} />
      )}

      {/* Session Resume Banner */}
      {hasSavedSession && (
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/25 rounded-2xl px-4 py-3 animate-slide-up">
          <span className="text-xl flex-shrink-0">💾</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-foreground">Quiz in progress</p>
            <p className="text-[11px] text-foreground/40 mt-0.5">Resume where you left off</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={onDiscardSession} className="text-xs text-foreground/30 hover:text-foreground/60 px-3 py-2 rounded-xl border border-border transition-all font-semibold">Discard</button>
            <button onClick={onResumeSession} className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-bold px-4 py-2 rounded-xl shadow-md shadow-primary/30 transition-all active:scale-[0.97]">
              <Play className="w-3.5 h-3.5 fill-current" /> Resume
            </button>
          </div>
        </div>
      )}

      {/* Daily Practice Hero */}
      <div className="glass-card p-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/6 via-transparent to-accent/4 pointer-events-none rounded-[1.25rem]" />
        <div className="relative flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <ActivityRing {...ringData} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-xl">{dailyDone ? '✅' : '🎯'}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-foreground">Daily Practice</h2>
            <div className="mt-1.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-foreground/40 font-bold">
                  {dailyDone ? '🎉 Goal complete!' : `${todayCount} / ${profile.dailyGoal} today`}
                </span>
                <span className={`text-[10px] font-black ${dailyDone ? 'text-emerald-400' : 'text-foreground/30'}`}>
                  {Math.round(dailyProgress * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${dailyDone ? 'bg-emerald-500' : 'bg-primary'}`}
                  style={{ width: `${dailyProgress * 100}%` }}
                />
              </div>
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-foreground/40 font-bold">
                  {questionDone ? '🎉 Question goal done!' : `❓ ${todayQuestionCount} / ${profile.dailyQuestionGoal} questions`}
                </span>
                <span className={`text-[10px] font-black ${questionDone ? 'text-emerald-400' : 'text-foreground/30'}`}>
                  {Math.round(questionProgress * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${questionDone ? 'bg-emerald-500' : 'bg-primary/70'}`}
                  style={{ width: `${questionProgress * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <Flame className={`w-4 h-4 flex-shrink-0 ${streak > 0 ? 'text-orange-400' : 'text-foreground/20'}`} />
              <span className={`text-sm font-black ${streak > 0 ? 'text-orange-400' : 'text-foreground/20'}`}>
                {streak > 0 ? `${streak}-day streak!` : 'Start your streak today'}
              </span>
            </div>
          </div>
          <button onClick={onStartCreate}
            className="flex-shrink-0 flex items-center gap-1.5 bg-primary hover:brightness-110 text-primary-foreground text-sm font-bold px-4 py-3 rounded-2xl shadow-lg shadow-primary/30 transition-all active:scale-[0.97]">
            <Plus className="w-4 h-4" />
            <span className="hidden xs:inline">New Quiz</span>
          </button>
        </div>
      </div>

      {/* Practice mode indicator */}
      {isPracticeMode && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl animate-fade-in">
          <span className="text-base">🏋️</span>
          <p className="text-[11px] font-bold text-amber-300">Practice Mode — stats shown are for practice sessions only</p>
        </div>
      )}

      {/* Analytics & Trends Module */}
      <AnalyticsTrends history={filteredHistory} onViewResult={onViewResult} />

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: 'Total Quizzes', value: String(sessionHistory.length), color: 'text-primary',      iconBg: 'bg-primary/12',       Icon: Hash   },
          { label: 'Average Score', value: `${avgScore}%`,          color: 'text-emerald-400', iconBg: 'bg-emerald-500/12',   Icon: Target },
          { label: 'Current Streak', value: `${streak}d`,           color: 'text-orange-400',  iconBg: 'bg-orange-500/12',    Icon: Flame  },
          { label: 'Study Time',    value: formatTime(totalTime),   color: 'text-accent',      iconBg: 'bg-accent/12',        Icon: Clock  },
        ].map(({ label, value, color, iconBg, Icon }) => (
          <div key={label} className="stat-card flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-[18px] h-[18px] ${color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <span className={`text-lg font-extrabold ${color} leading-none block tabular-nums`}>{value}</span>
              <span className="text-[10px] text-foreground/35 font-semibold mt-0.5 block leading-tight">{label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Difficulty Breakdown (collapsible) */}
      {filteredHistory.length > 0 && (
        <DashboardDifficultyRating history={filteredHistory} />
      )}

      {/* Question Mastery Heatmap */}
      {filteredHistory.length >= 2 && (
        <WidgetErrorBoundary name="Question Mastery">
          <QuestionMasteryHeatmap history={filteredHistory} onPractice={onPractice} />
        </WidgetErrorBoundary>
      )}

      {/* Performance Rating Card (collapsible) */}
      {vis.dashboardWidgets && vis.performanceRating && filteredHistory.length > 0 && (
        <WidgetErrorBoundary name="Performance Rating">
          <PerformanceRatingCard history={filteredHistory} />
        </WidgetErrorBoundary>
      )}

      {/* Daily Challenge */}
      {vis.dashboardWidgets && vis.dailyChallenge && (
        <WidgetErrorBoundary name="Daily Challenge">
          <DailyChallengeCard history={filteredHistory} />
        </WidgetErrorBoundary>
      )}

      {/* PWA Install Prompt */}
      <InstallPrompt />

      {/* Spaced Repetition Banner */}
      {vis.dashboardWidgets && vis.spacedRepetition && onPractice && (
        <WidgetErrorBoundary name="Spaced Repetition">
          <SpacedRepetitionBanner onStartReview={onPractice!} onFlashcards={onFlashcards} />
        </WidgetErrorBoundary>
      )}

      {/* Quick Actions — Flashcards + Stats */}
      {filteredHistory.length >= 2 && onFlashcards && (
        <button onClick={() => onFlashcards?.()}
          className="flex items-center gap-3 bg-card border border-border hover:border-primary/20 rounded-2xl p-3.5 transition-all active:scale-[0.98] text-left shadow-sm w-full">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🃏</span>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-foreground">Flashcards & Stats</p>
            <p className="text-[10px] text-foreground/30">Review wrong answers · Track mastery analytics</p>
          </div>
          <ChevronRight className="w-4 h-4 text-foreground/20" />
        </button>
      )}

      {/* Exam Countdown */}
      {vis.dashboardWidgets && vis.examCountdown && (
        <ExamCountdownSection history={filteredHistory} />
      )}

      {/* Compact Prediction */}
      {vis.dashboardWidgets && vis.prediction && filteredHistory.length >= 5 && (
        <CompactPrediction history={filteredHistory} />
      )}

      {/* Learning Intelligence */}
      {filteredHistory.length >= 2 && (
        <div className="grid grid-cols-1 gap-3">
          {vis.dashboardWidgets && vis.examReadiness && (
            <WidgetErrorBoundary name="Exam Readiness">
              <ExamReadinessCard history={filteredHistory} />
            </WidgetErrorBoundary>
          )}
          {vis.dashboardWidgets && vis.weakTopics && onPractice && (
            <WidgetErrorBoundary name="Weak Topics">
              <WeakTopicsPanel history={filteredHistory} onPractice={onPractice} />
            </WidgetErrorBoundary>
          )}
          {vis.dashboardWidgets && vis.mistakePatterns && (
            <WidgetErrorBoundary name="Mistake Patterns">
              <MistakePatternCard history={filteredHistory} />
            </WidgetErrorBoundary>
          )}
          {vis.dashboardWidgets && vis.studyPlan && (
            <WidgetErrorBoundary name="Study Plan">
              <StudyPlanCard history={filteredHistory} onNavigateToSetup={onStartCreate} />
            </WidgetErrorBoundary>
          )}
        </div>
      )}

      {/* Recent Quizzes */}
      {recent.length > 0 ? (
        <div>
          <div className="flex items-center justify-between px-1 mb-3">
            <h3 className="text-[11px] font-bold text-foreground/35 uppercase tracking-[0.1em]">Recent Quizzes</h3>
            <button onClick={onLibrary} className="flex items-center gap-0.5 text-[11px] text-primary/80 font-semibold active:opacity-70 transition-opacity hover:text-primary">
              See All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {recent.map((r, i) => (
              <RecentQuizCard key={r.id || r.timestamp} result={r} idx={i} onClick={() => onViewResult(r)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="glass-card p-8 sm:p-10 flex flex-col items-center text-center animate-slide-up">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 animate-scale-in">
            <span className="text-3xl">📚</span>
          </div>
          <h3 className="text-lg font-black text-foreground mb-2">Ready to test yourself?</h3>
          <p className="text-sm text-foreground/40 mb-3 leading-relaxed max-w-xs">
            Create a quiz from any source — paste text, upload a PDF, or let AI generate questions.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {[
              { emoji: '📄', label: 'PDF' },
              { emoji: '🖼️', label: 'Images' },
              { emoji: '📝', label: 'Text' },
              { emoji: '🤖', label: 'AI Generated' },
            ].map(t => (
              <span key={t.label} className="text-[11px] font-semibold text-foreground/50 bg-card border border-border px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-2xs">
                <span className="text-sm">{t.emoji}</span>{t.label}
              </span>
            ))}
          </div>
          <button onClick={onStartCreate}
            className="flex items-center gap-2 bg-primary hover:brightness-110 text-primary-foreground font-bold text-sm px-6 py-3 rounded-xl shadow-lg shadow-primary/20 active:scale-[0.97] transition-all">
            <Plus className="w-4 h-4" /> Create Your First Quiz
          </button>
        </div>
      )}
    </div>
  );
}
