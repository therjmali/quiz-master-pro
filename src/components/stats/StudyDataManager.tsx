import { useState, useMemo } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Check, BookOpen, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Subject, Unit, SubTopic, DailyLog } from '../../types/studyTracker';
import { SUBJECT_COLORS, DIFFICULTY_COLORS, MOOD_EMOJI, MOOD_LIST } from '../../types/studyTracker';
import {
  getSubjects, setSubjects, addSubject, deleteSubject, addUnit, addSubTopic, updateSubTopic,
  getDailyLogs, upsertDailyLog, uid,
} from '../../utils/studyTrackerStore';
import { fmtDate } from '../../utils/studyAnalytics';

interface Props { onDataChanged: () => void; }

export default function StudyDataManager({ onDataChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [subjects, setLocalSubjects] = useState(() => getSubjects());
  const [logs, setLocalLogs] = useState(() => getDailyLogs());
  const [expandedSubj, setExpandedSubj] = useState<string | null>(null);
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjShort, setNewSubjShort] = useState('');
  const [addingUnit, setAddingUnit] = useState<string | null>(null);
  const [newUnitName, setNewUnitName] = useState('');
  const [addingTopic, setAddingTopic] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicDiff, setNewTopicDiff] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [newTopicTime, setNewTopicTime] = useState(30);

  // Daily log form
  const [logDate, setLogDate] = useState(fmtDate(new Date()));
  const [logHours, setLogHours] = useState(0);
  const [logMood, setLogMood] = useState<string>('');
  const [logNote, setLogNote] = useState('');

  const refresh = () => {
    setLocalSubjects(getSubjects());
    setLocalLogs(getDailyLogs());
    onDataChanged();
  };

  const handleAddSubject = () => {
    if (!newSubjName.trim()) return;
    const colorIdx = subjects.length % SUBJECT_COLORS.length;
    addSubject({
      id: uid(), name: newSubjName.trim(),
      shortName: newSubjShort.trim() || newSubjName.trim().slice(0, 3).toUpperCase(),
      color: SUBJECT_COLORS[colorIdx], units: [],
    });
    setNewSubjName(''); setNewSubjShort(''); setAddingSubject(false);
    refresh();
    toast.success('Subject added ✓');
  };

  const handleDeleteSubject = (id: string) => {
    deleteSubject(id); refresh();
    toast.success('Subject deleted');
  };

  const handleAddUnit = (subjId: string) => {
    if (!newUnitName.trim()) return;
    addUnit(subjId, { id: uid(), name: newUnitName.trim(), subTopics: [] });
    setNewUnitName(''); setAddingUnit(null);
    refresh();
    toast.success('Unit added ✓');
  };

  const handleAddTopic = (subjId: string, unitId: string) => {
    if (!newTopicName.trim()) return;
    addSubTopic(subjId, unitId, {
      id: uid(), name: newTopicName.trim(), completed: false,
      status: 'incomplete', difficulty: newTopicDiff,
      timeSpent: newTopicTime, important: false,
    });
    setNewTopicName(''); setAddingTopic(null);
    refresh();
    toast.success('Topic added ✓');
  };

  const handleMarkComplete = (subjId: string, unitId: string, topicId: string) => {
    const now = new Date();
    updateSubTopic(subjId, unitId, topicId, {
      completed: true, status: 'complete',
      completedDate: fmtDate(now),
      completedTime: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
    });
    refresh();
    toast.success('Topic completed! 🎉');
  };

  const handleMarkInProcess = (subjId: string, unitId: string, topicId: string) => {
    updateSubTopic(subjId, unitId, topicId, { status: 'in_process' });
    refresh();
  };

  const handleSaveLog = () => {
    upsertDailyLog({
      date: logDate,
      hoursStudied: logHours,
      topicsCompleted: 0,
      mood: logMood as any || undefined,
      notes: logNote || undefined,
      sessions: [],
    });
    refresh();
    toast.success('Daily log saved ✓');
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 transition-all active:scale-[0.99]">
        <span className="text-xs font-black text-foreground/60 uppercase tracking-widest flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5" /> Manage Study Data
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-foreground/30" />
      </button>
    );
  }

  return (
    <div className="glass-card p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-foreground flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" /> Study Data Manager
        </h3>
        <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground/30">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Subjects */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Subjects</p>
          <button onClick={() => setAddingSubject(true)}
            className="text-[10px] font-bold text-primary flex items-center gap-0.5 transition-all active:scale-95">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        {addingSubject && (
          <div className="flex gap-2 items-end animate-fade-in">
            <input value={newSubjName} onChange={e => setNewSubjName(e.target.value)} placeholder="Subject name"
              className="flex-1 bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50" />
            <input value={newSubjShort} onChange={e => setNewSubjShort(e.target.value)} placeholder="Short" maxLength={4}
              className="w-16 bg-foreground/5 border border-border rounded-lg px-2 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50" />
            <button onClick={handleAddSubject} className="p-2 rounded-lg bg-primary text-primary-foreground active:scale-95"><Check className="w-4 h-4" /></button>
            <button onClick={() => setAddingSubject(false)} className="p-2 rounded-lg bg-foreground/5 text-foreground/40 active:scale-95"><X className="w-4 h-4" /></button>
          </div>
        )}

        {subjects.map(s => (
          <div key={s.id} className="border border-border rounded-xl overflow-hidden">
            <button onClick={() => setExpandedSubj(expandedSubj === s.id ? null : s.id)}
              className="w-full flex items-center gap-2 p-3 text-left hover:bg-foreground/[0.03] transition-colors">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-xs font-bold text-foreground flex-1">{s.name}</span>
              <span className="text-[9px] text-foreground/30">{s.units.reduce((a, u) => a + u.subTopics.length, 0)} topics</span>
              <button onClick={e => { e.stopPropagation(); handleDeleteSubject(s.id); }}
                className="p-1 rounded hover:bg-destructive/10 text-foreground/20 hover:text-destructive transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
              {expandedSubj === s.id ? <ChevronUp className="w-3 h-3 text-foreground/20" /> : <ChevronDown className="w-3 h-3 text-foreground/20" />}
            </button>

            {expandedSubj === s.id && (
              <div className="px-3 pb-3 space-y-2 border-t border-border pt-2 animate-fade-in">
                {s.units.map(u => (
                  <div key={u.id} className="space-y-1">
                    <button onClick={() => setExpandedUnit(expandedUnit === u.id ? null : u.id)}
                      className="text-[11px] font-bold text-foreground/60 flex items-center gap-1 w-full text-left">
                      {expandedUnit === u.id ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                      {u.name} ({u.subTopics.length})
                    </button>

                    {expandedUnit === u.id && (
                      <div className="pl-4 space-y-1 animate-fade-in">
                        {u.subTopics.map(t => (
                          <div key={t.id} className="flex items-center gap-2 py-1">
                            {t.status === 'complete' ? (
                              <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center"><Check className="w-2.5 h-2.5 text-emerald-400" /></span>
                            ) : (
                              <button onClick={() => handleMarkComplete(s.id, u.id, t.id)}
                                className="w-4 h-4 rounded-full border border-foreground/15 hover:border-emerald-500/50 transition-colors" />
                            )}
                            <span className={`text-[11px] flex-1 ${t.status === 'complete' ? 'text-foreground/40 line-through' : 'text-foreground/70'}`}>{t.name}</span>
                            <span className={`text-[8px] font-black px-1 py-0.5 rounded ${DIFFICULTY_COLORS[t.difficulty].bg} ${DIFFICULTY_COLORS[t.difficulty].text}`}>
                              {t.difficulty[0]}
                            </span>
                            {t.status !== 'complete' && t.status !== 'in_process' && (
                              <button onClick={() => handleMarkInProcess(s.id, u.id, t.id)}
                                className="text-[8px] font-bold text-amber-400/60 hover:text-amber-400">WIP</button>
                            )}
                          </div>
                        ))}

                        {addingTopic === u.id ? (
                          <div className="flex gap-1.5 items-center animate-fade-in">
                            <input value={newTopicName} onChange={e => setNewTopicName(e.target.value)} placeholder="Topic name"
                              className="flex-1 bg-foreground/5 border border-border rounded-lg px-2 py-1.5 text-[11px] text-foreground focus:outline-none" />
                            <select value={newTopicDiff} onChange={e => setNewTopicDiff(e.target.value as any)}
                              className="bg-foreground/5 border border-border rounded-lg px-1.5 py-1.5 text-[10px] text-foreground">
                              <option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Hard">Hard</option>
                            </select>
                            <input type="number" value={newTopicTime} onChange={e => setNewTopicTime(Number(e.target.value))} placeholder="min"
                              className="w-12 bg-foreground/5 border border-border rounded-lg px-1.5 py-1.5 text-[10px] text-foreground text-center focus:outline-none" />
                            <button onClick={() => handleAddTopic(s.id, u.id)} className="p-1 rounded bg-primary text-primary-foreground active:scale-95"><Check className="w-3 h-3" /></button>
                            <button onClick={() => setAddingTopic(null)} className="p-1 rounded bg-foreground/5 text-foreground/40"><X className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <button onClick={() => setAddingTopic(u.id)}
                            className="text-[10px] font-bold text-primary/60 flex items-center gap-0.5 mt-1 active:scale-95">
                            <Plus className="w-2.5 h-2.5" /> Topic
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {addingUnit === s.id ? (
                  <div className="flex gap-2 animate-fade-in">
                    <input value={newUnitName} onChange={e => setNewUnitName(e.target.value)} placeholder="Unit name"
                      className="flex-1 bg-foreground/5 border border-border rounded-lg px-2 py-1.5 text-[11px] text-foreground focus:outline-none" />
                    <button onClick={() => handleAddUnit(s.id)} className="p-1 rounded bg-primary text-primary-foreground active:scale-95"><Check className="w-3 h-3" /></button>
                    <button onClick={() => setAddingUnit(null)} className="p-1 rounded bg-foreground/5 text-foreground/40"><X className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <button onClick={() => setAddingUnit(s.id)}
                    className="text-[10px] font-bold text-primary/60 flex items-center gap-0.5 mt-1 active:scale-95">
                    <Plus className="w-2.5 h-2.5" /> Unit
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {subjects.length === 0 && !addingSubject && (
          <p className="text-[11px] text-foreground/30 text-center py-3">No subjects yet — add one to get started</p>
        )}
      </div>

      {/* Daily Log */}
      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">📝 Daily Log</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] text-foreground/30 uppercase">Date</label>
            <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
              className="w-full bg-foreground/5 border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none" />
          </div>
          <div>
            <label className="text-[9px] text-foreground/30 uppercase">Hours Studied</label>
            <input type="number" value={logHours} onChange={e => setLogHours(Number(e.target.value))} min={0} step={0.5}
              className="w-full bg-foreground/5 border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="text-[9px] text-foreground/30 uppercase mb-1 block">Mood</label>
          <div className="flex gap-2">
            {MOOD_LIST.map(m => (
              <button key={m} onClick={() => setLogMood(logMood === m ? '' : m)}
                className={`text-lg p-1.5 rounded-lg border transition-all active:scale-90 ${logMood === m ? 'bg-primary/15 border-primary/30 scale-110' : 'bg-foreground/5 border-border'}`}>
                {MOOD_EMOJI[m]}
              </button>
            ))}
          </div>
        </div>
        <textarea value={logNote} onChange={e => setLogNote(e.target.value)} placeholder="Notes..."
          className="w-full bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/20 resize-none focus:outline-none" rows={2} />
        <button onClick={handleSaveLog}
          className="w-full py-2.5 rounded-xl bg-primary/15 border border-primary/25 text-primary text-xs font-bold transition-all active:scale-95 hover:bg-primary/25">
          Save Daily Log
        </button>
      </div>
    </div>
  );
}
