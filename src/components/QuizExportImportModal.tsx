import { useState, useRef, useMemo, useCallback } from 'react';
import SearchInput, { SearchEmptyState } from './shared/SearchInput';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { toast } from 'sonner';
import {
  Download, Upload, FileJson, FileText, FileSpreadsheet, Copy, Check,
  Package, ChevronRight, ChevronDown, Eye, Play, FolderPlus, X, Clipboard,
  Share2, Search, Loader2, Clock, BarChart3, History,
} from 'lucide-react';
import { QuizQuestion, QuizResult } from '../types/quiz';
import { loadFileTree, createFile, findDuplicateFile, ROOT_ID, FileNode, getAllFiles } from '../utils/fileTree';
import { localOfflineParser, toMcqText, MCQ_SAMPLE } from '../utils/quizParser';
import { parseCSVText, autoMapColumns, validateAndConvert } from '../utils/csvParser';
import { loadFullResults } from '../utils/reports/loadFull';
import { storeQuizDetail } from '../hooks/useHistorySync';
import { getQuizDetail } from 'zitejs/api';
import { useAuth } from 'zitejs/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportFormat = 'quizpkg' | 'json' | 'csv' | 'text' | 'clipboard';
type ImportSource = 'file' | 'paste' | 'clipboard';
type Tab = 'export' | 'import';

