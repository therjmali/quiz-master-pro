import { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Loader2, LogIn, Folder, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from 'zitejs/auth';
import { openSignIn } from '../../platform/cloud/signInWindow';
import { hasBackend } from '../../platform/ai/caller';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { getTrashedHistory, emptyTrash, restoreQuizResult, deleteQuizResult, GetTrashedHistoryOutputType } from 'zitejs/api';
import { formatTime } from '../../utils/scoring';
import {
  TrashItem, loadFileTree, saveFileTree, loadTrash, restoreFromTrash, permanentDelete, emptyAllTrash,
  findNode as findNodeInTree, countFiles, countQuestions, notifyOrganizerChanged, ROOT_ID,
} from '../../utils/fileTree';
import {
  TrashedResult,
  loadHistoryTrash,
  onHistoryTrashChange,
  deleteFromHistoryTrash,
  emptyHistoryTrash,
  resultKey,
  daysLeft,
} from '../../utils/historyTrash';
import { restoreFromHistoryTrash } from '../../utils/historyTrashActions';

type TrashedRecord = GetTrashedHistoryOutputType['records'][0];

interface Props { onHistoryChanged: () => void; }

function titleForTrashedResult(t: TrashedResult): string {
  const firstQ = Array.isArray(t.result.quizData) ? t.result.quizData[0]?.question : undefined;
  const legacyTitle = !Array.isArray(t.result.quizData) ? (t.result.quizData as { title?: string } | undefined)?.title : undefined;
  return t.result.quizTitle || t.result.subject || legacyTitle || firstQ || 'Untitled Quiz';
}

export default function TrashTab({ onHistoryChanged }: Props) {
  const { user, isLoading: authLoading } = useAuth();
  const hostedSignedIn = !!user && hasBackend();
  const [records, setRecords] = useState<TrashedRecord[]>([]);
  const [loading, setLoading] = useState(() => hasBackend());
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Local / Supabase-synced quiz history trash
  const [localQuizzes, setLocalQuizzes] = useState<TrashedResult[]>([]);
  const [localDeleteKey, setLocalDeleteKey] = useState<string | null>(null);
  const [localBusyKey, setLocalBusyKey] = useState<string | null>(null);

  // Library Organizer trash (folders & files) — lives on this device and is shown here, in the main Trash
  const [orgItems, setOrgItems] = useState<TrashItem[]>(() => loadTrash());
  const [orgDeleteId, setOrgDeleteId] = useState<string | null>(null);

  const refreshOrg = useCallback(() => { setOrgItems([...loadTrash()]); }, []);
  const refreshLocalQuizzes = useCallback(() => {
    void loadHistoryTrash().then(items => setLocalQuizzes([...items])).catch(() => {});
  }, []);

  useEffect(() => {
    refreshLocalQuizzes();
    return onHistoryTrashChange(refreshLocalQuizzes);
  }, [refreshLocalQuizzes]);

  const handleRestoreOrg = (item: TrashItem) => {
    const tree = loadFileTree();
    const updated = restoreFromTrash(tree, item.node.id);
    saveFileTree(updated);
    refreshOrg();
    notifyOrganizerChanged();
    toast.success(`↩️ "${item.node.name}" restored to the Organizer`);
  };

  const handleDeleteOrgForever = (id: string) => {
    permanentDelete(id);
    setOrgDeleteId(null);
    refreshOrg();
    notifyOrganizerChanged();
    toast.success('Permanently deleted.');
  };

  const handleRestoreLocalQuiz = async (key: string) => {
    if (localBusyKey) return;
    setLocalBusyKey(key);
    try {
      const restored = await restoreFromHistoryTrash([key]);
      refreshLocalQuizzes();
      if (restored > 0) {
        toast.success('↩️ Quiz restored to history!');
        onHistoryChanged();
      } else {
        toast.info('Quiz is already in history.');
      }
    } catch {
      toast.error('Could not restore quiz.');
    } finally {
      setLocalBusyKey(null);
    }
  };

  const handleDeleteLocalQuizForever = async (key: string) => {
    setLocalBusyKey(key);
    setLocalDeleteKey(null);
    try {
      await deleteFromHistoryTrash([key]);
      refreshLocalQuizzes();
      toast.success('Permanently deleted.');
    } catch {
      toast.error('Could not delete.');
    } finally {
      setLocalBusyKey(null);
    }
  };

  const loadCloudTrash = useCallback(async () => {
    if (!hostedSignedIn) { setLoading(false); return; }
    try {
      setLoading(true);
      const data = await getTrashedHistory({});
      setRecords(data.records);
    } catch { toast.error('Could not load trash'); }
    finally { setLoading(false); }
  }, [hostedSignedIn]);

  useEffect(() => {
    if (!hasBackend()) { setLoading(false); return; }
    if (!authLoading && hostedSignedIn) void loadCloudTrash();
    else if (!authLoading && !hostedSignedIn) setLoading(false);
  }, [authLoading, hostedSignedIn, loadCloudTrash]);

  const handleRestore = async (id: string) => {
    if (restoringId) return;
    setRestoringId(id);
    try {
      await restoreQuizResult({ id });
      setRecords(prev => prev.filter(r => r.id !== id));
      toast.success('↩️ Quiz restored to history!');
      onHistoryChanged();
    } catch { toast.error('Could not restore quiz.'); }
    finally { setRestoringId(null); }
  };

  const handleDeletePermanently = async (id: string) => {
    setDeletingId(id);
    setDeleteConfirmId(null);
    try {
      await deleteQuizResult({ id });
      setRecords(prev => prev.filter(r => r.id !== id));
      toast.success('Permanently deleted.');
    } catch { toast.error('Could not delete.'); }
    finally { setDeletingId(null); }
  };

  const handleEmptyTrash = async () => {
    setEmptyingTrash(true);
    try {
      let deleted = 0;
      if (hostedSignedIn) {
        const res = await emptyTrash({});
        deleted += res.deleted;
        setRecords([]);
      }
      deleted += await emptyHistoryTrash();
      refreshLocalQuizzes();
      const orgCount = loadTrash().length;
      emptyAllTrash();
      refreshOrg();
      notifyOrganizerChanged();
      const total = deleted + orgCount;
      toast.success(`🗑️ Trash emptied — ${total} item${total !== 1 ? 's' : ''} permanently deleted`);
    } catch { toast.error('Could not empty trash.'); }
    finally { setEmptyingTrash(false); setShowEmptyConfirm(false); }
  };

  // Deduplicate cloud vs local quiz trash if both carry the same cloud id
  const cloudIds = new Set(records.map(r => r.id));
  const visibleLocalQuizzes = localQuizzes.filter(t => !t.result.id || !cloudIds.has(t.result.id));

  const confirmRecord = deleteConfirmId ? records.find(r => r.id === deleteConfirmId) : null;
  const confirmLocal = localDeleteKey ? visibleLocalQuizzes.find(t => resultKey(t.result) === localDeleteKey) : null;
  const confirmOrg = orgDeleteId ? orgItems.find(t => t.node.id === orgDeleteId) : null;
  const totalItems = records.length + visibleLocalQuizzes.length + orgItems.length;
  const cloudLoading = hasBackend() && (authLoading || (loading && hostedSignedIn));

  return (
    <>
      {/* Empty Trash confirm */}
      <AlertDialog open={showEmptyConfirm} onOpenChange={setShowEmptyConfirm}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Empty Trash?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will <strong>permanently delete</strong> all {totalItems} item{totalItems !== 1 ? 's' : ''} in trash. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEmptyTrash} disabled={emptyingTrash}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {emptyingTrash ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Empty Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Individual cloud delete confirm */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={open => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Permanently Delete?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              <strong>"{confirmRecord?.quizTitle || confirmRecord?.questionPreview || 'This quiz'}"</strong> will be
              permanently deleted and <strong>cannot be recovered</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDeletePermanently(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Individual local quiz delete confirm */}
      <AlertDialog open={!!localDeleteKey} onOpenChange={open => !open && setLocalDeleteKey(null)}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Permanently Delete?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              <strong>"{confirmLocal ? titleForTrashedResult(confirmLocal) : 'This quiz'}"</strong> will be
              permanently deleted and <strong>cannot be recovered</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => localDeleteKey && void handleDeleteLocalQuizForever(localDeleteKey)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Organizer item delete confirm */}
      <AlertDialog open={!!orgDeleteId} onOpenChange={open => !open && setOrgDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Permanently Delete?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              <strong>"{confirmOrg?.node.name || 'This item'}"</strong>
              {confirmOrg?.node.type === 'folder' ? ' and everything inside it' : ''} will be permanently deleted and <strong>cannot be recovered</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => orgDeleteId && handleDeleteOrgForever(orgDeleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-4">
        {/* Header */}
        <div className="glass-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Trash</h3>
              <p className="text-xs text-foreground/40">{totalItems} item{totalItems !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {totalItems > 0 && (
            <button onClick={() => setShowEmptyConfirm(true)}
              className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 text-xs font-bold px-3 py-2 rounded-xl transition-all active:scale-95">
              <Trash2 className="w-3.5 h-3.5" /> Empty Trash
            </button>
          )}
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border border-amber-500/20 bg-amber-500/8">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Everything you delete — quizzes and Library Organizer folders &amp; files — lands here. Restore to recover, or use <strong>Empty Trash</strong> to permanently delete all.
          </p>
        </div>

        {/* ── Library Organizer: folders & files ── */}
        {orgItems.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest px-1">
              📁 Library Organizer · {orgItems.length}
            </p>
            {orgItems.map(item => {
              const n = item.node;
              const isFolder = n.type === 'folder';
              const parent = findNodeInTree(loadFileTree(), item.parentId);
              const from = item.parentId === ROOT_ID || !parent ? 'Home' : parent.name;
              const qCount = isFolder ? countQuestions(n) : (n.questions?.length || 0);
              const fCount = isFolder ? countFiles(n) : 0;
              const dDate = new Date(item.deletedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
              return (
                <div key={n.id} className="glass-card p-4 flex items-center gap-3 opacity-70 hover:opacity-100 transition-opacity">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0">
                    {isFolder ? <Folder className="w-5 h-5 text-primary" /> : <FileText className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{n.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] font-bold text-primary/70">{isFolder ? 'Folder' : 'File'}</span>
                      {isFolder && <span className="text-[10px] text-foreground/35">{fCount} file{fCount !== 1 ? 's' : ''}</span>}
                      <span className="text-[10px] text-foreground/35">{qCount} Qs</span>
                      <span className="text-[10px] text-foreground/30">from {from}</span>
                      <span className="text-[10px] text-foreground/30">{dDate}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => handleRestoreOrg(item)}
                      className="flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-500 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
                    >
                      <RotateCcw className="w-3 h-3" /> Restore
                    </button>
                    <button
                      onClick={() => setOrgDeleteId(n.id)}
                      className="flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Local / Synced Quiz History Trash ── */}
        {visibleLocalQuizzes.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest px-1">
              📝 Quizzes · {visibleLocalQuizzes.length}
            </p>
            <div className="space-y-3">
              {visibleLocalQuizzes.map(t => {
                const key = resultKey(t.result);
                const r = t.result;
                const pct = r.percentage || 0;
                const title = titleForTrashedResult(t);
                const left = daysLeft(t.deletedAt);
                const dDate = new Date(t.deletedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
                const busy = localBusyKey === key;
                return (
                  <div key={key} className="glass-card p-4 flex items-center gap-3 opacity-70 hover:opacity-100 transition-opacity">
                    <div className="flex flex-col items-center w-12 flex-shrink-0">
                      <span className={`font-black text-lg leading-none ${pct >= 70 ? 'text-emerald-500' : pct >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                        {pct}%
                      </span>
                      <span className="text-[9px] text-foreground/30 uppercase tracking-wider mt-0.5">Score</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-emerald-500">✓{r.correct || 0}</span>
                        <span className="text-[10px] text-red-500">✗{r.wrong || 0}</span>
                        <span className="text-[10px] text-foreground/30">Deleted {dDate}</span>
                        {left !== null && (
                          <span className="text-[10px] text-amber-500/80">{left}d left</span>
                        )}
                        {r.timeTaken ? (
                          <span className="text-[10px] text-foreground/30">{formatTime(r.timeTaken)}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => void handleRestoreLocalQuiz(key)}
                        disabled={busy}
                        className="flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-500 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Restore
                      </button>
                      <button
                        onClick={() => setLocalDeleteKey(key)}
                        disabled={busy}
                        className="flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Hosted Cloud Quizzes (when Zite backend is enabled) ── */}
        {cloudLoading ? (
          <div className="flex items-center justify-center py-8 gap-3 text-foreground/40">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{authLoading ? 'Checking sign-in…' : 'Loading trash…'}</span>
          </div>
        ) : hasBackend() && !hostedSignedIn ? (
          <div className="flex flex-col items-center text-center py-6 px-4 gap-3">
            <p className="text-xs text-foreground/40">Sign in to also check server-stored deleted quizzes.</p>
            <button
              onClick={() => openSignIn('signin')}
              className="flex items-center gap-2 bg-primary text-primary-foreground font-bold text-sm px-5 py-2.5 rounded-xl shadow-md shadow-primary/25 transition-all active:scale-95"
            >
              <LogIn className="w-4 h-4" /> Sign In
            </button>
          </div>
        ) : records.length > 0 ? (
          <div className="space-y-2.5">
            <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest px-1">
              ☁️ Cloud Quizzes · {records.length}
            </p>
            <div className="space-y-3">
              {records.map(r => {
                const pct = r.percentage || 0;
                const preview = r.quizTitle || r.questionPreview || 'Untitled Quiz';
                const dDate = r.createdAt
                  ? new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
                  : '—';
                const isRestoring = restoringId === r.id;
                const isDeleting = deletingId === r.id;
                return (
                  <div key={r.id} className="glass-card p-4 flex items-center gap-3 opacity-70 hover:opacity-100 transition-opacity">
                    <div className="flex flex-col items-center w-12 flex-shrink-0">
                      <span className={`font-black text-lg leading-none ${pct >= 70 ? 'text-emerald-500' : pct >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                        {pct}%
                      </span>
                      <span className="text-[9px] text-foreground/30 uppercase tracking-wider mt-0.5">Score</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{preview}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-emerald-500">✓{r.correctCount || 0}</span>
                        <span className="text-[10px] text-red-500">✗{r.wrongCount || 0}</span>
                        <span className="text-[10px] text-foreground/30">{dDate}</span>
                        {r.timeTakenSeconds ? (
                          <span className="text-[10px] text-foreground/30">{formatTime(r.timeTakenSeconds)}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => handleRestore(r.id)}
                        disabled={isRestoring || isDeleting}
                        className="flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-500 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                      >
                        {isRestoring
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <RotateCcw className="w-3 h-3" />}
                        Restore
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(r.id)}
                        disabled={isRestoring || isDeleting}
                        className="flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                      >
                        {isDeleting
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3" />}
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {!cloudLoading && totalItems === 0 && (
          <div className="text-center py-16 text-foreground/30">
            <Trash2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-bold">Trash is empty</p>
            <p className="text-xs mt-1">Deleted quizzes, folders and files will appear here</p>
          </div>
        )}
      </div>
    </>
  );
}
