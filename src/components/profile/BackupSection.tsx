import { useState, useRef, useCallback } from 'react';
import {
  Download, Upload, Loader2, FileJson, AlertTriangle, Trash2,
  FolderTree, Bookmark, Settings2, Database, RotateCcw,
  FileText, BookOpen, Palette, Key, CalendarDays, Brain,
  Clock, Layers, Sparkles, Shield,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Progress } from '@project/components/ui/progress';
import { toast } from 'sonner';
import { QuizResult } from '../../types/quiz';
import { syncSubjectsFromHistory } from '../../utils/subjects';
import {
  parseBackupFile, extractHistoryFromBackup, extractSettings,
  normalizeQuizRecord, safeNum, formatBytes, gatherAllLocalDataWithIDB,
  buildBackupPayload, ALL_APP_KEYS, BackupPreview, checkRestoreIntegrity,
} from '../../utils/backupUtils';
import { idbGet, idbSet } from '../../utils/indexedDB';
import { wipeAllLocalStores } from '../../utils/dataReset';
import { getHistorySync, getHistory, setHistory } from '../../utils/historyStore';
import { getQuizDetailsFromIDB, storeQuizDetail } from '../../hooks/useHistorySync';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Props                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  isLoggedIn: boolean;
  history: QuizResult[];
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Constants                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

