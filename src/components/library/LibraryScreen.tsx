import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { loadQuizQuestions } from '../../utils/ensureQuestions';
import { usePersistedState } from '../../hooks/usePersistedState';
import { Trash2, RotateCcw, BookOpen, Pin, PinOff, ChevronRight, ChevronLeft, Pencil, FolderOpen, History, Plus, Home, FolderPlus, Share2, RotateCw, List, LayoutGrid, Download, Upload, SlidersHorizontal, Tag, X } from 'lucide-react';
import { hapticTap, hapticHeavy } from '../../utils/haptics';
import SummaryStatsStrip from './SummaryStatsStrip';
import Overlay from '../ui/Overlay';
import { SessionMode, filterBySession, getSessionLabel } from '../SessionSelector';
import {
  SearchField, Toolbar, ToolbarButton, ToolbarDivider, TrashToolbarButton, SessionToolbarButton, ChipsBar, Chip, TB_ICON,
} from './LibraryToolbar';
import SubjectFilterPopup from '../SubjectFilterPopup';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { QuizResult, QuizQuestion } from '../../types/quiz';
import { usePinnedQuizzes } from '../../hooks/usePinnedQuizzes';
import { formatTime } from '../../utils/scoring';
import { formatDateDMY, formatDateShort } from '../../utils/dateFormat';
import { toast } from 'sonner';
import { getHistorySync, setHistory } from '../../utils/historyStore';
import FileManager from './FileManager';
import QuizExportImportModal from '../QuizExportImportModal';
import { loadFileTree, saveFileTree, findNode as findNodeInTree, createFile, findDuplicateFile, createFolder as createFolderInTree, ROOT_ID, FileNode, getAllFiles, updateNode as updateNodeInTree } from '../../utils/fileTree';

interface Props {
  history: QuizResult[];
  onViewResult: (r: QuizResult) => void;
  onDeleteHistory: (id: string) => void;
  onPracticeMistakes: (qs: QuizQuestion[]) => void;
  onHistoryChanged?: () => void;
  onEditQuiz?: (id: string, title: string, subject: string, notes?: string, timestamp?: number) => void;
  onOpenReportPreview?: (data: import('../reports/ReportPreviewPage').ReportPreviewData) => void;
  /** Jump to the main Trash (Profile -> Trash) */
  onOpenTrash?: () => void;
}

type LibTab = 'history' | 'organizer';
type SortBy = 'newest' | 'oldest' | 'highest' | 'lowest';
type DiffFilter = 'all' | 'easy' | 'medium' | 'hard';
type TimeFilter = 'all' | 'today' | 'week' | 'month';

function scoreColor(p: number) { return p >= 80 ? 'text-emerald-400' : p >= 60 ? 'text-amber-400' : 'text-red-400'; }
function scoreBg(p: number) { return p >= 80 ? 'bg-emerald-500/15 border-emerald-500/30' : p >= 60 ? 'bg-amber-500/15 border-amber-500/30' : 'bg-red-500/15 border-red-500/30'; }
function scoreBar(p: number) { return p >= 80 ? 'bg-emerald-500' : p >= 60 ? 'bg-amber-500' : 'bg-red-500'; }

const THUMB_COLORS = [
  'from-primary/40 to-accent/40', 'from-emerald-500/40 to-teal-600/40',
  'from-amber-500/40 to-orange-600/40', 'from-pink-500/40 to-rose-600/40',
  'from-cyan-500/40 to-blue-600/40',
];

/* ─── Stable card actions ───────────────────────────────────────────
 * The parent writes fresh closures into a ref every render; cards read
 * through it at call time. Cards therefore receive one stable prop instead
 * of nine new arrow functions per render, which lets React.memo skip them
 * while the user types in search or toggles unrelated UI. */
interface LibraryCardActions {
  view: (r: QuizResult) => void;
  remove: (r: QuizResult) => void;
  practice: (r: QuizResult) => void;
  togglePin: (pinId: string) => void;
  edit: (r: QuizResult) => void;
  addToFolder: (r: QuizResult) => void;
  exportQuiz: (r: QuizResult) => void;
  importQuiz: () => void;
}

const LibraryCard = memo(function LibraryCard({ result, idx, isPinned, actionsRef }: {
  result: QuizResult; idx: number; isPinned: boolean;
  actionsRef: React.MutableRefObject<LibraryCardActions>;
}) {
  const handlers = useMemo(() => {
    const pinId = result.id || String(result.timestamp);
    return {
      onView: () => actionsRef.current.view(result),
      onDelete: () => actionsRef.current.remove(result),
      onPractice: () => actionsRef.current.practice(result),
      onTogglePin: () => actionsRef.current.togglePin(pinId),
      onEdit: () => actionsRef.current.edit(result),
      onAddToFolder: () => actionsRef.current.addToFolder(result),
      onExport: () => actionsRef.current.exportQuiz(result),
      onImport: () => actionsRef.current.importQuiz(),
    };
  }, [result, actionsRef]);
  return <LibraryCardBody result={result} idx={idx} isPinned={isPinned} {...handlers} />;
});

