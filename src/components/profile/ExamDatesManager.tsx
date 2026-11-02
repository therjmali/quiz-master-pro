import { useState } from 'react';
import { Plus, Trash2, Calendar } from 'lucide-react';
import { getExamDates, addExamDate, removeExamDate, ExamDate, getDaysRemaining } from '../../utils/examDates';
import { toast } from 'sonner';

export default function ExamDatesManager() {
  const [exams, setExams] = useState(getExamDates);
  const [showAdd, setShowAdd] = useState(false);
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState('');
  const [target, setTarget] = useState(70);

  const refresh = () => setExams(getExamDates());

  const handleAdd = () => {
    if (!subject.trim() || !date) { toast.error('Fill subject and date'); return; }
    addExamDate({ subject: subject.trim(), date, targetScore: target });
    setSubject(''); setDate(''); setShowAdd(false); refresh();
    toast.success('📅 Exam added!');
  };

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-black text-foreground/40 uppercase tracking-widest flex items-center gap-1.5">
          <Calendar className="w-3 h-3" /> My Exams
        </h3>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs font-bold text-primary active:opacity-70">
          {showAdd ? 'Cancel' : <><Plus className="w-3 h-3 inline" /> Add</>}
        </button>
      </div>
      {showAdd && (
        <div className="space-y-2 mb-3 p-3 bg-card/80 rounded-xl border border-border">
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject…"
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-foreground/30 focus:outline-none focus:border-primary/40" />
          <div className="flex gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none [color-scheme:dark]" />
            <input type="number" value={target} onChange={e => setTarget(+e.target.value)} min={0} max={100}
              placeholder="Target %" className="w-20 bg-muted/30 border border-border rounded-lg px-2 py-2 text-sm text-foreground focus:outline-none" />
          </div>
          <button onClick={handleAdd} className="w-full bg-primary text-primary-foreground text-xs font-bold py-2 rounded-lg active:scale-[0.98]">Save</button>
        </div>
      )}
      {exams.length === 0 ? (
        <p className="text-xs text-foreground/30 text-center py-4">No exams set yet</p>
      ) : (
        <div className="space-y-2">
          {exams.map(e => {
            const days = getDaysRemaining(e.date);
            return (
              <div key={e.id} className="flex items-center gap-3 p-3 bg-card/60 rounded-xl border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{e.subject}</p>
                  <p className="text-[10px] text-foreground/40">{days} days · Target: {e.targetScore || '—'}%</p>
                </div>
                <button onClick={() => { removeExamDate(e.id); refresh(); toast.success('Removed'); }}
                  className="text-foreground/20 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
