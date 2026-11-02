import React, { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { Trash2, Pencil, FolderPlus, Layers, Sparkles, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { QuizResult } from '../../types/quiz';
import { getHistorySync, setHistory } from '../../utils/historyStore';
import { clearAllLocalData } from '../../utils/dataReset';
import { useAuth } from 'zitejs/auth';
import FolderPickerSheet from '../shared/FolderPickerSheet';
import { formatTime, calculateStreak } from '../../utils/scoring';
import { studyStrategy } from 'zitejs/api';
import AiRationaleText from '../AiRationaleText';
import { getSubjectColors } from '../../utils/subjects';
import { useHistoryFilters } from '../../hooks/useHistoryFilters';
import HistoryFilterBar from './HistoryFilterBar';
import StreakHeatmap from './StreakHeatmap';

type DiffFilter = 'all' | 'easy' | 'medium' | 'hard';

interface Props {
  history: QuizResult[];
  filteredHistory: QuizResult[];
  onViewResult: (r: QuizResult) => void;
  onDeleteHistory: (id: string) => void;
  subjectFilter?: string;
  difficultyFilter?: DiffFilter;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 text-xs shadow-xl">
      <p className="text-foreground/50 mb-1 font-bold">Quiz #{payload[0]?.payload?.i}</p>
      <p className="text-primary font-bold">Score: {payload[0]?.value}%</p>
      {payload[1] && <p className="text-emerald-500 font-bold">Accuracy: {payload[1]?.value}%</p>}
    </div>
  );
}

/** Mini SVG circular progress indicator — always clamp to 0-100 */
function ScoreCircle({ pct: rawPct, size = 44 }: { pct: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(rawPct)));
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (circ * pct) / 100;
  const color = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={3} fill="none" className="text-foreground/8" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={3} fill="none"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          className="transition-all duration-500" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-black" style={{ color }}>{pct}%</span>
      </div>
    </div>
  );
}