/* ─── Quiz Card with Swipe-to-Delete + Long-Press ────────────────── */
function LibraryCardBody({ result, idx, isPinned, onView, onDelete, onPractice, onTogglePin, onEdit, onAddToFolder, onExport, onImport }: {
  result: QuizResult; idx: number; isPinned: boolean;
  onView: () => void; onDelete: () => void; onPractice: () => void; onTogglePin: () => void;
  onEdit?: () => void; onAddToFolder?: () => void; onExport?: () => void; onImport?: () => void;
}) {
  const pct = result.percentage;
  const mistakes = useMemo(
    () => (result.quizData || []).filter((q, i) => result.userAnswers[i] !== null && result.userAnswers[i] !== q.correctAnswer).length,
    [result.quizData, result.userAnswers],
  );
  const initial = result.quizTitle?.[0]?.toUpperCase() || '📝';

  // Swipe-to-delete state
  const [swipeX, setSwipeX] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);

  // Long-press state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    swiping.current = false;
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      hapticTap();
      didLongPress.current = true;
      setContextMenu({ x: startX.current, y: startY.current });
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    }
    if (Math.abs(dx) < Math.abs(dy) * 1.2) return; // vertical scroll
    if (dx > 5) { setSwipeX(0); return; } // only left swipe
    swiping.current = true;
    setSwipeX(Math.max(-120, dx));
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (swiping.current) {
      if (swipeX < -80) setSwipeX(-100); // snap to reveal
      else setSwipeX(0); // snap back
      swiping.current = false;
    }
  };

  const handleSwipeDelete = () => {
    hapticHeavy();
    setSwipeX(0);
    onDelete();
  };

  const handleShare = async () => {
    setContextMenu(null);
    const text = `${result.quizTitle || 'Quiz'} — ${pct}% (${result.correct}✓ ${result.wrong}✗)`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Quiz Result', text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      toast.success('📋 Copied to clipboard!');
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Red delete area behind card */}
      <div className="absolute inset-y-0 right-0 w-[100px] bg-destructive/90 flex items-center justify-center rounded-r-2xl">
        <button onClick={handleSwipeDelete} className="flex flex-col items-center gap-1 text-white">
          <Trash2 className="w-5 h-5" />
          <span className="text-[9px] font-bold">Delete</span>
        </button>
      </div>

      {/* Card (slides left) */}
      <div
        className={`relative z-10 bg-card border rounded-2xl overflow-hidden shadow-sm ${isPinned ? 'border-amber-500/20' : 'border-border hover:border-foreground/15'}`}
        style={{ transform: `translateX(${swipeX}px)`, transition: swiping.current ? 'none' : 'transform 0.3s cubic-bezier(0.25,1,0.5,1)' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isPinned && (
          <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-0.5">
            <span className="text-amber-400 text-[9px]">⭐</span>
            <span className="text-[9px] font-black text-amber-400/70 uppercase tracking-widest">Pinned</span>
          </div>
        )}
        <button onClick={() => { if (!didLongPress.current) onView(); }} className="w-full flex items-center gap-3 p-4 text-left active:bg-foreground/5">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${THUMB_COLORS[idx % THUMB_COLORS.length]} flex items-center justify-center flex-shrink-0 text-lg font-black text-white border border-foreground/10`}>
            {initial.length === 1 && initial !== '📝' ? initial : '📝'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <p className="text-sm font-bold text-foreground flex-1 truncate leading-snug">
                {result.quizTitle || `Quiz · ${result.totalQuestions} Questions`}
              </p>
              <div className={`flex-shrink-0 text-base font-black px-3 py-1.5 rounded-xl border ${scoreBg(pct)} ${scoreColor(pct)}`}>{pct}%</div>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {result.attemptType === 'practice' && (
                <span className="text-[9px] font-bold text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">🏋️ P#{result.attemptNumber || '?'}</span>
              )}
              {result.subject && (
                <span className="text-[9px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">{result.subject}</span>
              )}
              <span className="text-[10px] text-foreground/35">{formatDateDMY(result.timestamp)}</span>
              <span className="text-[10px] text-foreground/25">·</span>
              <span className="text-[10px] text-foreground/35">{formatTime(result.timeTaken)}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">✓{result.correct}</span>
              <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-md">✗{result.wrong}</span>
              <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md">⏭{result.skipped}</span>
              <span className="text-[9px] text-foreground/25 ml-auto">{result.totalQuestions} Qs</span>
            </div>
            <div className="mt-2 h-1 bg-muted/60 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${scoreBar(pct)}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-foreground/20 flex-shrink-0 ml-1" />
        </button>
        <div className="flex border-t border-border">
          <button onClick={onTogglePin}
            className={`flex items-center justify-center gap-1 px-3 py-2.5 text-[11px] font-bold transition-all active:scale-95 border-r border-border ${isPinned ? 'text-amber-400 hover:bg-amber-500/5' : 'text-foreground/25 hover:text-amber-400 hover:bg-amber-500/5'}`}>
            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          {onEdit && (
            <button onClick={onEdit} className="flex items-center justify-center gap-1 px-3 py-2.5 text-[11px] font-bold text-foreground/25 hover:text-primary hover:bg-primary/5 transition-all active:scale-95 border-r border-border">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onAddToFolder && (
            <button onClick={onAddToFolder} className="flex items-center justify-center gap-1 px-3 py-2.5 text-[11px] font-bold text-foreground/25 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all active:scale-95 border-r border-border" title="Add to Folder">
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          )}
          {mistakes > 0 && (
            <button onClick={onPractice} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold text-red-400/80 hover:text-red-300 hover:bg-red-500/5 transition-all active:scale-95">
              <RotateCcw className="w-3.5 h-3.5" /> Practice ({mistakes})
            </button>
          )}
          <button onClick={onDelete} className="flex items-center justify-center gap-1.5 px-5 py-2.5 text-[11px] font-bold text-foreground/25 hover:text-red-400 hover:bg-red-500/5 transition-all active:scale-95 border-l border-border">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Long-press context menu */}
      {contextMenu && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 'calc(var(--qmp-z-menu) - 1)' }} onClick={() => setContextMenu(null)} />
          <div
            className="fixed w-56 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-fade-in"
            role="menu"
            style={{ zIndex: 'var(--qmp-z-menu)', left: Math.min(contextMenu.x, window.innerWidth - 240), top: Math.min(Math.max(contextMenu.y - 40, 8), window.innerHeight - 260) }}
          >
            <div className="p-2 space-y-0.5">
              <button onClick={() => { setContextMenu(null); onView(); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-foreground/70 hover:bg-muted transition-all">
                <RotateCw className="w-4 h-4 text-primary" /> Retry Quiz
              </button>
              {mistakes > 0 && (
                <button onClick={() => { setContextMenu(null); onPractice(); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-foreground/70 hover:bg-muted transition-all">
                  <RotateCcw className="w-4 h-4 text-amber-500" /> Practice Mistakes ({mistakes})
                </button>
              )}
              <button onClick={handleShare} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-foreground/70 hover:bg-muted transition-all">
                <Share2 className="w-4 h-4 text-emerald-500" /> Share Result
              </button>
              {onExport && (
                <button onClick={() => { setContextMenu(null); onExport(); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-foreground/70 hover:bg-muted transition-all">
                  <Download className="w-4 h-4 text-blue-500" /> Export Quiz
                </button>
              )}
              {onImport && (
                <button onClick={() => { setContextMenu(null); onImport(); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-foreground/70 hover:bg-muted transition-all">
                  <Upload className="w-4 h-4 text-violet-500" /> Import Quiz
                </button>
              )}
              <div className="border-t border-border mx-2 my-1" />
              <button onClick={() => { setContextMenu(null); hapticHeavy(); onDelete(); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 transition-all">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

function SectionHeader({ title, count, sub }: { title: string; count: number; sub?: string }) {
  return (
    <div className="flex items-center gap-2 px-1 mb-2 mt-1">
      <span className="text-[11px] font-black text-foreground/50 uppercase tracking-[0.1em]">{title}</span>
      <span className="text-[10px] font-black text-foreground/25 bg-foreground/8 px-2 py-0.5 rounded-full">{count}</span>
      {sub && <span className="text-[10px] text-foreground/20 ml-auto">{sub}</span>}
    </div>
  );
}

/* ─── Grid Quiz Card (2-col grid view with SVG score ring + full action bar) ── */
function GridQuizCard({ result, idx, isPinned, onView, onPractice, onDelete, onTogglePin, onEdit, onAddToFolder }: {
  result: QuizResult; idx: number; isPinned: boolean;
  onView: () => void; onPractice: () => void; onDelete: () => void;
  onTogglePin: () => void; onEdit?: () => void; onAddToFolder?: () => void;
}) {
  const pct = result.percentage;
  const mistakes = (result.quizData || []).filter((q, i) => result.userAnswers[i] !== null && result.userAnswers[i] !== q.correctAnswer).length;
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (pct / 100) * circumference;
  const barClr = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const txtClr = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
  const bgClr = pct >= 80 ? 'bg-emerald-500/12 border-emerald-500/20' : pct >= 60 ? 'bg-amber-500/12 border-amber-500/20' : 'bg-red-500/12 border-red-500/20';

  return (
    <div className={`bg-card border rounded-2xl overflow-hidden shadow-sm transition-all ${isPinned ? 'border-amber-500/20' : 'border-border hover:border-foreground/15'}`}>
      {isPinned && (
        <div className="flex items-center gap-1 px-3 pt-2 pb-0">
          <span className="text-amber-400 text-[9px]">⭐</span>
          <span className="text-[8px] font-black text-amber-400/70 uppercase tracking-widest">Pinned</span>
        </div>
      )}
      <button onClick={onView} className="w-full p-3 pb-2 text-left active:bg-foreground/5">
        <div className={`w-full aspect-[4/3] rounded-xl mb-2.5 flex flex-col items-center justify-center ${bgClr} border gap-1`}>
          <div className="relative w-14 h-14">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" className="text-foreground/5" strokeWidth="2.5" />
              <circle cx="20" cy="20" r="18" fill="none" stroke={barClr} strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-500" />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-base font-black ${txtClr}`}>{pct}%</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-bold text-emerald-400">✓{result.correct}</span>
            <span className="text-[8px] font-bold text-red-400">✗{result.wrong}</span>
            {result.skipped > 0 && <span className="text-[8px] font-bold text-amber-400">⏭{result.skipped}</span>}
          </div>
        </div>
        <p className="text-xs font-bold text-foreground truncate leading-snug">{result.quizTitle || `Quiz · ${result.totalQuestions} Qs`}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {result.subject && (
            <span className="text-[8px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 truncate max-w-[80px]">{result.subject}</span>
          )}
          <span className="text-[9px] text-foreground/30">{formatDateShort(result.timestamp)}</span>
          <span className="text-[9px] text-foreground/25">{result.totalQuestions} Qs · {formatTime(result.timeTaken)}</span>
        </div>
        <div className="mt-2 h-1 bg-muted/60 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${scoreBar(pct)}`} style={{ width: `${pct}%` }} />
        </div>
      </button>
      {mistakes > 0 && (
        <div className="px-3 pb-2">
          <button onClick={onPractice}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-bold transition-all hover:bg-amber-500/15 active:scale-[0.98]">
            <RotateCcw className="w-3 h-3" /> Practice Again ({mistakes} mistakes)
          </button>
        </div>
      )}
      <div className="flex border-t border-border">
        <button onClick={onTogglePin}
          className={`flex items-center justify-center px-2.5 py-2 text-[11px] font-bold transition-all active:scale-95 border-r border-border ${isPinned ? 'text-amber-400 hover:bg-amber-500/5' : 'text-foreground/25 hover:text-amber-400 hover:bg-amber-500/5'}`}>
          {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
        </button>
        {onEdit && (
          <button onClick={onEdit} className="flex items-center justify-center px-2.5 py-2 text-[11px] font-bold text-foreground/25 hover:text-primary hover:bg-primary/5 transition-all active:scale-95 border-r border-border">
            <Pencil className="w-3 h-3" />
          </button>
        )}
        {onAddToFolder && (
          <button onClick={onAddToFolder} className="flex items-center justify-center px-2.5 py-2 text-[11px] font-bold text-foreground/25 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all active:scale-95 border-r border-border">
            <FolderOpen className="w-3 h-3" />
          </button>
        )}
        {mistakes > 0 ? (
          <button onClick={onPractice} className="flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-red-400/80 hover:text-red-300 hover:bg-red-500/5 transition-all active:scale-95">
            <RotateCcw className="w-3 h-3" /> ({mistakes})
          </button>
        ) : <div className="flex-1" />}
        <button onClick={onDelete} className="flex items-center justify-center px-3 py-2 text-[11px] font-bold text-foreground/25 hover:text-red-400 hover:bg-red-500/5 transition-all active:scale-95 border-l border-border">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

/* ─── Folder Picker Sheet ──────────────────────────────────────────── */
function FolderPickerSheet({ open, onClose, quiz, onDone }: {
  open: boolean; onClose: () => void; quiz: QuizResult | null;
  onDone: () => void;
}) {
  const [browsingId, setBrowsingId] = useState(ROOT_ID);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  const tree = useMemo(() => loadFileTree(), [open]);
  const browsingNode = useMemo(() => findNodeInTree(tree, browsingId), [tree, browsingId]);
  const subfolders = useMemo(() =>
    (browsingNode?.children || []).filter(c => c.type === 'folder'),
    [browsingNode]
  );

  // Build breadcrumb path
  const breadcrumbs = useMemo(() => {
    const path: { id: string; name: string }[] = [];
    function walk(node: FileNode): boolean {
      path.push({ id: node.id, name: node.name });
      if (node.id === browsingId) return true;
      if (node.children) {
        for (const c of node.children) { if (walk(c)) return true; }
      }
      path.pop();
      return false;
    }
    walk(tree);
    return path;
  }, [tree, browsingId]);

  const handleAddHere = async () => {
    if (!quiz) return;
    const name = quiz.quizTitle || `Quiz · ${quiz.totalQuestions} Questions`;
    const resultId = quiz.id || String(quiz.timestamp);
    // Cloud history rows are summaries (no questions) — load the real ones so the file is never empty.
    const folderLabel = browsingNode?.name || 'Home';
    // Already in this folder? Don't add it again.
    if (findDuplicateFile(loadFileTree(), browsingId, { sourceResultId: resultId, sourceTimestamp: quiz.timestamp, questions: quiz.quizData })) {
      toast.info(`"${name}" is already in ${folderLabel}`);
      onClose();
      setBrowsingId(ROOT_ID);
      return;
    }
    const questions = await loadQuizQuestions(quiz);
    const freshTree = loadFileTree();
    if (findDuplicateFile(freshTree, browsingId, { sourceResultId: resultId, sourceTimestamp: quiz.timestamp, questions })) {
      toast.info(`"${name}" is already in ${folderLabel}`);
      onClose();
      setBrowsingId(ROOT_ID);
      return;
    }
    createFile(freshTree, browsingId, name, questions, quiz.subject ? [quiz.subject] : [], '📄', quiz.timestamp, resultId, quiz.timestamp);
    saveFileTree(freshTree);
    const folderName = browsingNode?.name || 'Home';
    if (questions.length === 0) toast.warning(`Added "${name}", but its questions could not be loaded (offline?). They will fill in automatically.`);
    else toast.success(`📄 Added "${name}" to ${folderName}`);
    onDone();
    onClose();
    setBrowsingId(ROOT_ID);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const freshTree = loadFileTree();
    createFolderInTree(freshTree, browsingId, newFolderName.trim());
    saveFileTree(freshTree);
    toast.success(`📁 Created "${newFolderName.trim()}"`);
    setNewFolderName('');
    setShowNewFolder(false);
    // Force re-render by re-setting browsing
    setBrowsingId(prev => prev);
  };

  const handleClose = () => {
    onClose();
    setBrowsingId(ROOT_ID);
    setShowNewFolder(false);
    setNewFolderName('');
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-md max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <DialogTitle className="text-foreground font-bold text-left">Add to Folder</DialogTitle>
        </DialogHeader>

        {/* Quiz preview */}
        {quiz && (
          <div className="flex items-center gap-3 mx-5 mt-3 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15 mb-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center text-sm font-black text-primary flex-shrink-0">
              {quiz.quizTitle?.[0]?.toUpperCase() || '📝'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground truncate">{quiz.quizTitle || `Quiz · ${quiz.totalQuestions} Qs`}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {quiz.subject && <span className="text-[9px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">{quiz.subject}</span>}
                <span className="text-[10px] text-foreground/30">{quiz.totalQuestions} Qs · {quiz.percentage}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 mb-2 overflow-x-auto no-scrollbar flex-shrink-0 px-5">
          {breadcrumbs.map((bc, i) => (
            <div key={bc.id} className="flex items-center gap-1 flex-shrink-0">
              {i > 0 && <ChevronRight className="w-3 h-3 text-foreground/15" />}
              <button onClick={() => setBrowsingId(bc.id)}
                className={`text-[11px] font-bold transition-colors ${i === breadcrumbs.length - 1 ? 'text-foreground' : 'text-foreground/40 hover:text-foreground/70'}`}>
                {i === 0 ? <Home className="w-3.5 h-3.5 inline" /> : bc.name}
              </button>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-1 px-5 pb-4">
          {browsingId !== ROOT_ID && (
            <button onClick={() => {
              const parentIdx = breadcrumbs.findIndex(b => b.id === browsingId);
              setBrowsingId(parentIdx > 0 ? breadcrumbs[parentIdx - 1].id : ROOT_ID);
            }} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-foreground/50 hover:bg-foreground/5 rounded-xl transition-all">
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}

          {/* Add here button */}
          <button onClick={handleAddHere}
            className="w-full flex items-center gap-2.5 px-3 py-3 text-xs font-bold text-emerald-400 bg-emerald-500/8 border border-emerald-500/20 rounded-xl transition-all hover:bg-emerald-500/15 active:scale-[0.98]">
            <Plus className="w-4 h-4" /> Add quiz here — {browsingNode?.name || 'Home'}
          </button>

          {/* Subfolders */}
          {subfolders.length > 0 && (
            <div className="pt-1">
              <p className="text-[9px] font-black text-foreground/25 uppercase tracking-widest px-1 mb-1">Subfolders</p>
              {subfolders.map(f => (
                <button key={f.id} onClick={() => setBrowsingId(f.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-foreground/70 hover:bg-foreground/5 rounded-xl transition-all">
                  <span className="text-base">{f.icon || '📁'}</span>
                  <span className="flex-1 text-left truncate">{f.name}</span>
                  <span className="text-[9px] text-foreground/25">{(f.children?.length || 0)} items</span>
                  <ChevronRight className="w-3.5 h-3.5 text-foreground/20" />
                </button>
              ))}
            </div>
          )}

          {subfolders.length === 0 && (
            <p className="text-center text-[10px] text-foreground/25 py-4">No subfolders here</p>
          )}
        </div>

        {/* Bottom: New Folder + Cancel */}
        <div className="flex-shrink-0 border-t border-border pt-3 pb-4 px-5 space-y-2">
          {showNewFolder ? (
            <div className="flex gap-2">
              <input value={newFolderName} onChange={e => setNewFolderName(e.target.value.slice(0, 40))}
                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                autoFocus placeholder="Folder name…"
                className="flex-1 bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60" />
              <button onClick={handleCreateFolder} disabled={!newFolderName.trim()}
                className="text-xs font-bold px-4 py-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-30">Create</button>
              <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
                className="text-xs font-bold px-3 py-2 rounded-xl border border-border text-foreground/50">✕</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setShowNewFolder(true)}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-xl border border-dashed border-border text-foreground/40 hover:text-primary hover:border-primary/30 transition-all">
                <FolderPlus className="w-3.5 h-3.5" /> New Folder
              </button>
              <button onClick={handleClose}
                className="text-xs font-bold px-5 py-2.5 rounded-xl border border-border text-foreground/50 hover:text-foreground transition-all">
                Cancel
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Library Screen ──────────────────────────────────────────── */
export default function LibraryScreen({ history, onViewResult, onDeleteHistory, onPracticeMistakes, onHistoryChanged, onEditQuiz, onOpenReportPreview, onOpenTrash }: Props) {
  const [activeTab, setActiveTab] = usePersistedState<LibTab>('lib_tab', 'history');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(30);
  const loadMoreLib = useCallback(() => setVisibleCount(v => v + 30), []);
  const libSentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = libSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMoreLib();
    }, { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMoreLib]);
  const [diffFilter, setDiffFilter] = usePersistedState<DiffFilter>('lib_diff', 'all');
  const [timeFilter, setTimeFilter] = usePersistedState<TimeFilter>('lib_time', 'all');
  const [sortBy, setSortBy] = usePersistedState<SortBy>('lib_sort', 'newest');
  const [deleteTarget, setDeleteTarget] = useState<QuizResult | null>(null);
  const [showExportImport, setShowExportImport] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [editTarget, setEditTarget] = useState<QuizResult | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [folderPickerQuiz, setFolderPickerQuiz] = useState<QuizResult | null>(null);
  const [singleExportQuiz, setSingleExportQuiz] = useState<QuizResult | null>(null);
  const [contextMenuTab, setContextMenuTab] = useState<'export' | 'import'>('export');
  const [sessionMode, setSessionMode] = usePersistedState<SessionMode>('lib_session', 'main');
  const [subjectFilter, setSubjectFilter] = usePersistedState('lib_subject', 'all');
  const [subjectPopupOpen, setSubjectPopupOpen] = useState(false);
  const [folderFilter, setFolderFilter] = usePersistedState('lib_folder', 'all');
  const [folderPopupOpen, setFolderPopupOpen] = useState(false);
  const [viewMode, setViewMode] = usePersistedState<'list' | 'grid'>('lib_view', 'list');
  const { togglePin, isPinned } = usePinnedQuizzes();

  // Force FileManager to refresh after adding quiz from history
  const [fmKey, setFmKey] = useState(0);

  const handleEditSave = () => {
    if (!editTarget) return;
    const newTitle = editTitle.trim();
    const newSubject = editSubject.trim();
    const newNotes = editNotes.trim();
    // Build new timestamp from date+time if changed
    let newTimestamp: number | undefined;
    if (editDate) {
      const [y, m, d] = editDate.split('-').map(Number);
      const [hh, mm] = editTime ? editTime.split(':').map(Number) : [0, 0];
      const built = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime();
      if (built !== editTarget.timestamp) newTimestamp = built;
    }
    // Use cloud id if available, fall back to timestamp only for local-only records
    const editId = editTarget.id || String(editTarget.timestamp);
    const editTimestamp = editTarget.timestamp;
    setEditTarget(null);
    setEditTitle('');
    setEditSubject('');
    setEditNotes('');
    setEditDate('');
    setEditTime('');
    if (onEditQuiz) {
      onEditQuiz(editId, newTitle, newSubject, newNotes, newTimestamp);
    } else {
      try {
        const all: QuizResult[] = getHistorySync();
        if (all.length) {
          // Match by both id AND timestamp to guarantee uniqueness
          const idx = all.findIndex(r => {
            if (editTarget.id && r.id) return r.id === editTarget.id;
            return r.timestamp === editTimestamp;
          });
          if (idx !== -1) {
            all[idx] = { ...all[idx], quizTitle: newTitle || all[idx].quizTitle, subject: newSubject || all[idx].subject, notes: newNotes || all[idx].notes };
            setHistory(all);
          }
        }
      } catch {}
      onHistoryChanged?.();
      toast.success('Updated ✓');
    }
  };

  const sessionHistory = useMemo(() => filterBySession(history, sessionMode), [history, sessionMode]);

  // Subject options with count + avg from session-filtered history
  const subjectOptions = useMemo(() => {
    const map = new Map<string, { count: number; totalPct: number }>();
    sessionHistory.forEach(r => {
      if (r.subject) {
        const prev = map.get(r.subject) || { count: 0, totalPct: 0 };
        prev.count++;
        prev.totalPct += r.percentage;
        map.set(r.subject, prev);
      }
    });
    return Array.from(map.entries())
      .map(([name, { count, totalPct }]) => ({ name, count, avg: Math.round(totalPct / count) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessionHistory]);

  const effectiveSubjectFilter = subjectFilter !== 'all' && !subjectOptions.some(s => s.name === subjectFilter) ? 'all' : subjectFilter;

  // ── Folder filter options ──
  const folderOptions = useMemo(() => {
    try {
      const tree = loadFileTree();
      const allFiles = getAllFiles(tree);
      // Build map: folderId → { name, resultIds }
      const folderMap = new Map<string, { name: string; resultIds: Set<string> }>();
      const collectFolders = (node: FileNode, parentName?: string) => {
        if (node.type === 'folder' && node.id !== ROOT_ID) {
          const files = getAllFiles(node);
          const resultIds = new Set<string>();
          for (const f of files) {
            if (f.sourceResultId) resultIds.add(f.sourceResultId);
            if (f.sourceTimestamp) resultIds.add(String(f.sourceTimestamp));
          }
          if (resultIds.size > 0) {
            folderMap.set(node.id, { name: parentName ? `${parentName} / ${node.name}` : node.name, resultIds });
          }
          for (const child of (node.children || [])) {
            collectFolders(child, parentName ? `${parentName} / ${node.name}` : node.name);
          }
        } else if (node.children) {
          for (const child of node.children) collectFolders(child, parentName);
        }
      };
      collectFolders(tree);
      return Array.from(folderMap.entries()).map(([id, { name, resultIds }]) => ({
        id, name, resultIds
      })).sort((a, b) => a.name.localeCompare(b.name));
    } catch { return []; }
  }, [fmKey, history]);

  const effectiveFolderFilter = folderFilter !== 'all' && !folderOptions.some(f => f.id === folderFilter) ? 'all' : folderFilter;
  const folderResultIds = useMemo(() => {
    if (effectiveFolderFilter === 'all') return null;
    const opt = folderOptions.find(f => f.id === effectiveFolderFilter);
    return opt ? opt.resultIds : null;
  }, [effectiveFolderFilter, folderOptions]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const todayStr = new Date().toDateString();
    const cutoffs: Record<TimeFilter, number> = { all: 0, today: 0, week: now - 7 * 86400000, month: now - 30 * 86400000 };
    const q = debouncedSearch.toLowerCase();
    let res = sessionHistory.filter(r => {
      const matchSearch = !q || r.quizTitle?.toLowerCase().includes(q) || r.subject?.toLowerCase().includes(q) || r.quizData?.some(qItem => qItem.question?.toLowerCase().includes(q));
      const matchDiff = diffFilter === 'all' || r.difficulty === diffFilter;
      const matchTime = timeFilter === 'all' || (timeFilter === 'today' ? new Date(r.timestamp).toDateString() === todayStr : r.timestamp >= cutoffs[timeFilter]);
      const matchSubject = effectiveSubjectFilter === 'all' || r.subject === effectiveSubjectFilter;
      const matchFolder = !folderResultIds || folderResultIds.has(r.id || '') || folderResultIds.has(String(r.timestamp));
      return matchSearch && matchDiff && matchTime && matchSubject && matchFolder;
    });
    const sorts: Record<SortBy, (a: QuizResult, b: QuizResult) => number> = {
      newest: (a, b) => b.timestamp - a.timestamp,
      oldest: (a, b) => a.timestamp - b.timestamp,
      highest: (a, b) => b.percentage - a.percentage,
      lowest: (a, b) => a.percentage - b.percentage,
    };
    return res.sort(sorts[sortBy]);
  }, [sessionHistory, debouncedSearch, diffFilter, timeFilter, sortBy, effectiveSubjectFilter, folderResultIds]);

  const pinned = useMemo(() => filtered.filter(r => isPinned(r.id || String(r.timestamp))), [filtered, isPinned]);
  const unpinned = useMemo(() => filtered.filter(r => !isPinned(r.id || String(r.timestamp))), [filtered, isPinned]);
  const sevenDaysAgo = useMemo(() => Date.now() - 7 * 86400000, []);
  const recent = useMemo(() => unpinned.filter(r => r.timestamp >= sevenDaysAgo), [unpinned, sevenDaysAgo]);
  const older = useMemo(() => unpinned.filter(r => r.timestamp < sevenDaysAgo), [unpinned, sevenDaysAgo]);

  const isFiltering = debouncedSearch || diffFilter !== 'all' || timeFilter !== 'all' || effectiveFolderFilter !== 'all';

  // Reset visible count when filters change
  const filterKey = `${debouncedSearch}|${diffFilter}|${timeFilter}|${sortBy}|${effectiveSubjectFilter}|${sessionMode}|${effectiveFolderFilter}`;
  const prevFilterKey = useRef(filterKey);
  if (prevFilterKey.current !== filterKey) {
    prevFilterKey.current = filterKey;
    if (visibleCount !== 30) setVisibleCount(30);
  }

  const hasMore = filtered.length > visibleCount;
  const visibleFiltered = filtered.slice(0, visibleCount);


  const handlePractice = (r: QuizResult) => {
    if (!r.quizData?.length) { toast('Quiz data not loaded yet'); return; }
    const m = r.quizData.filter((q, i) => r.userAnswers[i] !== null && r.userAnswers[i] !== q.correctAnswer);
    if (!m.length) { toast('No mistakes to practice!'); return; }
    onPracticeMistakes(m.map(q => ({ ...q, shuffledOpts: undefined })));
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteHistory(deleteTarget.id ?? String(deleteTarget.timestamp));
    setDeleteTarget(null);
  };

  const activeFilters = [diffFilter !== 'all', timeFilter !== 'all', sortBy !== 'newest'].filter(Boolean).length;

  const hasActiveView = !!debouncedSearch.trim() || effectiveSubjectFilter !== 'all' || effectiveFolderFilter !== 'all' || sessionMode !== 'main' || activeFilters > 0;
  const clearAllFilters = () => {
    setSearch(''); setDebouncedSearch(''); setVisibleCount(30);
    setSubjectFilter('all'); setFolderFilter('all'); setSessionMode('main');
    setDiffFilter('all'); setTimeFilter('all'); setSortBy('newest');
  };

  // Refreshed every render so cards always call the latest closures (see LibraryCardActions)
  const cardActionsRef = useRef<LibraryCardActions>(null as unknown as LibraryCardActions);
  cardActionsRef.current = {
    view: r => onViewResult(r),
    remove: r => setDeleteTarget(r),
    practice: r => handlePractice(r),
    togglePin: pinId => togglePin(pinId),
    edit: r => { const d = new Date(r.timestamp); setEditTitle(r.quizTitle || ''); setEditSubject(r.subject || ''); setEditNotes(r.notes || ''); setEditDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); setEditTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`); setEditTarget(r); },
    addToFolder: r => setFolderPickerQuiz(r),
    exportQuiz: r => setSingleExportQuiz(r),
    importQuiz: () => { setContextMenuTab('import'); setShowExportImport(true); },
  };

  const renderCard = (r: QuizResult, globalIdx: number) => {
    const pinId = r.id || String(r.timestamp);
    return (
      <LibraryCard
        key={pinId}
        result={r}
        idx={globalIdx}
        isPinned={isPinned(pinId)}
        actionsRef={cardActionsRef}
      />
    );
  };

  return (
    <>
      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Delete Quiz?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              &ldquo;{deleteTarget?.quizTitle || 'This quiz'}&rdquo; will be moved to trash. You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-foreground hover:bg-muted/80">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-500 text-white border-none">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit quiz dialog */}
      <Dialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)}>
        <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle className="text-foreground font-bold">Edit Quiz Details</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Quiz Title</label>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value.slice(0, 60))} placeholder="Enter title…"
                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Subject</label>
              <input value={editSubject} onChange={e => setEditSubject(e.target.value.slice(0, 30))} placeholder="Enter subject…"
                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Notes</label>
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value.slice(0, 500))} placeholder="Add notes about this quiz…" rows={3}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">Date</label>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">Time</label>
                <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditTarget(null)} className="text-sm font-bold px-4 py-2 rounded-xl border border-border text-muted-foreground">Cancel</button>
            <button onClick={handleEditSave} className="text-sm font-bold px-4 py-2 rounded-xl bg-primary text-primary-foreground">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Folder Picker Sheet */}
      <FolderPickerSheet
        open={!!folderPickerQuiz}
        onClose={() => setFolderPickerQuiz(null)}
        quiz={folderPickerQuiz}
        onDone={() => setFmKey(k => k + 1)}
      />

      {/* Subject Filter Popup */}
      {subjectPopupOpen && (
        <SubjectFilterPopup
          subjects={subjectOptions}
          value={effectiveSubjectFilter}
          onChange={setSubjectFilter}
          onClose={() => setSubjectPopupOpen(false)}
        />
      )}

      {/* Folder Filter Popup */}
      <Overlay open={folderPopupOpen} onClose={() => setFolderPopupOpen(false)} kind="sheet" layer="sheet" className="sm:max-w-xs" labelledBy="folder-filter-title" hideClose>
          <div className="qmp-panel-header">
            <p id="folder-filter-title" className="text-xs font-black uppercase tracking-widest text-muted-foreground">📁 Filter by Folder</p>
            <button onClick={() => setFolderPopupOpen(false)} aria-label="Close" className="qmp-panel-close-inline"><X className="h-4 w-4" /></button>
          </div>
          <div className="qmp-panel-body max-h-[55vh] p-4">
            <button
              onClick={() => { setFolderFilter('all'); setFolderPopupOpen(false); }}
              className={`w-full text-left text-xs font-bold px-3 py-2.5 rounded-xl mb-1 transition-all ${effectiveFolderFilter === 'all' ? 'bg-primary/15 text-primary border border-primary/30' : 'text-foreground/50 hover:bg-foreground/5'}`}
            >All Folders</button>
            {folderOptions.map(f => (
              <button key={f.id}
                onClick={() => { setFolderFilter(f.id); setFolderPopupOpen(false); }}
                className={`w-full text-left text-xs font-bold px-3 py-2.5 rounded-xl mb-1 transition-all flex items-center justify-between ${effectiveFolderFilter === f.id ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'text-foreground/50 hover:bg-foreground/5'}`}
              >
                <span className="truncate">📁 {f.name}</span>
                <span className="text-[9px] text-foreground/25 ml-2 flex-shrink-0">{f.resultIds.size}</span>
              </button>
            ))}
          </div>
      </Overlay>

      {/* Filter Dialog */}
      <Dialog open={showFilterSheet} onOpenChange={setShowFilterSheet}>
        <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-md max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
            <DialogTitle className="text-foreground font-bold text-left">Filter & Sort</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-5 pb-5">
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Difficulty</p>
              <div className="flex gap-2">
                {(['all', 'easy', 'medium', 'hard'] as DiffFilter[]).map(d => (
                  <button key={d} onClick={() => setDiffFilter(d)}
                    className={`flex-1 text-xs font-bold py-2.5 rounded-xl border transition-all capitalize ${diffFilter === d ? 'bg-primary/15 border-primary/35 text-foreground' : 'bg-muted border-border text-muted-foreground'}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Time Period</p>
              <div className="grid grid-cols-2 gap-2">
                {([['all', 'All Time'], ['today', 'Today'], ['week', 'This Week'], ['month', 'This Month']] as [TimeFilter, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => setTimeFilter(k)}
                    className={`text-xs font-bold py-2.5 rounded-xl border transition-all ${timeFilter === k ? 'bg-primary/15 border-primary/35 text-foreground' : 'bg-muted border-border text-muted-foreground'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Sort By</p>
              <div className="grid grid-cols-2 gap-2">
                {([['newest', 'Newest First'], ['oldest', 'Oldest First'], ['highest', 'Highest Score'], ['lowest', 'Lowest Score']] as [SortBy, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => setSortBy(k)}
                    className={`text-xs font-bold py-2.5 rounded-xl border transition-all ${sortBy === k ? 'bg-primary/15 border-primary/35 text-foreground' : 'bg-muted border-border text-muted-foreground'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => { setDiffFilter('all'); setTimeFilter('all'); setSortBy('newest'); }}
                className="flex-1 text-sm font-bold py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-all">
                Clear All
              </button>
              <button onClick={() => setShowFilterSheet(false)}
                className="flex-1 text-sm font-bold py-3 rounded-xl bg-primary text-primary-foreground transition-all active:scale-[0.98]">
                Apply{activeFilters > 0 ? ` (${activeFilters})` : ''}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="animate-fade-in pb-4">
        {/* Header */}
        <div className="pt-1 px-1 mb-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-foreground/30 uppercase tracking-[0.12em] mb-0.5">Library</p>
            <h1 className="text-xl font-extrabold text-foreground leading-tight">My Quizzes</h1>
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 shadow-sm" title="Quizzes in this view">
            <BookOpen className="w-3.5 h-3.5 text-foreground/25" />
            <span className="text-sm font-bold text-foreground/50 tabular-nums">{sessionHistory.length}</span>
          </div>
        </div>

        {/* ── Tab Switcher ── */}
        <div className="flex gap-1 bg-muted/30 border border-border rounded-2xl p-1 mb-3">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold transition-all ${
              activeTab === 'history'
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-foreground/35 hover:text-foreground/55 border border-transparent'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            History
          </button>
          <button
            onClick={() => setActiveTab('organizer')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold transition-all ${
              activeTab === 'organizer'
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-foreground/35 hover:text-foreground/55 border border-transparent'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Organizer
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB 1: QUIZ HISTORY                                          */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <>
            {/* Command bar: search on top, filters and actions in ONE straight line below */}
            <div className="space-y-2 mb-3">
              <SearchField
                value={search}
                onChange={v => { setSearch(v); setDebouncedSearch(v); setVisibleCount(30); }}
                onClear={() => { setSearch(''); setDebouncedSearch(''); setVisibleCount(30); }}
                placeholder="Search titles, subjects, questions…"
              />
              <Toolbar>
                <ToolbarButton
                  icon={<SlidersHorizontal className={TB_ICON} />} label="Filter" title="Filter & sort"
                  active={activeFilters > 0} badge={activeFilters} onClick={() => setShowFilterSheet(true)}
                />
                <ToolbarButton
                  icon={<Tag className={TB_ICON} />} label="Subject" title="Filter by subject"
                  active={effectiveSubjectFilter !== 'all'} badge={effectiveSubjectFilter !== 'all' ? 1 : undefined}
                  disabled={subjectOptions.length < 2} disabledHint="Subject filter unlocks once you have quizzes in 2+ subjects"
                  onClick={() => setSubjectPopupOpen(true)}
                />
                <ToolbarButton
                  icon={<FolderOpen className={TB_ICON} />} label="Folder" title="Filter by Organizer folder" tone="amber"
                  active={effectiveFolderFilter !== 'all'} badge={effectiveFolderFilter !== 'all' ? 1 : undefined}
                  disabled={folderOptions.length < 1} disabledHint="Add quizzes to Organizer folders to filter by folder"
                  onClick={() => setFolderPopupOpen(true)}
                />
                <SessionToolbarButton history={history} value={sessionMode} onChange={setSessionMode} />
                <ToolbarDivider />
                <ToolbarButton
                  icon={viewMode === 'grid' ? <LayoutGrid className={TB_ICON} /> : <List className={TB_ICON} />}
                  label={viewMode === 'grid' ? 'Grid' : 'List'}
                  title={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
                  onClick={() => setViewMode(v => v === 'list' ? 'grid' : 'list')}
                />
                <ToolbarButton
                  icon={<Share2 className={TB_ICON} />} label="Export" title="Export & import quizzes"
                  onClick={() => { setContextMenuTab('export'); setShowExportImport(true); }}
                />
                <ToolbarDivider />
                <TrashToolbarButton onOpen={onOpenTrash} refreshKey={history.length} />
              </Toolbar>

              {hasActiveView && (
                <ChipsBar>
                  <span className="flex-shrink-0 text-[11px] font-black text-foreground/50 tabular-nums pr-0.5">
                    {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                  </span>
                  {effectiveSubjectFilter !== 'all' && <Chip prefix="Subject" label={effectiveSubjectFilter} onRemove={() => setSubjectFilter('all')} />}
                  {effectiveFolderFilter !== 'all' && <Chip tone="amber" prefix="Folder" label={folderOptions.find(f => f.id === effectiveFolderFilter)?.name || 'Folder'} onRemove={() => setFolderFilter('all')} />}
                  {sessionMode !== 'main' && <Chip tone="amber" label={`🏋️ ${getSessionLabel(sessionMode)}`} onRemove={() => setSessionMode('main')} />}
                  {diffFilter !== 'all' && <Chip label={diffFilter[0].toUpperCase() + diffFilter.slice(1)} onRemove={() => setDiffFilter('all')} />}
                  {timeFilter !== 'all' && <Chip label={{ today: 'Today', week: 'This week', month: 'This month', all: '' }[timeFilter]} onRemove={() => setTimeFilter('all')} />}
                  {sortBy !== 'newest' && <Chip prefix="Sort" label={{ newest: 'Newest', oldest: 'Oldest', highest: 'Highest', lowest: 'Lowest' }[sortBy]} onRemove={() => setSortBy('newest')} />}
                  <button type="button" onClick={clearAllFilters}
                    className="flex-shrink-0 h-7 px-2.5 rounded-full text-[11px] font-bold text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-all active:scale-95">
                    Clear all
                  </button>
                </ChipsBar>
              )}
            </div>

            <div className="mb-3"><SummaryStatsStrip history={sessionHistory} /></div>

            {/* Cards */}
            {viewMode === 'grid' ? (
              visibleFiltered.length === 0 && filtered.length === 0 ? (
                <div className="glass-card p-10 flex flex-col items-center text-center mt-2">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
                    <span className="text-3xl">{search || isFiltering ? '🔍' : '📂'}</span>
                  </div>
                  <h3 className="text-base font-black text-foreground mb-2">{search || isFiltering ? 'No results found' : 'No quizzes yet'}</h3>
                  <p className="text-sm text-foreground/40 max-w-xs leading-relaxed">{isFiltering ? 'Try adjusting your filters.' : 'Complete a quiz to see it here.'}</p>
                  {(search || isFiltering) && (
                    <button type="button" onClick={clearAllFilters} className="mt-4 h-9 px-4 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] text-xs font-bold text-foreground transition-colors">
                      Clear search & filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {visibleFiltered.map((r, i) => {
                      const pinId = r.id || String(r.timestamp);
                      return (
                        <GridQuizCard
                          key={pinId}
                          result={r}
                          idx={i}
                          isPinned={isPinned(pinId)}
                          onView={() => onViewResult(r)}
                          onPractice={() => handlePractice(r)}
                          onDelete={() => setDeleteTarget(r)}
                          onTogglePin={() => togglePin(pinId)}
                          onEdit={() => { const d = new Date(r.timestamp); setEditTitle(r.quizTitle || ''); setEditSubject(r.subject || ''); setEditNotes(r.notes || ''); setEditDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); setEditTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`); setEditTarget(r); }}
                          onAddToFolder={() => setFolderPickerQuiz(r)}
                        />
                      );
                    })}
                  </div>
                  {hasMore && (
                    <button onClick={() => setVisibleCount(c => c + 30)}
                      className="w-full mt-4 py-3 rounded-2xl border border-border bg-card text-sm font-bold text-foreground/50 hover:text-foreground/80 hover:border-foreground/20 transition-all active:scale-[0.98]">
                      Load More ({filtered.length - visibleCount} remaining)
                    </button>
                  )}
                </>
              )
            ) : filtered.length === 0 ? (
              <div className="glass-card p-10 flex flex-col items-center text-center mt-2">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
                  <span className="text-3xl">{search || isFiltering ? '🔍' : '📂'}</span>
                </div>
                <h3 className="text-base font-black text-foreground mb-2">{search || isFiltering ? 'No results found' : 'No quizzes yet'}</h3>
                <p className="text-sm text-foreground/40 max-w-xs leading-relaxed">{isFiltering ? 'Try adjusting your filters or search term.' : 'Complete a quiz to see it here in your library.'}</p>
                {(search || isFiltering) && (
                  <button type="button" onClick={clearAllFilters} className="mt-4 h-9 px-4 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] text-xs font-bold text-foreground transition-colors">
                    Clear search & filters
                  </button>
                )}
              </div>
            ) : isFiltering ? (
              <div className="space-y-2.5">
                {visibleFiltered.map((r, i) => renderCard(r, i))}
                {hasMore && (
                  <button onClick={() => setVisibleCount(c => c + 30)}
                    className="w-full mt-2 py-3 rounded-2xl border border-border bg-card text-sm font-bold text-foreground/50 hover:text-foreground/80 hover:border-foreground/20 transition-all active:scale-[0.98]">
                    Load More ({filtered.length - visibleCount} remaining)
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  let budget = visibleCount;
                  const pinnedSlice = pinned.slice(0, budget);
                  budget -= pinnedSlice.length;
                  const recentSlice = budget > 0 ? recent.slice(0, budget) : [];
                  budget -= recentSlice.length;
                  const olderSlice = budget > 0 ? older.slice(0, budget) : [];
                  return (
                    <>
                      {pinnedSlice.length > 0 && (
                        <div>
                          <SectionHeader title="⭐ Pinned" count={pinned.length} />
                          <div className="space-y-2.5">{pinnedSlice.map((r, i) => renderCard(r, i))}</div>
                        </div>
                      )}
                      {recentSlice.length > 0 && (
                        <div>
                          <SectionHeader title="Recent" count={recent.length} sub="Last 7 days" />
                          <div className="space-y-2.5">{recentSlice.map((r, i) => renderCard(r, pinned.length + i))}</div>
                        </div>
                      )}
                      {olderSlice.length > 0 && (
                        <div>
                          <SectionHeader title="History" count={older.length} />
                          <div className="space-y-2.5">{olderSlice.map((r, i) => renderCard(r, pinned.length + recent.length + i))}</div>
                        </div>
                      )}
                    </>
                  );
                })()}
                {hasMore && (
                  <div ref={libSentinelRef}>
                  <button onClick={() => setVisibleCount(c => c + 30)}
                    className="w-full mt-2 py-3 rounded-2xl border border-border bg-card text-sm font-bold text-foreground/50 hover:text-foreground/80 hover:border-foreground/20 transition-all active:scale-[0.98]">
                    Load More ({filtered.length - visibleCount} remaining)
                  </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB 2: FILE ORGANIZER                                        */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'organizer' && (
          <FileManager key={fmKey} onPractice={onPracticeMistakes} onViewResult={onViewResult} history={history} onOpenReportPreview={onOpenReportPreview} onEditQuiz={onEditQuiz} onHistoryChanged={onHistoryChanged} onStartQuiz={onPracticeMistakes} onOpenTrash={onOpenTrash} />
        )}
      </div>

      {/* Export & Import Modal */}
      <QuizExportImportModal
        key={singleExportQuiz ? `exp-${singleExportQuiz.timestamp}` : `main-${contextMenuTab}`}
        open={showExportImport || !!singleExportQuiz}
        onClose={() => { setShowExportImport(false); setSingleExportQuiz(null); setContextMenuTab('export'); }}
        history={history}
        onStartQuiz={onPracticeMistakes}
        initialTab={singleExportQuiz ? 'export' : contextMenuTab}
        selectedQuiz={singleExportQuiz || undefined}
        onImportToHistory={(records) => {
          let existing: QuizResult[] = [];
          try { existing = getHistorySync(); } catch { /* */ }
          const merged = new Map<number, QuizResult>();
          for (const r of existing) merged.set(r.timestamp, r);
          for (const r of records) merged.set(r.timestamp, r);
          const arr = Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp);
          setHistory(arr);
        }}
      />
    </>
  );
}
