import { useMemo, useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { ArrowLeft, Flame, Hash, Target, Clock, Dumbbell, Award, ChevronDown, ChevronUp, Filter, Calculator } from 'lucide-react';
import SessionSelector, { SessionMode, filterBySession, getSessionLabel } from '../SessionSelector';
import { QuizResult, QuizQuestion } from '../../types/quiz';
import { formatTime, calculateStreak } from '../../utils/scoring';
import { formatDateShort } from '../../utils/dateFormat';
import { calculateStats, getAvailablePracticeRounds, getPracticeJourneys } from '../../utils/practiceUtils';
import PracticeProgressChart from './PracticeProgressChart';
import MasteryTracker from './MasteryTracker';
import SpeedImprovementCard from './SpeedImprovementCard';
import PracticeGoals from './PracticeGoals';
import QuickRePractice from './QuickRePractice';
import WeakQuestionsPanel from './WeakQuestionsPanel';
import PracticeJourneyTimeline from './PracticeJourneyTimeline';
import PracticeSessionComparison from './PracticeSessionComparison';
import SessionComparisonCard from '../dashboard/SessionComparisonCard';
import ImprovementBanner from './ImprovementBanner';
import SubjectFilterPopup from '../SubjectFilterPopup';
import LifetimeNegMarkingPanel from '../profile/LifetimeNegMarkingPanel';
import { applyNegativeMarkingToAll, removeNegativeMarkingFromAll, applyNegativeMarkingToFiltered, removeNegativeMarkingFromFiltered, getQuizKey } from '../../utils/negativeMarkingStore';

interface Props {
  history: QuizResult[];
  setHistory?: (h: QuizResult[] | ((prev: QuizResult[]) => QuizResult[])) => void;
  onViewResult: (r: QuizResult) => void;
  onStartCreate: () => void;
  onPractice?: (questions: QuizQuestion[]) => void;
  onBack?: () => void;
}

/* ── Shared helpers ── */
function scoreColor(pct: number) {
  return pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
}

function MiniScoreRing({ pct: rawPct }: { pct: number }) {
  const pct = Math.max(0, Math.min(100, rawPct));
  const R = 16, C = 2 * Math.PI * R;
  const fill = (pct / 100) * C;
  const strokeColor = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#EF4444';
  return (
    <div className="relative flex-shrink-0 w-[44px] h-[44px]">
      <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
        <circle cx="22" cy="22" r={R} fill="none" stroke="currentColor" className="text-primary/10" strokeWidth="3" />
        <circle cx="22" cy="22" r={R} fill="none" stroke={strokeColor} strokeWidth="3"
          strokeDasharray={`${fill} ${C}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-[11px] font-black leading-none ${scoreColor(pct)}`}>{pct}%</span>
      </div>
    </div>
  );
}

function ActivityRing({ correct, wrong, skipped, total }: { correct: number; wrong: number; skipped: number; total: number }) {
  const R = 30, C = 2 * Math.PI * R, gap = 4;
  const t = Math.max(total, 1);
  const cL = Math.max(0, (correct / t) * C - gap);
  const wL = Math.max(0, (wrong / t) * C - gap);
  const sL = Math.max(0, (skipped / t) * C - gap);
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
      <circle cx="36" cy="36" r={R} fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.1" strokeWidth="6" />
      {cL > 2 && <circle cx="36" cy="36" r={R} fill="none" stroke="#22C55E" strokeWidth="6" strokeDasharray={`${cL} ${C}`} strokeDashoffset="0" strokeLinecap="round" />}
      {wL > 2 && <circle cx="36" cy="36" r={R} fill="none" stroke="#EF4444" strokeWidth="6" strokeDasharray={`${wL} ${C}`} strokeDashoffset={`${-(cL + gap)}`} strokeLinecap="round" />}
      {sL > 2 && <circle cx="36" cy="36" r={R} fill="none" stroke="#F59E0B" strokeWidth="6" strokeDasharray={`${sL} ${C}`} strokeDashoffset={`${-(cL + wL + gap * 2)}`} strokeLinecap="round" />}
    </svg>
  );
}