/** Enhanced recent quiz list with % circle, edit button, save-to-collection */
function RecentQuizList({ quizzes, onViewResult, onDeleteHistory }: {
  quizzes: QuizResult[];
  onViewResult: (r: QuizResult) => void;
  onDeleteHistory: (id: string) => void;
}) {
  const [editTarget, setEditTarget] = useState<QuizResult | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [saveColTarget, setSaveColTarget] = useState<QuizResult | null>(null);

  const openEdit = (r: QuizResult) => {
    setEditTarget(r);
    setEditTitle(r.quizTitle || '');
    setEditSubject(r.subject || '');
    const d = new Date(r.timestamp);
    setEditDate(d.toISOString().split('T')[0]);
    setEditTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  };

  const saveEdit = () => {
    if (!editTarget) return;
    let newTimestamp = editTarget.timestamp;
    try {
      if (editDate) {
        const [y, m, d] = editDate.split('-').map(Number);
        const [hh, mm] = (editTime || '00:00').split(':').map(Number);
        const dt = new Date(y, m - 1, d, hh || 0, mm || 0);
        if (!isNaN(dt.getTime())) newTimestamp = dt.getTime();
      }
    } catch { /* keep original */ }

    try {
      const all: QuizResult[] = getHistorySync();
      if (all.length) {
        const idx = all.findIndex(r => (r.id || String(r.timestamp)) === (editTarget.id || String(editTarget.timestamp)));
        if (idx !== -1) {
          all[idx] = { ...all[idx], quizTitle: editTitle.trim() || undefined, subject: editSubject.trim() || undefined, timestamp: newTimestamp };
          all.sort((a, b) => b.timestamp - a.timestamp);
          setHistory(all);
          toast.success('Quiz details updated ✓');
        }
      }
    } catch {}
    setEditTarget(null);
  };

  // Save to folder handled by FolderPickerSheet

  return (
    <>
      <Dialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)}>
        <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-sm mx-4">
          <DialogHeader><DialogTitle className="text-foreground font-bold">Edit Quiz Details</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-bold text-foreground/50 mb-1 block">Quiz Title</label>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value.slice(0, 60))} placeholder="Enter quiz title…"
                className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-foreground/25 focus:outline-none focus:border-primary/40" />
            </div>
            <div>
              <label className="text-xs font-bold text-foreground/50 mb-1 block">Subject</label>
              <input value={editSubject} onChange={e => setEditSubject(e.target.value.slice(0, 30))} placeholder="Enter subject…"
                className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-foreground/25 focus:outline-none focus:border-primary/40" />
            </div>
            <div>
              <label className="text-xs font-bold text-foreground/50 mb-1 block">📅 Attempt Date & Time</label>
              <div className="flex gap-2">
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                  className="flex-1 bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/40 [color-scheme:dark]" />
                <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
                  className="w-28 bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/40 [color-scheme:dark]" />
              </div>
              <p className="text-[10px] text-foreground/30 mt-1">Change when this quiz was attempted</p>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditTarget(null)} className="text-sm font-bold px-4 py-2 rounded-xl border border-border text-foreground/50">Cancel</button>
            <button onClick={saveEdit} className="text-sm font-bold px-4 py-2 rounded-xl bg-primary text-primary-foreground">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {saveColTarget && (
        <FolderPickerSheet
          open={!!saveColTarget}
          onClose={() => setSaveColTarget(null)}
          questions={saveColTarget.quizData}
          defaultName={saveColTarget.quizTitle || ''}
          tags={saveColTarget.subject ? [saveColTarget.subject] : []}
          sourceResultId={saveColTarget.id}
          sourceTimestamp={saveColTarget.timestamp}
        />
      )}

      <div className="space-y-3 max-h-[480px] overflow-y-auto thin-scrollbar pr-1">
        {quizzes.map((r, i) => {
          const pct = r.maxScore > 0 ? Math.max(0, Math.min(100, Math.round(((r.netScore ?? r.score ?? 0) / r.maxScore) * 100))) : r.percentage;
          const dDate = new Date(r.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          const preview = r.quizTitle || r.quizData?.[0]?.question?.substring(0, 55);
          const isTitle = !!r.quizTitle;
          const subjectColors = r.subject ? getSubjectColors(r.subject) : null;
          return (
            <div key={r.id || i}
              className="bg-foreground/4 hover:bg-foreground/8 p-4 rounded-xl border border-border transition-all group">
              <div className="flex items-center gap-3">
                <button onClick={() => onViewResult(r)} title="View quiz analysis" className="flex-shrink-0 hover:scale-110 transition-transform">
                  <ScoreCircle pct={pct} />
                </button>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onViewResult(r)}>
                  <p className={`text-sm font-bold truncate group-hover:text-primary transition-colors ${isTitle ? 'text-foreground' : 'text-foreground/70'}`}>
                    {isTitle ? preview : `Q: ${preview}…`}
                  </p>
                  <div className="flex items-center flex-wrap gap-1.5 mt-1">
                    <span className="text-[10px] text-emerald-500 font-bold">✓{r.correct}</span>
                    <span className="text-[10px] text-red-500 font-bold">✗{r.wrong}</span>
                    <span className="text-[10px] text-amber-500 font-bold">⏭{r.skipped}</span>
                    {r.subject && subjectColors && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${subjectColors.badge}`}>{r.subject}</span>
                    )}
                    <span className="text-[10px] text-foreground/30 hidden sm:inline">· {formatTime(r.timeTaken)}</span>
                  </div>
                  {r.passMark !== undefined && (
                    <span className={`text-[8px] font-black mt-0.5 inline-block ${pct >= r.passMark ? 'text-emerald-500' : 'text-red-500'}`}>
                      {pct >= r.passMark ? '✓ PASS' : '✗ FAIL'}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[10px] text-foreground/40">{dDate}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={e => { e.stopPropagation(); openEdit(r); }} title="Edit quiz details"
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-foreground/5 hover:bg-primary/15 hover:text-primary text-foreground/30 border border-transparent hover:border-primary/20 transition-all active:scale-90">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setSaveColTarget(r); }} title="Add to folder"
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-foreground/5 hover:bg-emerald-500/15 hover:text-emerald-500 text-foreground/30 border border-transparent hover:border-emerald-500/20 transition-all active:scale-90">
                      <FolderPlus className="w-3 h-3" />
                    </button>
                    {r.id && (
                      <button onClick={e => { e.stopPropagation(); onDeleteHistory(r.id!); }} title="Move to trash"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-foreground/5 hover:bg-red-500/15 hover:text-red-500 text-foreground/30 border border-transparent hover:border-red-500/20 transition-all active:scale-90">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Import mode chooser dialog */
function ImportModeDialog({ pending, onClose, onImport }: {
  pending: { items: QuizResult[]; name: string } | null;
  onClose: () => void;
  onImport: (mode: 'overlap' | 'fresh') => void;
}) {
  if (!pending) return null;
  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-sm mx-4">
        <DialogHeader><DialogTitle className="text-foreground font-bold">Import Backup</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-foreground/50">📁 <strong>{pending.name}</strong> — {pending.items.length} quizzes found</p>
          <button onClick={() => onImport('overlap')}
            className="w-full text-left p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-4 h-4 text-primary" />
              <span className="text-sm font-black text-foreground">Overlap (Merge)</span>
            </div>
            <p className="text-[10px] text-foreground/40 pl-6">Keeps existing data, adds new. Duplicates overwritten with imported version.</p>
          </button>
          <button onClick={() => onImport('fresh')}
            className="w-full text-left p-4 rounded-xl border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 transition-all">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-red-400" />
              <span className="text-sm font-black text-foreground">Fresh Start</span>
            </div>
            <p className="text-[10px] text-foreground/40 pl-6">Deletes all existing history first, then imports only from this file.</p>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CLEAR_CONFIRM_TEXT = 'DELETE';

/** Data management section with password-protected clear */
function DataManagementSection({ history, onExportJson, onExportCsv, onImport }: {
  history: QuizResult[];
  onExportJson: () => void;
  onExportCsv: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [showClear, setShowClear] = useState(false);
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState(false);
  const [clearing, setClearing] = useState(false);
  const { user: authUser } = useAuth();
  const signedIn = !!authUser;

  const handleClear = async () => {
    if (pw.trim().toUpperCase() !== CLEAR_CONFIRM_TEXT) { setPwErr(true); return; }
    setClearing(true);
    try {
      // Wipes history, caches, quiz details, folders, trash, bookmarks and the sync marker.
      // Preferences and API keys are kept.
      await clearAllLocalData();
      setShowClear(false); setPw(''); setPwErr(false);
      toast.success(signedIn
        ? '🗑️ Local data cleared — reloading your cloud history…'
        : '🗑️ Local data cleared — reloading…');
      setTimeout(() => window.location.reload(), 900);
    } catch {
      toast.error('Could not clear all local data. Please try again.');
      setClearing(false);
    }
  };

  return (
    <div className="glass-card p-5">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-4">💾 Local Data</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button onClick={onExportJson} className="flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/25 text-primary font-bold py-3.5 rounded-xl text-sm transition-all">⬇️ Backup JSON</button>
        <button onClick={onExportCsv} className="flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-bold py-3.5 rounded-xl text-sm transition-all">📊 Export CSV</button>
        <label className="flex items-center justify-center gap-2 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/25 text-violet-600 dark:text-violet-400 font-bold py-3.5 rounded-xl text-sm transition-all cursor-pointer">
          ⬆️ Import Backup
          <input type="file" accept=".json" className="hidden" onChange={onImport} />
        </label>
        <button onClick={() => setShowClear(true)}
          className="flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-500 font-bold py-3.5 rounded-xl text-sm transition-all">
          🗑️ Clear Local Data
        </button>
      </div>
      <p className="text-[10px] text-foreground/25 mt-3 text-center">Signed-in users: quiz data syncs to cloud automatically.</p>

      <AlertDialog open={showClear} onOpenChange={v => { if (!v) { setShowClear(false); setPw(''); setPwErr(false); } }}>
        <AlertDialogContent className="bg-card border-border mx-4 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" /> Clear Local Data
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Type <strong>DELETE</strong> to confirm. This removes all quiz history, folders, bookmarks, trash and cached data stored on this device. Your settings and API keys are kept.
              {signedIn && <span className="block mt-2 text-amber-500">You are signed in, so your cloud history will download again after reload. To delete cloud quizzes, move them to Trash.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <input type="text" value={pw} onChange={e => { setPw(e.target.value); setPwErr(false); }}
              placeholder='Type "DELETE" to confirm…'
              className={`w-full bg-card border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-foreground/30 focus:outline-none ${pwErr ? 'border-red-500/50' : 'border-border focus:border-primary/40'}`} />
            {pwErr && <p className="text-xs text-red-400 mt-1.5">❌ Type DELETE to confirm.</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={clearing} onClick={e => { e.preventDefault(); handleClear(); }} className="bg-red-600 hover:bg-red-500 text-white border-none">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const OverviewTab = React.memo(function OverviewTab({ history, filteredHistory, onViewResult, onDeleteHistory, subjectFilter, difficultyFilter = 'all' }: Props) {
  const masterFiltered = filteredHistory;

  const filters = useHistoryFilters(masterFiltered);
  const [strategyText, setStrategyText] = useState('');
  const [strategyLoading, setStrategyLoading] = useState(false);

  // Compute stats respecting difficulty filter at question level
  let totalQ = 0, totalTime = 0, bestPct = 0, totCorrect = 0, totWrong = 0, totSkipped = 0;
  const diffCounts = { easy: 0, medium: 0, hard: 0 };
  let totalGain = 0, totalPenalty = 0;

  if (difficultyFilter === 'all') {
    masterFiltered.forEach(r => {
      totalQ += r.totalQuestions;
      totalTime += r.timeTaken;
      const rPct = r.maxScore > 0 ? Math.max(0, Math.min(100, Math.round(((r.netScore ?? r.score ?? 0) / r.maxScore) * 100))) : r.percentage;
      if (rPct > bestPct) bestPct = rPct;
      totCorrect += r.correct; totWrong += r.wrong; totSkipped += r.skipped;
      totalGain += r.gain ?? 0; totalPenalty += r.penalty ?? 0;
      (r.quizData || []).forEach(q => { if (diffCounts[q.difficulty as keyof typeof diffCounts] !== undefined) diffCounts[q.difficulty as keyof typeof diffCounts]++; });
    });
  } else {
    // Question-level filtering by difficulty
    masterFiltered.forEach(r => {
      totalTime += r.timeTaken;
      const marksPerQ = r.maxScore && r.totalQuestions ? r.maxScore / r.totalQuestions : 1;
      const negMarks = r.wrong > 0 && r.penalty > 0 ? r.penalty / r.wrong : 0;
      (r.quizData || []).forEach((q, i) => {
        if (diffCounts[q.difficulty as keyof typeof diffCounts] !== undefined) diffCounts[q.difficulty as keyof typeof diffCounts]++;
        if (q.difficulty !== difficultyFilter) return;
        totalQ++;
        const ua = r.userAnswers[i];
        if (ua === null) { totSkipped++; }
        else if (ua === q.correctAnswer) { totCorrect++; totalGain += marksPerQ; }
        else { totWrong++; totalPenalty += negMarks; }
      });
    });
    totalPenalty = parseFloat(totalPenalty.toFixed(2));
    masterFiltered.forEach(r => {
      let qC = 0, qT = 0;
      (r.quizData || []).forEach((q, i) => { if (q.difficulty !== difficultyFilter) return; qT++; if (r.userAnswers[i] === q.correctAnswer) qC++; });
      if (qT > 0) { const p = Math.round((qC / qT) * 100); if (p > bestPct) bestPct = p; }
    });
  }

  const avgAcc = (totCorrect + totWrong) > 0 ? Math.round((totCorrect / (totCorrect + totWrong)) * 100) : 0;
  // Streak counts ALL quiz attempts — any daily attempt keeps the streak alive
  const streak = calculateStreak(history.map(r => r.timestamp));
  const netScore = Math.max(0, totalGain - totalPenalty);
  // ── WEIGHTED percentage from raw aggregated totals (matches neg-marking panel) ──
  const effectiveMax = difficultyFilter === 'all'
    ? masterFiltered.reduce((a, r) => a + (r.maxScore || r.totalQuestions), 0)
    : totalQ;
  const avgPct = effectiveMax > 0 ? Math.max(0, Math.min(100, Math.round((netScore / effectiveMax) * 100))) : 0;

  const chartData = useMemo(() =>
    [...masterFiltered].reverse().slice(-20).map((r, i) => ({
      i: i + 1, score: r.percentage, accuracy: r.accuracy,
    })), [masterFiltered]);

  const clampedAcc = Math.max(0, Math.min(100, avgAcc));
  const accRingCirc = 301.6;
  const accRingOffset = accRingCirc - (accRingCirc * clampedAcc) / 100;
  const accRingColor = clampedAcc >= 80 ? '#10b981' : clampedAcc >= 50 ? '#f59e0b' : '#ef4444';

  const [importPending, setImportPending] = useState<{ items: QuizResult[]; name: string } | null>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => { toast.error('Could not read file.'); };
    reader.onload = (ev) => {
      try {
        const raw = ev.target?.result;
        if (!raw || typeof raw !== 'string') { toast.error('Empty file.'); return; }
        let data: any;
        const cleaned = raw.replace(/^\uFEFF/, '').trim();
        try { data = JSON.parse(cleaned); } catch {
          try { data = JSON.parse(cleaned.replace(/,\s*([\]}])/g, '$1')); }
          catch { toast.error('Invalid JSON.'); return; }
        }
        const extract = (d: any): QuizResult[] => {
          const isValid = (item: any) => item && typeof item === 'object' && (Array.isArray(item.quizData) || typeof item.timestamp === 'number');
          if (Array.isArray(d)) return d.filter(isValid);
          if (typeof d === 'object' && d !== null) {
            for (const k of ['history', 'quizHistory', 'results', 'records', 'data']) {
              const v = d[k];
              if (Array.isArray(v)) { const f = v.filter(isValid); if (f.length) return f; }
              if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                for (const kk of ['history', 'quizHistory', 'results', 'records']) {
                  if (Array.isArray(v[kk])) { const ff = v[kk].filter(isValid); if (ff.length) return ff; }
                }
              }
            }
            for (const key of Object.keys(d)) {
              if (Array.isArray(d[key]) && d[key].length > 0 && isValid(d[key][0])) return d[key].filter(isValid);
            }
          }
          return [];
        };
        const validItems = extract(data);
        if (validItems.length === 0) { toast.error('No valid quiz records found in this file.'); return; }
        setImportPending({ items: validItems, name: file.name });
      } catch { toast.error('Could not parse backup file.'); }
    };
    reader.readAsText(file); e.target.value = '';
  };

  const doImport = (mode: 'overlap' | 'fresh') => {
    if (!importPending) return;
    if (mode === 'fresh') {
      setHistory(importPending.items.slice(0, 200));
    } else {
      let existing: QuizResult[] = [];
      try { existing = getHistorySync(); } catch {}
      const map = new Map<number, QuizResult>();
      for (const r of existing) map.set(r.timestamp, r);
      for (const r of importPending.items) map.set(r.timestamp, r);
      const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 200);
      setHistory(merged);
    }
    toast.success(`✅ ${mode === 'fresh' ? 'Fresh' : 'Overlap'} import: ${importPending.items.length} quizzes! Reloading…`);
    setImportPending(null);
    setTimeout(() => window.location.reload(), 1200);
  };

  const handleExportJson = () => {
    if (!history.length) { toast.info('No history to backup.'); return; }
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `RJQuiz_Backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
    toast.success('📦 Backup downloaded!');
  };

  const handleExportCsv = () => {
    if (!history.length) { toast.info('No history to export.'); return; }
    const header = 'Date,Title,Subject,Score,MaxScore,Percentage,Correct,Wrong,Skipped,Accuracy,TimeTaken,Difficulty';
    const rows = history.map(r => [
      new Date(r.timestamp).toISOString().split('T')[0],
      `"${r.quizTitle || ''}"`, `"${r.subject || ''}"`,
      r.netScore ?? r.score ?? 0, r.maxScore, r.percentage, r.correct, r.wrong, r.skipped, r.accuracy,
      formatTime(r.timeTaken), r.difficulty || 'Mixed'
    ].join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `RJQuiz_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    toast.success('📊 CSV exported!');
  };

  return (
    <div className="space-y-5">
      {/* AI Study Strategy */}
      {masterFiltered.length >= 3 && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">✨ AI Study Strategy</h3>
            <button
              onClick={async () => {
                setStrategyLoading(true);
                try {
                  const subjectMap = new Map<string, { correct: number; total: number }>();
                  masterFiltered.forEach(r => {
                    const s = r.subject || 'General';
                    const prev = subjectMap.get(s) || { correct: 0, total: 0 };
                    prev.correct += r.correct; prev.total += r.totalQuestions;
                    subjectMap.set(s, prev);
                  });
                  const weakSubjects = Array.from(subjectMap.entries())
                    .filter(([, v]) => v.total >= 5 && (v.correct / v.total) < 0.6)
                    .map(([k]) => k);
                  const strongSubjects = Array.from(subjectMap.entries())
                    .filter(([, v]) => v.total >= 5 && (v.correct / v.total) >= 0.8)
                    .map(([k]) => k);
                  const recent = masterFiltered.slice(0, 5);
                  let recentTrend: 'improving' | 'declining' | 'stable' | 'unknown' = 'unknown';
                  if (recent.length >= 4) {
                    const first = recent.slice(Math.floor(recent.length / 2)).reduce((a, r) => a + r.percentage, 0) / Math.ceil(recent.length / 2);
                    const second = recent.slice(0, Math.floor(recent.length / 2)).reduce((a, r) => a + r.percentage, 0) / Math.floor(recent.length / 2);
                    if (second - first > 5) recentTrend = 'improving';
                    else if (first - second > 5) recentTrend = 'declining';
                    else recentTrend = 'stable';
                  }
                  const data = await studyStrategy({
                    totalQuizzes: masterFiltered.length,
                    totalQuestions: totalQ,
                    correctCount: totCorrect,
                    wrongCount: totWrong,
                    skippedCount: totSkipped,
                    avgAccuracy: avgAcc,
                    bestScore: bestPct,
                    streak,
                    totalTimeSec: totalTime,
                    weakSubjects: weakSubjects.length > 0 ? weakSubjects : undefined,
                    strongSubjects: strongSubjects.length > 0 ? strongSubjects : undefined,
                    recentTrend,
                  });
                  setStrategyText(data.strategy);
                } catch (e: any) {
                  toast.error(e?.message || 'Could not generate strategy. Try again.');
                } finally { setStrategyLoading(false); }
              }}
              disabled={strategyLoading}
              className="flex items-center gap-1.5 text-xs font-bold text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/25 px-3.5 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            >
              {strategyLoading ? (
                <><Sparkles className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /> {strategyText ? 'Regenerate' : 'Generate Strategy'}</>
              )}
            </button>
          </div>
          {strategyText ? (
            <div className="bg-violet-500/8 border border-violet-500/18 rounded-2xl px-5 py-4 animate-fade-in">
              <AiRationaleText text={strategyText} className="text-sm text-violet-200/80 leading-relaxed" />
            </div>
          ) : (
            <p className="text-xs text-foreground/30 text-center py-4">
              Get a personalized study plan based on your {masterFiltered.length} quiz results.
            </p>
          )}
        </div>
      )}

      {masterFiltered.length > 0 && <StreakHeatmap timestamps={masterFiltered.map(r => r.timestamp)} />}

      {chartData.length >= 2 && (
        <div className="glass-card p-5">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-4">📈 Performance Trend</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="accGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="i" tick={{ fill: 'currentColor', fontSize: 10, opacity: 0.3 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: 'currentColor', fontSize: 10, opacity: 0.3 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="score" stroke="#6366F1" strokeWidth={2} fill="url(#scoreGrad2)" dot={false} />
                <Area type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2} fill="url(#accGrad2)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-3 justify-center">
            <div className="flex items-center gap-1.5 text-[10px] text-foreground/40"><span className="w-6 h-0.5 bg-primary rounded block" />Score %</div>
            <div className="flex items-center gap-1.5 text-[10px] text-foreground/40"><span className="w-6 h-0.5 bg-emerald-500 rounded block" />Accuracy %</div>
          </div>
        </div>
      )}

      {/* Accuracy Breakdown */}
      <div className="glass-card p-5">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-4">📊 Accuracy Breakdown</h3>
        {[
          { label: '✓ Correct', value: totCorrect, color: 'bg-emerald-500', text: 'text-emerald-500' },
          { label: '✗ Wrong',   value: totWrong,   color: 'bg-red-500',     text: 'text-red-500'     },
          { label: '⏭ Skipped', value: totSkipped, color: 'bg-amber-500',   text: 'text-amber-500'   },
        ].map(({ label, value, color, text }) => (
          <div key={label} className="mb-4">
            <div className="flex justify-between text-sm font-bold mb-2">
              <span className={text}>{label}</span>
              <span className="bg-foreground/10 px-2 py-0.5 rounded text-foreground font-black">{value}</span>
            </div>
            <div className="prog-bar-bg">
              <div className={`prog-bar-fill ${color}`} style={{ width: `${totalQ > 0 ? (value / totalQ) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
        <div className="flex flex-col sm:flex-row items-center gap-6 bg-foreground/5 p-5 rounded-2xl border border-border mt-6">
          <div className="relative w-28 h-28 flex-shrink-0">
            <svg className="w-full h-full -rotate-90">
              <circle cx="56" cy="56" r="48" stroke="rgba(0,0,0,0.08)" strokeWidth="10" fill="none" className="dark:stroke-white/5" />
              <circle cx="56" cy="56" r="48" stroke={accRingColor} strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray="301.6" strokeDashoffset={accRingOffset} className="transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center"><span className="text-2xl font-black text-foreground">{avgAcc}%</span></div>
          </div>
          <div className="flex-1 space-y-2 w-full text-sm">
            <div className="text-emerald-500 font-bold text-lg mb-3">Overall Accuracy</div>
            {[
              ['Total Questions', totalQ, 'text-foreground'],
              ['Total Time', formatTime(totalTime), 'text-primary'],
              ['Best Score', `${bestPct}%`, 'text-amber-500'],
              ['Streak', `${streak} day${streak !== 1 ? 's' : ''}`, 'text-orange-500'],
            ].map(([k, v, c]) => (
              <div key={String(k)} className="flex justify-between bg-foreground/5 px-3 py-2 rounded-lg border border-border">
                <span className="text-foreground/60 font-medium">{k}</span>
                <span className={`font-bold ${c}`}>{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Difficulty Breakdown */}
      <div className="glass-card p-5">
        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/40 mb-4">🎯 Difficulty Encountered</h3>
        {[
          { key: 'easy',   label: '🟢 Easy',   color: 'bg-emerald-500', text: 'text-emerald-500' },
          { key: 'medium', label: '🟡 Medium', color: 'bg-amber-500',   text: 'text-amber-500'   },
          { key: 'hard',   label: '🔴 Hard',   color: 'bg-red-500',     text: 'text-red-500'     },
        ].map(({ key, label, color, text }) => {
          const count = diffCounts[key as keyof typeof diffCounts];
          const pct = totalQ > 0 ? Math.round((count / totalQ) * 100) : 0;
          return (
            <div key={key} className="mb-4">
              <div className="flex justify-between text-sm font-bold mb-2">
                <span className={text}>{label}</span>
                <span className="text-foreground/60 bg-foreground/8 px-2 py-0.5 rounded text-xs">{count} Qs · {pct}%</span>
              </div>
              <div className="prog-bar-bg"><div className={`prog-bar-fill ${color}`} style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>

      {/* Quiz History */}
      <div className="glass-card p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/40">🕒 Quiz History</h3>
          <span className="bg-primary/10 text-primary text-xs px-3 py-1 rounded-lg font-bold border border-primary/20">{masterFiltered.length} quizzes</span>
        </div>
        <HistoryFilterBar filters={filters} history={masterFiltered} />
        {filters.filteredHistory.length === 0 ? (
          <div className="text-foreground/30 text-sm text-center py-8 bg-foreground/5 rounded-xl border border-border">
            {masterFiltered.length === 0 ? 'No quiz history yet.' : 'No quizzes match your filters.'}
          </div>
        ) : (
          <>
            <RecentQuizList
              quizzes={filters.filteredHistory.slice(0, 20)}
              onViewResult={onViewResult}
              onDeleteHistory={onDeleteHistory}
            />
            {filters.filteredHistory.length > 20 && (
              <p className="text-center text-[10px] text-foreground/30 py-2">+ {filters.filteredHistory.length - 20} more — use filters to narrow down</p>
            )}
          </>
        )}
      </div>

      <ImportModeDialog
        pending={importPending}
        onClose={() => setImportPending(null)}
        onImport={doImport}
      />

      <DataManagementSection
        history={history}
        onExportJson={handleExportJson}
        onExportCsv={handleExportCsv}
        onImport={handleImport}
      />
    </div>
  );
});
export default OverviewTab;