interface ExportableQuiz {
  title?: string;
  subject?: string;
  difficulty?: string;
  questions: QuizQuestion[];
  questionCount: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Current history for exporting */
  history?: QuizResult[];
  /** Callback when user wants to start a quiz with imported questions */
  onStartQuiz?: (questions: QuizQuestion[]) => void;
  /** Initial tab */
  initialTab?: Tab;
  /** Pre-selected quiz for single export */
  selectedQuiz?: QuizResult;
  /** Fetch full quiz detail from server (LRU cached) */
  fetchFullDetail?: (id: string) => Promise<QuizResult | null>;
  /** Whether the user is logged in */
  isLoggedIn?: boolean;
  /** Callback to import quiz results into history */
  onImportToHistory?: (records: QuizResult[]) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function questionsToCSV(questions: QuizQuestion[]): string {
  const header = 'Question,Option A,Option B,Option C,Option D,Correct Answer,Difficulty,Rationale';
  const rows = questions.map(q => {
    const opts = q.options || [];
    return [
      `"${(q.question || '').replace(/"/g, '""')}"`,
      ...Array.from({ length: 4 }, (_, i) => `"${(opts[i] || '').replace(/"/g, '""')}"`),
      `"${(q.correctAnswer || '').replace(/"/g, '""')}"`,
      q.difficulty || 'medium',
      `"${(q.rationale || '').replace(/"/g, '""')}"`,
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

function questionsToText(questions: QuizQuestion[], title?: string): string {
  const body = toMcqText(questions);
  return title ? `${title}\n\n${body}\n` : `${body}\n`;
}

function downloadBlob(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  return blob.size;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function safeNum(v: any, fb = 0): number {
  if (v == null) return fb;
  const n = Number(v);
  return isNaN(n) || !isFinite(n) ? fb : n;
}

/** Normalize a backup record into a QuizResult for import */
function normalizeBackupRecord(item: any): QuizResult {
  let quizData: QuizQuestion[] = [];
  let userAnswers: (string | null)[] = [];
  if (Array.isArray(item.quizData)) quizData = item.quizData;
  else { try { quizData = JSON.parse(item.quizDataJson || item.quizData || '[]'); } catch { quizData = []; } }
  if (Array.isArray(item.userAnswers)) userAnswers = item.userAnswers;
  else { try { userAnswers = JSON.parse(item.userAnswersJson || item.userAnswers || '[]'); } catch { userAnswers = []; } }
  while (userAnswers.length < quizData.length) userAnswers.push(null);

  const correct = safeNum(item.correct ?? item.correctCount, 0);
  const wrong = safeNum(item.wrong ?? item.wrongCount, 0);
  const skipped = safeNum(item.skipped ?? item.skippedCount, 0);
  const score = safeNum(item.score ?? item.netScore, 0);
  const maxScore = safeNum(item.maxScore, quizData.length);
  const totalQuestions = safeNum(item.totalQuestions, quizData.length);
  const answered = correct + wrong;
  const percentage = maxScore > 0 ? Math.max(0, Math.min(100, Math.round((score / maxScore) * 100))) : safeNum(item.percentage, 0);

  let timestamp = safeNum(item.timestamp ?? item.localTimestamp, 0);
  if (!timestamp && item.createdAt) timestamp = new Date(item.createdAt).getTime();
  if (!timestamp) timestamp = Date.now();

  return {
    id: item.id,
    quizData, userAnswers, score, maxScore, percentage,
    correct, wrong, skipped, totalQuestions,
    netScore: score,
    gain: safeNum(item.gain, correct),
    penalty: safeNum(item.penalty, 0),
    accuracy: answered > 0 ? Math.round((correct / answered) * 100) : 0,
    timeTaken: safeNum(item.timeTakenSeconds ?? item.timeTaken, 0),
    difficulty: item.difficulty || 'Mixed',
    timestamp,
    quizTitle: item.title ?? item.quizTitle,
    subject: item.subject,
    attemptType: item.attemptType === 'Practice' ? 'practice' : 'main',
    attemptNumber: item.attemptNumber,
    parentQuizId: item.parentQuizId,
    notes: item.notes,
  };
}

/** Check if data is in the main backup v5 format */
function isBackupFormat(data: any): boolean {
  if (data?._meta?.type === 'quiz-master-pro-full-backup') return true;
  if (data?.quizHistory?.records && Array.isArray(data.quizHistory.records)) return true;
  return false;
}

/** Extract quiz result records from a backup-format file */
function extractResultsFromBackup(data: any): QuizResult[] {
  const records = data?.quizHistory?.records;
  if (!Array.isArray(records)) return [];
  return records
    .filter((r: any) => r && typeof r === 'object')
    .map(normalizeBackupRecord);
}

// ─── Export Panel ─────────────────────────────────────────────────────────────

function ExportPanel({ history, selectedQuiz, onClose, fetchFullDetail, isLoggedIn }: {
  history: QuizResult[];
  selectedQuiz?: QuizResult;
  onClose: () => void;
  fetchFullDetail?: (id: string) => Promise<QuizResult | null>;
  isLoggedIn?: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => {
    if (selectedQuiz) {
      const idx = history.findIndex(r => r.timestamp === selectedQuiz.timestamp);
      return idx >= 0 ? new Set([idx]) : new Set<number>();
    }
    return new Set<number>();
  });
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(!selectedQuiz);
  const [format, setFormat] = useState<ExportFormat>('json');
  const [includeRationale, setIncludeRationale] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');

  // Show ALL quizzes — not just ones with local data
  const allQuizzes = useMemo(() => history, [history]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allQuizzes;
    const q = search.trim().toLowerCase();
    return allQuizzes.filter(r =>
      (r.quizTitle || '').toLowerCase().includes(q) ||
      (r.subject || '').toLowerCase().includes(q) ||
      r.quizData?.[0]?.question?.toLowerCase().includes(q)
    );
  }, [allQuizzes, search]);

  const toggleSelect = (idx: number) => {
    const realIdx = history.indexOf(filtered[idx]);
    if (realIdx < 0) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(realIdx)) next.delete(realIdx); else next.add(realIdx);
      return next;
    });
  };

  const selectAll = () => {
    const ids = filtered.map(r => history.indexOf(r)).filter(i => i >= 0);
    setSelectedIds(new Set(ids));
  };

  const selectedQuizzes = useMemo(() =>
    Array.from(selectedIds).map(i => history[i]).filter(Boolean), [selectedIds, history]);

  const totalQs = selectedQuizzes.reduce((a, r) => a + (r.quizData?.length || r.totalQuestions || 0), 0);
  const subjects = useMemo(() => [...new Set(selectedQuizzes.map(r => r.subject).filter(Boolean))], [selectedQuizzes]);
  const avgScore = selectedQuizzes.length > 0
    ? Math.round(selectedQuizzes.reduce((a, r) => a + (r.percentage || 0), 0) / selectedQuizzes.length) : 0;

  const handleExport = async () => {
    if (!selectedQuizzes.length) { toast.error('Select at least one quiz'); return; }

    if (format === 'json') {
      // ── Unified v5 backup format for JSON ──
      setExporting(true);
      setExportProgress('Preparing data…');
      try {
        // First hydrate from local IndexedDB detail shards (qd:YYYY-MM / qmp_detail_*)
        const { results: locallyHydrated } = await loadFullResults(selectedQuizzes);

        // Fetch full data from server for quizzes that still only have summaries
        const fullQuizzes: QuizResult[] = [];
        let fetchedCount = 0;
        const needsFetch = locallyHydrated.filter(r => (!r.quizData || r.quizData.length === 0) && r.id);

        for (const r of locallyHydrated) {
          if ((!r.quizData || r.quizData.length === 0) && r.id && fetchFullDetail && isLoggedIn) {
            fetchedCount++;
            setExportProgress(`Fetching quiz ${fetchedCount}/${needsFetch.length}…`);
            const full = await fetchFullDetail(r.id);
            fullQuizzes.push(full || r);
          } else {
            fullQuizzes.push(r);
          }
        }

        setExportProgress('Building export…');

        const withData = fullQuizzes.filter(r => r.quizData?.length > 0);
        const withoutData = fullQuizzes.filter(r => !r.quizData?.length);

        const exportData = {
          _meta: {
            version: 5,
            type: 'quiz-master-pro-full-backup',
            exportedAt: new Date().toISOString(),
            appName: 'Quiz Master Pro — Premium Edition',
            backupScope: `${fullQuizzes.length} selected quiz${fullQuizzes.length !== 1 ? 'zes' : ''}`,
            dataIntegrity: {
              totalRecords: fullQuizzes.length,
              recordsWithFullData: withData.length,
              recordsWithEmptyData: withoutData.length,
            },
          },
          quizHistory: {
            totalQuizzes: fullQuizzes.length,
            records: fullQuizzes.map(r => {
              let qd = r.quizData || [];
              if (!includeRationale) qd = qd.map(q => ({ ...q, rationale: undefined }));
              return {
                id: r.id,
                title: r.quizTitle || 'Untitled',
                subject: r.subject,
                difficulty: r.difficulty,
                score: r.netScore ?? r.score,
                maxScore: r.maxScore,
                percentage: r.percentage,
                correct: r.correct,
                wrong: r.wrong,
                skipped: r.skipped,
                totalQuestions: r.totalQuestions,
                timeTakenSeconds: r.timeTaken,
                gain: r.gain,
                penalty: r.penalty,
                timestamp: r.timestamp,
                localTimestamp: r.timestamp,
                quizData: qd,
                userAnswers: r.userAnswers || [],
                accuracy: r.accuracy,
                attemptType: r.attemptType === 'practice' ? 'Practice' : 'Main',
                attemptNumber: r.attemptNumber,
                parentQuizId: r.parentQuizId,
                notes: r.notes,
              };
            }),
          },
        };

        const dateStr = new Date().toISOString().split('T')[0];
        const subjectSlug = selectedQuizzes.length === 1 && selectedQuizzes[0].subject
          ? `_${selectedQuizzes[0].subject.replace(/[^a-zA-Z0-9]/g, '')}`
          : '';
        const fname = `QMP_QuizExport${subjectSlug}_${fullQuizzes.length}quizzes_${dateStr}.json`;
        const fileSize = downloadBlob(JSON.stringify(exportData, null, 2), 'application/json', fname);
        toast.success(`📄 Exported ${fullQuizzes.length} quizzes · ${formatBytes(fileSize)}`, { duration: 4000 });
        if (withoutData.length > 0) {
          toast.warning(`⚠️ ${withoutData.length} quiz(es) exported without question data (summary only)`, { duration: 5000 });
        }
      } catch (e: any) {
        toast.error(e?.message || 'Export failed');
      } finally {
        setExporting(false);
        setExportProgress('');
      }
      return;
    }

    // Non-JSON formats: hydrate from local detail shards first so sharded quizzes export cleanly offline
    const { results: hydratedSelected } = await loadFullResults(selectedQuizzes);
    const allQuestions = hydratedSelected.flatMap(r => {
      let qs = r.quizData || [];
      if (!includeRationale) qs = qs.map(q => ({ ...q, rationale: undefined }));
      return qs;
    });

    if (allQuestions.length === 0) {
      toast.error('Selected quizzes have no question data on this device.');
      return;
    }

    const title = hydratedSelected.length === 1
      ? hydratedSelected[0].quizTitle || 'Quiz Export'
      : `${hydratedSelected.length} Quizzes Export`;
    const dateStr = new Date().toISOString().split('T')[0];

    if (format === 'quizpkg') {
      const files = hydratedSelected
        .filter(r => r.quizData?.length > 0)
        .map(r => ({
          id: `exp_${r.timestamp}`,
          name: r.quizTitle || `Quiz ${new Date(r.timestamp).toLocaleDateString()}`,
          description: `Exported from Quiz Master Pro`,
          questions: includeRationale ? r.quizData : r.quizData.map(q => ({ ...q, rationale: undefined })),
          tags: r.subject ? [r.subject] : [],
          createdAt: r.timestamp,
          updatedAt: Date.now(),
        }));
      const pkg = { version: 2, type: 'quiz-package', files };
      const json = JSON.stringify(pkg, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `quiz_export_${Date.now()}.quizpkg`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`📦 Exported ${files.length} quiz package(s)!`);
    } else if (format === 'csv') {
      const csv = questionsToCSV(allQuestions);
      downloadBlob(csv, 'text/csv', `QuizExport_${dateStr}.csv`);
      toast.success('📊 CSV exported!');
    } else if (format === 'text') {
      const text = questionsToText(allQuestions, title);
      downloadBlob(text, 'text/plain', `QuizExport_${dateStr}.txt`);
      toast.success('📝 Text exported!');
    } else if (format === 'clipboard') {
      const text = questionsToText(allQuestions, title);
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        toast.success('📋 Copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => toast.error('Clipboard access denied'));
    }
  };

  const FORMAT_OPTIONS: { key: ExportFormat; icon: React.ReactNode; label: string; desc: string }[] = [
    { key: 'json', icon: <FileJson className="w-4 h-4" />, label: 'JSON (Backup Format)', desc: 'Full data — compatible with Backup & Restore' },
    { key: 'quizpkg', icon: <Package className="w-4 h-4" />, label: 'Quiz Package (.quizpkg)', desc: 'Portable — re-import into Quiz Master Pro' },
    { key: 'csv', icon: <FileSpreadsheet className="w-4 h-4" />, label: 'CSV Spreadsheet', desc: 'Open in Excel / Google Sheets' },
    { key: 'text', icon: <FileText className="w-4 h-4" />, label: 'Plain Text (.txt)', desc: 'Human-readable Q&A format' },
    { key: 'clipboard', icon: <Copy className="w-4 h-4" />, label: 'Copy to Clipboard', desc: 'Paste into notes / messaging apps' },
  ];

  return (
    <div className="space-y-4">
      {/* Export summary card */}
      {selectedQuizzes.length > 0 && (
        <div className="bg-primary/5 border border-primary/15 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-primary">Export Preview</span>
          </div>
          <p className="text-[11px] text-foreground/60">
            {selectedQuizzes.length} quiz{selectedQuizzes.length !== 1 ? 'zes' : ''} · {totalQs} Qs
            {avgScore > 0 && <> · Avg {avgScore}%</>}
            {subjects.length > 0 && <> · {subjects.slice(0, 3).join(', ')}{subjects.length > 3 ? ` +${subjects.length - 3}` : ''}</>}
          </p>
        </div>
      )}

      {/* Quiz selector */}
      <div className="space-y-2">
        <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between text-xs font-bold text-foreground/60 uppercase tracking-widest">
          <span>Select Quizzes ({selectedIds.size} selected)</span>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {expanded && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <SearchInput size="sm" className="flex-1" value={search} onChange={setSearch} placeholder="Search quizzes…" />
              <button onClick={selectAll} className="text-[10px] font-bold text-primary px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all whitespace-nowrap">
                Select All
              </button>
            </div>

            <div className="max-h-40 overflow-y-auto thin-scrollbar space-y-1 pr-1">
              {filtered.length === 0 ? (
                search.trim() ? <SearchEmptyState query={search.trim()} onClear={() => setSearch('')} noun="quizzes" />
                  : <p className="text-xs text-foreground/30 text-center py-4">No quizzes found.</p>
              ) : filtered.map((r, i) => {
                const realIdx = history.indexOf(r);
                const isSelected = selectedIds.has(realIdx);
                const hasFullData = Array.isArray(r.quizData) && r.quizData.length > 0;
                return (
                  <button key={r.timestamp} onClick={() => toggleSelect(i)}
                    className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-all ${isSelected ? 'bg-primary/15 border border-primary/30' : 'bg-foreground/4 border border-transparent hover:bg-foreground/8'}`}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-primary border-primary' : 'border-foreground/20'}`}>
                      {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold truncate text-foreground">{r.quizTitle || r.quizData?.[0]?.question?.substring(0, 40) || 'Untitled'}</p>
                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${hasFullData ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-primary/10 text-primary border border-primary/15'}`}>
                          {hasFullData ? '📦' : '☁️'}
                        </span>
                      </div>
                      <p className="text-[10px] text-foreground/40">
                        {r.totalQuestions} Qs · {r.subject || 'No subject'} · {r.percentage}% · {new Date(r.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Format picker */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-foreground/60 uppercase tracking-widest">Export Format</p>
        <div className="grid grid-cols-1 gap-1.5">
          {FORMAT_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setFormat(opt.key)}
              className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all ${format === opt.key ? 'bg-primary/15 border border-primary/30' : 'bg-foreground/4 border border-transparent hover:bg-foreground/8'}`}>
              <span className={format === opt.key ? 'text-primary' : 'text-foreground/40'}>{opt.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground">{opt.label}</p>
                <p className="text-[10px] text-foreground/30">{opt.desc}</p>
              </div>
              {format === opt.key && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <label className="flex items-center gap-2.5 bg-foreground/4 p-3 rounded-xl border border-border cursor-pointer">
        <input type="checkbox" checked={includeRationale} onChange={e => setIncludeRationale(e.target.checked)}
          className="w-4 h-4 rounded border-border accent-primary" />
        <div>
          <p className="text-xs font-bold text-foreground">Include Rationales</p>
          <p className="text-[10px] text-foreground/30">Include explanations with exported questions</p>
        </div>
      </label>

      {/* Export button */}
      <button onClick={handleExport} disabled={selectedIds.size === 0 || exporting}
        className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3.5 rounded-xl text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98]">
        {exporting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> {exportProgress || 'Exporting…'}</>
        ) : format === 'clipboard' ? (
          copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy to Clipboard</>
        ) : (
          <><Download className="w-4 h-4" /> Export {selectedIds.size} Quiz{selectedIds.size !== 1 ? 'zes' : ''}</>
        )}
      </button>
    </div>
  );
}

// ─── Import Panel ─────────────────────────────────────────────────────────────

function ImportPanel({ onStartQuiz, onClose, onImportToHistory, isLoggedIn }: {
  onStartQuiz?: (questions: QuizQuestion[]) => void;
  onClose: () => void;
  onImportToHistory?: (records: QuizResult[]) => void;
  isLoggedIn?: boolean;
}) {
  const [source, setSource] = useState<ImportSource>('file');
  const [pasteText, setPasteText] = useState('');
  const [importedQuestions, setImportedQuestions] = useState<QuizQuestion[]>([]);
  const [importedResults, setImportedResults] = useState<QuizResult[]>([]);
  const [importName, setImportName] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importingToHistory, setImportingToHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Summary for backup-format imports
  const resultsSummary = useMemo(() => {
    if (importedResults.length === 0) return null;
    const avgScore = Math.round(importedResults.reduce((a, r) => a + (r.percentage || 0), 0) / importedResults.length);
    const subjects = [...new Set(importedResults.map(r => r.subject).filter(Boolean))];
    const withData = importedResults.filter(r => r.quizData?.length > 0).length;
    const oldest = importedResults.length > 0 ? new Date(Math.min(...importedResults.map(r => r.timestamp))) : null;
    const newest = importedResults.length > 0 ? new Date(Math.max(...importedResults.map(r => r.timestamp))) : null;
    return { avgScore, subjects, withData, oldest, newest };
  }, [importedResults]);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setImportedResults([]);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'quizpkg' || ext === 'json') {
        // Try quiz package first
        const pkgText = await file.text();
        try {
          const pkgData = JSON.parse(pkgText);
          if (pkgData?.type === 'quiz-package') {
            const items = pkgData.files || pkgData.collections || [];
            if (Array.isArray(items) && items.length > 0) {
              const allQs = items.flatMap((c: any) => c.questions || []);
              if (allQs.length > 0) {
                setImportedQuestions(allQs);
                setImportName(items.length === 1 ? items[0].name : `${items.length} Quiz Files`);
                toast.success(`📦 Found ${allQs.length} questions in ${items.length} file(s)!`);
                setLoading(false);
                return;
              }
            }
          }
        } catch { /* not valid JSON quiz package, continue */ }
        // Try JSON
        const text = await file.text();
        try {
          const data = JSON.parse(text);

          // Check for unified backup format (v5 or has quizHistory.records)
          if (isBackupFormat(data)) {
            const results = extractResultsFromBackup(data);
            const allQs = results.flatMap(r => r.quizData || []);
            if (results.length > 0) {
              setImportedResults(results);
              setImportedQuestions(allQs);
              const scope = data._meta?.backupScope || `${results.length} quizzes`;
              setImportName(scope);
              toast.success(`📄 Found ${results.length} quizzes with full result data!`);
              setLoading(false);
              return;
            }
          }

          // Old v2 quiz-master-export format
          if (data?.type === 'quiz-master-export' && Array.isArray(data.quizzes)) {
            const allQs = data.quizzes.flatMap((q: ExportableQuiz) => q.questions || []);
            setImportedQuestions(allQs);
            setImportName(`${data.quizzes.length} Quiz Export`);
            toast.success(`📄 Found ${allQs.length} questions!`);
            setLoading(false);
            return;
          }
          // Try as raw quiz question array
          if (Array.isArray(data) && data[0]?.question && data[0]?.options) {
            setImportedQuestions(data);
            setImportName(file.name.replace(/\.[^.]+$/, ''));
            toast.success(`📄 Found ${data.length} questions!`);
            setLoading(false);
            return;
          }
          // Try as backup with history (deep search)
          const extract = (d: any): QuizQuestion[] => {
            const findQuizData = (obj: any): QuizQuestion[] => {
              if (!obj || typeof obj !== 'object') return [];
              if (Array.isArray(obj)) {
                return obj.flatMap(item => {
                  if (item?.quizData && Array.isArray(item.quizData)) return item.quizData;
                  if (item?.question && item?.options) return [item];
                  return [];
                });
              }
              for (const key of Object.keys(obj)) {
                const result = findQuizData(obj[key]);
                if (result.length > 0) return result;
              }
              return [];
            };
            return findQuizData(d);
          };
          const qs = extract(data);
          if (qs.length > 0) {
            setImportedQuestions(qs);
            setImportName(file.name.replace(/\.[^.]+$/, ''));
            toast.success(`📄 Extracted ${qs.length} questions from backup!`);
            setLoading(false);
            return;
          }
        } catch { /* not JSON */ }
      }

      if (ext === 'csv') {
        const text = await file.text();
        const parsed = parseCSVText(text);
        if (parsed.rows.length > 0) {
          const mapping = autoMapColumns(parsed.headers);
          if (mapping.question !== undefined) {
            const { questions: qs } = validateAndConvert(parsed.rows, mapping as any);
            if (qs.length > 0) {
              setImportedQuestions(qs);
              setImportName(file.name.replace(/\.[^.]+$/, ''));
              toast.success(`📊 Parsed ${qs.length} questions from CSV!`);
              setLoading(false);
              return;
            }
          }
        }
      }

      // Fallback: try text parsing
      const text = await file.text();
      const qs = localOfflineParser(text);
      if (qs.length > 0) {
        setImportedQuestions(qs);
        setImportName(file.name.replace(/\.[^.]+$/, ''));
        toast.success(`📝 Parsed ${qs.length} questions from text!`);
      } else {
        toast.error('Could not find any valid questions in this file.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to read file.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePasteImport = () => {
    if (!pasteText.trim()) { toast.error('Paste some quiz text first'); return; }
    setLoading(true);
    setImportedResults([]);
    try {
      try {
        const data = JSON.parse(pasteText);
        if (isBackupFormat(data)) {
          const results = extractResultsFromBackup(data);
          const allQs = results.flatMap(r => r.quizData || []);
          if (results.length > 0) {
            setImportedResults(results);
            setImportedQuestions(allQs);
            setImportName(`${results.length} quizzes`);
            toast.success(`📄 Found ${results.length} quizzes with result data!`);
            return;
          }
        }
        if (Array.isArray(data) && data[0]?.question) {
          setImportedQuestions(data);
          setImportName('Pasted Quiz');
          toast.success(`📋 Found ${data.length} questions!`);
          return;
        }
      } catch { /* not JSON */ }
      const qs = localOfflineParser(pasteText);
      setImportedQuestions(qs);
      setImportName('Pasted Quiz');
      toast.success(`📝 Parsed ${qs.length} questions!`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not parse any questions. Check format.');
    } finally {
      setLoading(false);
    }
  };

  const handleClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { toast.error('Clipboard is empty'); return; }
      setPasteText(text);
      setSource('paste');
      toast.success('📋 Clipboard text loaded! Click Parse to import.');
    } catch {
      toast.error('Clipboard access denied. Use paste instead.');
      setSource('paste');
    }
  };

  const handleStartQuiz = () => {
    if (!importedQuestions.length || !onStartQuiz) return;
    onStartQuiz(importedQuestions);
    onClose();
    toast.success(`🚀 Starting quiz with ${importedQuestions.length} questions!`);
  };

  const handleSaveToLibrary = () => {
    if (!importedQuestions.length) return;
    const tree = loadFileTree();
    if (findDuplicateFile(tree, ROOT_ID, { questions: importedQuestions })) {
      toast.info('This quiz is already saved in the library');
      return;
    }
    createFile(tree, ROOT_ID, importName || 'Imported Quiz', importedQuestions);
    toast.success(`📁 Saved "${importName}" with ${importedQuestions.length} questions to library!`);
  };

  const handleImportToHistory = async () => {
    if (!importedResults.length) return;
    if (onImportToHistory) {
      setImportingToHistory(true);
      try {
        await Promise.all(
          importedResults
            .filter(r => Array.isArray(r.quizData) && r.quizData.length > 0)
            .flatMap(r => [
              storeQuizDetail(String(r.timestamp), r),
              ...(r.id ? [storeQuizDetail(String(r.id), r)] : []),
            ]),
        );
        onImportToHistory(importedResults);
        toast.success(`✅ Imported ${importedResults.length} quizzes locally`);
        onClose();
        setTimeout(() => window.location.reload(), 1200);
      } catch (e: any) {
        toast.error(e?.message || 'Import failed');
      } finally {
        setImportingToHistory(false);
      }
    }
  };

  const SOURCE_OPTIONS = [
    { key: 'file' as ImportSource, icon: <Upload className="w-4 h-4" />, label: 'Upload File', desc: '.quizpkg, .json, .csv, .txt' },
    { key: 'paste' as ImportSource, icon: <FileText className="w-4 h-4" />, label: 'Paste Text', desc: 'Paste quiz questions directly' },
    { key: 'clipboard' as ImportSource, icon: <Clipboard className="w-4 h-4" />, label: 'From Clipboard', desc: 'Read text from clipboard' },
  ];

  // If questions imported, show preview
  if (importedQuestions.length > 0 || importedResults.length > 0) {
    const hasResults = importedResults.length > 0;
    return (
      <div className="space-y-4">
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-5 h-5 text-emerald-500" />
            <span className="text-sm font-bold text-emerald-500">Import Ready!</span>
          </div>
          <p className="text-xs text-foreground/60">
            {hasResults ? (
              <><strong className="text-foreground">{importedResults.length}</strong> quizzes with full result data</>
            ) : (
              <><strong className="text-foreground">{importedQuestions.length}</strong> questions from <strong className="text-foreground">{importName || 'import'}</strong></>
            )}
          </p>
        </div>

        {/* Result data summary strip */}
        {hasResults && resultsSummary && (
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-lg font-semibold flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> Avg {resultsSummary.avgScore}%
            </span>
            {resultsSummary.withData > 0 && (
              <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-lg font-semibold">
                ✅ {resultsSummary.withData} with full data
              </span>
            )}
            {resultsSummary.subjects.length > 0 && (
              <span className="bg-secondary/50 text-secondary-foreground px-2 py-0.5 rounded-lg font-semibold">
                📚 {resultsSummary.subjects.slice(0, 3).join(', ')}
              </span>
            )}
            {resultsSummary.oldest && resultsSummary.newest && (
              <span className="bg-foreground/5 text-foreground/40 px-2 py-0.5 rounded-lg font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {resultsSummary.oldest.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })} — {resultsSummary.newest.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
              </span>
            )}
          </div>
        )}

        {/* Preview */}
        {importedQuestions.length > 0 && (
          <div>
            <button onClick={() => setPreviewOpen(!previewOpen)} className="flex items-center gap-2 text-xs font-bold text-foreground/50 mb-2">
              <Eye className="w-3.5 h-3.5" /> Preview Questions
              {previewOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {previewOpen && (
              <div className="max-h-48 overflow-y-auto thin-scrollbar space-y-2 pr-1">
                {importedQuestions.slice(0, 20).map((q, i) => (
                  <div key={i} className="bg-foreground/4 rounded-lg p-3 border border-border">
                    <p className="text-xs font-bold text-foreground mb-1">Q{i + 1}. {q.question.substring(0, 120)}{q.question.length > 120 ? '…' : ''}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {q.options.map((o, j) => (
                        <span key={j} className={`text-[10px] px-2 py-0.5 rounded ${o === q.correctAnswer ? 'bg-emerald-500/20 text-emerald-500 font-bold border border-emerald-500/30' : 'bg-foreground/8 text-foreground/50'}`}>
                          ({String.fromCharCode(97 + j)}) {o.substring(0, 30)}{o.length > 30 ? '…' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {importedQuestions.length > 20 && (
                  <p className="text-[10px] text-foreground/30 text-center py-2">+ {importedQuestions.length - 20} more questions</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-1 gap-2">
          {/* Import to History — only for backup-format files */}
          {hasResults && onImportToHistory && (
            <button onClick={handleImportToHistory} disabled={importingToHistory}
              className="flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-bold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98] disabled:opacity-50">
              {importingToHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
              Import {importedResults.length} quizzes with scores & results
            </button>
          )}
          {onStartQuiz && importedQuestions.length > 0 && (
            <button onClick={handleStartQuiz}
              className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98]">
              <Play className="w-4 h-4" /> Start Quiz Now
            </button>
          )}
          {importedQuestions.length > 0 && (
            <button onClick={handleSaveToLibrary}
              className="flex items-center justify-center gap-2 bg-foreground/8 hover:bg-foreground/12 border border-border text-foreground font-bold py-3 rounded-xl text-sm transition-all active:scale-[0.98]">
              <FolderPlus className="w-4 h-4" /> Save to Library
            </button>
          )}
          <button onClick={() => { setImportedQuestions([]); setImportedResults([]); setImportName(''); }}
            className="flex items-center justify-center gap-2 text-foreground/40 hover:text-foreground/60 font-bold py-2 text-xs transition-all">
            <X className="w-3.5 h-3.5" /> Import Different File
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Source picker */}
      <div className="grid grid-cols-3 gap-2">
        {SOURCE_OPTIONS.map(opt => (
          <button key={opt.key}
            onClick={() => { if (opt.key === 'clipboard') handleClipboard(); else setSource(opt.key); }}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-all ${source === opt.key ? 'bg-primary/15 border border-primary/30' : 'bg-foreground/4 border border-transparent hover:bg-foreground/8'}`}>
            <span className={source === opt.key ? 'text-primary' : 'text-foreground/40'}>{opt.icon}</span>
            <span className="text-[10px] font-bold text-foreground">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* File upload */}
      {source === 'file' && (
        <div>
          <input ref={fileRef} type="file" accept=".quizpkg,.json,.csv,.txt,.text" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            className="w-full flex flex-col items-center justify-center gap-3 bg-foreground/4 hover:bg-foreground/8 border-2 border-dashed border-foreground/15 hover:border-primary/30 rounded-xl py-8 transition-all disabled:opacity-50">
            {loading ? (
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Upload className="w-8 h-8 text-foreground/25" />
                <div className="text-center">
                  <p className="text-sm font-bold text-foreground/60">Click to upload or drag & drop</p>
                  <p className="text-[10px] text-foreground/30 mt-1">.quizpkg · .json · .csv · .txt — Max 10MB</p>
                </div>
              </>
            )}
          </button>
        </div>
      )}

      {/* Paste text */}
      {source === 'paste' && (
        <div className="space-y-2">
          <textarea
            value={pasteText} onChange={e => setPasteText(e.target.value)}
            placeholder={`Paste quiz questions here…\n\n${MCQ_SAMPLE}\n\nOr paste a JSON array of {question, options, correctAnswer}`}
            rows={7}
            className="w-full bg-muted/30 border border-border rounded-xl p-3 text-xs text-foreground placeholder-foreground/20 focus:outline-none focus:border-primary/40 resize-none thin-scrollbar"
          />
          <button onClick={handlePasteImport} disabled={!pasteText.trim() || loading}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl text-sm transition-all disabled:opacity-30 active:scale-[0.98]">
            {loading ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
            Parse & Import
          </button>
        </div>
      )}

      {/* Supported formats info */}
      <div className="bg-foreground/4 rounded-xl p-3 border border-border">
        <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider mb-2">Supported Formats</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { ext: '.json', desc: 'Backup files & quiz exports' },
            { ext: '.quizpkg', desc: 'Quiz Master Pro package' },
            { ext: '.csv', desc: 'Spreadsheet with Q&A columns' },
            { ext: '.txt', desc: 'Text with numbered questions' },
          ].map(f => (
            <div key={f.ext} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{f.ext}</span>
              <span className="text-[10px] text-foreground/30">{f.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

/** Fallback: fetch full detail directly from endpoint */
async function fallbackFetchDetail(id: string): Promise<QuizResult | null> {
  try {
    const resp = await getQuizDetail({ id });
    if (!resp.record) return null;
    const r = resp.record as any;
    let quizData: QuizQuestion[] = [];
    let userAnswers: (string | null)[] = [];
    try { quizData = JSON.parse(r.quizDataJson || '[]'); } catch {}
    try { userAnswers = JSON.parse(r.userAnswersJson || '[]'); } catch {}
    return normalizeBackupRecord({ ...r, quizData, userAnswers });
  } catch { return null; }
}

export default function QuizExportImportModal({
  open, onClose, history = [], onStartQuiz, initialTab = 'export', selectedQuiz,
  fetchFullDetail, isLoggedIn: isLoggedInProp, onImportToHistory,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { user } = useAuth();
  const isLoggedIn = isLoggedInProp ?? !!user;
  const resolvedFetchDetail = fetchFullDetail ?? fallbackFetchDetail;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-md mx-4 max-h-[85vh] overflow-y-auto thin-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-foreground font-bold flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            Quiz Export & Import
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-foreground/5 p-1 rounded-xl">
          <button onClick={() => setTab('export')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${tab === 'export' ? 'bg-primary text-primary-foreground shadow' : 'text-foreground/50 hover:text-foreground'}`}>
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button onClick={() => setTab('import')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${tab === 'import' ? 'bg-primary text-primary-foreground shadow' : 'text-foreground/50 hover:text-foreground'}`}>
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
        </div>

        {tab === 'export' ? (
          <ExportPanel
            history={history}
            selectedQuiz={selectedQuiz}
            onClose={onClose}
            fetchFullDetail={resolvedFetchDetail}
            isLoggedIn={isLoggedIn}
          />
        ) : (
          <ImportPanel
            onStartQuiz={onStartQuiz}
            onClose={onClose}
            onImportToHistory={onImportToHistory}
            isLoggedIn={isLoggedIn}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
