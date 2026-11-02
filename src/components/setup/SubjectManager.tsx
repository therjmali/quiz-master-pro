import { useState, useEffect, useMemo } from 'react';
import SearchInput from '../shared/SearchInput';
import { Plus, Pencil, Trash2, Check, X, Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import { getHistorySync } from '../../utils/historyStore';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { getUserSubjects, addUserSubject, deleteUserSubject, renameUserSubject, getSubjectColors, syncSubjectsFromHistory } from '../../utils/subjects';
import { QuizResult } from '../../types/quiz';

interface Props {
  selectedSubject: string;
  onSelect: (subject: string) => void;
}

function getHistory(): QuizResult[] {
  return getHistorySync();
}

export default function SubjectManager({ selectedSubject, onSelect }: Props) {
  const [subjects, setSubjects] = useState<string[]>(() => getUserSubjects());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setSubjects(getUserSubjects());
  }, []);

  // Compute quiz counts and last-used timestamps per subject
  const subjectStats = useMemo(() => {
    const hist = getHistory();
    const counts = new Map<string, number>();
    const lastUsed = new Map<string, number>();
    for (const r of hist) {
      const s = r.subject?.trim();
      if (!s) continue;
      const lower = s.toLowerCase();
      counts.set(lower, (counts.get(lower) || 0) + 1);
      const ts = r.timestamp || 0;
      if (ts > (lastUsed.get(lower) || 0)) lastUsed.set(lower, ts);
    }
    return { counts, lastUsed };
  }, [subjects]); // re-derive when subjects change

  // Sort subjects: most recently used first
  const sortedSubjects = useMemo(() => {
    return [...subjects].sort((a, b) => {
      const tsA = subjectStats.lastUsed.get(a.toLowerCase()) || 0;
      const tsB = subjectStats.lastUsed.get(b.toLowerCase()) || 0;
      return tsB - tsA;
    });
  }, [subjects, subjectStats]);

  // Filter subjects by search
  const filteredSubjects = useMemo(() => {
    if (!search.trim()) return sortedSubjects;
    const q = search.trim().toLowerCase();
    return sortedSubjects.filter(s => s.toLowerCase().includes(q));
  }, [sortedSubjects, search]);

  const handleAdd = () => {
    if (!newName.trim()) return;
    const updated = addUserSubject(newName.trim());
    setSubjects(updated);
    onSelect(newName.trim());
    setNewName('');
    setAdding(false);
    toast.success(`Subject "${newName.trim()}" added`);
  };

  const handleRename = (oldName: string) => {
    const trimmed = editName.trim();
    if (!trimmed) { setEditingIdx(null); return; }
    const updated = renameUserSubject(oldName, trimmed);
    setSubjects(updated);
    if (selectedSubject === oldName) onSelect(trimmed);
    setEditingIdx(null);
    setEditName('');
    toast.success(`Renamed to "${trimmed}"`);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const updated = deleteUserSubject(deleteTarget);
    setSubjects(updated);
    if (selectedSubject === deleteTarget) onSelect('');
    setDeleteTarget(null);
    toast.success(`Deleted "${deleteTarget}"`);
  };

  const startEdit = (idx: number, name: string) => {
    setEditingIdx(idx);
    setEditName(name);
    setAdding(false);
  };

  const handleFromHistory = () => {
    const hist = getHistory();
    const added = syncSubjectsFromHistory(hist);
    setSubjects(getUserSubjects());
    if (added > 0) {
      toast.success(`📥 ${added} new subject${added > 1 ? 's' : ''} added from history!`);
    } else {
      toast('All subjects from history are already in your list ✓');
    }
  };

  const getCount = (subj: string) => subjectStats.counts.get(subj.toLowerCase()) || 0;

  return (
    <>
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border rounded-2xl mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Delete subject?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Delete <strong className="text-foreground font-bold">"{deleteTarget}"</strong>? This does not affect existing quiz history that used this subject.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-500 text-white border-none">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div>
        <label className="block text-[10px] font-black text-foreground/40 mb-2 uppercase tracking-widest">
          Subject / Topic <span className="text-foreground/20 normal-case font-normal">(optional)</span>
        </label>

        {/* Search bar — show when > 6 subjects */}
        {subjects.length > 6 && (
          <SearchInput size="sm" className="mb-2" debounceMs={120} value={search} onChange={setSearch} placeholder="Search subjects…" />
        )}

        {search.trim() && filteredSubjects.length === 0 && (
          <p className="text-[11px] text-foreground/45 mb-2">
            No subjects match “{search.trim()}”.{' '}
            <button type="button" onClick={() => setSearch('')} className="font-bold text-primary hover:underline">Clear</button>
          </p>
        )}
        {/* Subject chips */}
        <div className="flex flex-wrap gap-2 mb-2">
          {/* None / General */}
          {(!search.trim()) && (
            <button
              onClick={() => onSelect('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${!selectedSubject
                ? 'bg-foreground/15 border-foreground/30 text-foreground shadow-sm'
                : 'bg-foreground/5 border-border text-foreground/40 hover:border-foreground/20 hover:text-foreground/60'}`}
            >
              General
            </button>
          )}

          {filteredSubjects.map((subj) => {
            const c = getSubjectColors(subj);
            const isActive = selectedSubject === subj;
            const globalIdx = subjects.indexOf(subj);
            const isEditing = editingIdx === globalIdx;
            const count = getCount(subj);

            if (isEditing) {
              return (
                <div key={subj} className="flex items-center gap-1 bg-foreground/10 border border-foreground/20 rounded-lg px-2 py-1">
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(subj);
                      if (e.key === 'Escape') setEditingIdx(null);
                    }}
                    className="bg-transparent text-xs text-foreground focus:outline-none w-24"
                    maxLength={30}
                  />
                  <button onClick={() => handleRename(subj)} className="text-emerald-400 hover:text-emerald-300">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={() => setEditingIdx(null)} className="text-foreground/40 hover:text-foreground/60">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            }

            return (
              <div key={subj} className={`flex items-center gap-1 rounded-lg border transition-all ${isActive ? `${c.chip} scale-105` : 'bg-foreground/5 border-border'}`}>
                <button
                  onClick={() => onSelect(subj)}
                  className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 ${isActive ? '' : 'text-foreground/50 hover:text-foreground'}`}
                >
                  {subj}
                  {count > 0 && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none ${isActive ? 'bg-foreground/15 text-foreground/70' : 'bg-foreground/8 text-foreground/30'}`}>
                      {count}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => startEdit(globalIdx, subj)}
                  title="Rename"
                  className="text-foreground/20 hover:text-blue-400 pr-1 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setDeleteTarget(subj)}
                  title="Delete"
                  className="text-foreground/20 hover:text-red-400 pr-1.5 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* From History chip */}
          <button
            onClick={handleFromHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-emerald-500/25 text-emerald-400/60 hover:border-emerald-400/50 hover:text-emerald-400 transition-all"
          >
            <Download className="w-3 h-3" /> From History
          </button>

          {/* Add button */}
          {adding ? (
            <div className="flex items-center gap-1 bg-card border border-blue-500/40 rounded-lg px-2 py-1">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAdd();
                  if (e.key === 'Escape') { setAdding(false); setNewName(''); }
                }}
                placeholder="Subject name…"
                className="bg-transparent text-xs text-foreground placeholder-foreground/30 focus:outline-none w-28"
                maxLength={30}
              />
              <button onClick={handleAdd} className="text-emerald-400 hover:text-emerald-300">
                <Check className="w-3 h-3" />
              </button>
              <button onClick={() => { setAdding(false); setNewName(''); }} className="text-foreground/40 hover:text-foreground/60">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setAdding(true); setEditingIdx(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-foreground/20 text-foreground/40 hover:border-blue-400/50 hover:text-blue-400 transition-all"
            >
              <Plus className="w-3 h-3" /> Add Subject
            </button>
          )}
        </div>

        {subjects.length === 0 && !adding && (
          <p className="text-[10px] text-foreground/25 mt-1">No subjects yet — click <strong className="text-foreground/40">+ Add Subject</strong> or <strong className="text-emerald-400/50">📥 From History</strong></p>
        )}
      </div>
    </>
  );
}
