import { useState, useMemo, useCallback, useRef } from 'react';
import { loadFileTree, countFiles } from '../utils/fileTree';
import { wipeAllLocalStores, clearStorageKeys, mirrorRestoredSettingsToIdb } from '../utils/dataReset';
import {
  Cloud, RefreshCw, ChevronDown, ChevronRight, Download, Upload, Trash2, X,
  HardDrive, Database, Layers, AlertCircle, Loader2, FileJson, Clock,
  BookOpen, Settings2, FolderTree, Bookmark, FileText, Palette, Key,
  CalendarDays, Brain, Sparkles, CheckCircle2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { Progress } from '@project/components/ui/progress';
import { toast } from 'sonner';
// Cloud backup sync removed
import { syncSubjectsFromHistory } from '../utils/subjects';
import { getHistorySync, setHistory } from '../utils/historyStore';
import {
  parseBackupFile, formatBytes, safeNum, ALL_APP_KEYS, BackupPreview,
} from '../utils/backupUtils';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface CategoryData {
  key: string;
  icon: string;
  label: string;
  storageKeys: string[];
  detail: () => string;
}

function getStorageSize(keys: string[]): number {
  let size = 0;
  for (const key of keys) {
    try {
      const val = localStorage.getItem(key);
      if (val) size += new Blob([val]).size;
    } catch { /* */ }
  }
  return size;
}

function getRecordCount(keys: string[]): number {
  let count = 0;
  for (const key of keys) {
    try {
      const val = localStorage.getItem(key);
      if (!val) continue;
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) count += parsed.length;
      else if (typeof parsed === 'object' && parsed !== null) count += Object.keys(parsed).length;
      else count += 1;
    } catch { count += 1; }
  }
  return count;
}

function getAllLocalStorageKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }
  return keys;
}

function getQmpKeys(prefix: string): string[] {
  return getAllLocalStorageKeys().filter(k => k.startsWith(prefix));
}

const CATEGORIES: CategoryData[] = [
  {
    key: 'history',
    icon: '📚',
    label: 'Quiz History & Results',
    storageKeys: ['qmp_history', 'qmp_pinned_quizzes'],
    detail: () => {
      try {
        const h = getHistorySync();
        const totalQs = h.reduce((s: number, r: any) => s + (r.totalQuestions || 0), 0);
        return `${h.length} quiz results · ${totalQs} total questions`;
      } catch { return '0 results'; }
    },
  },
  {
    key: 'organizer',
    icon: '🗂️',
    label: 'Library Organizer (Folders & Files)',
    storageKeys: ['qmp_file_tree', 'qmp_file_trash'],
    detail: () => {
      try {
        const tree = loadFileTree();
        return `${countFiles(tree)} files in your folders (independent of quiz history)`;
      } catch { return '0 files'; }
    },
  },
  {
    key: 'settings',
    icon: '⚙️',
    label: 'App Settings & Preferences',
    storageKeys: [
      'qmp_theme', 'qmp_rationale_prefs', 'qmp_report_helper',
      'qmp_feature_visibility', 'qmp_quiz_skins', 'qmp_profile',
      'rjquiz:profile',
      ...getQmpKeys('qmp_setting'),
    ],
    detail: () => {
      try {
        const profile = JSON.parse(localStorage.getItem('qmp_profile') || '{}');
        const theme = localStorage.getItem('qmp_theme') || 'default';
        return `Theme: ${theme} · Profile: ${profile.displayName || 'Default'}`;
      } catch { return 'Default settings'; }
    },
  },
  {
    key: 'cache',
    icon: '🧠',
    label: 'AI Rationale Cache',
    storageKeys: ['qmp_rationale_cache', ...getQmpKeys('qmp_cache'), ...getQmpKeys('qmp_revision')],
    detail: () => {
      try {
        const cache = JSON.parse(localStorage.getItem('qmp_rationale_cache') || '{}');
        const count = Object.keys(cache).length;
        return `${count} cached AI explanations`;
      } catch { return '0 cached'; }
    },
  },
  {
    key: 'trash',
    icon: '🗑️',
    label: 'Trash & Deleted Items',
    storageKeys: ['qmp_trash', 'qmp_trashed_history'],
    detail: () => {
      try {
        const t = JSON.parse(localStorage.getItem('qmp_trash') || '[]');
        const th = JSON.parse(localStorage.getItem('qmp_trashed_history') || '[]');
        return `${t.length + th.length} trashed items`;
      } catch { return '0 items'; }
    },
  },
];

