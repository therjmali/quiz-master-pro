import { useState, useMemo, useCallback } from 'react';
import { Trophy, Target, Clock, Zap, Flame, BarChart2, Loader2, Filter, ChevronDown, Calculator, Cloud, CloudOff, Crosshair, Settings } from 'lucide-react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useAccount } from '../../platform/cloud/useAccount';
import { useCloudAuth } from '../../platform/cloud/authStore';
import { useSyncState } from '../../platform/cloud/syncEngine';
import PremiumSpeedometer from '../results/PremiumSpeedometer';
import { QuestionBreakdownStrip, DifficultyDistributionBar } from '../results/ScoreAnalyticsStrip';
import LifetimeNegMarkingPanel from './LifetimeNegMarkingPanel';
import { applyNegativeMarkingToAll, removeNegativeMarkingFromAll, applyNegativeMarkingToFiltered, removeNegativeMarkingFromFiltered, getQuizKey } from '../../utils/negativeMarkingStore';
import { toast } from 'sonner';
import { QuizQuestion, QuizResult, RationalePrefs, AIMode, ReportOrder } from '../../types/quiz';
import { formatTime, calculateStreak } from '../../utils/scoring';
import { computeRank } from '../../utils/rank';
import { useProfileStore } from '../../hooks/useProfileStore';
import { getActiveMistakes, mistakesToQuizQuestions } from '../../utils/globalMistakes';
import OverviewTab from './OverviewTab';
import HistoryList from './HistoryList';
import ReportDownloadPanel from '../reports/ReportDownloadPanel';
import { ReportPreviewData } from '../reports/ReportPreviewPage';
import SessionSelector, { SessionMode, filterBySession, getSessionLabel } from '../SessionSelector';

type View = 'overview' | 'correct' | 'wrong' | 'skipped';
type ReviewFilter = 'correct' | 'wrong' | 'skipped';
type DiffFilter = 'all' | 'easy' | 'medium' | 'hard';
const VIEWS: View[] = ['overview', 'correct', 'wrong', 'skipped'];

interface Props {
  history: QuizResult[];
  setHistory?: (h: QuizResult[] | ((prev: QuizResult[]) => QuizResult[])) => void;
  rationaleCache: Record<string, string>;
  getAiRationale: (q: string, ca: string, ua: string | null, s: 'correct' | 'wrong' | 'skipped') => Promise<string>;
  onDeleteHistory: (id: string) => void;
  onPracticeMistakes: (questions: QuizQuestion[]) => void;
  onViewResult: (r: QuizResult) => void;
  isSyncing?: boolean;
  rationalePrefs: RationalePrefs;
  onRationalePrefsChange: (p: RationalePrefs) => void;
  reportHelper: AIMode;
  onReportHelperChange: (m: AIMode) => void;
  onOpenReportPreview?: (data: ReportPreviewData) => void;
  /** Opens Settings (optionally at one section, e.g. "updates", "backup", "cloud"). */
  onOpenSettings: (section?: string) => void;
}

