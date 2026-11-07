import { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useAccount } from '../../platform/cloud/useAccount';
import { useCloudAuth } from '../../platform/cloud/authStore';
import { useSyncState } from '../../platform/cloud/syncEngine';
import { useUpload } from 'zitejs/upload';
import { ArrowLeft, Trophy, Target, Clock, Zap, Flame, BarChart2, Loader2, Edit2, Check, Camera, Filter, ChevronDown, Calculator, Cloud } from 'lucide-react';
import SubjectFilterPopup from '../SubjectFilterPopup';
import PremiumSpeedometer from '../results/PremiumSpeedometer';
import { QuestionBreakdownStrip, DifficultyDistributionBar } from '../results/ScoreAnalyticsStrip';
import LifetimeNegMarkingPanel from './LifetimeNegMarkingPanel';
import { applyNegativeMarkingToAll, removeNegativeMarkingFromAll, applyNegativeMarkingToFiltered, removeNegativeMarkingFromFiltered, getQuizKey } from '../../utils/negativeMarkingStore';

import { toast } from 'sonner';
import { QuizQuestion, QuizResult, RationalePrefs, AIMode, ReportOrder, AppTheme } from '../../types/quiz';
import { formatTime, calculateStreak } from '../../utils/scoring';
import { useProfileStore } from '../../hooks/useProfileStore';
import { getActiveMistakes, mistakesToQuizQuestions } from '../../utils/globalMistakes';
import OverviewTab from './OverviewTab';
import HistoryList from './HistoryList';
import AwardsGrid from './AwardsGrid';
import NotesTab from './NotesTab';
import ReportDownloadPanel from '../reports/ReportDownloadPanel';
import { ReportPreviewData } from '../reports/ReportPreviewPage';
import ApiKeysTab from './ApiKeysTab';
import SettingsTab from './SettingsTab';
import DownloadsTab from './DownloadsTab';
import TrashTab from './TrashTab';
import TemplatesTab from './TemplatesTab';
import CloudDataManager from '../CloudDataManager';
import StatusStrip from './StatusStrip';
import { triggerOpenSettings } from '../cloud/CloudGate';

import SessionSelector, { SessionMode, filterBySession, getSessionLabel } from '../SessionSelector';

type Tab = 'overview' | 'notes' | 'correct' | 'wrong' | 'skipped' | 'awards' | 'templates' | 'trash' | 'apikeys' | 'settings' | 'downloads';
type ReviewFilter = 'correct' | 'wrong' | 'skipped';
type DiffFilter = 'all' | 'easy' | 'medium' | 'hard';

interface Props {
  history: QuizResult[];
  setHistory?: (h: QuizResult[] | ((prev: QuizResult[]) => QuizResult[])) => void;
  rationaleCache: Record<string, string>;
  getAiRationale: (q: string, ca: string, ua: string | null, s: 'correct' | 'wrong' | 'skipped') => Promise<string>;
  onBack: () => void;
  onDeleteHistory: (id: string) => void;
  onPracticeMistakes: (questions: QuizQuestion[]) => void;
  onViewResult: (r: QuizResult) => void;
  isSyncing?: boolean;
  rationalePrefs: RationalePrefs;
  onRationalePrefsChange: (p: RationalePrefs) => void;
  reportHelper: AIMode;
  onReportHelperChange: (m: AIMode) => void;
  theme: AppTheme;
  onThemeChange: (t: AppTheme) => void;
  onHistoryChanged?: () => void;
  onOpenReportPreview?: (data: ReportPreviewData) => void;
  /** Called whenever the active tab changes so App can track sub-state */
  onTabChange?: (tab: string) => void;
  /** If set, jump to this tab on mount (used when restoring from nav stack) */
  initialTab?: string;
}

const EMOJI_OPTIONS = ['🧑‍⚕️','🧑‍💻','🧑‍🎓','👩‍🎓','🧑‍🔬','🧑‍🎨','🦸','🧙','🦊','🐼','🦁','🌟','🔥','⚡','🎯','💎','🚀','🌈'];

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