/* ─── Stat Card ─────────────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center gap-1.5 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
      <div className="relative z-10">{icon}</div>
      <span className="text-lg font-black text-foreground relative z-10">{value}</span>
      <span className="text-[9px] font-black text-foreground/30 uppercase tracking-widest relative z-10">{label}</span>
      {sub && <span className="text-[8px] text-foreground/20 relative z-10">{sub}</span>}
    </div>
  );
}

/* ─── Category Row ──────────────────────────────────────────────────── */
function CategoryRow({ cat, expanded, onToggle, onExport, onClear }: {
  cat: CategoryData; expanded: boolean;
  onToggle: () => void; onExport: () => void; onClear: () => void;
}) {
  const size = useMemo(() => getStorageSize(cat.storageKeys), [cat.storageKeys]);
  const records = useMemo(() => getRecordCount(cat.storageKeys), [cat.storageKeys]);
  const detail = useMemo(() => cat.detail(), [cat]);

  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-card/50 backdrop-blur-sm">
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all hover:bg-foreground/[0.03] active:bg-foreground/[0.05]">
        <span className="text-xl flex-shrink-0">{cat.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{cat.label}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold text-foreground/30">{records} records</span>
            <span className="text-foreground/10">·</span>
            <span className="text-[10px] font-bold text-foreground/25">{formatBytes(size)}</span>
          </div>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-foreground/30 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-foreground/30 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border animate-fade-in">
          <p className="text-xs text-foreground/50 mb-3 leading-relaxed">{detail}</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-foreground/[0.03] border border-border rounded-xl p-2.5 text-center">
              <span className="text-sm font-black text-foreground">{records}</span>
              <p className="text-[8px] font-bold text-foreground/25 uppercase tracking-widest mt-0.5">Records</p>
            </div>
            <div className="bg-foreground/[0.03] border border-border rounded-xl p-2.5 text-center">
              <span className="text-sm font-black text-foreground">{formatBytes(size)}</span>
              <p className="text-[8px] font-bold text-foreground/25 uppercase tracking-widest mt-0.5">Storage</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onExport}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary/10 border border-primary/25 text-primary text-[11px] font-bold transition-all hover:bg-primary/15 active:scale-[0.97]">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button onClick={onClear}
              className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-[11px] font-bold transition-all hover:bg-destructive/15 active:scale-[0.97]">
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Detail Chip ── */
function DetailChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-foreground/50 bg-foreground/[0.03] border border-border rounded-lg px-2 py-1">
      <span className="text-foreground/30">{icon}</span>
      <span className="font-semibold truncate">{label}</span>
    </div>
  );
}