/* ── Collapsible section wrapper ── */
function CollapsibleSection({ title, icon, defaultOpen = false, children }: {
  title: string; icon: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card border-primary/10 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-foreground/[0.02] transition-colors active:scale-[0.995]">
        <span className="text-base leading-none">{icon}</span>
        <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest flex-1">{title}</p>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-foreground/25" /> : <ChevronDown className="w-3.5 h-3.5 text-foreground/25" />}
      </button>
      {open && <div className="px-4 pb-4 pt-0 animate-fade-in">{children}</div>}
    </div>
  );
}

/* ── Section divider label ── */
function SectionLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1 pt-2 mb-1">
      <span className="text-[10px] leading-none">{icon}</span>
      <span className="text-[11px] font-black text-foreground/20 uppercase tracking-[0.15em]">{label}</span>
    </div>
  );
}

const THUMB_COLORS = [
  'from-primary/40 to-primary/20', 'from-amber-500/40 to-orange-600/40',
  'from-orange-500/40 to-red-600/40', 'from-rose-500/40 to-pink-600/40',
  'from-primary/30 to-primary/10',
];

export default function PracticeDashboardScreen({ history, setHistory, onViewResult, onStartCreate, onPractice, onBack }: Props) {
  const [sessionMode, setSessionMode] = usePersistedState<SessionMode>('practice_dash_session', 'main');
  const [subjectFilter, setSubjectFilter] = usePersistedState('practice_dash_subject', 'all');
  const [showSubjectPopup, setShowSubjectPopup] = useState(false);

  const sessionHistory = useMemo(() => filterBySession(history, sessionMode), [history, sessionMode]);

  // Subject options with count + avg from session-filtered history
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
    let filtered = sessionHistory;
    if (effectiveSubjectFilter !== 'all') filtered = filtered.filter(r => r.subject === effectiveSubjectFilter);
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }, [sessionHistory, effectiveSubjectFilter]);

  const practiceHistory = useMemo(() => history.filter(r => r.attemptType === 'practice'), [history]);
  const stats = useMemo(() => calculateStats(filteredHistory), [filteredHistory]);
  const rounds = useMemo(() => getAvailablePracticeRounds(filteredHistory), [filteredHistory]);
  const streak = useMemo(() => calculateStreak(practiceHistory.map(r => r.timestamp)), [practiceHistory]);
  const journeys = useMemo(() => getPracticeJourneys(filteredHistory), [filteredHistory]);

  const ringData = useMemo(() => {
    if (!filteredHistory.length) return { correct: 0, wrong: 0, skipped: 0, total: 1 };
    return {
      correct: filteredHistory.reduce((a, r) => a + r.correct, 0),
      wrong: filteredHistory.reduce((a, r) => a + r.wrong, 0),
      skipped: filteredHistory.reduce((a, r) => a + r.skipped, 0),
      total: filteredHistory.reduce((a, r) => a + r.totalQuestions, 0),
    };
  }, [filteredHistory]);

  const recent = filteredHistory.slice(0, 8);
  const activeFilterCount = (sessionMode !== 'main' ? 1 : 0) + (effectiveSubjectFilter !== 'all' ? 1 : 0);
  const [showNegPanel, setShowNegPanel] = useState(false);
  const filteredQuizIds = useMemo(() => filteredHistory.map(r => getQuizKey(r)), [filteredHistory]);
  const isSubjectFiltered = effectiveSubjectFilter !== 'all';

  // ── Empty state ──
  if (practiceHistory.length === 0 && history.length === 0) {
    return (
      <div className="animate-fade-in pt-2 pb-4">
        <DashboardHeader onBack={onBack} count={0} />
        <div className="glass-card p-10 flex flex-col items-center text-center border-primary/10 mt-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
            <span className="text-3xl">🏋️</span>
          </div>
          <h3 className="text-base font-black text-foreground mb-2">No practice sessions yet</h3>
          <p className="text-sm text-foreground/40 max-w-xs leading-relaxed">
            Complete a quiz and click &quot;Retry&quot; on the results screen to start practicing.
          </p>
          <button onClick={onStartCreate}
            className="mt-5 flex items-center gap-2 bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-xs font-bold px-5 py-2.5 rounded-xl transition-all active:scale-95">
            <Dumbbell className="w-3.5 h-3.5" /> Create a Quiz First
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-3 pb-24 relative">
      {/* Header with filters */}
      <div className="flex items-center justify-between pt-2 px-1">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="w-9 h-9 rounded-xl bg-foreground/5 border border-border flex items-center justify-center hover:bg-foreground/10 transition-all active:scale-95 flex-shrink-0">
              <ArrowLeft className="w-4 h-4 text-foreground/50" />
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Dumbbell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black text-primary/60 uppercase tracking-[0.12em]">Practice Mode</p>
              {practiceHistory.length > 0 && (
                <span className="text-[9px] font-bold text-primary bg-primary/15 border border-primary/25 px-2 py-0.5 rounded-full">
                  {practiceHistory.length} sessions
                </span>
              )}
            </div>
            <h1 className="text-xl font-black text-foreground leading-tight">Practice Dashboard</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {subjectOptions.length >= 2 && (
            <button
              onClick={() => setShowSubjectPopup(true)}
              className={`relative flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-all active:scale-95 ${
                effectiveSubjectFilter !== 'all'
                  ? 'bg-primary/15 border-primary/30 text-primary'
                  : 'bg-card border-border text-foreground/50 hover:border-foreground/20'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span className="max-w-[60px] truncate">{effectiveSubjectFilter === 'all' ? 'Subject' : effectiveSubjectFilter}</span>
              {effectiveSubjectFilter !== 'all' && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[8px] font-black flex items-center justify-center">1</span>
              )}
            </button>
          )}
          <SessionSelector history={history} value={sessionMode} onChange={setSessionMode} compact />
        </div>
      </div>

      {/* Subject Filter Popup */}
      {showSubjectPopup && (
        <SubjectFilterPopup
          subjects={subjectOptions}
          value={effectiveSubjectFilter}
          onChange={setSubjectFilter}
          onClose={() => setShowSubjectPopup(false)}
        />
      )}

      {/* Active filter indicator */}
      {effectiveSubjectFilter !== 'all' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/8 border border-primary/20 rounded-xl animate-fade-in">
          <Filter className="w-3 h-3 text-primary/60" />
          <p className="text-[11px] font-bold text-primary/80 flex-1">
            Subject: {effectiveSubjectFilter} · {filteredHistory.length} result{filteredHistory.length !== 1 ? 's' : ''}
          </p>
          <button onClick={() => setSubjectFilter('all')} className="text-[10px] font-bold text-destructive/70 hover:text-destructive transition-colors">
            Clear
          </button>
        </div>
      )}

      {/* Session mode indicator */}
      {sessionMode !== 'main' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl animate-fade-in">
          <span className="text-base">🏋️</span>
          <p className="text-[11px] font-bold text-amber-300">Showing {getSessionLabel(sessionMode)} sessions only</p>
        </div>
      )}

      {/* Improvement Banner */}
      <ImprovementBanner history={filteredHistory} />

      {/* ═══════ 📊 PERFORMANCE ═══════ */}
      <SectionLabel icon="📊" label="Performance" />

      {/* Hero Card (compact) */}
      <div className="glass-card p-4 relative overflow-hidden border-primary/10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-primary/[0.03] pointer-events-none rounded-[inherit]" />
        <div className="relative flex items-center gap-3.5">
          <div className="relative flex-shrink-0">
            <ActivityRing {...ringData} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-lg">🔄</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black text-foreground leading-tight">
              {getSessionLabel(sessionMode)} Performance
            </h2>
            <div className="mt-1.5">
              <span className="text-[10px] text-foreground/40 font-bold">
                Avg: {stats.avgPercentage}% · Best: {stats.bestScore}%
              </span>
              <div className="h-1.5 bg-primary/10 rounded-full overflow-hidden mt-1">
                <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${stats.avgPercentage}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <Flame className={`w-3.5 h-3.5 flex-shrink-0 ${streak > 0 ? 'text-orange-400' : 'text-foreground/20'}`} />
              <span className={`text-xs font-black ${streak > 0 ? 'text-orange-400' : 'text-foreground/20'}`}>
                {streak > 0 ? `${streak}-day streak` : 'Start today'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Sentence */}
      {filteredHistory.length >= 2 && (() => {
        const older = filteredHistory.slice(Math.floor(filteredHistory.length / 2));
        const newer = filteredHistory.slice(0, Math.floor(filteredHistory.length / 2));
        const olderAvg = older.length ? Math.round(older.reduce((a, r) => a + r.percentage, 0) / older.length) : 0;
        const newerAvg = newer.length ? Math.round(newer.reduce((a, r) => a + r.percentage, 0) / newer.length) : 0;
        const diff = newerAvg - olderAvg;
        return (
          <p className="text-xs text-foreground/45 px-1 leading-relaxed">
            {diff > 0
              ? `You've improved ${diff}% over ${filteredHistory.length} sessions — keep it up! 🚀`
              : diff < 0
              ? `Your accuracy is ${stats.avgPercentage}% across ${filteredHistory.length} sessions. Focus on weak areas to bounce back!`
              : `Your accuracy is ${stats.avgPercentage}% across ${filteredHistory.length} sessions — steady performance! 💪`}
          </p>
        );
      })()}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {([
          { label: 'Sessions', value: String(stats.totalQuizzes), color: 'text-primary', iconBg: 'bg-primary/15', Icon: Hash },
          { label: 'Avg', value: `${stats.avgPercentage}%`, color: 'text-emerald-400', iconBg: 'bg-emerald-500/15', Icon: Target },
          { label: 'Questions', value: String(stats.totalQuestions), color: 'text-orange-400', iconBg: 'bg-orange-500/15', Icon: Award },
          { label: 'Time', value: formatTime(stats.totalTime), color: 'text-purple-400', iconBg: 'bg-purple-500/15', Icon: Clock },
        ] as const).map(({ label, value, color, iconBg, Icon }) => (
          <div key={label} className="bg-card border border-border/50 rounded-xl p-2.5 flex flex-col items-center text-center">
            <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center mb-1`}>
              <Icon className={`w-3.5 h-3.5 ${color}`} />
            </div>
            <span className={`text-sm font-black ${color} leading-none tabular-nums`}>{value}</span>
            <span className="text-[8px] text-foreground/30 uppercase tracking-wider font-bold mt-0.5">{label}</span>
          </div>
        ))}
      </div>

      {/* Practice Goals */}
      <PracticeGoals history={filteredHistory} />

      {/* Quick Re-Practice */}
      {onPractice && <QuickRePractice history={filteredHistory} onPractice={onPractice} />}

      {/* Answer Breakdown */}
      <div className="glass-card p-4 border-primary/10">
        <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-3">Answer Breakdown</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          {([
            { label: 'Correct', value: stats.correct, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Wrong', value: stats.wrong, color: 'text-red-400', bg: 'bg-red-500/10' },
            { label: 'Skipped', value: stats.skipped, color: 'text-primary', bg: 'bg-primary/10' },
          ] as const).map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl py-2.5 border border-foreground/5`}>
              <div className={`text-xl font-black ${color}`}>{value}</div>
              <div className="text-[8px] text-foreground/30 uppercase tracking-widest font-bold mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] font-bold text-foreground/40 w-14">Accuracy</span>
          <div className="flex-1 h-1.5 bg-foreground/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${stats.accuracy}%` }} />
          </div>
          <span className="text-[11px] font-black text-primary tabular-nums">{stats.accuracy}%</span>
        </div>
      </div>

      {/* Practice Rounds */}
      {rounds.length > 1 && (
        <div className="glass-card p-4 border-primary/10">
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-3">Practice Rounds</p>
          <div className="space-y-1.5">
            {rounds.map((round, idx) => {
              const roundResults = filteredHistory.filter(r => r.attemptType === 'practice' && r.attemptNumber === round.attemptNumber);
              const roundStats = calculateStats(roundResults);
              const prevRound = idx > 0 ? rounds[idx - 1] : null;
              const diff = prevRound ? round.avgScore - prevRound.avgScore : 0;
              return (
                <div key={round.attemptNumber}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border bg-card border-border/50 text-left">
                  <span className="text-[11px] font-black text-primary w-7 flex-shrink-0">P{round.attemptNumber}</span>
                  <div className="flex-1 h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${roundStats.avgPercentage}%` }} />
                  </div>
                  <span className={`text-xs font-black ${scoreColor(roundStats.avgPercentage)}`}>{roundStats.avgPercentage}%</span>
                  {idx > 0 && diff !== 0 && (
                    <span className={`text-[9px] font-bold ${diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {diff > 0 ? '▲' : '▼'}{Math.abs(diff)}
                    </span>
                  )}
                  <span className="text-[9px] text-foreground/25">{round.count}q</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════ 📈 TRENDS ═══════ */}
      <SectionLabel icon="📈" label="Trends" />

      <PracticeProgressChart history={filteredHistory} />
      <SpeedImprovementCard history={filteredHistory} />

      {/* Scoring Summary */}
      <div className="glass-card p-4 border-primary/10">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Scoring Summary</p>
          {filteredHistory.length > 0 && (
            <button
              onClick={() => setShowNegPanel(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/10 border border-destructive/25 text-destructive text-[9px] font-black uppercase tracking-wider hover:bg-destructive/15 transition-all active:scale-95"
            >
              <Calculator className="w-3 h-3" />
              <span>➖🎯</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {([
            { label: 'Total Gain', value: stats.gain.toFixed(1), color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Penalty', value: stats.penalty.toFixed(1), color: 'text-red-400', bg: 'bg-red-500/10' },
            { label: 'Net Score', value: stats.netScore.toFixed(1), color: 'text-primary', bg: 'bg-primary/10' },
          ] as const).map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl py-2.5 border border-foreground/5`}>
              <div className={`text-lg font-black ${color}`}>{value}</div>
              <div className="text-[8px] text-foreground/30 uppercase tracking-widest font-bold mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Negative Marking Panel */}
      {showNegPanel && filteredHistory.length > 0 && (
        <LifetimeNegMarkingPanel
          totalCorrect={stats.correct}
          totalWrong={stats.wrong}
          totalSkipped={stats.skipped}
          totalQuestions={stats.totalQuestions}
          originalGain={stats.gain}
          originalPenalty={stats.penalty}
          passMark={50}
          onClose={() => setShowNegPanel(false)}
          filteredQuizIds={isSubjectFiltered ? filteredQuizIds : undefined}
          allQuizIds={filteredQuizIds}
          subjectLabel={isSubjectFiltered ? effectiveSubjectFilter : undefined}
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

      {/* ═══════ 🔬 DEEP ANALYSIS ═══════ */}
      <SectionLabel icon="🔬" label="Deep Analysis" />

      <CollapsibleSection title="Mastery Tracker" icon="🎯" defaultOpen={true}>
        <MasteryTracker history={filteredHistory} onPracticeWeak={onPractice} />
      </CollapsibleSection>

      <CollapsibleSection title="Weak Questions" icon="⚠️">
        <WeakQuestionsPanel history={filteredHistory} onPractice={onPractice} />
      </CollapsibleSection>

      {journeys.length > 0 && (
        <CollapsibleSection title="Practice Journeys" icon="🗺️">
          <PracticeJourneyTimeline journeys={journeys} onViewResult={onViewResult} />
        </CollapsibleSection>
      )}

      {/* ═══════ ⚖️ SESSION ANALYTICS ═══════ */}
      <SectionLabel icon="⚖️" label="Session Analytics" />
      <SessionComparisonCard history={filteredHistory} />

      {/* ═══════ 🔄 QUICK COMPARE ═══════ */}
      <SectionLabel icon="🔄" label="Quick Compare" />
      <PracticeSessionComparison history={filteredHistory} />

      {/* ═══════ 🕐 RECENT ═══════ */}
      {recent.length > 0 && (
        <>
          <SectionLabel icon="🕐" label="Recent Sessions" />
          <div className="space-y-1.5">
            {recent.map((r, i) => (
              <button key={r.id || r.timestamp} onClick={() => onViewResult(r)}
                className="w-full flex items-center gap-3 bg-card border border-border/50 hover:border-primary/25 rounded-xl p-2.5 transition-all active:scale-[0.99] text-left">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${THUMB_COLORS[i % THUMB_COLORS.length]} flex items-center justify-center flex-shrink-0 text-xs font-black text-white border border-primary/20`}>
                  {r.quizTitle?.[0]?.toUpperCase() || '🔄'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-foreground truncate leading-snug">
                    {r.quizTitle || `Practice · ${r.totalQuestions} Qs`}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {r.attemptType === 'practice' && r.attemptNumber && (
                      <span className="text-[7px] font-bold text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                        P#{r.attemptNumber}
                      </span>
                    )}
                    {(r.attemptType || 'main') === 'main' && (
                      <span className="text-[7px] font-bold text-foreground/50 bg-foreground/5 px-1.5 py-0.5 rounded border border-border">
                        Main
                      </span>
                    )}
                    {r.subject && (
                      <span className="text-[7px] font-bold text-foreground/40 bg-foreground/5 px-1.5 py-0.5 rounded border border-border">
                        {r.subject}
                      </span>
                    )}
                    <span className="text-[8px] text-foreground/25">{formatDateShort(r.timestamp)} · {r.totalQuestions}Q</span>
                  </div>
                </div>
                <MiniScoreRing pct={r.percentage} />
              </button>
            ))}
          </div>
        </>
      )}

      {/* Empty filtered state */}
      {filteredHistory.length === 0 && (
        <div className="glass-card p-8 flex flex-col items-center text-center border-border/50 mt-2">
          <span className="text-2xl mb-2">🔍</span>
          <h3 className="text-sm font-black text-foreground mb-1">No results match filters</h3>
          <p className="text-[11px] text-foreground/40 max-w-xs">Try changing the type or subject filter above.</p>
          <button onClick={() => { setSessionMode('main'); setSubjectFilter('all'); }}
            className="mt-3 text-xs font-bold text-primary hover:underline">Clear all filters</button>
        </div>
      )}

      {/* Floating FAB */}
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40">
        <button onClick={onStartCreate}
          className="w-12 h-12 rounded-2xl bg-primary shadow-lg shadow-primary/30 flex items-center justify-center transition-all active:scale-90 hover:scale-105"
          aria-label="Start new practice">
          <Dumbbell className="w-5 h-5 text-primary-foreground" />
        </button>
      </div>
    </div>
  );
}

/* ── Header sub-component ── */
function DashboardHeader({ onBack, count }: { onBack?: () => void; count: number }) {
  return (
    <div className="flex items-center gap-3 pt-2 px-1">
      {onBack && (
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-foreground/5 border border-border flex items-center justify-center hover:bg-foreground/10 transition-all active:scale-95 flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-foreground/50" />
        </button>
      )}
      <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
        <Dumbbell className="w-5 h-5 text-primary" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-black text-primary/60 uppercase tracking-[0.12em]">Practice Mode</p>
          {count > 0 && (
            <span className="text-[9px] font-bold text-primary bg-primary/15 border border-primary/25 px-2 py-0.5 rounded-full">
              {count} sessions
            </span>
          )}
        </div>
        <h1 className="text-xl font-black text-foreground leading-tight">Practice Dashboard</h1>
      </div>
    </div>
  );
}
