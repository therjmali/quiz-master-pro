import { useMemo } from 'react';
import { QuizResult } from '../../types/quiz';
import { calculateStreak } from '../../utils/scoring';

interface Props { history: QuizResult[]; }

/* ── Level Definitions ── */
interface Level {
  level: number;
  name: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  glow: string;
  minQuizzes: number;
  minAvg: number;
  difficulty: string;
  challenge: string;
}

const LEVELS: Level[] = [
  { level: 1, name: 'Novice',       icon: '🌱', color: 'text-emerald-400',  bg: 'bg-emerald-500/10',  border: 'border-emerald-500/25', glow: 'tier-bronze',    minQuizzes: 0,   minAvg: 0,  difficulty: 'Easy',          challenge: 'Complete 5 quizzes to level up' },
  { level: 2, name: 'Apprentice',   icon: '📘', color: 'text-blue-400',     bg: 'bg-blue-500/10',     border: 'border-blue-500/25',    glow: 'tier-bronze',    minQuizzes: 5,   minAvg: 35, difficulty: 'Easy → Medium',  challenge: 'Reach 50% avg on 15 quizzes' },
  { level: 3, name: 'Scholar',      icon: '📚', color: 'text-indigo-400',   bg: 'bg-indigo-500/10',   border: 'border-indigo-500/25',  glow: 'tier-silver',    minQuizzes: 15,  minAvg: 50, difficulty: 'Medium',         challenge: 'Reach 60% avg on 30 quizzes' },
  { level: 4, name: 'Expert',       icon: '⚡', color: 'text-amber-400',    bg: 'bg-amber-500/10',    border: 'border-amber-500/25',   glow: 'tier-gold',      minQuizzes: 30,  minAvg: 60, difficulty: 'Medium → Hard',  challenge: 'Reach 70% avg on 50 quizzes' },
  { level: 5, name: 'Master',       icon: '🎓', color: 'text-purple-400',   bg: 'bg-purple-500/10',   border: 'border-purple-500/25',  glow: 'tier-diamond',   minQuizzes: 50,  minAvg: 70, difficulty: 'Hard',           challenge: 'Reach 80% avg on 100 quizzes' },
  { level: 6, name: 'Grandmaster',  icon: '💎', color: 'text-cyan-400',     bg: 'bg-cyan-500/10',     border: 'border-cyan-500/25',    glow: 'tier-diamond',   minQuizzes: 100, minAvg: 80, difficulty: 'Hard + Timed',   challenge: 'Reach 85% avg on 200 quizzes' },
  { level: 7, name: 'Legend',       icon: '👑', color: 'text-yellow-400',   bg: 'bg-yellow-500/10',   border: 'border-yellow-500/25',  glow: 'tier-legendary', minQuizzes: 200, minAvg: 85, difficulty: 'Expert',         challenge: 'You have reached the pinnacle!' },
];

function computeLevel(count: number, avg: number): { current: Level; next: Level | null; progress: number } {
  let currentIdx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (count >= LEVELS[i].minQuizzes && avg >= LEVELS[i].minAvg) {
      currentIdx = i;
      break;
    }
  }
  const current = LEVELS[currentIdx];
  const next = currentIdx < LEVELS.length - 1 ? LEVELS[currentIdx + 1] : null;
  
  let progress = 100;
  if (next) {
    const quizProgress = next.minQuizzes > current.minQuizzes 
      ? Math.min(100, ((count - current.minQuizzes) / (next.minQuizzes - current.minQuizzes)) * 100) : 100;
    const avgProgress = next.minAvg > current.minAvg
      ? Math.min(100, ((avg - current.minAvg) / (next.minAvg - current.minAvg)) * 100) : 100;
    progress = Math.round(Math.min(quizProgress, avgProgress));
  }
  
  return { current, next, progress };
}

