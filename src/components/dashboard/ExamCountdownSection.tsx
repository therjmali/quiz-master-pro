import { useState } from 'react';
import { Plus, X, Calendar } from 'lucide-react';
import { getUpcomingExams, addExamDate, removeExamDate, ExamDate } from '../../utils/examDates';
import { QuizResult } from '../../types/quiz';

export default function ExamCountdownSection({ history }: { history: QuizResult[] }) {
  const [exams, setExams] = useState(getUpcomingExams);
  const [showAdd, setShowAdd] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTarget, setNewTarget] = useState(70);

  const refresh = () => setExams(getUpcomingExams());

  const handleAdd = () => {
    if (!newSubject.trim() || !newDate) return;
    addExamDate({ subject: newSubject.trim(), date: newDate, targetScore: newTarget });
    setNewSubject(''); setNewDate(''); setShowAdd(false); refresh();
  };

  const handleDelete = (id: string) => { removeExamDate(id); refresh(); };

  const getColor = (days: number) =>
    days < 3 ? 'border-red-500/40 bg-red-500/10' :
    days < 7 ? 'border-red-500/30 bg-red-500/8' :
    days <= 14 ? 'border-amber-500/30 bg-amber-500/8' :
    'border-emerald-500/20 bg-emerald-500/8';

  const getTextColor = (days: number) =>
    days < 7 ? 'text-red-400' : days <= 14 ? 'text-amber-400' : 'text-emerald-400';

  if (exams.length === 0 && !showAdd) {
    return (
      <button onClick={() => setShowAdd(true)}
        className="w-full flex items-center gap-3 bg-card/60 border border-dashed border-border hover:border-primary/30 rounded-2xl p-4 transition-all text-left">
        <Calendar className="w-5 h-5 text-foreground/20" />
        <span className="text-sm text-foreground/30">📅 Set your exam dates to see countdowns here</span>
        <Plus className="w-4 h-4 text-foreground/20 ml-auto" />
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[11px] font-black text-foreground/40 uppercase tracking-[0.12em]">📅 Exam Countdown</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="text-[10px] font-bold text-primary active:opacity-70">
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>
      {showAdd && (
        <div className="glass-card p-4 space-y-3 animate-fade-in">
          <input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Subject name…"
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-foreground/30 focus:outline-none focus:border-primary/40" />
          <div className="flex gap-2">
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
              className="flex-1 bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/40 [color-scheme:dark]" />
            <input type="number" value={newTarget} onChange={e => setNewTarget(+e.target.value)} min={0} max={100} placeholder="Target %"
              className="w-24 bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/40" />
          </div>
          <button onClick={handleAdd} className="w-full bg-primary text-primary-foreground text-sm font-bold py-2.5 rounded-xl active:scale-[0.98] transition-all">
            Save Exam
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {exams.map(e => {
          const quizzesForSubject = history.filter(r => r.subject === e.subject && Date.now() - r.timestamp < e.daysLeft * 86400000).length;
          const progressPct = Math.min(100, Math.round((quizzesForSubject / Math.max(e.daysLeft, 1)) * 100));
          return (
            <div key={e.id} className={`relative rounded-2xl border p-4 ${getColor(e.daysLeft)} ${e.daysLeft < 3 ? 'animate-pulse' : ''}`}>
              <button onClick={() => handleDelete(e.id)} className="absolute top-2 right-2 text-foreground/20 hover:text-foreground/60">
                <X className="w-3.5 h-3.5" />
              </button>
              <p className="text-xs font-bold text-foreground/60 truncate">{e.subject}</p>
              <p className={`text-2xl font-black mt-1 ${getTextColor(e.daysLeft)}`}>
                {e.daysLeft}<span className="text-sm ml-1">days</span>
              </p>
              <div className="mt-2 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                <div className="h-full bg-primary/50 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="text-[9px] text-foreground/30 mt-1">{quizzesForSubject} quizzes · {e.targetScore ? `Target: ${e.targetScore}%` : ''}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
