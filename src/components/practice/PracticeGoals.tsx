import { useState, useMemo } from 'react';
import { Flame, Target, Minus, Plus, Check } from 'lucide-react';
import { QuizResult } from '../../types/quiz';
import { getPracticeGoal, setPracticeGoal, getWeeklyPracticeCount } from '../../utils/practiceUtils';
import { calculateStreak } from '../../utils/scoring';

interface Props {
  history: QuizResult[];
}

function GoalRing({ progress, size = 64 }: { progress: number; size?: number }) {
  const R = (size - 10) / 2;
  const C = 2 * Math.PI * R;
  const fill = Math.min(progress, 1) * C;
  const color = progress >= 1 ? '#22C55E' : '#F59E0B';

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="currentColor" className="text-amber-500/10" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${fill} ${C}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {progress >= 1
          ? <Check className="w-5 h-5 text-emerald-400" />
          : <span className="text-sm font-black text-amber-400">{Math.round(progress * 100)}%</span>
        }
      </div>
    </div>
  );
}

export default function PracticeGoals({ history }: Props) {
  const [goal, setGoal] = useState(() => getPracticeGoal());
  const [editing, setEditing] = useState(false);

  const weeklyCount = useMemo(() => getWeeklyPracticeCount(history), [history]);
  const practiceHistory = useMemo(() => history.filter(r => r.attemptType === 'practice'), [history]);
  const practiceStreak = useMemo(() => calculateStreak(practiceHistory.map(r => r.timestamp)), [practiceHistory]);

  const progress = goal.weeklyTarget > 0 ? weeklyCount / goal.weeklyTarget : 0;
  const isComplete = weeklyCount >= goal.weeklyTarget;

  const adjustGoal = (delta: number) => {
    const newTarget = Math.max(1, Math.min(50, goal.weeklyTarget + delta));
    setGoal({ ...goal, weeklyTarget: newTarget });
    setPracticeGoal(newTarget);
  };

  return (
    <div className="glass-card p-4 border-amber-500/10">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Weekly Practice Goal</p>
        <button
          onClick={() => setEditing(e => !e)}
          className="text-[9px] font-bold text-amber-400/60 hover:text-amber-400 transition-colors"
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      <div className="flex items-center gap-4">
        <GoalRing progress={progress} />
        <div className="flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-black leading-none ${isComplete ? 'text-emerald-400' : 'text-amber-400'}`}>
              {weeklyCount}
            </span>
            <span className="text-sm text-foreground/30 font-bold">/ {goal.weeklyTarget}</span>
          </div>
          <p className="text-[10px] text-foreground/40 mt-0.5">
            {isComplete ? '🎉 Goal complete this week!' : `${goal.weeklyTarget - weeklyCount} more to go`}
          </p>

          {/* Practice Streak */}
          <div className="flex items-center gap-1.5 mt-2">
            <Flame className={`w-3.5 h-3.5 ${practiceStreak > 0 ? 'text-orange-400' : 'text-foreground/20'}`} />
            <span className={`text-[11px] font-black ${practiceStreak > 0 ? 'text-orange-400' : 'text-foreground/20'}`}>
              {practiceStreak > 0 ? `${practiceStreak}-day practice streak` : 'No practice streak'}
            </span>
          </div>
        </div>
      </div>

      {/* Goal adjuster */}
      {editing && (
        <div className="flex items-center justify-center gap-3 mt-4 pt-3 border-t border-amber-500/10 animate-fade-in">
          <span className="text-[10px] text-foreground/40 font-bold">Target:</span>
          <button
            onClick={() => adjustGoal(-1)}
            className="w-8 h-8 rounded-lg bg-foreground/5 border border-border flex items-center justify-center hover:bg-foreground/10 transition-colors active:scale-95"
          >
            <Minus className="w-3.5 h-3.5 text-foreground/50" />
          </button>
          <span className="text-lg font-black text-amber-400 w-8 text-center">{goal.weeklyTarget}</span>
          <button
            onClick={() => adjustGoal(1)}
            className="w-8 h-8 rounded-lg bg-foreground/5 border border-border flex items-center justify-center hover:bg-foreground/10 transition-colors active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 text-foreground/50" />
          </button>
          <span className="text-[10px] text-foreground/30 font-bold">per week</span>
        </div>
      )}
    </div>
  );
}