export default function StreakMilestones({ history }: Props) {
  const { current, next, progress, streak, count, avg, milestones, achievedCount } = useMemo(() => {
    const count = history.length;
    const avg = count > 0 ? Math.round(history.reduce((a, r) => a + r.percentage, 0) / count) : 0;
    const streak = calculateStreak(history.map(r => r.timestamp));
    const totalQ = history.reduce((a, r) => a + r.totalQuestions, 0);
    const totCorrect = history.reduce((a, r) => a + r.correct, 0);
    const has90 = history.some(r => r.percentage >= 90);
    const speedDemon = history.some(r => r.timeTaken > 0 && r.timeTaken < 60 && r.percentage >= 50);
    const uniqueSubjects = new Set(history.map(r => r.subject?.trim()).filter(Boolean)).size;
    
    const comebackKing = (() => {
      const subjectScores = new Map<string, number[]>();
      for (const r of [...history].sort((a, b) => a.timestamp - b.timestamp)) {
        const s = r.subject?.trim();
        if (!s) continue;
        const arr = subjectScores.get(s.toLowerCase()) || [];
        arr.push(r.percentage);
        subjectScores.set(s.toLowerCase(), arr);
      }
      for (const scores of subjectScores.values()) {
        let hadBelow50 = false;
        for (const sc of scores) {
          if (sc < 50) hadBelow50 = true;
          if (hadBelow50 && sc >= 80) return true;
        }
      }
      return false;
    })();

    const milestones = [
      { icon: '🌱', name: 'First Steps',      desc: 'Complete 1 quiz',              achieved: count >= 1,                    tier: 'bronze' as const },
      { icon: '🔥', name: '3-Day Streak',     desc: '3 consecutive days',           achieved: streak >= 3,                   tier: 'bronze' as const },
      { icon: '⚡', name: 'On Fire',          desc: '7-day streak',                 achieved: streak >= 7,                   tier: 'silver' as const },
      { icon: '📚', name: 'Bookworm',         desc: 'Complete 10 quizzes',          achieved: count >= 10,                   tier: 'silver' as const },
      { icon: '🌟', name: 'Fifty Right',      desc: '50 total correct answers',     achieved: totCorrect >= 50,              tier: 'silver' as const },
      { icon: '🌍', name: 'Subject Explorer', desc: 'Quizzes in 5+ subjects',       achieved: uniqueSubjects >= 5,           tier: 'silver' as const },
      { icon: '🎓', name: 'High Scorer',      desc: 'Avg 80%+ score',               achieved: avg >= 80,                     tier: 'gold' as const   },
      { icon: '💡', name: '500 Questions',    desc: '500 questions answered',       achieved: totalQ >= 500,                 tier: 'gold' as const   },
      { icon: '🎯', name: 'Sharpshooter',     desc: '90%+ accuracy on any quiz',    achieved: has90,                         tier: 'gold' as const   },
      { icon: '⚡', name: 'Speed Demon',      desc: 'Quiz in <60s with 50%+',       achieved: speedDemon,                    tier: 'gold' as const   },
      { icon: '📅', name: '14-Day Warrior',   desc: '14-day streak',                achieved: streak >= 14,                  tier: 'gold' as const   },
      { icon: '💪', name: 'Comeback King',    desc: '80%+ after <50% same subject', achieved: comebackKing,                  tier: 'gold' as const   },
      { icon: '💎', name: 'Diamond Learner',  desc: '10+ quizzes, 70%+ avg',        achieved: count >= 10 && avg >= 70,      tier: 'diamond' as const },
      { icon: '🏆', name: 'Champion',         desc: 'Complete 50 quizzes',          achieved: count >= 50,                   tier: 'diamond' as const },
      { icon: '🎓', name: 'Century Club',     desc: '100 total correct answers',    achieved: totCorrect >= 100,             tier: 'diamond' as const },
      { icon: '📖', name: '1000 Questions',   desc: '1000 questions answered',      achieved: totalQ >= 1000,                tier: 'legendary' as const },
      { icon: '🏅', name: '30-Day Legend',    desc: '30-day streak',                achieved: streak >= 30,                  tier: 'legendary' as const },
      { icon: '👑', name: 'Quiz Legend',      desc: '100-day streak',               achieved: streak >= 100,                 tier: 'legendary' as const },
    ];

    const achievedCount = milestones.filter(m => m.achieved).length;
    const levelData = computeLevel(count, avg);

    return { ...levelData, streak, count, avg, milestones, achievedCount };
  }, [history]);

  const tierStyle: Record<string, { bg: string; border: string; glow: string; badge: string }> = {
    bronze:    { bg: 'bg-orange-500/10',  border: 'border-orange-500/25',   glow: 'tier-bronze',     badge: 'bg-orange-500/15 text-orange-400'   },
    silver:    { bg: 'bg-slate-500/10',   border: 'border-slate-400/25',    glow: 'tier-silver',     badge: 'bg-slate-500/15 text-slate-300'     },
    gold:      { bg: 'bg-amber-500/10',   border: 'border-amber-500/25',    glow: 'tier-gold',       badge: 'bg-amber-500/15 text-amber-400'     },
    diamond:   { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/25',     glow: 'tier-diamond',    badge: 'bg-cyan-500/15 text-cyan-400'       },
    legendary: { bg: 'bg-violet-500/10',  border: 'border-violet-500/25',   glow: 'tier-legendary',  badge: 'bg-violet-500/15 text-violet-400'   },
  };

  const achieved = milestones.filter(m => m.achieved);
  const locked   = milestones.filter(m => !m.achieved);

  // Level ring SVG params
  const ringR = 38;
  const ringCirc = 2 * Math.PI * ringR;
  const ringDash = (progress / 100) * ringCirc;

  return (
    <div className="space-y-4">
      {/* ═══ LEVEL PROGRESSION CARD ═══ */}
      <div className={`glass-prismatic p-5 ${current.glow}`}>
        <div className="flex items-center gap-5">
          {/* Animated Level Ring */}
          <div className="relative flex-shrink-0 level-ring-glow">
            <svg width="88" height="88" viewBox="0 0 88 88" className="rotate-[-90deg]">
              <circle cx="44" cy="44" r={ringR} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
              <circle cx="44" cy="44" r={ringR} fill="none" stroke="url(#levelGrad)" strokeWidth="5"
                strokeDasharray={`${ringDash} ${ringCirc}`} strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.34,1.2,0.64,1)' }} />
              <defs>
                <linearGradient id="levelGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(var(--accent))" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl leading-none">{current.icon}</span>
              <span className="text-[8px] font-black text-foreground/40 mt-0.5">LVL {current.level}</span>
            </div>
          </div>

          {/* Level Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-lg font-black ${current.color}`}>{current.name}</span>
              <span className={`text-[8px] font-black px-2 py-0.5 rounded-full badge-shimmer ${current.bg} ${current.color} border ${current.border}`}>
                LEVEL {current.level}
              </span>
            </div>

            <div className="text-[10px] text-foreground/50 mb-2">
              Recommended: <span className="font-bold text-foreground/70">{current.difficulty}</span>
            </div>

            {/* Progress bar to next level */}
            {next ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-bold text-foreground/30">Progress to {next.name}</span>
                  <span className="text-[9px] font-black text-primary">{progress}%</span>
                </div>
                <div className="h-2 bg-foreground/8 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[8px] text-foreground/25">{count}/{next.minQuizzes} quizzes</span>
                  <span className="text-[8px] text-foreground/15">•</span>
                  <span className="text-[8px] text-foreground/25">{avg}%/{next.minAvg}% avg</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-yellow-400">✨ Maximum level reached!</span>
              </div>
            )}
          </div>
        </div>

        {/* Challenge Card */}
        {next && (
          <div className="mt-4 p-3 rounded-xl bg-foreground/5 border border-foreground/8">
            <div className="flex items-center gap-2">
              <span className="text-base">{next.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-black text-foreground/60 uppercase tracking-wider">Next Challenge</span>
                <p className="text-[11px] text-foreground/80 font-semibold mt-0.5">{current.challenge}</p>
              </div>
              <span className={`text-[9px] font-black px-2 py-1 rounded-lg ${next.bg} ${next.color} border ${next.border}`}>
                {next.name}
              </span>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[
            { v: count, l: 'Quizzes', c: 'text-primary' },
            { v: `${avg}%`, l: 'Average', c: avg >= 70 ? 'text-emerald-400' : avg >= 50 ? 'text-amber-400' : 'text-red-400' },
            { v: `${streak}d`, l: 'Streak', c: 'text-orange-400' },
            { v: `${achievedCount}/${milestones.length}`, l: 'Badges', c: 'text-purple-400' },
          ].map(({ v, l, c }) => (
            <div key={l} className="bg-foreground/5 rounded-xl p-2 text-center border border-foreground/8">
              <div className={`text-sm font-black ${c}`}>{v}</div>
              <div className="text-[7px] text-foreground/30 uppercase tracking-widest mt-0.5">{l}</div>
            </div>
          ))}
        </div>

        {/* All Levels Roadmap */}
        <div className="mt-4">
          <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">Level Roadmap</p>
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1">
            {LEVELS.map((lvl, i) => {
              const isActive = lvl.level === current.level;
              const isPassed = lvl.level < current.level;
              return (
                <div key={i} className="flex items-center flex-shrink-0">
                  <div className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg transition-all ${
                    isActive ? `${lvl.bg} border ${lvl.border}` : isPassed ? 'opacity-60' : 'opacity-25'
                  }`}>
                    <span className={`text-sm ${isActive ? '' : isPassed ? '' : 'grayscale'}`}>{lvl.icon}</span>
                    <span className={`text-[7px] font-black ${isActive ? lvl.color : 'text-foreground/40'}`}>{lvl.level}</span>
                  </div>
                  {i < LEVELS.length - 1 && (
                    <div className={`w-3 h-0.5 rounded-full flex-shrink-0 ${isPassed ? 'bg-primary/40' : 'bg-foreground/8'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ MILESTONES ═══ */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Milestones</p>
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {achievedCount}/{milestones.length}
          </span>
        </div>

        {/* Achieved */}
        {achieved.length > 0 && (
          <div className="mb-3">
            <p className="text-[9px] text-emerald-400/60 uppercase font-bold tracking-widest mb-2">Unlocked ✓</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {achieved.map((m, i) => {
                const style = tierStyle[m.tier] || tierStyle.bronze;
                return (
                  <div key={i} title={m.desc}
                    className={`flex-shrink-0 flex flex-col items-center gap-1.5 p-3 rounded-2xl border w-[80px] transition-all ${style.bg} ${style.border} ${style.glow}`}
                  >
                    <span className="text-2xl leading-none">{m.icon}</span>
                    <span className="text-[9px] font-bold text-center leading-tight text-foreground/80">{m.name}</span>
                    <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full ${style.badge}`}>{m.tier}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Locked */}
        {locked.length > 0 && (
          <div>
            <p className="text-[9px] text-foreground/25 uppercase font-bold tracking-widest mb-2">Locked</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {locked.map((m, i) => (
                <div key={i} title={`Unlock: ${m.desc}`}
                  className="flex-shrink-0 flex flex-col items-center gap-1.5 p-3 rounded-2xl border border-border bg-muted w-[80px]">
                  <span className="text-2xl leading-none grayscale opacity-60">{m.icon}</span>
                  <span className="text-[9px] font-bold text-center leading-tight text-muted-foreground">{m.name}</span>
                  <span className="text-[7px] text-foreground/20">🔒 locked</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