/** Compute question-level stats respecting difficulty filter */
function computeFilteredStats(
  quizzes: QuizResult[],
  diffFilter: DiffFilter
) {
  let totalQ = 0, totCorrect = 0, totWrong = 0, totSkipped = 0;
  let totalGain = 0, totalPenalty = 0, totalTime = 0, bestPct = 0;
  let totalMaxScore = 0;
  const diffCounts = { easy: 0, medium: 0, hard: 0 };

  if (diffFilter === 'all') {
    // Fast path — use aggregate quiz-level data
    quizzes.forEach(r => {
      totalQ += r.totalQuestions;
      totalTime += r.timeTaken;
      const rPct = r.maxScore > 0 ? Math.max(0, Math.min(100, Math.round(((r.netScore ?? r.score ?? 0) / r.maxScore) * 100))) : r.percentage;
      if (rPct > bestPct) bestPct = rPct;
      totCorrect += r.correct;
      totWrong += r.wrong;
      totSkipped += r.skipped;
      totalGain += r.gain ?? 0;
      totalPenalty += r.penalty ?? 0;
      totalMaxScore += r.maxScore || r.totalQuestions;
      (r.quizData || []).forEach(q => {
        if (diffCounts[q.difficulty as keyof typeof diffCounts] !== undefined) {
          diffCounts[q.difficulty as keyof typeof diffCounts]++;
        }
      });
    });
  } else {
    // Slow path — filter per-question by difficulty
    quizzes.forEach(r => {
      totalTime += r.timeTaken;
      const marksPerQ = r.maxScore && r.totalQuestions ? r.maxScore / r.totalQuestions : 1;
      const negMarks = r.wrong > 0 && r.penalty > 0 ? r.penalty / r.wrong : 0;

      (r.quizData || []).forEach((q, i) => {
        if (diffCounts[q.difficulty as keyof typeof diffCounts] !== undefined) {
          diffCounts[q.difficulty as keyof typeof diffCounts]++;
        }
        if (q.difficulty !== diffFilter) return;
        totalQ++;
        totalMaxScore += marksPerQ;
        const ua = r.userAnswers[i];
        if (ua === null) {
          totSkipped++;
        } else if (ua === q.correctAnswer) {
          totCorrect++;
          totalGain += marksPerQ;
        } else {
          totWrong++;
          totalPenalty += negMarks;
        }
      });
    });
    totalPenalty = parseFloat(totalPenalty.toFixed(2));
    // Recalculate best percentage per quiz (filtered by difficulty)
    quizzes.forEach(r => {
      let qCorrect = 0, qTotal = 0;
      (r.quizData || []).forEach((q, i) => {
        if (q.difficulty !== diffFilter) return;
        qTotal++;
        if (r.userAnswers[i] === q.correctAnswer) qCorrect++;
      });
      if (qTotal > 0) {
        const pct = Math.round((qCorrect / qTotal) * 100);
        if (pct > bestPct) bestPct = pct;
      }
    });
  }

  const avgAcc = (totCorrect + totWrong) > 0 ? Math.round((totCorrect / (totCorrect + totWrong)) * 100) : 0;
  const netScore = Math.max(0, totalGain - totalPenalty);

  // ── WEIGHTED percentage from raw aggregated totals ──
  // This matches what the Lifetime Negative Marking panel computes,
  // so the speedometer and the neg-marking dashboard always agree.
  const effectiveMax = totalMaxScore > 0 ? totalMaxScore : totalQ;
  const avgPct = effectiveMax > 0 ? Math.max(0, Math.min(100, Math.round((netScore / effectiveMax) * 100))) : 0;
  // Precise version with 2 decimals for the decimal toggle
  const avgPctDecimal = effectiveMax > 0 ? Math.max(0, Math.min(100, Math.round(((netScore / effectiveMax) * 100) * 100) / 100)) : 0;

  return { totalQ, totCorrect, totWrong, totSkipped, totalGain, totalPenalty, totalTime, bestPct, avgAcc, netScore, avgPct, avgPctDecimal, totalMaxScore: effectiveMax, diffCounts };
}