export default function ProfileScreen({
  history, setHistory, rationaleCache, getAiRationale, onBack, onDeleteHistory,
  onPracticeMistakes, onViewResult, isSyncing, rationalePrefs,
  onRationalePrefsChange, reportHelper, onReportHelperChange, theme, onThemeChange,
  onHistoryChanged, onOpenReportPreview, onTabChange, initialTab,
}: Props) {
  const account = useAccount();
  const cloudAuth = useCloudAuth();
  const syncState = useSyncState();
  const [tab, setTabInner] = usePersistedState<Tab>('profile_tab', (initialTab as Tab) || 'overview');
  const setTab = useCallback((t: Tab | ((prev: Tab) => Tab)) => {
    setTabInner(prev => {
      const next = typeof t === 'function' ? t(prev) : t;
      onTabChange?.(next);
      return next;
    });
  }, [setTabInner, onTabChange]);
  const [profileReportOrder, setProfileReportOrder] = usePersistedState<ReportOrder>('profile_report_order', 'attempt');
  const [editingName, setEditingName] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { upload } = useUpload();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { profile, update: updateProfile } = useProfileStore();

  // Lifted filter state — persisted so they survive reload
  const [profileSubjectFilter, setProfileSubjectFilter] = usePersistedState('profile_subject', 'all');
  const [profileUnitFilter, setProfileUnitFilter] = usePersistedState<string | null>('profile_unit', null);
  const [profileDiffFilter, setProfileDiffFilter] = usePersistedState<DiffFilter>('profile_diff', 'all');
  const [subjectPopupOpen, setSubjectPopupOpen] = useState(false);
  const [sessionMode, setSessionMode] = usePersistedState<SessionMode>('profile_session', 'main');
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [showCloudManager, setShowCloudManager] = useState(false);

  const authName = cloudAuth.user?.name || account.name || 'Student';
  const authEmail = cloudAuth.user?.email || account.email || '';
  const displayName = profile.displayName || authName;
  const [nameVal, setNameVal] = useState(displayName);

  // "Sign in" prompts elsewhere in the app ask for the Settings tab.
  useEffect(() => {
    const wantSettings = () => { try { if (sessionStorage.getItem('qm-open-section')) setTab('settings'); } catch { /* ignore */ } };
    wantSettings();
    window.addEventListener('qm:open-settings', wantSettings);
    return () => window.removeEventListener('qm:open-settings', wantSettings);
  }, [setTab]);

  // Apply initialTab from navigation stack restore
  useEffect(() => {
    if (initialTab && initialTab !== tab) {
      setTabInner(initialTab as Tab);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (editingName) nameInputRef.current?.focus(); }, [editingName]);

  // Reset unit when subject changes
  useEffect(() => { setProfileUnitFilter(null); }, [profileSubjectFilter]);

  const saveName = () => {
    const t = nameVal.trim().slice(0, 24);
    if (t) { updateProfile({ displayName: t }); toast.success('Name updated ✓'); }
    else { setNameVal(displayName); }
    setEditingName(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Photo must be under 5MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    setUploadingPhoto(true);
    try {
      const { url } = await upload(file);
      updateProfile({ avatarUrl: url });
      toast.success('Profile photo updated! 📸');
    } catch { toast.error('Upload failed. Try again.'); }
    finally { setUploadingPhoto(false); if (photoInputRef.current) photoInputRef.current.value = ''; }
  };

  // Compute filtered data — session → subject → unit
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

  // Subject options for filter popup
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

  // Available units based on current subject filter
  const units = useMemo(() => {
    const set = new Set(subjectFiltered.map(r => r.quizTitle).filter(Boolean));
    return Array.from(set) as string[];
  }, [subjectFiltered]);

  // Compute stats with difficulty filter applied
  const stats = useMemo(() => computeFilteredStats(masterFiltered, profileDiffFilter), [masterFiltered, profileDiffFilter]);
  // Streak counts ALL quiz attempts — any daily attempt keeps the streak alive
  const streak = calculateStreak(history.map(r => r.timestamp));

  const rank = (masterFiltered.length >= 10 && stats.avgAcc >= 80) ? '🎓 Master' : (masterFiltered.length >= 5 && stats.avgAcc >= 60) ? '⚡ Intermediate' : '🌱 Beginner';

  // Build filter label for hero card
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
    // Use global mistakes store for cross-quiz mistake practice
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

  const mainTabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview',   label: 'Overview',   icon: '📊' },
    { key: 'notes',      label: 'AI Notes',   icon: '📖' },
    { key: 'awards',     label: 'Awards',     icon: '🏅'  },
    { key: 'templates',  label: 'Templates',  icon: '🎮'  },
  ];

  const utilityTabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'trash',      label: 'Trash',      icon: '🗑️'  },
    { key: 'apikeys',    label: 'API Keys',   icon: '🔑'  },
    { key: 'settings',   label: 'Settings',   icon: '⚙️'  },
    { key: 'downloads',  label: 'Downloads',  icon: '⬇️'  },
  ];

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

  const reviewFilterConfig = [
    { key: 'correct' as ReviewFilter, label: 'Correct',  icon: '✓', color: 'text-emerald-400', active: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300', badge: 'bg-emerald-500/20 text-emerald-300' },
    { key: 'wrong'   as ReviewFilter, label: 'Mistakes', icon: '✗', color: 'text-red-400',     active: 'bg-red-500/15 border-red-500/30 text-red-300',             badge: 'bg-red-500/20 text-red-300'       },
    { key: 'skipped' as ReviewFilter, label: 'Skipped',  icon: '⏭', color: 'text-amber-400',   active: 'bg-amber-500/15 border-amber-500/30 text-amber-300',       badge: 'bg-amber-500/20 text-amber-300'   },
  ];

  return (
    <div className="max-w-4xl mx-auto pb-4 animate-fade-in">
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />

      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <p className="text-[10px] font-black text-foreground/35 uppercase tracking-[0.12em] mb-0.5">Account</p>
          <h2 className="text-xl font-black text-foreground">My Profile</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Cloud Data Manager */}
          <button
            onClick={() => setShowCloudManager(true)}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border border-border bg-card text-foreground/50 hover:text-primary hover:border-primary/30 transition-all active:scale-95"
            title="Cloud Data Manager"
          >
            <Cloud className="w-3.5 h-3.5" />
          </button>
          {/* Master filter button */}
          <button
            onClick={() => setShowFilterBar(p => !p)}
            className={`relative flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-all active:scale-95 ${
              hasActiveFilter
                ? 'bg-primary/15 border-primary/30 text-primary'
                : 'bg-card border-border text-foreground/50 hover:border-foreground/20'
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
          <button onClick={onBack}
            className="flex items-center gap-1.5 bg-foreground/5 border border-border text-foreground/50 text-sm px-3.5 py-2 rounded-xl font-semibold transition-all active:scale-95 hover:bg-foreground/8">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </div>
      </div>

      {/* ── Unified Filter Bar ── */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out mb-3 ${showFilterBar ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[9px] font-black uppercase tracking-widest text-foreground/40">🔍 Filter Everything</h4>
            {hasActiveFilter && (
              <button onClick={clearAllFilters} className="text-[10px] font-bold text-destructive/60 hover:text-destructive transition-colors">Clear All</button>
            )}
          </div>

          {/* Subject */}
          {subjects.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-foreground/25 mb-2">🔖 Subject</p>
              <div className="flex flex-wrap gap-1.5">
                <FilterBtn active={profileSubjectFilter === 'all'} onClick={() => setProfileSubjectFilter('all')}>🌐 All</FilterBtn>
                {subjects.map(s => (
                  <FilterBtn key={s.name} active={profileSubjectFilter === s.name} onClick={() => setProfileSubjectFilter(s.name)}>
                    {s.name} <span className="text-foreground/25 ml-0.5">({s.count})</span>
                  </FilterBtn>
                ))}
              </div>
            </div>
          )}

          {/* Unit / Topic */}
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

          {/* Difficulty */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-foreground/25 mb-2">🎯 Difficulty Level</p>
            <div className="flex flex-wrap gap-1.5">
              <FilterBtn active={profileDiffFilter === 'all'} onClick={() => setProfileDiffFilter('all')}>All</FilterBtn>
              <FilterBtn active={profileDiffFilter === 'easy'} onClick={() => setProfileDiffFilter('easy')}>🟢 Easy</FilterBtn>
              <FilterBtn active={profileDiffFilter === 'medium'} onClick={() => setProfileDiffFilter('medium')}>🟡 Medium</FilterBtn>
              <FilterBtn active={profileDiffFilter === 'hard'} onClick={() => setProfileDiffFilter('hard')}>🔴 Hard</FilterBtn>
            </div>
          </div>

          {/* Active filter summary */}
          {hasActiveFilter && (
            <div className="flex items-center gap-2 p-2.5 bg-primary/8 border border-primary/15 rounded-xl">
              <span className="text-[9px]">🔍</span>
              <p className="text-[10px] font-bold text-primary/80 flex-1 truncate">{filterLabel}</p>
              <span className="text-[10px] font-black text-foreground/30">{stats.totalQ}Q</span>
            </div>
          )}
        </div>
      </div>

      {/* Hero Card */}
      <div className="glass-card p-4 sm:p-6 mb-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/6 pointer-events-none" />
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-primary/8 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-start gap-4 mb-4">
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl overflow-hidden border-2 border-primary/40 shadow-lg shadow-primary/20 bg-gradient-to-br from-primary/60 to-accent/60">
              {profile.avatarUrl
                ? <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-4xl">{profile.avatarEmoji}</div>
              }
            </div>
            <button onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
              className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow-lg active:scale-90 transition-all">
              {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Camera className="w-3.5 h-3.5 text-white" />}
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {editingName ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input ref={nameInputRef} value={nameVal} onChange={e => setNameVal(e.target.value)}
                    onBlur={saveName} onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setNameVal(displayName); } }}
                    maxLength={24}
                    className="flex-1 min-w-0 bg-foreground/10 border border-primary/40 rounded-lg px-2 py-1 text-xl font-black text-foreground focus:outline-none" />
                  <button onClick={saveName} className="text-emerald-500 flex-shrink-0"><Check className="w-5 h-5" /></button>
                </div>
              ) : (
                <button onClick={() => { setNameVal(displayName); setEditingName(true); }} className="flex items-center gap-2 group text-left">
                  <h2 className="text-xl sm:text-2xl font-black text-foreground truncate max-w-[180px]">{displayName}</h2>
                  <Edit2 className="w-3.5 h-3.5 text-foreground/20 group-hover:text-foreground/50 flex-shrink-0 transition-colors" />
                </button>
              )}
            </div>
            {account.signedIn ? (
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="text-xs font-bold text-emerald-500 dark:text-emerald-400 truncate">
                  {authEmail || 'Cloud Synced'}
                </span>
              </div>
            ) : (
              <p className="text-xs text-foreground/40 mb-2 truncate flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0" />
                Offline Mode (Local Storage)
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <span className="bg-gradient-to-r from-primary to-accent text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full text-white">{rank}</span>
              <span className={`text-[10px] font-bold px-3 py-1 rounded-full border ${streak > 0 ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-foreground/5 text-foreground/30 border-border'}`}>
                🔥 {streak} day streak
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          {[
            { label: 'Quizzes',   value: String(masterFiltered.length), color: 'text-foreground',  Icon: Zap       },
            { label: 'Avg Score', value: profile.showDecimalPct ? `${stats.avgPctDecimal}%` : `${stats.avgPct}%`, color: 'text-primary', Icon: Target },
            { label: 'Best',      value: `${stats.bestPct}%`,          color: 'text-amber-500',   Icon: Trophy    },
            { label: 'Accuracy',  value: `${stats.avgAcc}%`,           color: 'text-emerald-500', Icon: BarChart2 },
            { label: 'Streak',    value: `${streak}d`,           color: 'text-orange-500',  Icon: Flame     },
            { label: 'Time',      value: formatTime(stats.totalTime),  color: 'text-violet-500',  Icon: Clock     },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} className="bg-foreground/[0.04] rounded-xl p-3 text-center border border-border flex flex-col items-center gap-1">
              <Icon className={`w-3.5 h-3.5 ${color} opacity-50`} />
              <div className={`text-base font-black ${color} leading-none`}>{value}</div>
              <div className="text-[8px] text-foreground/35 font-bold tracking-wider leading-tight uppercase">{label}</div>
            </div>
          ))}
        </div>

        {/* Active filter label under hero stats */}
        {hasActiveFilter && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/8 border border-primary/20 rounded-xl mt-2 animate-fade-in">
            <span className="text-[9px]">🔍</span>
            <p className="text-[10px] font-bold text-primary/70 flex-1 truncate">
              Showing: {filterLabel}
            </p>
            <button onClick={clearAllFilters}
              className="text-[9px] font-bold text-destructive/60 hover:text-destructive transition-colors flex-shrink-0">
              Clear
            </button>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <button onClick={handlePracticeMistakes}
            className="flex items-center gap-1.5 bg-destructive/10 border border-destructive/25 text-destructive text-xs font-bold py-2.5 px-4 rounded-xl transition-all active:scale-95 justify-center">
            🎯 Practice Mistakes ({getActiveMistakes().length})
          </button>
          <button onClick={() => setShowEmojiPicker(p => !p)}
            className="flex items-center gap-1.5 bg-foreground/[0.04] border border-border text-foreground/50 text-xs font-bold py-2.5 px-3 rounded-xl transition-all active:scale-95">
            {profile.avatarEmoji} Emoji
          </button>
        </div>

        {showEmojiPicker && (
          <div className="mt-3 p-3 bg-foreground/[0.04] rounded-2xl border border-border">
            <p className="text-[9px] text-foreground/40 uppercase font-bold tracking-widest mb-2">Choose Avatar Emoji</p>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} onClick={() => { updateProfile({ avatarEmoji: e }); setShowEmojiPicker(false); toast.success('Avatar updated ✓'); }}
                  className={`text-xl p-1.5 rounded-lg transition-all active:scale-90 ${profile.avatarEmoji === e ? 'bg-primary/20 ring-1 ring-primary/40' : 'hover:bg-foreground/10'}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Status Strip: Cloud, Backup, Storage, App Version ── */}
      <StatusStrip onJump={(section) => { setTab('settings'); triggerOpenSettings(section); }} />

      {/* ── Lifetime Score Section (always visible) ── */}
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
                  <span className="text-[9px] font-black bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-md">
                    -{stats.totalPenalty.toFixed(1)}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Speedometer */}
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

          {/* Score formula */}
          <div className="relative z-10 flex flex-wrap items-center justify-center gap-4 text-xs font-mono bg-foreground/5 px-6 py-4 rounded-2xl border border-border max-w-sm mx-auto">
            <div className="flex flex-col items-center"><span className="text-emerald-500 font-black text-2xl">{stats.totalGain}</span><span className="text-[9px] text-foreground/40 uppercase tracking-widest mt-0.5">Gain</span></div>
            <span className="text-foreground/30 text-xl">−</span>
            <div className="flex flex-col items-center"><span className="text-destructive font-black text-2xl">{stats.totalPenalty % 1 === 0 ? stats.totalPenalty : stats.totalPenalty.toFixed(2)}</span><span className="text-[9px] text-foreground/40 uppercase tracking-widest mt-0.5">Penalty</span></div>
            <span className="text-foreground/30 text-xl">=</span>
            <div className="flex flex-col items-center"><span className="text-primary font-black text-3xl">{stats.netScore % 1 === 0 ? stats.netScore : stats.netScore.toFixed(2)}</span><span className="text-[9px] text-primary/60 uppercase tracking-widest mt-0.5">Net Score</span></div>
          </div>

          {/* Question Breakdown Strip */}
          <QuestionBreakdownStrip
            totalQ={stats.totalQ}
            correct={stats.totCorrect}
            wrong={stats.totWrong}
            skipped={stats.totSkipped}
            className="relative z-10 mt-4"
          />



          {/* Difficulty Distribution Bar */}
          <DifficultyDistributionBar
            easy={stats.diffCounts.easy}
            medium={stats.diffCounts.medium}
            hard={stats.diffCounts.hard}
            className="relative z-10 mt-3"
          />

          {/* Stats strip */}
          <div className="relative z-10 flex items-center justify-center gap-3 mt-3 text-[10px] text-foreground/25 font-bold">
            <span>{masterFiltered.length} quizzes</span>
            <span>·</span>
            <span>{stats.totalQ} questions</span>
            <span>·</span>
            <span>Avg {profile.showDecimalPct ? `${stats.avgPctDecimal}%` : `${stats.avgPct}%`}</span>
          </div>

          {/* Negative Marking Panel */}
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
              onRemoveAll={() => {
                const updated = removeNegativeMarkingFromAll();
                setHistory?.(updated);
              }}
              onRemoveFiltered={(ids) => {
                const updated = removeNegativeMarkingFromFiltered(ids);
                setHistory?.(updated);
              }}
            />
          )}
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

      {/* Subject Filter Popup */}
      {subjectPopupOpen && (
        <SubjectFilterPopup
          subjects={subjects}
          value={profileSubjectFilter}
          onChange={setProfileSubjectFilter}
          onClose={() => setSubjectPopupOpen(false)}
        />
      )}

      {/* Report Download Panel — loading skeleton when syncing */}
      {isSyncing && masterFiltered.length === 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-lg mb-6 animate-pulse">
          <div className="px-5 py-4 border-b border-border bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-36 bg-foreground/10 rounded-lg" />
                <div className="h-3 w-48 bg-foreground/5 rounded-lg" />
              </div>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="py-4 rounded-xl bg-foreground/[0.03] border border-border">
                  <div className="h-5 w-8 bg-foreground/10 rounded mx-auto mb-1" />
                  <div className="h-2 w-12 bg-foreground/5 rounded mx-auto" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-28 rounded-xl bg-foreground/[0.03] border border-border" />
              ))}
            </div>
          </div>
        </div>
      )}
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
          controlledSubject={profileSubjectFilter === 'all' ? null : profileSubjectFilter}
          controlledUnit={profileUnitFilter}
          controlledDiffFilter={profileDiffFilter}
          onSubjectChange={v => setProfileSubjectFilter(v || 'all')}
          onUnitChange={setProfileUnitFilter}
          onDiffFilterChange={setProfileDiffFilter}
          // CRITICAL: History contains lightweight summaries with empty quizData arrays.
          // The report panel now handles fetching full details on-demand when generating reports.
          // This avoids loading all quiz data upfront (which would be slow for large histories).
        />
      )}

      <div className="grid grid-cols-4 gap-1.5 mb-4">
        {[
          { label: 'Correct',  value: stats.totCorrect, color: 'text-emerald-500', bg: 'bg-emerald-500/8 border-emerald-500/25', t: 'correct'  as Tab },
          { label: 'Wrong',    value: stats.totWrong,   color: 'text-red-500',     bg: 'bg-red-500/8 border-red-500/25',         t: 'wrong'    as Tab },
          { label: 'Skipped',  value: stats.totSkipped, color: 'text-amber-500',   bg: 'bg-amber-500/8 border-amber-500/25',     t: 'skipped'  as Tab },
          { label: 'Total Qs', value: stats.totalQ,     color: 'text-foreground',  bg: 'bg-primary/8 border-primary/25',         t: 'overview' as Tab },
        ].map(({ label, value, color, bg, t }) => (
          <button key={label} onClick={() => setTab(t)}
            className={`bg-card rounded-xl p-2.5 border text-center transition-all active:scale-95 ${tab === t ? bg : 'border-border hover:border-foreground/15'}`}>
            <div className={`font-black text-sm sm:text-lg ${color} leading-none`}>{value}</div>
            <div className="text-[8px] text-foreground/35 uppercase tracking-wider font-bold mt-1 leading-tight">{label}</div>
          </button>
        ))}
      </div>

      {/* Main Tabs */}
      <div className="flex gap-0.5 mb-2 bg-card/80 p-1 rounded-2xl border border-border">
        {mainTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all border active:scale-95 ${tab === t.key ? 'bg-primary/15 border-primary/30 text-foreground shadow-sm' : 'border-transparent text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5'}`}>
            <span className="text-sm leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Utility Tabs */}
      <div className="flex gap-0.5 mb-4 bg-card/80 p-1 rounded-2xl border border-border">
        {utilityTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold whitespace-nowrap transition-all border active:scale-95 ${tab === t.key ? 'bg-primary/15 border-primary/30 text-foreground shadow-sm' : 'border-transparent text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5'}`}>
            <span className="text-[11px] leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div key={tab} className="animate-tab-content">
        {tab === 'overview' && (
          <OverviewTab
            history={history}
            filteredHistory={masterFiltered}
            onViewResult={onViewResult}
            onDeleteHistory={onDeleteHistory}
            subjectFilter={profileSubjectFilter}
            difficultyFilter={profileDiffFilter}
          />
        )}
        {tab === 'notes'    && <NotesTab history={history} rationaleCache={rationaleCache} />}
        {tab === 'awards'   && <AwardsGrid history={history} />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'trash'    && <TrashTab onHistoryChanged={() => onHistoryChanged?.()} />}
        {tab === 'settings' && (
          <SettingsTab
            theme={theme} onThemeChange={onThemeChange}
            isLoggedIn={account.signedIn} history={history}
            onOpenTab={t => { setTab(t); window.scrollTo({ top: 0 }); }}
          />
        )}
        {tab === 'apikeys'   && <ApiKeysTab />}
        {tab === 'downloads' && <DownloadsTab />}

        {(tab === 'correct' || tab === 'wrong' || tab === 'skipped') && (
          <div>
            <div className="flex items-center gap-1 mb-5 bg-foreground/[0.04] p-1.5 rounded-2xl border border-border">
              {reviewFilterConfig.map(({ key, label, icon, color, active, badge }) => {
                const count = reviewCounts[key];
                return (
                  <button key={key} onClick={() => setTab(key)}
                    className={`flex-1 flex items-center justify-center gap-1 py-2.5 px-2 rounded-xl font-bold text-xs transition-all border active:scale-95 ${tab === key ? `${active} shadow-sm` : `border-transparent ${color} opacity-60`}`}>
                    <span className="text-sm leading-none">{icon}</span>
                    <span>{label}</span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${tab === key ? badge : 'bg-foreground/10 text-foreground/40'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            <HistoryList type={tab as ReviewFilter} history={history} rationaleCache={rationaleCache}
              getAiRationale={getAiRationale} reportOrder={profileReportOrder}
              rationalePrefs={rationalePrefs} reportHelper={reportHelper} />
          </div>
        )}
      </div>

      {/* Cloud Data Manager Modal */}
      <CloudDataManager open={showCloudManager} onClose={() => setShowCloudManager(false)} isLoggedIn={account.signedIn} />
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