/* ─── Stat Pill ── */
function StatPill({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-lg p-2.5 text-center`}>
      <p className={`text-lg font-black ${color} leading-none`}>{value}</p>
      <p className="text-[8px] font-bold text-foreground/40 mt-0.5 uppercase">{label}</p>
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────────────────── */
export default function CloudDataManager({ open, onClose, onSync, isLoggedIn }: {
  open: boolean; onClose: () => void; onSync?: () => void; isLoggedIn?: boolean;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [clearTarget, setClearTarget] = useState<CategoryData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Import state (same pipeline as BackupSection)
  const [pendingImport, setPendingImport] = useState<{
    historyItems: any[];
    settings: Record<string, string | null>;
    preview: BackupPreview;
    fileName: string;
  } | null>(null);
  const [importProcessing, setImportProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const totalSize = useMemo(() => {
    let size = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) {
        const v = localStorage.getItem(k);
        if (v) size += new Blob([k + v]).size;
      }
    }
    return size;
  }, [refreshKey]);

  const totalRecords = useMemo(() => {
    return CATEGORIES.reduce((sum, cat) => sum + getRecordCount(cat.storageKeys), 0);
  }, [refreshKey]);

  const lastModified = useMemo(() => {
    try {
      const h = getHistorySync();
      if (h.length > 0) {
        const latest = Math.max(...h.map((r: any) => r.timestamp || 0));
        if (latest > 0) return new Date(latest).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
    } catch { /* */ }
    return 'Unknown';
  }, [refreshKey]);

  const handleSync = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      onSync?.();
      await new Promise(r => setTimeout(r, 1500));
      setSyncStatus('synced');
      setRefreshKey(k => k + 1);
      toast.success('☁️ Sync complete!');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch {
      setSyncStatus('error');
      toast.error('Sync failed. Try again.');
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  }, [onSync]);

  const handleExport = useCallback((cat: CategoryData) => {
    const data: Record<string, any> = {};
    cat.storageKeys.forEach(key => {
      const val = localStorage.getItem(key);
      if (val) {
        try { data[key] = JSON.parse(val); } catch { data[key] = val; }
      }
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qmp_${cat.key}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`📦 Exported ${cat.label}`);
  }, []);

  const handleExportAll = useCallback(() => {
    const data: Record<string, any> = {};
    getAllLocalStorageKeys().filter(k => k.startsWith('qmp_') || k.startsWith('rjquiz:')).forEach(key => {
      const val = localStorage.getItem(key);
      if (val) {
        try { data[key] = JSON.parse(val); } catch { data[key] = val; }
      }
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qmp_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('📦 Full backup exported!');
  }, []);

  /* ─── Unified Import Handler (same pipeline as BackupSection) ─── */
  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast.error('Could not read file.');
    reader.onload = () => {
      const raw = reader.result as string;
      if (!raw) { toast.error('Empty file.'); return; }
      const result = parseBackupFile(raw, file.size);
      if ('error' in result) {
        toast.error(`❌ ${result.error}`);
        return;
      }
      setPendingImport({
        historyItems: result.historyItems,
        settings: result.settings,
        preview: result.preview,
        fileName: file.name,
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  /* ─── Execute import ─── */
  const executeImport = useCallback(async (mode: 'overlap' | 'fresh') => {
    if (!pendingImport) return;
    setImportProcessing(true);
    setImportProgress(0);
    const { historyItems, settings } = pendingImport;

    try {
      await new Promise(r => setTimeout(r, 150));
      setImportProgress(10);

      if (mode === 'fresh') {
        await wipeAllLocalStores();
      }
      setImportProgress(20);

      if (historyItems.length > 0) {
        if (mode === 'fresh') {
          setHistory(historyItems.slice(0, 200));
        } else {
          let existing: any[] = [];
          try { existing = getHistorySync(); } catch { /* */ }
          const merged = new Map<number, any>();
          for (const r of existing) merged.set(r.timestamp, r);
          for (const r of historyItems) merged.set(r.timestamp, r);
          const mergedArr = Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 200);
          setHistory(mergedArr);
        }
        syncSubjectsFromHistory(historyItems);
      }
      setImportProgress(40);

      for (const [key, val] of Object.entries(settings)) {
        if (val != null) localStorage.setItem(key, val);
      }
      await mirrorRestoredSettingsToIdb(settings as Record<string, string | undefined>);
      setImportProgress(50);
      setImportProgress(95);

      await new Promise(r => setTimeout(r, 400));
      setImportProgress(100);

      const parts = [
        historyItems.length > 0 ? `${historyItems.length} quizzes` : '',
        Object.values(settings).filter(Boolean).length > 0 ? 'settings' : '',
      ].filter(Boolean).join(' + ');

      toast.success(`✅ ${mode === 'fresh' ? 'Fresh' : 'Merged'}: ${parts || 'Done'}! Reloading…`);
      setPendingImport(null);
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      toast.error('Import failed.');
    } finally {
      setImportProcessing(false);
      setImportProgress(0);
    }
  }, [pendingImport, isLoggedIn]);

  const handleClearCategory = useCallback(async () => {
    if (!clearTarget) return;
    const label = clearTarget.label;
    await clearStorageKeys(clearTarget.storageKeys);
    setClearTarget(null);
    setRefreshKey(k => k + 1);
    toast.success(`🗑️ Cleared ${label} — reloading…`);
    setTimeout(() => window.location.reload(), 700);
  }, [clearTarget]);

  const statusConfig: Record<SyncStatus, { label: string; color: string; dot: string }> = {
    idle: { label: 'Ready', color: 'text-foreground/40', dot: 'bg-foreground/20' },
    syncing: { label: 'Syncing…', color: 'text-primary', dot: 'bg-primary animate-pulse' },
    synced: { label: 'Synced ✓', color: 'text-emerald-400', dot: 'bg-emerald-500' },
    error: { label: 'Error', color: 'text-destructive', dot: 'bg-destructive' },
  };

  const sc = statusConfig[syncStatus];

  // Import analysis
  const importAnalysis = pendingImport ? (() => {
    const { historyItems } = pendingImport;
    let existing: any[] = [];
    try { existing = getHistorySync(); } catch { /* */ }
    const existingTs = new Set(existing.map((r: any) => r.timestamp));
    const newCount = historyItems.filter((r: any) => !existingTs.has(r.timestamp)).length;
    const dupCount = historyItems.length - newCount;
    return { newCount, dupCount, existingCount: existing.length };
  })() : null;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileSelected}
      />

      <AlertDialog open={!!clearTarget} onOpenChange={v => !v && setClearTarget(null)}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Clear {clearTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently remove all data in this category from local storage. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearCategory} className="bg-destructive hover:bg-destructive/90 text-white border-none">Clear Data</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Import Preview Dialog ── */}
      {pendingImport && importAnalysis && (
        <Dialog open onOpenChange={v => { if (!v) setPendingImport(null); }}>
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
                <span className="text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                  {pendingImport.preview.formatLabel}
                </span>
              </div>

              {/* Stats */}
              <div className="bg-foreground/5 rounded-xl p-4 border border-border space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <StatPill label="Quizzes" value={pendingImport.preview.quizCount} color="text-primary" bg="bg-primary/8" />
                  <StatPill label="New" value={importAnalysis.newCount} color="text-accent" bg="bg-accent/8" />
                  <StatPill label="Overlap" value={importAnalysis.dupCount} color="text-foreground/60" bg="bg-foreground/5" />
                </div>

                {(pendingImport.preview.fullDataCount > 0 || pendingImport.preview.summaryOnlyCount > 0) && (
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    {pendingImport.preview.fullDataCount > 0 && (
                      <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-lg font-semibold">
                        ✅ {pendingImport.preview.fullDataCount} with full data
                      </span>
                    )}
                    {pendingImport.preview.summaryOnlyCount > 0 && (
                      <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-lg font-semibold">
                        ⚠️ {pendingImport.preview.summaryOnlyCount} summary only
                      </span>
                    )}
                  </div>
                )}

                {/* Detailed breakdown */}
                <div className="grid grid-cols-2 gap-1.5">
                  {pendingImport.preview.subjects.length > 0 && (
                    <DetailChip icon={<BookOpen className="w-3 h-3" />} label={`${pendingImport.preview.subjects.length} subjects`} />
                  )}
                  {pendingImport.preview.settingsCount > 0 && (
                    <DetailChip icon={<Settings2 className="w-3 h-3" />} label={`${pendingImport.preview.settingsCount} settings`} />
                  )}
                  {pendingImport.preview.fileTreeItems > 0 && (
                    <DetailChip icon={<FolderTree className="w-3 h-3" />} label={`${pendingImport.preview.fileTreeItems} files`} />
                  )}
                  {pendingImport.preview.bookmarkCount > 0 && (
                    <DetailChip icon={<Bookmark className="w-3 h-3" />} label={`${pendingImport.preview.bookmarkCount} bookmarks`} />
                  )}
                  {pendingImport.preview.hasTheme && (
                    <DetailChip icon={<Palette className="w-3 h-3" />} label="Theme" />
                  )}
                  {pendingImport.preview.hasStudyPlan && (
                    <DetailChip icon={<Brain className="w-3 h-3" />} label="Study plan" />
                  )}
                </div>

                {pendingImport.preview.dateRange && (
                  <p className="text-[10px] text-foreground/30 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {pendingImport.preview.dateRange.oldest.toLocaleDateString()} → {pendingImport.preview.dateRange.newest.toLocaleDateString()}
                  </p>
                )}
              </div>

              <p className="text-[11px] text-foreground/40 px-1">
                You currently have <strong className="text-foreground/60">{importAnalysis.existingCount}</strong> quizzes locally
              </p>

              {/* Merge */}
              <button
                onClick={() => executeImport('overlap')}
                disabled={importProcessing}
                className="w-full text-left p-4 rounded-xl border border-primary/25 bg-primary/5 hover:bg-primary/10 transition-all group disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">Merge</p>
                    <p className="text-[11px] text-foreground/40">Keep existing + add {importAnalysis.newCount} new</p>
                  </div>
                </div>
              </button>

              {/* Fresh */}
              <button
                onClick={() => executeImport('fresh')}
                disabled={importProcessing}
                className="w-full text-left p-4 rounded-xl border border-destructive/25 bg-destructive/5 hover:bg-destructive/10 transition-all group disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-destructive" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground group-hover:text-destructive transition-colors">Fresh Start</p>
                    <p className="text-[11px] text-foreground/40">Replace everything → {pendingImport.historyItems.length} quizzes</p>
                  </div>
                </div>
              </button>

              {importProcessing && (
                <div className="space-y-2 py-1">
                  <Progress value={importProgress} className="h-2" />
                  <div className="flex items-center justify-center gap-2 text-xs text-primary font-bold">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {importProgress < 20 ? 'Preparing…' : importProgress < 40 ? 'Saving locally…' : importProgress < 50 ? 'Applying settings…' : importProgress < 90 ? 'Syncing to cloud…' : 'Finalizing…'}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="bg-background border-border text-foreground rounded-2xl max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col p-0 top-[4%] translate-y-0">
          {/* Header */}
          <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-border relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/5 pointer-events-none" />
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/8 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                    <Cloud className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-foreground">Data & Sync Manager</h2>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                      <span className={`text-[10px] font-bold ${sc.color}`}>{sc.label}</span>
                    </div>
                  </div>
                </div>
                <button onClick={onClose}
                  className="w-8 h-8 rounded-xl bg-card border border-border flex items-center justify-center text-foreground/40 hover:text-foreground transition-all active:scale-90">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 text-[10px] text-foreground/35 font-bold">
                <span>{formatBytes(totalSize)} total</span>
                <span className="text-foreground/10">·</span>
                <span>{totalRecords} records</span>
                <span className="text-foreground/10">·</span>
                <span>{CATEGORIES.length} categories</span>
                <span className="text-foreground/10">·</span>
                <span>{lastModified}</span>
              </div>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="flex-shrink-0 grid grid-cols-3 gap-2 px-5 pt-4 pb-2">
            <StatCard icon={<HardDrive className="w-4 h-4 text-primary" />} label="Total Size" value={formatBytes(totalSize)} />
            <StatCard icon={<Database className="w-4 h-4 text-emerald-400" />} label="Records" value={String(totalRecords)} />
            <StatCard icon={<Layers className="w-4 h-4 text-amber-400" />} label="Categories" value={String(CATEGORIES.length)} />
          </div>

          {/* Info Banner */}
          <div className="flex-shrink-0 mx-5 mt-2 mb-3 p-3 bg-primary/5 border border-primary/15 rounded-xl flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-foreground/70 leading-relaxed">
                Download & Upload your complete Quiz Master Pro data
              </p>
              <p className="text-[10px] text-foreground/40 leading-relaxed mt-1">
                Supports V3, V5 & raw localStorage formats. Auto-detects format with detailed preview before import.
              </p>
            </div>
          </div>

          {/* Category List */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
            {CATEGORIES.map(cat => (
              <CategoryRow
                key={cat.key + refreshKey}
                cat={cat}
                expanded={expandedKey === cat.key}
                onToggle={() => setExpandedKey(expandedKey === cat.key ? null : cat.key)}
                onExport={() => handleExport(cat)}
                onClear={() => setClearTarget(cat)}
              />
            ))}
          </div>

          {/* Bottom Actions */}
          <div className="flex-shrink-0 border-t border-border px-5 py-4 bg-card/50 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleExportAll}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold transition-all active:scale-[0.97]">
                <Download className="w-4 h-4" /> Download All
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-card border border-border text-foreground/70 text-sm font-bold transition-all hover:text-foreground hover:border-foreground/20 active:scale-[0.97]">
                <Upload className="w-4 h-4" /> Upload Backup
              </button>
            </div>
            <button onClick={handleSync} disabled={syncStatus === 'syncing'}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              {syncStatus === 'syncing' ? 'Syncing Cloud…' : 'Sync to Cloud'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