export default function ProgressScreen({
  history, setHistory, rationaleCache, getAiRationale, onDeleteHistory,
  onPracticeMistakes, onViewResult, isSyncing, rationalePrefs,
  onRationalePrefsChange, reportHelper, onReportHelperChange,
  onOpenReportPreview, onOpenSettings,
}: Props) {
  const account = useAccount();
  const cloudAuth = useCloudAuth();
  const syncState = useSyncState();
  const [storedView, setView] = usePersistedState<View>('progress_view', 'overview');
  const view: View = VIEWS.includes(storedView) ? storedView : 'overview';
  const [profileReportOrder, setProfileReportOrder] = usePersistedState<ReportOrder>('profile_report_order', 'attempt');
  const { profile } = useProfileStore();

  // Lifted filter state - persisted so they survive reload
  const [profileSubjectFilter, setProfileSubjectFilter] = usePersistedState('profile_subject', 'all');
  const [profileUnitFilter, setProfileUnitFilter] = usePersistedState<string | null>('profile_unit', null);
  const [profileDiffFilter, setProfileDiffFilter] = usePersistedState<DiffFilter>('profile_diff', 'all');
  const [sessionMode, setSessionMode] = usePersistedState<SessionMode>('profile_session', 'main');
  const [showFilterBar, setShowFilterBar] = useState(false);

  const authName = cloudAuth.user?.name || account.name || 'Student';
  const displayName = profile.displayName || authName;
  const setSubject = useCallback((v: string) => { setProfileSubjectFilter(v); setProfileUnitFilter(null); }, [setProfileSubjectFilter, setProfileUnitFilter]);

  // Compute filtered data - session -> subject -> unit
  const sessionFiltered = useMemo(() => filterBySession(history, sessionMode), [history, sessionMode]);
  const subjectFiltered = useMemo(() => {
    if (profileSubjectFilter === 'all') return sessionFiltered;
    return sessionFiltered.filter(r => r.subject === profileSubjectFilter);
  }, [sessionFiltered, profileSubjectFilter]);
  const masterFiltered = useMemo(() => {
    if (!profileUnitFilter) return subjectFiltered;
    return subjectFiltered.filter(r => r.quizTitle === profileUnitFilter);
  }, [subjectFiltered, profileUnitFilter]);

  const [showNegPanel, setShowNegPanel] = useState(false);
  const filteredQuizIds = useMemo(() => masterFiltered.map(r => getQuizKey(r)), [masterFiltered]);
  const isSubjectFiltered = profileSubjectFilter !== 'all';

  const hasActiveFilter = sessionMode !== 'main' || profileSubjectFilter !== 'all' || profileUnitFilter !== null || profileDiffFilter !== 'all';
  const masterFilterCount = (sessionMode !== 'main' ? 1 : 0) + (profileSubjectFilter !== 'all' ? 1 : 0) + (profileUnitFilter ? 1 : 0) + (profileDiffFilter !== 'all' ? 1 : 0);

  const subjects = useMemo(() => {
    const map = new Map<string, { count: number; totalPct: number }>();
    history.forEach(r => {
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
  }, [history]);

  const units = useMemo(() => {
    const set = new Set(subjectFiltered.map(r => r.quizTitle).filter(Boolean));
    return Array.from(set) as string[];
  }, [subjectFiltered]);

  const stats = useMemo(() => computeFilteredStats(masterFiltered, profileDiffFilter), [masterFiltered, profileDiffFilter]);
  // Streak counts ALL quiz attempts - any daily attempt keeps the streak alive
  const streak = calculateStreak(history.map(r => r.timestamp));
  const rank = computeRank(masterFiltered.length, stats.avgAcc);

  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (sessionMode !== 'main') parts.push(getSessionLabel(sessionMode));
    if (profileSubjectFilter !== 'all') parts.push(profileSubjectFilter);
    if (profileUnitFilter) parts.push(profileUnitFilter.length > 25 ? profileUnitFilter.slice(0, 25) + '…' : profileUnitFilter);
    if (profileDiffFilter !== 'all') parts.push(`${profileDiffFilter === 'easy' ? '🟢' : profileDiffFilter === 'medium' ? '🟡' : '🔴'} ${profileDiffFilter}`);
    if (parts.length === 0) return '';
    return `${parts.join(' · ')} (${masterFiltered.length} results)`;
  }, [sessionMode, profileSubjectFilter, profileUnitFilter, profileDiffFilter, masterFiltered.length]);

  const handlePracticeMistakes = () => {
    const activeMistakes = getActiveMistakes();
    if (!activeMistakes.length) { toast('No mistakes to practice! Amazing! 🎉'); return; }
    const questions = mistakesToQuizQuestions(activeMistakes.slice(0, 50).sort(() => Math.random() - 0.5));
    onPracticeMistakes(questions);
  };

  const clearAllFilters = () => {
    setSessionMode('main');
    setProfileSubjectFilter('all');
    setProfileUnitFilter(null);
    setProfileDiffFilter('all');
  };

  const reviewCounts = useMemo(() => {
    const s = { correct: new Set<string>(), wrong: new Set<string>(), skipped: new Set<string>() };
    history.forEach(r => {
      (r.quizData || []).forEach((q, i) => {
        const u = r.userAnswers[i];
        if (u === null) s.skipped.add(q.question);
        else if (u === q.correctAnswer) s.correct.add(q.question);
        else s.wrong.add(q.question);
      });
    });
    return { correct: s.correct.size, wrong: s.wrong.size, skipped: s.skipped.size };
  }, [history]);

  const segments: { key: View; label: string; icon: string; count?: number; tone: string }[] = [
    { key: 'overview', label: 'Overview', icon: '📊', tone: 'bg-primary/15 border-primary/30 text-foreground' },
    { key: 'correct', label: 'Correct', icon: '✓', count: reviewCounts.correct, tone: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
    { key: 'wrong', label: 'Mistakes', icon: '✗', count: reviewCounts.wrong, tone: 'bg-red-500/15 border-red-500/30 text-red-300' },
    { key: 'skipped', label: 'Skipped', icon: '⏭', count: reviewCounts.skipped, tone: 'bg-amber-500/15 border-amber-500/30 text-amber-300' },
  ];

  const cloudChip = account.signedIn
    ? syncState.phase === 'syncing'
      ? { icon: <Loader2 className="w-3 h-3 animate-spin" />, text: 'Syncing', cls: 'border-primary/30 bg-primary/10 text-primary' }
      : syncState.phase === 'error'
        ? { icon: <CloudOff className="w-3 h-3" />, text: 'Sync problem', cls: 'border-destructive/35 bg-destructive/10 text-destructive' }
        : { icon: <Cloud className="w-3 h-3" />, text: 'Cloud synced', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' }
    : { icon: <CloudOff className="w-3 h-3" />, text: 'Guest · this device', cls: 'border-border bg-foreground/5 text-foreground/50' };

  const heroTiles = [
    { label: 'Quizzes',   value: String(masterFiltered.length), color: 'text-foreground',  Icon: Zap       },
    { label: 'Avg Score', value: profile.showDecimalPct ? `${stats.avgPctDecimal}%` : `${stats.avgPct}%`, color: 'text-primary', Icon: Target },
    { label: 'Best',      value: `${stats.bestPct}%`,           color: 'text-amber-500',   Icon: Trophy    },
    { label: 'Accuracy',  value: `${stats.avgAcc}%`,            color: 'text-emerald-500', Icon: BarChart2 },
    { label: 'Streak',    value: `${streak}d`,                  color: 'text-orange-500',  Icon: Flame     },
    { label: 'Time',      value: formatTime(stats.totalTime),   color: 'text-violet-500',  Icon: Clock     },
  ];

  return (
    <div className="w-full pb-4 animate-fade-in" data-screen="progress">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 px-1 gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-foreground/35 uppercase tracking-[0.12em] mb-0.5">Lifetime</p>
          <h2 className="text-xl font-black text-foreground">Progress</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilterBar(p => !p)}
            aria-expanded={showFilterBar}
            className={`relative flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-all active:scale-95 ${
              hasActiveFilter ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-card border-border text-foreground/50 hover:border-foreground/20'
            }`}
          >
            <Filter className="w-3 h-3" />
            <span>Filters</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showFilterBar ? 'rotate-180' : ''}`} />
            {masterFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[8px] font-black flex items-center justify-center">{masterFilterCount}</span>
            )}
          </button>
          <SessionSelector history={history} value={sessionMode} onChange={setSessionMode} compact />
        </div>
      </div>

      {/* Unified Filter Bar */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out mb-3 ${showFilterBar ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`} aria-hidden={!showFilterBar}>
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[9px] font-black uppercase tracking-widest text-foreground/40">🔍 Filter Everything</h4>
            {hasActiveFilter && (
              <button onClick={clearAllFilters} className="text-[10px] font-bold text-destructive/60 hover:text-destructive transition-colors">Clear All</button>
            )}
          </div>
          {subjects.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-foreground/25 mb-2">🔖 Subject</p>
              <div className="flex flex-wrap gap-1.5">
                <FilterBtn active={profileSubjectFilter === 'all'} onClick={() => setSubject('all')}>🌐 All</FilterBtn>
                {subjects.map(s => (
                  <FilterBtn key={s.name} active={profileSubjectFilter === s.name} onClick={() => setSubject(s.name)}>
                    {s.name} <span className="text-foreground/25 ml-0.5">({s.count})</span>
                  </FilterBtn>
                ))}
              </div>
            </div>
          )}
          {units.length > 1 && (
            <div className="pl-3 border-l-2 border-primary/20">
              <p className="text-[9px] font-black uppercase tracking-widest text-foreground/20 mb-2">📁 Unit / Topic</p>
              <div className="flex flex-wrap gap-1.5">
                <FilterBtn active={!profileUnitFilter} onClick={() => setProfileUnitFilter(null)} small>All Units</FilterBtn>
                {units.map(u => (
                  <FilterBtn key={u} active={profileUnitFilter === u} onClick={() => setProfileUnitFilter(u)} small>
                    {u && u.length > 22 ? u.slice(0, 22) + '…' : u}
                  </FilterBtn>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-foreground/25 mb-2">🎯 Difficulty Level</p>
            <div className="flex flex-wrap gap-1.5">
              <FilterBtn active={profileDiffFilter === 'all'} onClick={() => setProfileDiffFilter('all')}>All</FilterBtn>
              <FilterBtn active={profileDiffFilter === 'easy'} onClick={() => setProfileDiffFilter('easy')}>🟢 Easy</FilterBtn>
              <FilterBtn active={profileDiffFilter === 'medium'} onClick={() => setProfileDiffFilter('medium')}>🟡 Medium</FilterBtn>
              <FilterBtn active={profileDiffFilter === 'hard'} onClick={() => setProfileDiffFilter('hard')}>🔴 Hard</FilterBtn>
            </div>
          </div>
          {hasActiveFilter && (
            <div className="flex items-center gap-2 p-2.5 bg-primary/8 border border-primary/15 rounded-xl">
              <span className="text-[9px]">🔍</span>
              <p className="text-[10px] font-bold text-primary/80 flex-1 truncate">{filterLabel}</p>
              <span className="text-[10px] font-black text-foreground/30">{stats.totalQ}Q</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Premium status hero ── */}
      <section className="qmp-status-hero glass-card relative overflow-hidden p-4 sm:p-6 mb-4" aria-label="Your status">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/12 via-transparent to-accent/10 pointer-events-none" />
        <div className="absolute -top-10 -right-10 w-44 h-44 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3.5 mb-4">
          <button type="button" onClick={() => onOpenSettings()} aria-label="Open settings and profile"
            className="relative shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-3xl overflow-hidden border-2 border-primary/40 shadow-lg shadow-primary/20 bg-gradient-to-br from-primary/60 to-accent/60 active:scale-95 transition-transform">
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
              : <span className="w-full h-full flex items-center justify-center text-3xl sm:text-4xl">{profile.avatarEmoji}</span>}
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg sm:text-2xl font-black text-foreground truncate leading-tight">{displayName}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="bg-gradient-to-r from-primary to-accent text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full text-white">{rank.label}</span>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${streak > 0 ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-foreground/5 text-foreground/30 border-border'}`}>🔥 {streak} day streak</span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cloudChip.cls}`}>{cloudChip.icon}{cloudChip.text}</span>
            </div>
          </div>
          <button type="button" onClick={() => onOpenSettings()} aria-label="Settings" className="shrink-0 grid place-items-center w-10 h-10 rounded-2xl border border-border bg-card/60 text-foreground/55 active:scale-95 transition-transform hover:text-foreground">
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Next-rank meter */}
        <div className="relative mb-4" data-testid="rank-meter">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-foreground/45 mb-1.5">
            <span>{rank.next ? `Next: ${rank.next.label}` : 'Top rank reached'}</span>
            <span>{Math.round(rank.progress * 100)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-foreground/10 overflow-hidden" role="progressbar" aria-valuenow={Math.round(rank.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next rank">
            <div className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-accent transition-[width] duration-500" style={{ width: `${Math.round(rank.progress * 100)}%` }} />
          </div>
          {rank.next && (
            <p className="mt-1.5 text-[11px] text-foreground/45">
              {rank.quizzesLeft > 0 ? `${rank.quizzesLeft} more quiz${rank.quizzesLeft === 1 ? '' : 'zes'}` : 'Quiz target met'}
              {' · '}
              {rank.accuracyLeft > 0 ? `${rank.accuracyLeft}% more accuracy` : `accuracy target (${rank.next.accuracy}%) met`}
            </p>
          )}
        </div>

        <div className="relative grid grid-cols-3 sm:grid-cols-6 gap-2">
          {heroTiles.map(({ label, value, color, Icon }) => (
            <div key={label} className="bg-foreground/[0.04] rounded-xl p-3 text-center border border-border flex flex-col items-center gap-1">
              <Icon className={`w-3.5 h-3.5 ${color} opacity-50`} />
              <div className={`text-base font-black ${color} leading-none`}>{value}</div>
              <div className="text-[8px] text-foreground/35 font-bold tracking-wider leading-tight uppercase">{label}</div>
            </div>
          ))}
        </div>

        {hasActiveFilter && (
          <div className="relative flex items-center gap-2 px-3 py-1.5 bg-primary/8 border border-primary/20 rounded-xl mt-3 animate-fade-in">
            <span className="text-[9px]">🔍</span>
            <p className="text-[10px] font-bold text-primary/70 flex-1 truncate">Showing: {filterLabel}</p>
            <button onClick={clearAllFilters} className="text-[9px] font-bold text-destructive/60 hover:text-destructive transition-colors flex-shrink-0">Clear</button>
          </div>
        )}

        <button onClick={handlePracticeMistakes}
          className="relative mt-3 w-full flex items-center justify-center gap-1.5 bg-destructive/10 border border-destructive/25 text-destructive text-xs font-bold py-2.5 px-4 rounded-xl transition-all active:scale-95">
          <Crosshair className="w-3.5 h-3.5" /> Practice Mistakes ({getActiveMistakes().length})
        </button>
      </section>

      {/* ── Lifetime Score ── */}
      {masterFiltered.length > 0 && (
        <div className="glass-card p-5 mb-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="flex items-center gap-2">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">🧮 Lifetime Score</h3>
              {profileDiffFilter !== 'all' && (
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                  profileDiffFilter === 'easy' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
                  profileDiffFilter === 'medium' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' :
                  'bg-red-500/15 text-red-400 border-red-500/25'
                }`}>
                  {profileDiffFilter === 'easy' ? '🟢' : profileDiffFilter === 'medium' ? '🟡' : '🔴'} {profileDiffFilter} only
                </span>
              )}
            </div>
            {stats.totalQ > 0 && (
              <button
                onClick={() => setShowNegPanel(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-[10px] font-black uppercase tracking-wider hover:bg-destructive/15 transition-all active:scale-95"
                title="Negative Marking Simulator"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>➖🎯</span>
                {stats.totalPenalty > 0 && (
                  <span className="text-[9px] font-black bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-md">-{stats.totalPenalty.toFixed(1)}</span>
                )}
              </button>
            )}
          </div>

          <div className="relative z-10 mb-5">
            <PremiumSpeedometer
              percentage={stats.avgPct}
              precisePct={stats.avgPctDecimal}
              netScore={parseFloat(stats.netScore.toFixed(1))}
              maxScore={stats.totalMaxScore}
              startAnimation={true}
              showDecimal={profile.showDecimalPct}
            />
          </div>

          <div className="relative z-10 flex flex-wrap items-center justify-center gap-4 text-xs font-mono bg-foreground/5 px-6 py-4 rounded-2xl border border-border max-w-sm mx-auto">
            <div className="flex flex-col items-center"><span className="text-emerald-500 font-black text-2xl">{stats.totalGain}</span><span className="text-[9px] text-foreground/40 uppercase tracking-widest mt-0.5">Gain</span></div>
            <span className="text-foreground/30 text-xl">−</span>
            <div className="flex flex-col items-center"><span className="text-destructive font-black text-2xl">{stats.totalPenalty % 1 === 0 ? stats.totalPenalty : stats.totalPenalty.toFixed(2)}</span><span className="text-[9px] text-foreground/40 uppercase tracking-widest mt-0.5">Penalty</span></div>
            <span className="text-foreground/30 text-xl">=</span>
            <div className="flex flex-col items-center"><span className="text-primary font-black text-3xl">{stats.netScore % 1 === 0 ? stats.netScore : stats.netScore.toFixed(2)}</span><span className="text-[9px] text-primary/60 uppercase tracking-widest mt-0.5">Net Score</span></div>
          </div>

          <QuestionBreakdownStrip totalQ={stats.totalQ} correct={stats.totCorrect} wrong={stats.totWrong} skipped={stats.totSkipped} className="relative z-10 mt-4" />
          <DifficultyDistributionBar easy={stats.diffCounts.easy} medium={stats.diffCounts.medium} hard={stats.diffCounts.hard} className="relative z-10 mt-3" />

          <div className="relative z-10 flex items-center justify-center gap-3 mt-3 text-[10px] text-foreground/25 font-bold">
            <span>{masterFiltered.length} quizzes</span><span>·</span><span>{stats.totalQ} questions</span><span>·</span>
            <span>Avg {profile.showDecimalPct ? `${stats.avgPctDecimal}%` : `${stats.avgPct}%`}</span>
          </div>

          {showNegPanel && (
            <LifetimeNegMarkingPanel
              totalCorrect={stats.totCorrect}
              totalWrong={stats.totWrong}
              totalSkipped={stats.totSkipped}
              totalQuestions={stats.totalQ}
              originalGain={stats.totalGain}
              originalPenalty={stats.totalPenalty}
              passMark={50}
              showDecimalPct={profile.showDecimalPct}
              onClose={() => setShowNegPanel(false)}
              filteredQuizIds={isSubjectFiltered ? filteredQuizIds : undefined}
              allQuizIds={filteredQuizIds}
              subjectLabel={isSubjectFiltered ? profileSubjectFilter : undefined}
              onApplyAll={(marksPerQ, negMarks) => {
                const updated = isSubjectFiltered
                  ? applyNegativeMarkingToFiltered(filteredQuizIds, marksPerQ, negMarks)
                  : applyNegativeMarkingToAll(marksPerQ, negMarks);
                setHistory?.(updated);
              }}
              onRemoveAll={() => { setHistory?.(removeNegativeMarkingFromAll()); }}
              onRemoveFiltered={(ids) => { setHistory?.(removeNegativeMarkingFromFiltered(ids)); }}
            />
          )}
        </div>
      )}

      {history.length === 0 && !isSyncing && (
        <div className="glass-card p-6 mb-4 text-center">
          <p className="text-3xl mb-2">📈</p>
          <p className="text-sm font-black text-foreground">Your lifetime score appears here</p>
          <p className="text-[12px] text-foreground/50 mt-1">Finish your first quiz and your score, accuracy and report show up on this screen.</p>
        </div>
      )}

      {isSyncing && history.length === 0 && (
        <div className="flex items-center gap-3 px-5 py-3.5 mb-4 rounded-2xl border border-primary/20 bg-primary/5">
          <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-foreground/70">Loading your quiz history…</p>
            <p className="text-[10px] text-foreground/35 mt-0.5">Fetching from cloud — just a moment.</p>
          </div>
        </div>
      )}

      {/* ── Report ── */}
      {masterFiltered.length > 0 && (
        <ReportDownloadPanel
          results={masterFiltered}
          rationaleCache={rationaleCache}
          scope="profile"
          reportOrder={profileReportOrder}
          onOrderChange={setProfileReportOrder}
          rationalePrefs={rationalePrefs}
          onRationalePrefsChange={onRationalePrefsChange}
          reportHelper={reportHelper}
          onReportHelperChange={onReportHelperChange}
          onOpenPreviewPage={onOpenReportPreview}
          getAiRationale={getAiRationale}
          controlledSubject={profileSubjectFilter === 'all' ? null : profileSubjectFilter}
          controlledUnit={profileUnitFilter}
          controlledDiffFilter={profileDiffFilter}
          onSubjectChange={v => setProfileSubjectFilter(v || 'all')}
          onUnitChange={setProfileUnitFilter}
          onDiffFilterChange={setProfileDiffFilter}
          // History holds lightweight summaries (empty quizData); the report panel fetches full details on demand.
        />
      )}

      {/* ── Overview ── */}
      <div className="mt-4 mb-3 flex gap-0.5 bg-card/80 p-1 rounded-2xl border border-border" role="tablist" aria-label="Overview views">
        {segments.map(seg => (
          <button key={seg.key} type="button" role="tab" aria-selected={view === seg.key} onClick={() => setView(seg.key)}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 px-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all border active:scale-95 ${view === seg.key ? `${seg.tone} shadow-sm` : 'border-transparent text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5'}`}>
            <span className="text-sm leading-none">{seg.icon}</span>
            <span>{seg.label}</span>
            {seg.count !== undefined && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-foreground/10 text-foreground/50">{seg.count}</span>}
          </button>
        ))}
      </div>

      <div key={view} className="animate-tab-content">
        {view === 'overview' && (
          <OverviewTab
            history={history}
            filteredHistory={masterFiltered}
            onViewResult={onViewResult}
            onDeleteHistory={onDeleteHistory}
            subjectFilter={profileSubjectFilter}
            difficultyFilter={profileDiffFilter}
          />
        )}
        {view !== 'overview' && (
          <HistoryList type={view as ReviewFilter} history={history} rationaleCache={rationaleCache}
            getAiRationale={getAiRationale} reportOrder={profileReportOrder}
            rationalePrefs={rationalePrefs} reportHelper={reportHelper} />
        )}
      </div>
    </div>
  );
}

function FilterBtn({
  active, onClick, children, small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        font-bold rounded-lg border transition-all leading-none
        ${small ? 'text-[10px] px-2.5 py-1' : 'text-xs px-3 py-1.5'}
        ${active
          ? 'bg-primary/15 border-primary/30 text-foreground'
          : 'bg-muted/30 border-border text-foreground/40 hover:text-foreground/70 hover:bg-muted/50'
        }
      `}
    >
      {children}
    </button>
  );
}
