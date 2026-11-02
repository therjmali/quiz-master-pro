import { useState, useEffect, useRef } from 'react';
import { QuizResult, QuizQuestion } from '../../types/quiz';
import { generateDailyChallenge, submitChallengeAnswer, isChallengeCompletedToday, getChallengeStreak, loadChallenge } from '../../utils/dailyChallenge';
import { hapticSuccess, hapticError } from '../../utils/haptics';
import { toast } from 'sonner';

export default function DailyChallengeCard({ history }: { history: QuizResult[] }) {
  const [state, setState] = useState(loadChallenge);
  const [showQuiz, setShowQuiz] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [timer, setTimer] = useState(30);
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (history.length < 2) return;
    setState(generateDailyChallenge(history));
  }, [history]);

  useEffect(() => {
    if (!showQuiz || revealed) return;
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) { clearInterval(timerRef.current); handleTimeout(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [showQuiz, revealed]); // eslint-disable-line

  const handleTimeout = () => {
    if (!revealed) { setRevealed(true); toast("⏰ Time's up!"); }
  };

  const handleAnswer = (ans: string) => {
    if (revealed || selected) return;
    setSelected(ans);
    setRevealed(true);
    clearInterval(timerRef.current);
    const updated = submitChallengeAnswer(ans);
    setState(updated);
    if (updated.todayResult?.correct) { hapticSuccess(); toast.success('🎉 Correct!'); }
    else { hapticError(); toast.error('❌ Wrong answer'); }
  };

  const q = state.todayQuestion;
  const completed = isChallengeCompletedToday();
  const streak = getChallengeStreak();

  if (!q || history.length < 2) return null;

  if (completed && state.todayResult) {
    return (
      <div className="glass-card p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-emerald-500/5 pointer-events-none" />
        <div className="flex items-center gap-3">
          <span className="text-2xl">{state.todayResult.correct ? '✅' : '❌'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-foreground">Today's Challenge {state.todayResult.correct ? 'Complete!' : 'Attempted'}</p>
            <p className="text-[10px] text-foreground/40 mt-0.5">🔥 Challenge Streak: {streak} day{streak !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <span className="text-lg font-black text-amber-400">🏆 {streak}</span>
          </div>
        </div>
      </div>
    );
  }

  if (showQuiz) {
    const opts = q.shuffledOpts || q.options;
    return (
      <div className="glass-card p-5 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">🏆 Daily Challenge</span>
          <div className={`text-sm font-mono font-black tabular-nums ${timer <= 10 ? 'text-red-400 animate-pulse' : 'text-foreground/50'}`}>
            {timer}s
          </div>
        </div>
        <p className="text-sm font-bold text-foreground leading-relaxed">{q.question}</p>
        <div className="space-y-2">
          {opts.map((opt, i) => {
            let cls = 'bg-card border-border hover:border-primary/30';
            if (revealed) {
              if (opt === q.correctAnswer) cls = 'bg-emerald-500/15 border-emerald-500/30';
              else if (opt === selected) cls = 'bg-red-500/15 border-red-500/30';
              else cls = 'bg-card border-border opacity-40';
            }
            return (
              <button key={i} onClick={() => handleAnswer(opt)} disabled={revealed}
                className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border text-sm transition-all ${cls}`}>
                <span className="w-7 h-7 rounded-full border-2 border-foreground/15 flex items-center justify-center text-xs font-bold text-foreground/40 flex-shrink-0">
                  {String.fromCharCode(97 + i)}
                </span>
                <span className="text-foreground/80">{opt}</span>
              </button>
            );
          })}
        </div>
        {revealed && (
          <div className="flex items-center gap-2 text-xs text-foreground/40 pt-2 border-t border-border">
            <span>✓ {q.correctAnswer}</span>
            {q.rationale && <span className="text-foreground/25">— {q.rationale.slice(0, 80)}…</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="glass-card p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 pointer-events-none" />
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <span className="text-lg">🏆</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-foreground">Daily Challenge</p>
          <p className="text-[10px] text-foreground/40 line-clamp-1 mt-0.5">{q.question}</p>
        </div>
        <button onClick={() => { setShowQuiz(true); setTimer(30); setSelected(null); setRevealed(false); }}
          className="flex-shrink-0 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-bold px-4 py-2.5 rounded-xl border border-amber-500/25 transition-all active:scale-95">
          Take Challenge →
        </button>
      </div>
      {streak > 0 && (
        <p className="text-[9px] text-foreground/25 mt-2 ml-14">🔥 {streak} day streak</p>
      )}
    </div>
  );
}
