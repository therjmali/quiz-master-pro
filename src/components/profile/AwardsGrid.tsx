import { memo } from 'react';
import { QuizResult } from '../../types/quiz';
import { getChallengeStreak } from '../../utils/dailyChallenge';

interface Props { history: QuizResult[]; }

const AWARDS = [
  { id: 'first',      icon: '🎯', title: 'First Steps',    desc: 'Complete your first quiz',              check: (h: QuizResult[]) => h.length >= 1 },
  { id: 'onfire',     icon: '🔥', title: 'On Fire',        desc: 'Complete 5 quizzes',                    check: (h: QuizResult[]) => h.length >= 5 },
  { id: 'diamond',    icon: '💎', title: 'Diamond Learner',desc: 'Complete 10 quizzes',                   check: (h: QuizResult[]) => h.length >= 10 },
  { id: 'perfect',    icon: '🏆', title: 'Perfect Score',  desc: 'Score 100% on any quiz',                check: (h: QuizResult[]) => h.some(r => r.percentage === 100) },
  { id: 'highach',    icon: '⭐', title: 'High Achiever',  desc: 'Avg accuracy above 80%',                check: (h: QuizResult[]) => { if (h.length < 3) return false; return h.reduce((a, r) => a + r.accuracy, 0) / h.length >= 80; } },
  { id: 'consistent', icon: '📅', title: 'Consistent',     desc: '3-day quiz streak',                     check: (h: QuizResult[]) => { const days = new Set(h.map(r => { const d = new Date(r.timestamp); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })); return days.size >= 3; } },
  { id: 'fifty',      icon: '🏅', title: 'Fifty Right',    desc: 'Get 50 correct answers total',          check: (h: QuizResult[]) => h.reduce((a, r) => a + r.correct, 0) >= 50 },
  { id: 'speed',      icon: '⚡', title: 'Speed Demon',    desc: 'Finish a quiz under 30s with >50%',     check: (h: QuizResult[]) => h.some(r => r.timeTaken < 30 && r.percentage >= 50) },
  { id: 'challenge7', icon: '🏆', title: 'Weekly Warrior', desc: '7-day daily challenge streak',           check: () => getChallengeStreak() >= 7 },
  { id: 'challenge30',icon: '👑', title: 'Challenge King', desc: '30-day daily challenge streak',          check: () => getChallengeStreak() >= 30 },
];

const AwardsGrid = memo(function AwardsGrid({ history }: Props) {
  const unlocked = AWARDS.filter(a => a.check(history)).length;
  return (
    <div>
      <div className="flex justify-between items-center mb-5 pb-4 border-b border-border">
        <h3 className="text-sm font-bold uppercase tracking-widest text-amber-500 flex items-center gap-2">🏅 Achievements</h3>
        <span className="text-amber-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-amber-500/30 bg-amber-500/10">
          {unlocked}/{AWARDS.length} unlocked
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {AWARDS.map(award => {
          const isUnlocked = award.check(history);
          return (
            <div key={award.id}
              className={`flex flex-col items-center text-center p-4 rounded-2xl border transition-all ${
                isUnlocked
                  ? 'bg-primary/15 border-primary/30 shadow-sm shadow-primary/10'
                  : 'bg-muted border-border'
              }`}>
              <div className={`text-4xl mb-3 drop-shadow-lg ${isUnlocked ? '' : 'grayscale opacity-60'}`}>{award.icon}</div>
              <div className={`text-sm font-bold mb-1 ${isUnlocked ? 'text-foreground' : 'text-muted-foreground'}`}>{award.title}</div>
              <div className={`text-[10px] mb-3 leading-relaxed ${isUnlocked ? 'text-foreground/60' : 'text-muted-foreground/70'}`}>{award.desc}</div>
              <div className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${
                isUnlocked
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : 'text-muted-foreground border border-border bg-muted'
              }`}>
                {isUnlocked ? '✓ Unlocked' : '🔒 Locked'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
export default AwardsGrid;