const DELETE_CONFIRM_TEXT = 'DELETE';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Utility functions                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatFileSize(bytes: string | undefined): string {
  if (!bytes) return '';
  const n = parseInt(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Main Component                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function BackupSection({ isLoggedIn, history }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Download state
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Import state
  const [pendingImport, setPendingImport] = useState<{
    historyItems: QuizResult[];
    settings: Record<string, string | null>;
    preview: BackupPreview;
    fileName: string;
    fileSize: number;
  } | null>(null);
  const [importProcessing, setImportProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState('');

  // Retry state for partially failed cloud syncs
  const [retryInfo, setRetryInfo] = useState<{
    failedIndices: number[];
    batchSize: number;
    totalBatches: number;
    synced: number;
  } | null>(null);
  const retryDataRef = useRef<QuizResult[]>([]);

  // Clear all state
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [clearError, setClearError] = useState(false);

  /* ─── Local backup size ─── */
  const localSize = (() => {
    try {
      let total = 0;
      ALL_APP_KEYS.forEach(k => { total += new Blob([localStorage.getItem(k) || '']).size; });
      return total;
    } catch { return 0; }
  })();

  /* ─── Download JSON (CLIENT-SIDE BUILD) ─── */
  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadProgress(10);

    const triggerDownload = (jsonStr: string, quizCount: number) => {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz-master-pro-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      localStorage.setItem('qmp_last_local_backup', String(Date.now()));
      const sizeKB = Math.round(blob.size / 1024);
      toast.success(`💾 Backup downloaded! ${quizCount} quizzes · ${sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`}`);
    };

    try {
      // Use async getHistory() to ensure IDB is fully loaded — the sync
      // fallback only has the localStorage mirror (top 50, stripped)
      let localHistory: any[] = [];
      try { localHistory = await getHistory(); } catch { /* */ }

      setDownloadProgress(20);

      // Enrich any records that are still stripped (quizData:[]) by looking
      // up individual detail keys in IDB
      const needsEnrichment = localHistory.filter((r: any) => {
        const qd = r.quizData ?? [];
        return (!Array.isArray(qd) || qd.length === 0) && (r.totalQuestions > 0 || r.correct > 0 || r.wrong > 0);
      });

      if (needsEnrichment.length > 0) {
        const keys = needsEnrichment.flatMap((r: any) => {
          const k: string[] = [];
          if (r.id) k.push(r.id);
          if (r.timestamp) k.push(String(r.timestamp));
          if (r.localTimestamp) k.push(String(r.localTimestamp));
          return k;
        });
        const idbDetails = await getQuizDetailsFromIDB([...new Set(keys)]);
        
        setDownloadProgress(40);

        localHistory = localHistory.map((r: any) => {
          const qd = r.quizData ?? [];
          if (Array.isArray(qd) && qd.length > 0) return r;

          const fullById = r.id ? idbDetails.get(r.id) : undefined;
          const fullByTs = idbDetails.get(String(r.timestamp)) || idbDetails.get(String(r.localTimestamp));
          const full = fullById || fullByTs;

          if (full && Array.isArray(full.quizData) && full.quizData.length > 0) {
            return {
              ...r,
              quizData: full.quizData,
              userAnswers: full.userAnswers || [],
              quizDataJson: undefined,
              userAnswersJson: undefined,
            };
          }
          return r;
        });
      }

      setDownloadProgress(50);

      // Fallback: if many records are still stripped, try the legacy
      // qmp_history_full bulk key as a last-resort source
      let stillStripped = localHistory.filter((r: any) => {
        const qd = r.quizData ?? [];
        return (!Array.isArray(qd) || qd.length === 0) && (r.totalQuestions > 0 || r.correct > 0 || r.wrong > 0);
      });

      if (stillStripped.length > 0) {
        try {
          const bulkFull = await idbGet<any[]>('qmp_history_full');
          if (Array.isArray(bulkFull) && bulkFull.length > 0) {
            const bulkMap = new Map<string, any>();
            for (const r of bulkFull) {
              if (Array.isArray(r.quizData) && r.quizData.length > 0) {
                if (r.id) bulkMap.set(r.id, r);
                if (r.timestamp) bulkMap.set(String(r.timestamp), r);
              }
            }
            localHistory = localHistory.map((r: any) => {
              const qd = r.quizData ?? [];
              if (Array.isArray(qd) && qd.length > 0) return r;
              const full = (r.id ? bulkMap.get(r.id) : undefined) || bulkMap.get(String(r.timestamp));
              if (full) return { ...r, quizData: full.quizData, userAnswers: full.userAnswers || [] };
              return r;
            });
          }
        } catch { /* */ }
      }

      setDownloadProgress(70);

      // Pre-flight validation
      const statsOnly = localHistory.filter((r: any) => {
        const qd = r.quizData ?? [];
        return (!Array.isArray(qd) || qd.length === 0) && (r.totalQuestions > 0 || r.correct > 0 || r.wrong > 0);
      });
      if (statsOnly.length > 0) {
        toast.warning(`⚠️ ${statsOnly.length} quiz(es) have stats only — question data unavailable. These will restore as read-only history entries.`);
      }

      const localData = await gatherAllLocalDataWithIDB(idbGet);
      const backupData = buildBackupPayload({
        cloudRecords: localHistory,
        localData,
        userEmail: 'local',
        userName: 'local',
      });
      backupData._meta.backupScope = 'local-only';
      backupData._meta.dataIntegrity.fullDataQuizzes = localHistory.length - statsOnly.length;
      backupData._meta.dataIntegrity.statsOnlyQuizzes = statsOnly.length;

      setDownloadProgress(90);

      const jsonStr = JSON.stringify(backupData, null, 2);
      triggerDownload(jsonStr, localHistory.length);
    } catch (e: any) {
      toast.error(e?.message || 'Backup failed');
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  }, [downloading]);

  /* ─── File import (parse with unified parser) ─── */
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast.error('Could not read file.');
    reader.onload = () => {
      try {
        const raw = reader.result as string;
        if (!raw) { toast.error('Empty file.'); return; }
        const result = parseBackupFile(raw, file.size);
        if ('error' in result) { toast.error(`❌ ${result.error}`); return; }
        setPendingImport({
          historyItems: result.historyItems,
          settings: result.settings,
          preview: result.preview,
          fileName: file.name,
          fileSize: file.size,
        });
      } catch { toast.error('❌ Could not process file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  /* ─── Execute import ─── */
  const executeImport = async (mode: 'overlap' | 'fresh') => {
    if (!pendingImport) return;
    setImportProcessing(true);
    setImportProgress(0);
    setImportStatus('Preparing…');
    const { historyItems, settings } = pendingImport;

    try {
      await new Promise(r => setTimeout(r, 150));
      setImportProgress(10);

      if (mode === 'fresh') {
        // Wipe EVERY local store (IDB caches, details, tree, trash…) — not just localStorage —
        // so old cached data cannot leak back into a "fresh" restore.
        await wipeAllLocalStores();
      }
      setImportProgress(20);
      setImportStatus('Saving locally…');

      if (historyItems.length > 0) {
        // CRITICAL: Store FULL records (with quizData/userAnswers) in the
        // primary IDB store. The historyStore._persistAsync internally strips
        // quizData for the localStorage mirror — we must NOT strip here.

        if (mode === 'fresh') {
          setHistory(historyItems);
        } else {
          let existing: QuizResult[] = [];
          try { existing = await getHistory(); } catch {
            try { existing = getHistorySync(); } catch { /* */ }
          }
          // Merge: prefer records with full quizData over stripped ones
          const merged = new Map<number, QuizResult>();
          for (const r of existing) merged.set(r.timestamp, r);
          for (const r of historyItems) {
            const existingRec = merged.get(r.timestamp);
            if (!existingRec) {
              // New record — add it
              merged.set(r.timestamp, r);
            } else {
              // Duplicate — keep whichever has full data; prefer incoming if both have it
              const existingHasData = Array.isArray(existingRec.quizData) && existingRec.quizData.length > 0;
              const incomingHasData = Array.isArray(r.quizData) && r.quizData.length > 0;
              if (incomingHasData || !existingHasData) {
                merged.set(r.timestamp, r);
              }
            }
          }
          const mergedArr = Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp);
          setHistory(mergedArr);
        }

        // Store each quiz's full data individually in IDB detail keys
        // (for on-demand lazy loading in the UI)
        const fullDataItems = historyItems.filter((r: any) => Array.isArray(r.quizData) && r.quizData.length > 0);
        const statsOnlyItems = historyItems.filter((r: any) => !Array.isArray(r.quizData) || r.quizData.length === 0);
        for (const item of fullDataItems) {
          const key = item.id || String(item.timestamp);
          await storeQuizDetail(key, item).catch(() => {});
          if (item.id && item.timestamp) {
            await storeQuizDetail(String(item.timestamp), item).catch(() => {});
          }
        }
        setImportProgress(40);

        // Mark stats-only records so UI can label them
        for (const item of statsOnlyItems) {
          if (item.totalQuestions > 0 || item.correct > 0 || item.wrong > 0) {
            (item as any)._statsOnly = true;
          }
        }
      }
      setImportProgress(50);

      if (historyItems.length > 0) {
        syncSubjectsFromHistory(historyItems);
      }

      for (const [key, val] of Object.entries(settings)) {
        if (val != null) localStorage.setItem(key, val);
      }

      // Also write to IDB-primary stores so the authoritative data is there
      const idbMirrors: Array<{ lsKey: string; idbKey: string }> = [
        { lsKey: 'qmp_file_tree', idbKey: 'qmp_file_tree_idb' },
        { lsKey: 'qmp_file_trash', idbKey: 'qmp_file_trash_idb' },
        { lsKey: 'qmp_bookmarks_v2', idbKey: 'qmp_bookmarks_idb' },
        { lsKey: 'qmp_global_mistakes_v1', idbKey: 'qmp_mistakes_idb' },
      ];
      for (const { lsKey, idbKey } of idbMirrors) {
        const val = settings[lsKey];
        if (val != null) {
          try {
            const parsed = JSON.parse(val);
            await idbSet(idbKey, parsed).catch(() => {});
          } catch { /* not valid JSON, skip IDB write */ }
        }
      }

      setImportProgress(70);
      setImportStatus('Applying settings…');

      setImportProgress(95);
      setImportStatus('Finalizing…');

      await new Promise(r => setTimeout(r, 300));
      setImportProgress(100);
      setImportStatus('Done! ✓');
      await new Promise(r => setTimeout(r, 400));

      const fullCount = historyItems.filter((r: any) => Array.isArray(r.quizData) && r.quizData.length > 0).length;
      const statsOnlyCount = historyItems.length - fullCount;
      const parts = [
        historyItems.length > 0 ? `${historyItems.length} quizzes` : '',
        fullCount > 0 && statsOnlyCount > 0 ? `(${fullCount} full, ${statsOnlyCount} stats-only)` : '',
        Object.values(settings).filter(Boolean).length > 0 ? 'settings' : '',
      ].filter(Boolean).join(' + ');

      // Integrity check — compare actual vs expected
      const restoredHistory = getHistorySync();
      const integrity = checkRestoreIntegrity(
        {
          quizCount: historyItems.length,
          fullDataCount: fullCount,
          settingsCount: Object.values(settings).filter(Boolean).length,
        },
        restoredHistory,
      );

      if (!integrity.ok) {
        // Block the success message — show error with specifics
        toast.error(`❌ Restore completed with issues:`);
        integrity.issues.forEach(issue => toast.warning(`⚠️ ${issue}`));
      } else {
        toast.success(`✅ ${mode === 'fresh' ? 'Fresh' : 'Merged'}: ${parts || 'Done'}! Reloading…`);
      }

      if (statsOnlyCount > 0) {
        toast.warning(`⚠️ ${statsOnlyCount} quiz(es) restored as stats-only — question data was not in the backup.`);
      }

      setPendingImport(null);
      setRetryInfo(null);
      setTimeout(() => window.location.reload(), 1200);
    } catch { toast.error('Import failed.'); }
    finally { setImportProcessing(false); setImportProgress(0); setImportStatus(''); }
  };

  /* ─── Retry (disabled — Drive removed) ─── */
  const handleRetry = async () => {};

  /* ─── Clear all ─── */
  const handleClearAll = async () => {
    try {
      await wipeAllLocalStores();
      try { localStorage.setItem('qmp_clear_pending', 'true'); } catch {}
    } catch {
      toast.error('Could not clear all local data.');
      return;
    }
    setShowClearDialog(false);
    setClearPassword('');
    setClearError(false);
    toast.success('🗑️ All local data cleared.');
    setTimeout(() => window.location.reload(), 800);
  };

  /* ─── Import analysis (computed) ─── */
  const importAnalysis = pendingImport ? (() => {
    const { historyItems } = pendingImport;
    let existing: QuizResult[] = [];
    try { existing = getHistorySync(); } catch { /* */ }
    const existingTs = new Set(existing.map(r => r.timestamp));
    const newCount = historyItems.filter(r => !existingTs.has(r.timestamp)).length;
    const dupCount = historyItems.length - newCount;
    return { newCount, dupCount, existingCount: existing.length };
  })() : null;

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  Render                                                                */
  /* ═══════════════════════════════════════════════════════════════════════ */

  return (
    <>
      <input type="file" ref={fileRef} accept=".json" onChange={handleFileSelected} className="hidden" />

      {/* ── Import Dialog ── */}
      <ImportDialog
        pendingImport={pendingImport}
        importAnalysis={importAnalysis}
        importProcessing={importProcessing}
        importProgress={importProgress}
        importStatus={importStatus}
        isLoggedIn={isLoggedIn}
        retryInfo={retryInfo}
        onClose={() => { setPendingImport(null); setRetryInfo(null); retryDataRef.current = []; }}
        onExecute={executeImport}
        onRetry={handleRetry}
      />

      {/* ── Clear All Dialog ── */}
      <AlertDialog open={showClearDialog} onOpenChange={v => { if (!v) { setShowClearDialog(false); setClearPassword(''); setClearError(false); } }}>
        <AlertDialogContent className="bg-card border-border mx-4 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Clear All Data
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete <strong className="text-foreground font-bold">all local data</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-3">
            <div className="bg-destructive/5 border border-destructive/15 rounded-xl p-3 text-xs text-destructive/80 space-y-1">
              <p className="font-bold text-destructive">⚠️ Data to be deleted:</p>
              <p>• {history.length} quiz records ({formatBytes(localSize)})</p>
              <p>• All settings, themes, API keys</p>
              <p>• Collections, templates, reminders</p>
            </div>
            <p className="text-xs font-semibold text-foreground/50">Type <strong>DELETE</strong> to confirm:</p>
            <input
              type="text" value={clearPassword}
              onChange={e => { setClearPassword(e.target.value); setClearError(false); }}
              placeholder='Type "DELETE" to confirm…'
              className={`w-full bg-card border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-foreground/30 focus:outline-none transition-colors ${clearError ? 'border-destructive/50' : 'border-border focus:border-primary/40'}`}
            />
            {clearError && <p className="text-xs text-destructive">❌ Type DELETE to confirm.</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { if (clearPassword.trim().toUpperCase() !== DELETE_CONFIRM_TEXT) { e.preventDefault(); setClearError(true); return; } handleClearAll(); }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground border-none"
            >Delete Everything</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MAIN LAYOUT                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">

        {/* Backup age warning */}
        {(() => {
          const lastLocal = localStorage.getItem('qmp_last_local_backup');
          const latest = lastLocal ? parseInt(lastLocal) : 0;
          const daysSince = latest > 0 ? Math.floor((Date.now() - latest) / 86400000) : -1;
          if (daysSince < 0 || daysSince < 7) return null;
          return (
            <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl animate-fade-in">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-amber-300">No backup in {daysSince} days</p>
                <p className="text-[10px] text-foreground/40 mt-0.5">Back up your data to avoid losing progress.</p>
              </div>
            </div>
          );
        })()}

        {/* ── Card 1: Local Backup ── */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <FileJson className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Local Backup</h3>
              <p className="text-[11px] text-foreground/40">
                {history.length} quizzes · {formatBytes(localSize)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex flex-col items-center gap-2 py-4 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all active:scale-[0.97] disabled:opacity-50 relative overflow-hidden"
            >
              {downloading && (
                <div className="absolute bottom-0 left-0 h-1 bg-primary/40 transition-all duration-300" style={{ width: `${downloadProgress}%` }} />
              )}
              {downloading ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Download className="w-5 h-5 text-primary" />}
              <span className="text-xs font-bold text-foreground">{downloading ? 'Building…' : 'Download JSON'}</span>
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-2 py-4 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/10 transition-all active:scale-[0.97]"
            >
              <Upload className="w-5 h-5 text-accent" />
              <span className="text-xs font-bold text-foreground">Import Backup</span>
            </button>
          </div>

          <p className="text-[10px] text-foreground/30 mt-3 flex items-center gap-1.5">
            <Shield className="w-3 h-3 flex-shrink-0" />
            Supports V3, V5 & raw localStorage — auto-detects format
          </p>
        </div>

        {/* ── Card 2: Danger Zone ── */}
        <div className="glass-card p-5 border-destructive/15">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Danger Zone</h3>
              <p className="text-[11px] text-foreground/40">Irreversible actions</p>
            </div>
          </div>

          <button
            onClick={() => setShowClearDialog(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive/8 hover:bg-destructive/15 border border-destructive/20 text-destructive font-bold text-sm transition-all active:scale-[0.97]"
          >
            <Trash2 className="w-4 h-4" /> Clear All Data
          </button>
          <p className="text-[10px] text-foreground/30 mt-2 text-center">
            Permanently deletes all local data. Password required.
          </p>
        </div>

      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Import Dialog (Rich Preview)                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ImportDialog({
  pendingImport,
  importAnalysis,
  importProcessing,
  importProgress,
  importStatus,
  isLoggedIn,
  retryInfo,
  onClose,
  onExecute,
  onRetry,
}: {
  pendingImport: { historyItems: QuizResult[]; settings: Record<string, string | null>; preview: BackupPreview; fileName: string; fileSize: number } | null;
  importAnalysis: { newCount: number; dupCount: number; existingCount: number } | null;
  importProcessing: boolean;
  importProgress: number;
  importStatus: string;
  isLoggedIn: boolean;
  retryInfo: { failedIndices: number[]; batchSize: number; totalBatches: number; synced: number } | null;
  onClose: () => void;
  onExecute: (mode: 'overlap' | 'fresh') => void;
  onRetry: () => void;
}) {
  if (!pendingImport || !importAnalysis) return null;
  const { preview } = pendingImport;

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-bold">
            <Upload className="w-5 h-5 text-primary" /> Import Backup
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Format badge + file info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-foreground/70 truncate max-w-[180px]">{pendingImport.fileName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                {preview.formatLabel}
              </span>
              <span className="text-[10px] text-foreground/30 font-mono">{formatBytes(preview.rawSize)}</span>
            </div>
          </div>

          {/* Main stats grid */}
          <div className="bg-foreground/5 rounded-xl p-4 border border-border space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatPill label="Quizzes" value={preview.quizCount} color="text-primary" bg="bg-primary/8" />
              <StatPill label="New" value={importAnalysis.newCount} color="text-accent" bg="bg-accent/8" />
              <StatPill label="Overlap" value={importAnalysis.dupCount} color="text-foreground/60" bg="bg-foreground/5" />
            </div>

            {/* Data integrity */}
            {(preview.fullDataCount > 0 || preview.summaryOnlyCount > 0) && (
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                {preview.fullDataCount > 0 && (
                  <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-lg font-semibold">
                    ✅ {preview.fullDataCount} with full data
                  </span>
                )}
                {preview.summaryOnlyCount > 0 && (
                  <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-lg font-semibold">
                    ⚠️ {preview.summaryOnlyCount} summary only
                  </span>
                )}
              </div>
            )}

            {/* Detailed breakdown */}
            <div className="grid grid-cols-2 gap-1.5">
              {preview.subjects.length > 0 && (
                <DetailChip icon={<BookOpen className="w-3 h-3" />} label={`${preview.subjects.length} subject${preview.subjects.length > 1 ? 's' : ''}`} />
              )}
              {preview.settingsCount > 0 && (
                <DetailChip icon={<Settings2 className="w-3 h-3" />} label={`${preview.settingsCount} settings`} />
              )}
              {preview.fileTreeItems > 0 && (
                <DetailChip icon={<FolderTree className="w-3 h-3" />} label={`${preview.fileTreeItems} file tree items`} />
              )}
              {preview.collectionItems > 0 && (
                <DetailChip icon={<Database className="w-3 h-3" />} label={`${preview.collectionItems} collections`} />
              )}
              {preview.bookmarkCount > 0 && (
                <DetailChip icon={<Bookmark className="w-3 h-3" />} label={`${preview.bookmarkCount} bookmarks`} />
              )}
              {preview.templateCount > 0 && (
                <DetailChip icon={<FileText className="w-3 h-3" />} label={`${preview.templateCount} templates`} />
              )}
              {preview.hasTheme && (
                <DetailChip icon={<Palette className="w-3 h-3" />} label="Theme & appearance" />
              )}
              {preview.hasApiKeys && (
                <DetailChip icon={<Key className="w-3 h-3" />} label="API keys" />
              )}
              {preview.hasExamDates && (
                <DetailChip icon={<CalendarDays className="w-3 h-3" />} label="Exam dates" />
              )}
              {preview.hasStudyPlan && (
                <DetailChip icon={<Brain className="w-3 h-3" />} label="Study plan" />
              )}
            </div>

            {/* Score & date range */}
            <div className="flex flex-wrap gap-2 text-[10px]">
              {preview.avgScore > 0 && (
                <span className="bg-secondary/50 text-secondary-foreground px-2 py-0.5 rounded-lg font-semibold">
                  Avg: {preview.avgScore}%
                </span>
              )}
              {preview.dateRange && (
                <span className="text-foreground/30 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {preview.dateRange.oldest.toLocaleDateString()} → {preview.dateRange.newest.toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Subject list */}
            {preview.subjects.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {preview.subjects.slice(0, 8).map(s => (
                  <span key={s} className="text-[9px] bg-primary/8 text-primary/80 px-1.5 py-0.5 rounded font-semibold truncate max-w-[120px]">{s}</span>
                ))}
                {preview.subjects.length > 8 && (
                  <span className="text-[9px] text-foreground/30 font-bold">+{preview.subjects.length - 8} more</span>
                )}
              </div>
            )}
          </div>

          {/* Current data context */}
          <p className="text-[11px] text-foreground/40 px-1">
            You currently have <strong className="text-foreground/60">{importAnalysis.existingCount}</strong> quizzes locally
          </p>

          {/* Merge option */}
          <button
            onClick={() => onExecute('overlap')}
            disabled={importProcessing}
            className="w-full text-left p-4 rounded-xl border border-primary/25 bg-primary/5 hover:bg-primary/10 transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">Merge</p>
                <p className="text-[11px] text-foreground/40">
                  Keep existing + add {importAnalysis.newCount} new{importAnalysis.dupCount > 0 ? `, update ${importAnalysis.dupCount} overlapping` : ''}
                </p>
              </div>
            </div>
          </button>

          {/* Fresh Start option */}
          <button
            onClick={() => onExecute('fresh')}
            disabled={importProcessing}
            className="w-full text-left p-4 rounded-xl border border-destructive/25 bg-destructive/5 hover:bg-destructive/10 transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground group-hover:text-destructive transition-colors">Fresh Start</p>
                <p className="text-[11px] text-foreground/40">
                  Replace everything → {pendingImport.historyItems.length} quizzes
                </p>
              </div>
            </div>
          </button>

          {/* Progress */}
          {importProcessing && (
            <div className="space-y-2 py-1">
              <Progress value={importProgress} className="h-2" />
              <div className="flex items-center justify-center gap-2 text-xs text-primary font-bold">
                <Loader2 className="w-4 h-4 animate-spin" />
                {importStatus || 'Processing…'}
              </div>
            </div>
          )}

          {/* Retry failed batches */}
          {!importProcessing && retryInfo && retryInfo.failedIndices.length > 0 && (
            <div className="space-y-3 py-1">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 space-y-1">
                <p className="font-bold text-amber-400">⚠️ Partial sync complete</p>
                <p>{retryInfo.synced} records synced · {retryInfo.failedIndices.length} batch(es) failed</p>
              </div>
              <button
                onClick={onRetry}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-400 font-bold text-sm transition-all active:scale-[0.97]"
              >
                <RotateCcw className="w-4 h-4" />
                Retry {retryInfo.failedIndices.length} failed batch{retryInfo.failedIndices.length > 1 ? 'es' : ''}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Stat Pill ── */
function StatPill({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-lg p-2.5 text-center`}>
      <p className={`text-lg font-black ${color} leading-none`}>{value}</p>
      <p className="text-[8px] font-bold text-foreground/40 mt-0.5 uppercase">{label}</p>
    </div>
  );
}

/* ── Detail Chip ── */
function DetailChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-foreground/50 bg-foreground/[0.03] border border-border rounded-lg px-2 py-1">
      <span className="text-foreground/30">{icon}</span>
      <span className="font-semibold truncate">{label}</span>
    </div>
  );
}
