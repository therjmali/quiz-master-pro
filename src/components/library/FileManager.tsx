import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { loadQuizQuestions } from '../../utils/ensureQuestions';
import { resolveLinkedResult, computeLinkBackfill } from '../../utils/historyLink';
import AiRationaleText from '../AiRationaleText';
import Overlay from '../ui/Overlay';
import { usePersistedState, usePersistedMap } from '../../hooks/usePersistedState';
import {
  Search, Trash2, Copy, Scissors, ClipboardPaste, X,
  ChevronRight, ChevronLeft, MoreVertical, FolderPlus, FilePlus,
  Home, LayoutGrid, List, Pencil, Move, FolderOpen,
  RotateCcw, Play, CheckSquare, Square, Plus, ArrowUpDown,
  ImagePlus, ImageOff, ArrowUp, ArrowDown, GripVertical,
  Pin, PinOff, Download, Upload, Share2, RotateCw, FileText, HelpCircle,
} from 'lucide-react';
import { usePinnedQuizzes } from '../../hooks/usePinnedQuizzes';
import { formatTime } from '../../utils/scoring';
import { useUpload } from 'zitejs/upload';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { toast } from 'sonner';
import { getHistorySync, setHistory } from '../../utils/historyStore';
import { useFileManager } from '../../hooks/useFileManager';
import { FileNode, TrashItem, ROOT_ID, findDuplicateFile, findNode as findNodeInTree, countQuestions, countFiles, removeBookmarkNode, BookmarkData } from '../../utils/fileTree';
import BookmarksHub from '../bookmarks/BookmarksHub';
import FolderStatsPanel, { InlineFolderStats, GridFolderStats, computeFolderPerformance } from './FolderStatsBar';
import { QuizQuestion, QuizResult } from '../../types/quiz';
import { formatDateShort, formatDateDMY, formatDateTimeDMY } from '../../utils/dateFormat';
import { SessionMode, filterBySession, getSessionLabel } from '../SessionSelector';
import {
  SearchField, Toolbar, ToolbarButton, ToolbarDivider, TrashToolbarButton, SessionToolbarButton, ToolbarSheet, SheetOption, ChipsBar, Chip, TB_ICON,
} from './LibraryToolbar';
import QuizExportImportModal from '../QuizExportImportModal';
import SearchInput, { SearchEmptyState } from '../shared/SearchInput';

interface Props {
  onPractice: (questions: QuizQuestion[]) => void;
  onViewResult?: (result: QuizResult) => void;
  history?: QuizResult[];
  onOpenReportPreview?: (data: import('../reports/ReportPreviewPage').ReportPreviewData) => void;
  onEditQuiz?: (id: string, title: string, subject: string, notes?: string, timestamp?: number) => void;
  onHistoryChanged?: () => void;
  onStartQuiz?: (questions: QuizQuestion[]) => void;
  /** Jump to the main Trash (Profile -> Trash) */
  onOpenTrash?: () => void;
}

/* ─── Context Menu ──────────────────────────────────────────────────── */
/**
 * Options menu for a file/folder.
 *
 *  • Rendered in a portal on <body>: cards use backdrop-filter, which makes a `fixed` child position
 *    relative to the card instead of the screen — that is what pushed the old menu off the page.
 *  • Phones (< 640px): a bottom sheet with a backdrop, always fully visible, scrolls if the list is long,
 *    and sits above the bottom navigation bar.
 *  • Larger screens: a popover measured after render, clamped inside the screen, flipped upward when
 *    there is no room below, and scrollable when taller than the available space.
 */
type CtxItem = { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; divider?: boolean };

const CTX_EDGE = 12;            // minimum gap to the screen edge
const CTX_BOTTOM_RESERVE = 96;  // bottom navigation bar + breathing room (popover mode)

function CtxMenu({ x, y, items, title, onClose }: {
  x: number; y: number; items: CtxItem[]; title?: string; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isSheet] = useState(() => window.innerWidth < 640);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);

  // Close on outside tap / Escape
  useEffect(() => {
    const h = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('touchstart', h);
      document.removeEventListener('keydown', k);
    };
  }, [onClose]);

  // Popover placement: measure the real size, then clamp / flip inside the visible area
  useLayoutEffect(() => {
    if (isSheet || !ref.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = ref.current.offsetWidth;
    const naturalH = ref.current.scrollHeight;
    const usableBottom = vh - CTX_BOTTOM_RESERVE;
    const availBelow = usableBottom - y;
    const availAbove = y - CTX_EDGE;
    const openUp = naturalH > availBelow && availAbove > availBelow;
    const maxH = Math.max(160, Math.min(naturalH, (openUp ? availAbove : availBelow)));
    const top = openUp ? Math.max(CTX_EDGE, y - maxH) : Math.max(CTX_EDGE, Math.min(y, usableBottom - maxH));
    const left = Math.max(CTX_EDGE, Math.min(x, vw - w - CTX_EDGE));
    setPos({ left, top, maxH });
  }, [x, y, isSheet, items.length]);

  const list = (
    <>
      {items.map((item, i) => (
        <div key={i}>
          {item.divider && <div className="h-px bg-border my-1" />}
          <button onClick={() => { item.onClick(); onClose(); }}
            className={`w-full flex items-center gap-3 px-4 ${isSheet ? 'py-3.5 text-[13px]' : 'py-2.5 text-[12px]'} font-semibold text-left transition-all ${
              item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-foreground/70 hover:bg-muted hover:text-foreground'
            }`}>
            {item.icon} {item.label}
          </button>
        </div>
      ))}
    </>
  );

  const content = isSheet ? (
    <Overlay open onClose={onClose} kind="sheet" layer="menu" hideClose label={title || 'Actions'}>
      <div ref={ref} className="qmp-panel-body" style={{ paddingBottom: 'max(var(--qmp-inset-bottom), 12px)' }}>
        <div className="sticky top-0 z-10 bg-card pt-2.5 pb-1">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-foreground/15" />
          {title && <p className="truncate px-4 pb-1.5 text-[11px] font-black uppercase tracking-widest text-foreground/40">{title}</p>}
        </div>
        {list}
      </div>
    </Overlay>
  ) : (
    <div ref={ref}
      className="fixed bg-card border border-border rounded-2xl shadow-2xl shadow-black/20 py-2 min-w-[220px] overflow-y-auto overscroll-contain animate-fade-in"
      role="menu"
      style={{
        left: pos?.left ?? x,
        top: pos?.top ?? y,
        maxHeight: pos?.maxH,
        zIndex: 'var(--qmp-z-menu)',
        visibility: pos ? 'visible' : 'hidden',
      }}>
      {list}
    </div>
  );

  return createPortal(content, document.body);
}

/* ─── Score helpers ─────────────────────────────────────────────────── */
function scoreColor(p: number) { return p >= 80 ? 'text-emerald-400' : p >= 60 ? 'text-amber-400' : 'text-red-400'; }
function scoreBar(p: number) { return p >= 80 ? 'bg-emerald-500' : p >= 60 ? 'bg-amber-500' : 'bg-red-500'; }

/* ─── Grid Card ─────────────────────────────────────────────────────── */
function GridCard({ node, selected, selectMode, onOpen, onToggle, onContext, history = [], onPractice, onViewResult, onTogglePin, isPinned, onEdit }: {
  node: FileNode; selected: boolean; selectMode: boolean;
  onOpen: () => void; onToggle: () => void;
  onContext: (e: React.MouseEvent | React.TouchEvent) => void;
  history?: QuizResult[];
  onPractice?: (qs: QuizQuestion[]) => void;
  onViewResult?: (r: QuizResult) => void;
  onTogglePin?: () => void;
  isPinned?: boolean;
  onEdit?: () => void;
}) {
  const isFolder = node.type === 'folder';
  const isBookmark = node.type === 'bookmark';
  const match = useQuizMatch(node, history);
  const qCount = isFolder ? countQuestions(node) : (node.questions?.length || match?.totalQuestions || 0);
  const longPressRef = useRef<ReturnType<typeof setTimeout>>();

  const handleTouchStart = (e: React.TouchEvent) => {
    longPressRef.current = setTimeout(() => { e.preventDefault(); onContext(e); }, 500);
  };
  const handleTouchEnd = () => { if (longPressRef.current) clearTimeout(longPressRef.current); };

  const effectiveQuestions = node.questions?.length ? node.questions : match?.quizData;
  const mistakeCount = match?.quizData?.length ? match.quizData.filter((q: QuizQuestion, i: number) => match.userAnswers[i] !== null && match.userAnswers[i] !== q.correctAnswer).length : 0;

  // Bookmark card
  if (isBookmark) {
    const bm = node.bookmarkData;
    const statusClr = bm?.userAnswer === bm?.correctAnswer ? 'text-emerald-400' : bm?.userAnswer === null ? 'text-amber-400' : 'text-red-400';
    const statusIcon = bm?.userAnswer === bm?.correctAnswer ? '✓' : bm?.userAnswer === null ? '⏭' : '✗';
    return (
      <div
        onClick={selectMode ? onToggle : onOpen}
        onContextMenu={onContext}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchEnd}
        className={`relative bg-card border rounded-2xl p-3.5 transition-all cursor-pointer group active:scale-[0.97] ${
          selected ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'border-amber-500/20 hover:border-amber-500/30 hover:shadow-md hover:shadow-black/10 bg-amber-500/[0.03]'
        }`}
      >
        {selectMode && (
          <div className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all z-10 ${
            selected ? 'bg-primary border-primary' : 'border-foreground/20 bg-card'
          }`}>{selected && <span className="text-primary-foreground text-[9px] font-black">✓</span>}</div>
        )}
        <div className="w-full aspect-[4/3] rounded-xl mb-3 flex flex-col items-center justify-center bg-amber-500/8 border border-amber-500/15 gap-1.5">
          <span className="text-3xl">🔖</span>
          <span className={`text-[10px] font-black ${statusClr}`}>{statusIcon}</span>
        </div>
        <p className="text-xs font-bold text-foreground truncate leading-snug">{node.name}</p>
        <div className="flex items-center gap-1.5 mt-1">
          {bm?.subject && <span className="text-[8px] font-bold text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/15 truncate max-w-[80px]">{bm.subject}</span>}
          {bm?.difficulty && <span className="text-[8px] text-foreground/25">{bm.difficulty}</span>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onContext(e); }}
          className="absolute top-2.5 left-2.5 w-7 h-7 rounded-lg bg-card/90 border border-border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  // Folder card unchanged
  if (isFolder) {
    return (
      <div
        onClick={selectMode ? onToggle : onOpen}
        onContextMenu={onContext}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchEnd}
        className={`relative bg-card border rounded-2xl p-3.5 transition-all cursor-pointer group active:scale-[0.97] ${
          selected ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-foreground/15 hover:shadow-md hover:shadow-black/10'
        }`}
      >
        {selectMode && (
          <div className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all z-10 ${
            selected ? 'bg-primary border-primary' : 'border-foreground/20 bg-card'
          }`}>{selected && <span className="text-primary-foreground text-[9px] font-black">✓</span>}</div>
        )}
        {node.posterUrl ? (
          <div className="w-full aspect-[4/3] rounded-xl overflow-hidden mb-3 bg-muted/20">
            <img src={node.posterUrl} alt={node.name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-full aspect-[4/3] rounded-xl mb-3 flex items-center justify-center bg-primary/8 border border-primary/10">
            <span className="text-3xl">{node.icon || '📁'}</span>
          </div>
        )}
        <p className="text-xs font-bold text-foreground truncate leading-snug">{node.name}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[9px] text-foreground/30 font-semibold">{(node.children?.length || 0)} items</span>
          {qCount > 0 && <><span className="text-foreground/10">·</span><span className="text-[9px] text-primary/50 font-bold">{qCount} Qs</span></>}
        </div>
        <GridFolderStats node={node} history={history} />
        <button onClick={(e) => { e.stopPropagation(); onContext(e); }}
          className="absolute top-2.5 left-2.5 w-7 h-7 rounded-lg bg-card/90 border border-border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  // ── Quiz file card (ultra-premium) ──
  const pct = match?.percentage ?? 0;
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (pct / 100) * circumference;
  const barClr = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const txtClr = scoreColor(pct);
  const bgClr = match ? (pct >= 80 ? 'bg-emerald-500/12 border-emerald-500/20' : pct >= 60 ? 'bg-amber-500/12 border-amber-500/20' : 'bg-red-500/12 border-red-500/20') : 'bg-accent/8 border-accent/10';

  return (
    <div className={`bg-card border rounded-2xl overflow-hidden shadow-sm transition-all duration-200 ${
      selected ? 'border-primary/50 ring-1 ring-primary/20' : isPinned ? 'border-amber-500/20 hover:border-amber-500/30 hover:shadow-lg hover:shadow-black/5' : 'border-border hover:border-foreground/15 hover:shadow-lg hover:shadow-black/5'
    }`}>
      {isPinned && (
        <div className="flex items-center gap-1 px-3 pt-2 pb-0">
          <span className="text-amber-400 text-[9px]">⭐</span>
          <span className="text-[8px] font-black text-amber-400/70 uppercase tracking-widest">Pinned</span>
        </div>
      )}
      {selectMode && (
        <div className="flex justify-end px-2 pt-2">
          <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
              selected ? 'bg-primary border-primary' : 'border-foreground/20 bg-card'
            }`}>{selected && <span className="text-primary-foreground text-[9px] font-black">✓</span>}</button>
        </div>
      )}
      <button onClick={selectMode ? onToggle : onOpen} className="w-full p-3 pb-2 text-left active:bg-foreground/5">
        {match ? (
          <div className={`w-full aspect-[4/3] rounded-2xl mb-2.5 flex flex-col items-center justify-center ${bgClr} border gap-1.5`}>
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" className="text-foreground/5" strokeWidth="2.5" />
                <circle cx="20" cy="20" r="18" fill="none" stroke={barClr} strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-500" />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-lg font-black ${txtClr}`}>{pct}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded">✓{match.correct}</span>
              <span className="text-[8px] font-bold text-red-400 bg-red-500/10 px-1 py-0.5 rounded">✗{match.wrong}</span>
              {match.skipped > 0 && <span className="text-[8px] font-bold text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded">⏭{match.skipped}</span>}
            </div>
          </div>
        ) : (
          <div className={`w-full aspect-[4/3] rounded-2xl mb-2.5 flex flex-col items-center justify-center ${bgClr} border gap-1.5`}>
            <span className="text-3xl">📝</span>
            <span className="text-[8px] font-black uppercase tracking-widest text-accent-foreground/40 bg-accent/15 px-2 py-0.5 rounded-full">New</span>
          </div>
        )}
        <p className="text-sm font-bold text-foreground truncate leading-snug">{node.name}</p>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {node.tags && node.tags.length > 0 && (
            <span className="text-[8px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/20 truncate max-w-[80px]">{node.tags[0]}</span>
          )}
          <span className="text-[9px] text-foreground/30">{formatDateShort(node.updatedAt)}</span>
          <span className="text-[9px] text-foreground/25">{qCount} Qs{match ? ` · ${formatTime(match.timeTaken)}` : ''}</span>
        </div>
        {match && (
          <div className="mt-2 h-1.5 bg-muted/40 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${scoreBar(pct)}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </button>
      {/* Practice Again button */}
      {match && mistakeCount > 0 && onPractice && (
        <div className="px-3 pb-2">
          <button onClick={(e) => { e.stopPropagation(); const qs = effectiveQuestions || match.quizData; if (qs) onPractice(qs.filter((q, i) => match.userAnswers[i] !== null && match.userAnswers[i] !== q.correctAnswer)); }}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-bold transition-all hover:bg-amber-500/15 active:scale-[0.98]">
            <RotateCcw className="w-3 h-3" /> Practice Again ({mistakeCount} mistakes)
          </button>
        </div>
      )}
      {/* Action bar */}
      <div className="flex border-t border-border bg-foreground/[0.01]">
        {onTogglePin && (
          <button onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
            className={`flex items-center justify-center px-3 py-2.5 text-[11px] font-bold transition-all active:scale-95 border-r border-border ${isPinned ? 'text-amber-400 hover:bg-amber-500/5' : 'text-foreground/25 hover:text-amber-400 hover:bg-amber-500/5'}`}>
            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        )}
        {onEdit && (
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="flex items-center justify-center px-3 py-2.5 text-[11px] font-bold text-foreground/25 hover:text-primary hover:bg-primary/5 transition-all active:scale-95 border-r border-border">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {/* 3-dot menu for move/copy/delete */}
        <button onClick={(e) => { e.stopPropagation(); onContext(e); }}
          className="flex items-center justify-center px-3 py-2.5 text-[11px] font-bold text-foreground/25 hover:text-foreground/60 hover:bg-foreground/5 transition-all active:scale-95 border-r border-border">
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
        {match && mistakeCount > 0 && onPractice ? (
          <button onClick={(e) => { e.stopPropagation(); const qs = effectiveQuestions || match.quizData; if (qs) onPractice(qs.filter((q, i) => match.userAnswers[i] !== null && match.userAnswers[i] !== q.correctAnswer)); }}
            className="flex-1 flex items-center justify-center gap-1 py-2.5 text-[10px] font-bold text-red-400/80 hover:text-red-300 hover:bg-red-500/5 transition-all active:scale-95">
            <RotateCcw className="w-3.5 h-3.5" /> ({mistakeCount})
          </button>
        ) : <div className="flex-1" />}
        <button onClick={(e) => { e.stopPropagation(); onContext(e); }}
          className="flex items-center justify-center px-3.5 py-2.5 text-[11px] font-bold text-foreground/25 hover:text-red-400 hover:bg-red-500/5 transition-all active:scale-95 border-l border-border"
          title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─── File Performance Inline (individual quiz match) ───────────────── */
function FilePerformanceInline({ file, history }: { file: FileNode; history: QuizResult[] }) {
  const match = useQuizMatch(file, history);

  if (!match) return null;

  const pct = match.percentage;
  const pctClr = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
  const barClr = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const bgClr = pct >= 80 ? 'bg-emerald-500/15 border-emerald-500/30' : pct >= 60 ? 'bg-amber-500/15 border-amber-500/30' : 'bg-red-500/15 border-red-500/30';

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${bgClr} ${pctClr}`}>{pct}%</span>
      <div className="flex h-1 w-10 rounded-full overflow-hidden bg-muted/40 flex-shrink-0">
        <div className={`h-full rounded-full ${barClr}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[8px] font-bold text-emerald-400">✓{match.correct}</span>
      <span className="text-[8px] font-bold text-red-400">✗{match.wrong}</span>
      <span className="text-[8px] font-bold text-amber-400">⏭{match.skipped}</span>
    </div>
  );
}

/* ─── Normalize helper ──────────────────────────────────────────────── */
function normalizeQ(text: string): string {
  return text.replace(/^\d+[\.\)\-:\s]+/, '').replace(/\*\*/g, '').trim().toLowerCase().slice(0, 80);
}

/* ─── Match helper ──────────────────────────────────────────────────── */
function useQuizMatch(file: FileNode, history: QuizResult[]) {
  return useMemo(() => resolveLinkedResult(file, history), [file, history]);
}

/* ─── File Performance Grid (individual quiz in grid view) ──────────── */
function FilePerformanceGrid({ file, history }: { file: FileNode; history: QuizResult[] }) {
  const match = useQuizMatch(file, history);
  if (!match) return null;

  const pct = match.percentage;
  const barClr = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const pctClr = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] font-black ${pctClr}`}>{pct}%</span>
        <div className="flex-1 h-1 rounded-full overflow-hidden bg-muted/30">
          <div className={`h-full rounded-full ${barClr}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[7px] font-bold text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded">✓{match.correct}</span>
        <span className="text-[7px] font-bold text-red-400 bg-red-500/10 px-1 py-0.5 rounded">✗{match.wrong}</span>
        <span className="text-[7px] font-bold text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded">⏭{match.skipped}</span>
      </div>
    </div>
  );
}

/* ─── Quiz Score Icon (replaces 📄 in grid & list) ──────────────────── */
function QuizScoreIcon({ file, history, size = 'grid' }: { file: FileNode; history: QuizResult[]; size?: 'grid' | 'list' }) {
  const match = useQuizMatch(file, history);
  if (!match) {
    // Not attempted — NEW badge
    if (size === 'grid') {
      return (
        <div className="w-full aspect-[4/3] rounded-xl mb-3 flex flex-col items-center justify-center bg-accent/8 border border-accent/10 gap-1.5">
          <span className="text-2xl">📝</span>
          <span className="text-[8px] font-black uppercase tracking-widest text-accent-foreground/40 bg-accent/15 px-2 py-0.5 rounded-full">New</span>
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center bg-accent/10 border border-accent/15 gap-0.5">
        <span className="text-xs">📝</span>
        <span className="text-[6px] font-black text-accent-foreground/40">NEW</span>
      </div>
    );
  }

  const pct = match.percentage;
  const ringClr = pct >= 80 ? 'border-emerald-500' : pct >= 60 ? 'border-amber-500' : 'border-red-500';
  const bgClr = pct >= 80 ? 'bg-emerald-500/12' : pct >= 60 ? 'bg-amber-500/12' : 'bg-red-500/12';
  const txtClr = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
  const barClr = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (pct / 100) * circumference;

  if (size === 'grid') {
    return (
      <div className={`w-full aspect-[4/3] rounded-xl mb-3 flex flex-col items-center justify-center ${bgClr} border ${ringClr}/20 gap-1`}>
        <div className="relative w-14 h-14">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" className="text-foreground/5" strokeWidth="2.5" />
            <circle cx="20" cy="20" r="18" fill="none" stroke={barClr} strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-500" />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-sm font-black ${txtClr}`}>{pct}%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[7px] font-bold text-emerald-400">✓{match.correct}</span>
          <span className="text-[7px] font-bold text-red-400">✗{match.wrong}</span>
          {match.skipped > 0 && <span className="text-[7px] font-bold text-amber-400">⏭{match.skipped}</span>}
        </div>
      </div>
    );
  }

  // List size
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgClr} border ${ringClr}/25 flex-shrink-0`}>
      <span className={`text-xs font-black ${txtClr}`}>{pct}%</span>
    </div>
  );
}

/* ─── List Row ──────────────────────────────────────────────────────── */
function ListRow({ node, selected, selectMode, onOpen, onToggle, onContext, history = [], onPractice, onViewResult, onTogglePin, isPinned, onEdit }: {
  node: FileNode; selected: boolean; selectMode: boolean;
  onOpen: () => void; onToggle: () => void;
  onContext: (e: React.MouseEvent | React.TouchEvent) => void;
  history?: QuizResult[];
  onPractice?: (qs: QuizQuestion[]) => void;
  onViewResult?: (r: QuizResult) => void;
  onTogglePin?: () => void;
  isPinned?: boolean;
  onEdit?: () => void;
}) {
  const isFolder = node.type === 'folder';
  const match = useQuizMatch(node, history);
  const qCount = isFolder ? countQuestions(node) : (node.questions?.length || match?.totalQuestions || 0);
  const longPressRef = useRef<ReturnType<typeof setTimeout>>();

  const handleTouchStart = (e: React.TouchEvent) => {
    longPressRef.current = setTimeout(() => { e.preventDefault(); onContext(e); }, 500);
  };
  const handleTouchEnd = () => { if (longPressRef.current) clearTimeout(longPressRef.current); };

  const effectiveQuestions = node.questions?.length ? node.questions : match?.quizData;
  const mistakeCount = match?.quizData?.length ? match.quizData.filter((q: QuizQuestion, i: number) => match.userAnswers[i] !== null && match.userAnswers[i] !== q.correctAnswer).length : 0;
  const pct = match?.percentage ?? 0;
  const isBookmark = node.type === 'bookmark';

  // Bookmark list row
  if (isBookmark) {
    const bm = node.bookmarkData;
    const statusClr = bm?.userAnswer === bm?.correctAnswer ? 'text-emerald-400' : bm?.userAnswer === null ? 'text-amber-400' : 'text-red-400';
    const statusIcon = bm?.userAnswer === bm?.correctAnswer ? '✓' : bm?.userAnswer === null ? '⏭' : '✗';
    return (
      <div
        onClick={selectMode ? onToggle : onOpen}
        onContextMenu={onContext}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchEnd}
        className={`flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer group ${
          selected ? 'bg-primary/8 border border-primary/30' : 'hover:bg-amber-500/[0.04] border border-amber-500/10 bg-amber-500/[0.02]'
        }`}
      >
        <button onClick={e => { e.stopPropagation(); onContext(e); }}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex-shrink-0">
          <MoreVertical className="w-4 h-4" />
        </button>
        {selectMode && (
          <button onClick={e => { e.stopPropagation(); onToggle(); }}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              selected ? 'bg-primary border-primary' : 'border-foreground/20'
            }`}>{selected && <span className="text-primary-foreground text-[9px] font-black">✓</span>}</button>
        )}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg bg-amber-500/10 border border-amber-500/15">
          🔖
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{node.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-black ${statusClr}`}>{statusIcon}</span>
            {bm?.subject && <span className="text-[9px] font-bold text-amber-400/60 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/15">{bm.subject}</span>}
            {bm?.difficulty && <span className="text-[9px] text-foreground/25">{bm.difficulty}</span>}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-foreground/20 flex-shrink-0" />
      </div>
    );
  }

  if (isFolder) {
    return (
      <div
        onClick={selectMode ? onToggle : onOpen}
        onContextMenu={onContext}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchEnd}
        className={`flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer group ${
          selected ? 'bg-primary/8 border border-primary/30' : 'hover:bg-foreground/[0.03] border border-transparent'
        }`}
      >
        <button onClick={e => { e.stopPropagation(); onContext(e); }}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex-shrink-0">
          <MoreVertical className="w-4 h-4" />
        </button>
        {selectMode && (
          <button onClick={e => { e.stopPropagation(); onToggle(); }}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              selected ? 'bg-primary border-primary' : 'border-foreground/20'
            }`}>{selected && <span className="text-primary-foreground text-[9px] font-black">✓</span>}</button>
        )}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg bg-primary/10 border border-primary/15">
          {node.icon || '📁'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{node.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-foreground/30 font-medium">{node.children?.length || 0} items</span>
            <span className="text-foreground/10">·</span>
            <span className="text-[10px] text-foreground/25">{formatDateDMY(node.updatedAt)}</span>
          </div>
          <InlineFolderStats node={node} history={history} />
        </div>
        <ChevronRight className="w-4 h-4 text-foreground/20 flex-shrink-0" />
      </div>
    );
  }

  // ── Quiz file row (ultra-premium — matches History card design) ──
  const scoreBgClr = match ? (pct >= 80 ? 'bg-emerald-500/15 border-emerald-500/30' : pct >= 60 ? 'bg-amber-500/15 border-amber-500/30' : 'bg-red-500/15 border-red-500/30') : '';
  const ringClr2 = match ? (pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444') : 'hsl(var(--primary))';
  const circumference2 = 2 * Math.PI * 18;
  const offset2 = circumference2 - (pct / 100) * circumference2;

  return (
    <div className={`bg-card border rounded-2xl overflow-hidden transition-all duration-200 ${
      selected ? 'border-primary/50 ring-1 ring-primary/20' : isPinned ? 'border-amber-500/20 hover:border-amber-500/30 hover:shadow-lg hover:shadow-black/5' : 'border-border hover:border-foreground/15 hover:shadow-lg hover:shadow-black/5'
    }`}
      onContextMenu={onContext}
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchEnd}
    >
      {isPinned && (
        <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-0.5">
          <span className="text-amber-400 text-[9px]">⭐</span>
          <span className="text-[9px] font-black text-amber-400/70 uppercase tracking-widest">Pinned</span>
        </div>
      )}
      <button onClick={selectMode ? onToggle : onOpen} className="w-full flex items-center gap-3.5 p-4 text-left active:bg-foreground/5">
        {selectMode && (
          <button onClick={e => { e.stopPropagation(); onToggle(); }}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              selected ? 'bg-primary border-primary' : 'border-foreground/20'
            }`}>{selected && <span className="text-primary-foreground text-[9px] font-black">✓</span>}</button>
        )}
        {/* Circular score badge — matches History card design */}
        {match ? (
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" className="text-foreground/5" strokeWidth="2.5" />
              <circle cx="20" cy="20" r="18" fill="none" stroke={ringClr2} strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={circumference2} strokeDashoffset={offset2} className="transition-all duration-700" />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-sm font-black ${scoreColor(pct)}`}>{pct}%</span>
          </div>
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center flex-shrink-0 text-xl font-black text-white/80 border border-foreground/10">
            {node.name?.[0]?.toUpperCase() || '📝'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="text-sm font-bold text-foreground flex-1 truncate leading-snug">{node.name}</p>
            {match && <div className={`flex-shrink-0 text-base font-black px-3 py-1.5 rounded-xl border ${scoreBgClr} ${scoreColor(pct)}`}>{pct}%</div>}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {node.tags && node.tags.length > 0 && (
              <span className="text-[9px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">{node.tags[0]}</span>
            )}
            <span className="text-[10px] text-foreground/35">{formatDateDMY(node.updatedAt)}</span>
            <span className="text-[10px] text-foreground/25">·</span>
            <span className="text-[10px] text-foreground/35">{match ? `${formatTime(match.timeTaken)} · ${match.totalQuestions} Qs` : `${qCount} Qs`}</span>
          </div>
          {match && (
            <>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">✓{match.correct}</span>
                <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-md">✗{match.wrong}</span>
                <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md">⏭{match.skipped}</span>
                <span className="text-[9px] text-foreground/25 ml-auto">{match.totalQuestions} Qs</span>
              </div>
              <div className="mt-2 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${scoreBar(pct)}`} style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-foreground/20 flex-shrink-0 ml-1" />
      </button>
      {/* Action bar */}
      <div className="flex border-t border-border bg-foreground/[0.01]">
        {onTogglePin && (
          <button onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
            className={`flex items-center justify-center gap-1 px-3.5 py-3 text-[11px] font-bold transition-all active:scale-95 border-r border-border ${isPinned ? 'text-amber-400 hover:bg-amber-500/5' : 'text-foreground/25 hover:text-amber-400 hover:bg-amber-500/5'}`}>
            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        )}
        {onEdit && (
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="flex items-center justify-center gap-1 px-3.5 py-3 text-[11px] font-bold text-foreground/25 hover:text-primary hover:bg-primary/5 transition-all active:scale-95 border-r border-border">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {/* 3-dot menu: move/copy/delete */}
        <button onClick={(e) => { e.stopPropagation(); onContext(e as any); }}
          className="flex items-center justify-center gap-1 px-3.5 py-3 text-[11px] font-bold text-foreground/25 hover:text-foreground/60 hover:bg-foreground/5 transition-all active:scale-95 border-r border-border">
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
        {match && mistakeCount > 0 && onPractice ? (
          <button onClick={(e) => { e.stopPropagation(); const qs = effectiveQuestions || match.quizData; if (qs) onPractice(qs.filter((q, i) => match.userAnswers[i] !== null && match.userAnswers[i] !== q.correctAnswer)); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold text-red-400/80 hover:text-red-300 hover:bg-red-500/5 transition-all active:scale-95">
            <RotateCcw className="w-3.5 h-3.5" /> Practice ({mistakeCount})
          </button>
        ) : <div className="flex-1" />}
        <button onClick={(e) => { e.stopPropagation(); onContext(e as any); }}
          className="flex items-center justify-center gap-1.5 px-5 py-3 text-[11px] font-bold text-foreground/25 hover:text-red-400 hover:bg-red-500/5 transition-all active:scale-95 border-l border-border"
          title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─── Move To Dialog ────────────────────────────────────────────────── */
function MoveToDialog({ open, root, nodeIds, onMove, onClose }: {
  open: boolean; root: FileNode; nodeIds: string[];
  onMove: (targetId: string) => void; onClose: () => void;
}) {
  const [browsing, setBrowsing] = useState(ROOT_ID);
  const browseFolder = findNodeInTree(root, browsing);
  const subfolders = (browseFolder?.children || []).filter(c => c.type === 'folder' && !nodeIds.includes(c.id));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-sm">
        <DialogHeader><DialogTitle className="text-foreground font-bold">Move to…</DialogTitle></DialogHeader>
        <div className="space-y-1 max-h-60 overflow-y-auto py-2">
          {browsing !== ROOT_ID && (
            <button onClick={() => {
              const parent = findParentId(root, browsing);
              setBrowsing(parent || ROOT_ID);
            }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-foreground/50 hover:bg-foreground/5 rounded-xl transition-all">
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}
          <button onClick={() => onMove(browsing)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-primary bg-primary/10 border border-primary/20 rounded-xl transition-all hover:bg-primary/15">
            <ClipboardPaste className="w-3.5 h-3.5" /> Paste here — {browseFolder?.name || 'Home'}
          </button>
          {subfolders.map(f => (
            <button key={f.id} onClick={() => setBrowsing(f.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-foreground/70 hover:bg-foreground/5 rounded-xl transition-all">
              <span className="text-base">{f.icon || '📁'}</span>
              <span className="flex-1 text-left truncate">{f.name}</span>
              <ChevronRight className="w-3.5 h-3.5 text-foreground/20" />
            </button>
          ))}
          {subfolders.length === 0 && <p className="text-center text-[10px] text-foreground/25 py-3">No subfolders here</p>}
        </div>
        <DialogFooter>
          <button onClick={onClose} className="text-sm font-bold px-4 py-2 rounded-xl border border-border text-muted-foreground">Cancel</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function findParentId(root: FileNode, childId: string): string | null {
  if (root.children) {
    for (const c of root.children) {
      if (c.id === childId) return root.id;
      const found = findParentId(c, childId);
      if (found) return found;
    }
  }
  return null;
}

/* ─── Add Quiz Sheet (pick from history — multi-select) ─────────────── */
function AddQuizSheet({ open, onClose, quizzes, onAdd, existingNames, existingQuestions }: {
  open: boolean; onClose: () => void;
  quizzes: QuizResult[];
  onAdd: (quiz: QuizResult) => void;
  existingNames?: Set<string>;
  existingQuestions?: Set<string>;
}) {
  const [search, setSearch] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const filtered = useMemo(() => {
    if (!search) return quizzes;
    const q = search.trim().toLowerCase();
    if (!q) return quizzes;
    return quizzes.filter(r => r.quizTitle?.toLowerCase().includes(q) || r.subject?.toLowerCase().includes(q));
  }, [quizzes, search]);

  // Reset added set when dialog opens
  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current) setAddedIds(new Set());
    prevOpen.current = open;
  }, [open]);

  const handleAdd = (r: QuizResult) => {
    const key = r.id || String(r.timestamp);
    if (addedIds.has(key)) return;
    onAdd(r);
    setAddedIds(prev => new Set(prev).add(key));
  };

  const isAlreadyInFolder = (r: QuizResult) => {
    const name = r.quizTitle || `Quiz · ${r.totalQuestions} Questions`;
    // Check by name
    if (existingNames?.has(name)) return true;
    // Check by question content (first question + count)
    if (existingQuestions && r.quizData?.length > 0) {
      const contentKey = `${r.quizData[0].question}::${r.totalQuestions}`;
      if (existingQuestions.has(contentKey)) return true;
    }
    return false;
  };

  // Summary counts
  const existingCount = useMemo(() => filtered.filter(r => isAlreadyInFolder(r)).length, [filtered, existingNames, existingQuestions]);
  const newCount = filtered.length - existingCount;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-md max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-foreground font-bold text-left">Add Quiz to Folder</DialogTitle>
            {addedIds.size > 0 && (
              <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg animate-fade-in">
                ✓ {addedIds.size} added
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Summary strip */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-2 mx-5 mt-3 px-3 py-2 bg-foreground/[0.03] border border-border rounded-xl">
            <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
              🆕 {newCount} new
            </span>
            {existingCount > 0 && (
              <span className="text-[10px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-lg">
                ⚠️ {existingCount} already exists
              </span>
            )}
            <span className="text-[9px] text-foreground/25 ml-auto">{filtered.length} total</span>
          </div>
        )}

        <SearchInput className="mx-5 my-3 flex-shrink-0" value={search} onChange={setSearch} placeholder="Search quizzes…" />
        <div className="flex-1 overflow-y-auto space-y-1.5 px-5 pb-3">
          {filtered.length === 0 && (search ? <SearchEmptyState query={search} onClear={() => setSearch('')} noun="quizzes" /> : (
            <div className="text-center py-8">
              <span className="text-2xl block mb-2">📭</span>
              <p className="text-sm text-foreground/40">No quiz history available</p>
            </div>
          ))}
          {/* New quizzes section */}
          {newCount > 0 && existingCount > 0 && (
            <div className="flex items-center gap-2 pt-1 pb-0.5">
              <span className="text-[9px] font-black text-emerald-400/60 uppercase tracking-widest">🆕 New ({newCount})</span>
              <div className="flex-1 h-px bg-emerald-500/15" />
            </div>
          )}
          {filtered.filter(r => !isAlreadyInFolder(r)).map(r => {
            const pct = r.percentage;
            const pctColor = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
            const key = r.id || String(r.timestamp);
            const justAdded = addedIds.has(key);
            return (
              <button key={key} onClick={() => !justAdded && handleAdd(r)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all text-left active:scale-[0.98] ${
                  justAdded ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border hover:border-primary/30 hover:bg-primary/5'
                }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0 border ${
                  justAdded ? 'bg-emerald-500/15 border-emerald-500/25' : 'bg-primary/10 border-primary/15'
                }`}>
                  {justAdded ? <span className="text-emerald-400 text-sm font-black">✓</span> : (r.quizTitle?.[0]?.toUpperCase() || '📝')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{r.quizTitle || `Quiz · ${r.totalQuestions} Qs`}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {r.subject && <span className="text-[9px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">{r.subject}</span>}
                    <span className="text-[10px] text-foreground/30">{formatDateShort(r.timestamp)}</span>
                    <span className="text-[10px] text-foreground/20">·</span>
                    <span className="text-[10px] text-foreground/30">{r.totalQuestions} Qs</span>
                  </div>
                </div>
                <span className={`text-sm font-black ${pctColor}`}>{pct}%</span>
                {justAdded ? (
                  <span className="text-emerald-400 text-[10px] font-black bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 flex-shrink-0">Added</span>
                ) : (
                  <Plus className="w-4 h-4 text-primary/50 flex-shrink-0" />
                )}
              </button>
            );
          })}
          {/* Already in folder section */}
          {existingCount > 0 && (
            <>
              <div className="flex items-center gap-2 pt-2 pb-0.5">
                <span className="text-[9px] font-black text-red-400/50 uppercase tracking-widest">⚠️ Already in Folder ({existingCount})</span>
                <div className="flex-1 h-px bg-red-500/15" />
              </div>
              {filtered.filter(r => isAlreadyInFolder(r)).map(r => {
                const pct = r.percentage;
                const pctColor = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
                const key = r.id || String(r.timestamp);
                return (
                  <div key={key}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border border-border bg-foreground/[0.02] opacity-50">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0 border bg-foreground/5 border-border">
                      <span className="text-foreground/20 text-sm">✓</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground/50 truncate">{r.quizTitle || `Quiz · ${r.totalQuestions} Qs`}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-foreground/20">{formatDateShort(r.timestamp)}</span>
                        <span className="text-[10px] text-foreground/20">·</span>
                        <span className="text-[10px] text-foreground/20">{r.totalQuestions} Qs</span>
                      </div>
                    </div>
                    <span className={`text-sm font-black ${pctColor} opacity-50`}>{pct}%</span>
                    <span className="text-red-400/50 text-[10px] font-bold flex-shrink-0">In folder</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div className="flex-shrink-0 border-t border-border px-5 py-3">
          <button onClick={onClose}
            className="w-full text-sm font-bold py-3 rounded-xl bg-primary text-primary-foreground transition-all active:scale-[0.98]">
            {addedIds.size > 0 ? `Done (${addedIds.size} added)` : 'Close'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Bookmark Preview Modal ────────────────────────────────────────── */
function BookmarkPreviewModal({ node, onClose, onRemove, onPractice, onUpdateNotes }: {
  node: FileNode; onClose: () => void; onRemove: () => void;
  onPractice?: (questions: QuizQuestion[]) => void;
  onUpdateNotes?: (nodeId: string, notes: string) => void;
}) {
  const bm = node.bookmarkData;
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(bm?.notes || '');
  if (!bm) return null;
  const isCorrect = bm.userAnswer === bm.correctAnswer;
  const isSkipped = bm.userAnswer === null;
  const statusColor = isCorrect ? 'text-emerald-400' : isSkipped ? 'text-amber-400' : 'text-red-400';
  const statusLabel = isCorrect ? '✓ Correct' : isSkipped ? '⏭ Skipped' : '✗ Wrong';

  const handlePracticeThis = () => {
    if (!onPractice) return;
    onPractice([{
      question: bm.question,
      options: bm.options,
      correctAnswer: bm.correctAnswer,
      difficulty: (bm.difficulty as 'easy' | 'medium' | 'hard') || 'medium',
      rationale: bm.rationale,
      questionType: bm.questionType,
    }]);
  };

  const handleSaveNotes = () => {
    onUpdateNotes?.(node.id, notesDraft.trim());
    setEditingNotes(false);
    toast.success('📝 Notes saved');
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-md max-h-[85vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-foreground font-bold text-left flex items-center gap-2">
            <span className="text-lg">🔖</span> Bookmarked Question
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 py-4 space-y-4">
          {/* Status & meta */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] font-black uppercase tracking-widest ${statusColor}`}>{statusLabel}</span>
            {bm.difficulty && (
              <span className="text-[9px] font-bold text-foreground/40 bg-foreground/5 px-2 py-0.5 rounded border border-border">{bm.difficulty}</span>
            )}
            {bm.questionType && (
              <span className="text-[9px] font-bold text-primary/60 bg-primary/10 px-2 py-0.5 rounded border border-primary/15">{bm.questionType}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] text-foreground/35">
            <span className="font-bold">{bm.subject}</span>
            <span>·</span>
            <span>{bm.quizTitle}</span>
            <span>·</span>
            <span>{new Date(bm.bookmarkedAt).toLocaleDateString()}</span>
          </div>

          {/* Question */}
          <p className="text-sm font-semibold text-foreground/90 leading-relaxed">{bm.question}</p>

          {/* Options */}
          <div className="space-y-1.5">
            {bm.options.map((opt, i) => {
              const isThisCorrect = opt === bm.correctAnswer;
              const isThisUser = opt === bm.userAnswer;
              let cls = 'bg-foreground/4 border-border';
              let badge: React.ReactNode = null;
              if (isThisCorrect) {
                cls = 'bg-emerald-500/10 border-emerald-500/25';
                badge = <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/25 font-bold flex-shrink-0">✓ Correct</span>;
              } else if (isThisUser && !isCorrect) {
                cls = 'bg-red-500/10 border-red-500/25';
                badge = <span className="text-[9px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded border border-red-500/25 font-bold flex-shrink-0">✗ Yours</span>;
              }
              return (
                <div key={i} className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border ${cls}`}>
                  <span className="text-xs text-foreground/80 leading-snug">
                    <span className="text-foreground/30 font-bold mr-1.5 text-[10px]">({String.fromCharCode(97 + i)})</span>
                    {opt}
                  </span>
                  {badge}
                </div>
              );
            })}
          </div>

          {/* Rationale */}
          {bm.rationale && (
            <div className="bg-amber-500/10 border-l-4 border-amber-500/50 p-3 rounded-r-xl">
              <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">📖 Rationale</p>
              <AiRationaleText text={bm.rationale} className="text-xs text-foreground/70" />
            </div>
          )}

          {/* User Notes */}
          <div className="bg-foreground/[0.03] border border-border rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest">📝 My Notes</p>
              <button onClick={() => { setEditingNotes(!editingNotes); setNotesDraft(bm.notes || ''); }}
                className="text-[10px] font-bold text-primary/60 hover:text-primary transition-colors">
                {editingNotes ? 'Cancel' : bm.notes ? 'Edit' : '+ Add Notes'}
              </button>
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value.slice(0, 500))}
                  rows={3} placeholder="Add personal notes about this question…" autoFocus
                  className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder-foreground/25 focus:outline-none focus:border-primary/40 resize-none" />
                <button onClick={handleSaveNotes} className="text-xs font-bold bg-primary text-primary-foreground px-3 py-1.5 rounded-lg transition-all active:scale-95">Save Notes</button>
              </div>
            ) : (
              <p className="text-xs text-foreground/50 leading-relaxed">{bm.notes || 'No notes yet.'}</p>
            )}
          </div>
        </div>
        <DialogFooter className="px-5 py-4 border-t border-border flex-row gap-2 flex-wrap">
          {onPractice && (
            <button onClick={handlePracticeThis} className="flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/25 text-primary hover:bg-primary/15 transition-all">
              <Play className="w-3.5 h-3.5" /> Practice
            </button>
          )}
          <button onClick={onClose} className="flex-1 text-sm font-bold px-4 py-2.5 rounded-xl border border-border text-muted-foreground">Close</button>
          <button onClick={onRemove} className="flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/15 transition-all">
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SORT_LABELS = {
  name: 'Name (A–Z)',
  newest: 'Newest first',
  oldest: 'Oldest first',
  high_score: 'Highest score',
  low_score: 'Lowest score',
  custom: 'Custom order',
} as const;

/* ─── Main FileManager ──────────────────────────────────────────────── */
export default function FileManager({ onPractice, onViewResult, history = [], onOpenReportPreview, onEditQuiz, onHistoryChanged, onStartQuiz, onOpenTrash }: Props) {
  const fm = useFileManager();
  const { upload } = useUpload();
  const { togglePin, isPinned } = usePinnedQuizzes();
  const [sessionMode, setSessionMode] = usePersistedState<SessionMode>('fm_session', 'main');
  const sessionHistory = useMemo(() => filterBySession(history, sessionMode), [history, sessionMode]);
  const [ctx, setCtx] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [createDialogType, setCreateDialogType] = useState<'folder' | 'file' | null>(null);
  const [createName, setCreateName] = useState('');
  const [renameTarget, setRenameTarget] = useState<FileNode | null>(null);
  const [renameName, setRenameName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveNodeIds, setMoveNodeIds] = useState<string[]>([]);
  const [addQuizOpen, setAddQuizOpen] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [bookmarkPreview, setBookmarkPreview] = useState<FileNode | null>(null);
  const [showExportImport, setShowExportImport] = useState(false);
  const [exportQuizResult, setExportQuizResult] = useState<QuizResult | null>(null);
  const [exportImportTab, setExportImportTab] = useState<'export' | 'import'>('export');
  // Per-folder sort: each folder remembers its own sort preference independently
  const folderSortMap = usePersistedMap<'name' | 'newest' | 'oldest' | 'high_score' | 'low_score' | 'custom'>('fm_folder_sort', 'name');
  // Per-folder view mode: each folder remembers its own grid/list preference
  const folderViewMap = usePersistedMap<'grid' | 'list'>('fm_folder_view', 'list');
  const viewMode = folderViewMap.get(fm.currentFolderId);
  const sortBy = folderSortMap.get(fm.currentFolderId);
  const setSortBy = useCallback((val: 'name' | 'newest' | 'oldest' | 'high_score' | 'low_score' | 'custom') => {
    folderSortMap.set(fm.currentFolderId, val);
  }, [fm.currentFolderId, folderSortMap]);

  // Auto-detect if we're inside the Bookmarks folder tree
  const isInsideBookmarks = useMemo(() => {
    if (fm.currentFolder?.name === '📁 Bookmarks' || fm.currentFolder?.name === 'Bookmarks') return true;
    return fm.breadcrumbs.some(b => b.name === '📁 Bookmarks' || b.name === 'Bookmarks');
  }, [fm.currentFolder, fm.breadcrumbs]);

  // Reset reorder mode when navigating to a different folder (sort preference is per-folder)
  useEffect(() => {
    setReorderMode(false);
  }, [fm.currentFolderId]);
  const coverPhotoRef = useRef<HTMLInputElement>(null);
  const [coverPhotoTargetId, setCoverPhotoTargetId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);

  // Find matching QuizResult for a file node (uses same multi-strategy matching)
  const findMatchingResult = useCallback((node: FileNode): QuizResult | null => resolveLinkedResult(node, sessionHistory), [sessionHistory]);

  const handleOpenNode = useCallback((node: FileNode) => {
    if (node.type === 'folder') {
      fm.navigateTo(node.id);
    } else if (node.type === 'bookmark') {
      setBookmarkPreview(node);
    } else {
      // Try to find matching result and navigate to it
      const match = findMatchingResult(node);
      if (match && onViewResult) {
        onViewResult(match);
      } else if (match && !onViewResult) {
        const qs = match.quizData?.length ? match.quizData : node.questions;
        if (qs?.length) onPractice(qs);
        else toast('📄 No questions available');
      } else if (node.questions && node.questions.length > 0) {
        toast('📝 No result found — starting quiz…', { duration: 2000 });
        onPractice(node.questions);
      } else {
        toast('📄 No questions in this collection');
      }
    }
  }, [fm, onPractice, onViewResult, findMatchingResult]);

  const handleCtx = useCallback((e: React.MouseEvent | React.TouchEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = 'clientX' in e ? e.clientX : rect.left;
    const y = 'clientY' in e ? e.clientY : rect.top + rect.height;
    setCtx({ x, y, nodeId });
  }, []);

  const ctxNode = ctx ? fm.findNode(ctx.nodeId) : null;
  const ctxMatchedResult = ctxNode && ctxNode.type === 'file' ? findMatchingResult(ctxNode) : null;

  const handleRemoveBookmark = useCallback((nodeId: string) => {
    const updated = removeBookmarkNode(fm.root, nodeId);
    fm.forceRefreshWith(updated);
    toast.success('🔖 Bookmark removed');
  }, [fm]);

  const handleUpdateBookmarkNotes = useCallback((nodeId: string, notes: string) => {
    const node = findNodeInTree(fm.root, nodeId);
    if (node?.bookmarkData) {
      node.bookmarkData.notes = notes;
      node.updatedAt = Date.now();
      fm.forceRefreshWith({ ...fm.root });
    }
  }, [fm]);

  const ctxItems = ctxNode ? [
    ...(ctxNode.type === 'folder' ? [
      { label: 'Open', icon: <FolderOpen className="w-3.5 h-3.5" />, onClick: () => fm.navigateTo(ctxNode.id) },
    ] : ctxNode.type === 'bookmark' ? [
      { label: 'View Bookmark', icon: <FolderOpen className="w-3.5 h-3.5" />, onClick: () => setBookmarkPreview(ctxNode) },
    ] : [
      { label: 'Practice', icon: <Play className="w-3.5 h-3.5" />, onClick: () => { if (ctxNode.questions?.length) onPractice(ctxNode.questions!); else toast('No questions'); } },
      ...(ctxMatchedResult && onViewResult ? [{ label: 'Retry Quiz', icon: <RotateCw className="w-3.5 h-3.5" />, onClick: () => onViewResult!(ctxMatchedResult) }] : []),
      ...(ctxMatchedResult ? [{ label: 'Share Result', icon: <Share2 className="w-3.5 h-3.5" />, onClick: async () => {
        const text = `${ctxMatchedResult.quizTitle || 'Quiz'} — ${ctxMatchedResult.percentage}% (${ctxMatchedResult.correct}✓ ${ctxMatchedResult.wrong}✗)`;
        if (navigator.share) { try { await navigator.share({ title: 'Quiz Result', text }); } catch {} }
        else { await navigator.clipboard.writeText(text); toast.success('📋 Copied to clipboard!'); }
      } }] : []),
      { label: 'Export Quiz', icon: <Download className="w-3.5 h-3.5" />, onClick: () => {
        if (ctxMatchedResult) { setExportQuizResult(ctxMatchedResult); }
        else if (ctxNode.questions?.length) {
          setExportQuizResult({ quizData: ctxNode.questions!, userAnswers: ctxNode.questions!.map(() => null), totalQuestions: ctxNode.questions!.length, correct: 0, wrong: 0, skipped: ctxNode.questions!.length, score: 0, gain: 0, penalty: 0, netScore: 0, maxScore: 0, percentage: 0, accuracy: 0, timeTaken: 0, timestamp: ctxNode.updatedAt, quizTitle: ctxNode.name, subject: ctxNode.tags?.[0] } as QuizResult);
        } else { toast('No questions to export'); return; }
        setExportImportTab('export'); setShowExportImport(true);
      }, divider: true },
      { label: 'Import Quiz', icon: <Upload className="w-3.5 h-3.5" />, onClick: () => { setExportImportTab('import'); setShowExportImport(true); } },
    ]),
    ...(ctxNode.type === 'bookmark' ? [
      { label: 'Remove Bookmark', icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => handleRemoveBookmark(ctxNode.id), danger: true, divider: true },
      { label: 'Move To…', icon: <Move className="w-3.5 h-3.5" />, onClick: () => { setMoveNodeIds([ctxNode.id]); setMoveDialogOpen(true); } },
      { label: 'Cut', icon: <Scissors className="w-3.5 h-3.5" />, onClick: () => { fm.clipCut([ctxNode.id]); toast('✂️ Cut — navigate and paste'); } },
      { label: 'Copy', icon: <Copy className="w-3.5 h-3.5" />, onClick: () => { fm.clipCopy([ctxNode.id]); toast('📋 Copied — navigate and paste'); } },
    ] : [
      { label: 'Edit Details', icon: <Pencil className="w-3.5 h-3.5" />, onClick: () => { setRenameTarget(ctxNode); setRenameName(ctxNode.name); setEditSubject(ctxNode.tags?.[0] || ''); setEditNotes(''); const d = new Date(ctxNode.updatedAt); setEditDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); setEditTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`); }, divider: true },
      { label: 'Cut', icon: <Scissors className="w-3.5 h-3.5" />, onClick: () => { fm.clipCut([ctxNode.id]); toast('✂️ Cut — navigate and paste'); } },
      { label: 'Copy', icon: <Copy className="w-3.5 h-3.5" />, onClick: () => { fm.clipCopy([ctxNode.id]); toast('📋 Copied — navigate and paste'); } },
      { label: 'Move To…', icon: <Move className="w-3.5 h-3.5" />, onClick: () => { setMoveNodeIds([ctxNode.id]); setMoveDialogOpen(true); } },
      ...(ctxNode.type === 'folder' ? [
        { label: ctxNode.posterUrl ? 'Change Cover Photo' : 'Set Cover Photo', icon: <ImagePlus className="w-3.5 h-3.5" />, onClick: () => { setCoverPhotoTargetId(ctxNode.id); coverPhotoRef.current?.click(); }, divider: true },
        ...(ctxNode.posterUrl ? [{ label: 'Remove Cover Photo', icon: <ImageOff className="w-3.5 h-3.5" />, onClick: () => { fm.update(ctxNode.id, { posterUrl: undefined }); toast.success('📷 Cover photo removed'); } }] : []),
      ] : []),
      { label: 'Delete', icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => setDeleteTarget(ctxNode), danger: true, divider: true },
    ]),
  ] : [];

  const handleCreate = () => {
    if (!createName.trim()) return;
    fm.addFolder(createName.trim());
    toast.success(`📁 Created "${createName.trim()}"`);
    setCreateDialogType(null);
    setCreateName('');
  };

  const handleRename = () => {
    if (!renameTarget || !renameName.trim()) return;
    fm.rename(renameTarget.id, renameName.trim());
    // Update tags (subject) and other metadata
    const newSubject = editSubject.trim();
    const updates: Record<string, any> = {};
    if (newSubject) updates.tags = [newSubject];
    else if (renameTarget.tags?.length) updates.tags = renameTarget.tags; // keep existing
    if (editNotes.trim()) updates.notes = editNotes.trim();
    // Update timestamp if date changed
    if (editDate) {
      const [y, m, d] = editDate.split('-').map(Number);
      const [hh, mm] = editTime ? editTime.split(':').map(Number) : [0, 0];
      const built = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime();
      if (built !== renameTarget.updatedAt) updates.updatedAt = built;
    }
    if (Object.keys(updates).length > 0) fm.update(renameTarget.id, updates);
    // Sync changes back to quiz history (Stats, Calendar, Cloud)
    if (onEditQuiz && renameTarget.type === 'file') {
      const syncResult: QuizResult | null = resolveLinkedResult(renameTarget, history);
      if (syncResult) {
        const editId = syncResult.id || String(syncResult.timestamp);
        onEditQuiz(editId, renameName.trim(), newSubject, editNotes.trim() || undefined, updates.updatedAt);
      }
    }
    setRenameTarget(null);
    setEditSubject(''); setEditNotes(''); setEditDate(''); setEditTime('');
    toast.success('Updated ✓');
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    fm.moveToTrash(deleteTarget.id);
    setDeleteTarget(null);
    toast('🗑️ Moved to trash', { action: { label: 'Undo', onClick: () => fm.restoreTrashItem(deleteTarget.id) } });
  };

  const handleBulkAction = (action: 'cut' | 'copy' | 'move' | 'delete') => {
    const ids = [...fm.selectedIds];
    if (ids.length === 0) return;
    switch (action) {
      case 'cut': fm.clipCut(ids); toast(`✂️ Cut ${ids.length} items`); break;
      case 'copy': fm.clipCopy(ids); toast(`📋 Copied ${ids.length} items`); break;
      case 'move': setMoveNodeIds(ids); setMoveDialogOpen(true); break;
      case 'delete': fm.bulkMoveToTrash(ids); toast(`🗑️ ${ids.length} items trashed`); break;
    }
  };

  const handleAddQuizToFolder = async (quiz: QuizResult) => {
    const name = quiz.quizTitle || `Quiz · ${quiz.totalQuestions} Questions`;
    const resultId = quiz.id || String(quiz.timestamp);
    const folderId = fm.currentFolder?.id || ROOT_ID;
    const folderName = fm.currentFolder?.name || 'Home';
    // Already in this folder? Don't add it again (checked before any network work).
    if (findDuplicateFile(fm.root, folderId, { sourceResultId: resultId, sourceTimestamp: quiz.timestamp, questions: quiz.quizData })) {
      toast.info(`"${name}" is already in ${folderName}`);
      return;
    }
    // Cloud history holds summaries only — fetch the real questions so the file is never empty.
    const questions = await loadQuizQuestions(quiz);
    const added = fm.addFile(name, questions, quiz.subject ? [quiz.subject] : [], undefined, quiz.timestamp, resultId, quiz.timestamp);
    if (!added) { toast.info(`"${name}" is already in ${folderName}`); return; }
    if (questions.length === 0) toast.warning(`Added "${name}", but its questions could not be loaded (offline?). They will be filled in automatically.`);
    else toast.success(`📄 Added "${name}" to ${fm.currentFolder?.name || 'Home'}`);
  };

  // ── Auto-link healing: runs whenever history or the folder tree changes ──
  // 1) give every unlinked file a permanent hard link to its quiz (only when the match is unambiguous)
  // 2) fill files that have a link but no questions (saved from cloud summaries / older builds)
  const healingRef = useRef(false);
  const healFailedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (healingRef.current || history.length === 0) return;
    const files = fm.getAllFiles().filter(f => f.type === 'file');
    const linkPatches = computeLinkBackfill(files, history).map(p => ({
      id: p.fileId, patch: { sourceResultId: p.sourceResultId, sourceTimestamp: p.sourceTimestamp },
    }));
    const needQuestions = files.filter(f => (!f.questions || f.questions.length === 0) && !healFailedRef.current.has(f.id) && resolveLinkedResult(f, history));
    if (linkPatches.length === 0 && needQuestions.length === 0) return;

    healingRef.current = true;
    (async () => {
      try {
        const patches: { id: string; patch: any }[] = [...linkPatches];
        for (const f of needQuestions.slice(0, 20)) {
          const rec = resolveLinkedResult(f, history);
          if (!rec) continue;
          const qs = await loadQuizQuestions(rec);
          if (qs.length > 0) patches.push({ id: f.id, patch: { questions: qs } });
          else healFailedRef.current.add(f.id);
        }
        if (patches.length > 0) fm.batchUpdate(patches);
      } finally {
        // allow a later pass (e.g. after more history loads) but avoid tight loops
        setTimeout(() => { healingRef.current = false; }, 4000);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, fm.root]);

  // Reorder handler (works on deep-cloned tree to trigger React re-renders)
  const handleReorder = useCallback((nodeId: string, direction: 'up' | 'down') => {
    const folder = fm.currentFolder;
    if (!folder?.children) return;
    const idx = folder.children.findIndex(c => c.id === nodeId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= folder.children.length) return;
    // Deep clone root, find the folder inside the clone, swap there
    const clonedRoot: FileNode = JSON.parse(JSON.stringify(fm.root));
    const clonedFolder = findNodeInTree(clonedRoot, folder.id);
    if (!clonedFolder?.children) return;
    const cIdx = clonedFolder.children.findIndex(c => c.id === nodeId);
    if (cIdx === -1) return;
    const cNewIdx = direction === 'up' ? cIdx - 1 : cIdx + 1;
    if (cNewIdx < 0 || cNewIdx >= clonedFolder.children.length) return;
    const temp = clonedFolder.children[cIdx];
    clonedFolder.children[cIdx] = clonedFolder.children[cNewIdx];
    clonedFolder.children[cNewIdx] = temp;
    clonedFolder.children.forEach((c, i) => { c.position = i; });
    fm.forceRefreshWith(clonedRoot);
  }, [fm]);

  // Sort display items with performance data (uses filtered sessionHistory)
  const sortedItems = useMemo(() => {
    let baseItems = fm.displayItems;
    if (sortBy === 'custom') {
      return [...baseItems].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }
    if (sortBy === 'name') return baseItems;
    const items = [...baseItems];
    if (sortBy === 'newest') return items.sort((a, b) => b.updatedAt - a.updatedAt);
    if (sortBy === 'oldest') return items.sort((a, b) => a.updatedAt - b.updatedAt);
    const perfCache = new Map<string, number>();
    for (const item of items) {
      if (item.type === 'folder') {
        perfCache.set(item.id, computeFolderPerformance(item, sessionHistory).avgPercentage);
      } else {
        const match = resolveLinkedResult(item, sessionHistory);
        perfCache.set(item.id, match?.percentage ?? -1);
      }
    }
    if (sortBy === 'high_score') return items.sort((a, b) => (perfCache.get(b.id) ?? -1) - (perfCache.get(a.id) ?? -1));
    if (sortBy === 'low_score') return items.sort((a, b) => (perfCache.get(a.id) ?? -1) - (perfCache.get(b.id) ?? -1));
    return items;
  }, [fm.displayItems, sortBy, sessionHistory]);

  const isRoot = fm.currentFolderId === ROOT_ID;

  return (
    <>
      {/* Hidden cover photo input */}
      <input ref={coverPhotoRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file || !coverPhotoTargetId) return;
        if (file.size > 1024 * 1024) { toast.error('Image must be under 1MB'); e.target.value = ''; return; }
        try {
          const { url } = await upload(file);
          fm.update(coverPhotoTargetId, { posterUrl: url });
          toast.success('📷 Cover photo set!');
        } catch { toast.error('Failed to upload image'); }
        e.target.value = '';
        setCoverPhotoTargetId(null);
      }} />

      {ctx && <CtxMenu x={ctx.x} y={ctx.y} items={ctxItems} title={ctxNode?.name} onClose={() => setCtx(null)} />}

      {/* Dialogs */}
      <Dialog open={!!createDialogType} onOpenChange={v => !v && setCreateDialogType(null)}>
        <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground font-bold">New Folder</DialogTitle>
          </DialogHeader>
          <input value={createName} onChange={e => setCreateName(e.target.value.slice(0, 60))}
            onKeyDown={e => e.key === 'Enter' && handleCreate()} autoFocus
            placeholder="Folder name…"
            className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60" />
          <DialogFooter>
            <button onClick={() => setCreateDialogType(null)} className="text-sm font-bold px-4 py-2 rounded-xl border border-border text-muted-foreground">Cancel</button>
            <button onClick={handleCreate} disabled={!createName.trim()} className="text-sm font-bold px-4 py-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-30">Create</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={v => { if (!v) { setRenameTarget(null); setEditSubject(''); setEditNotes(''); setEditDate(''); setEditTime(''); } }}>
        <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle className="text-foreground font-bold">Edit Details</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Title</label>
              <input value={renameName} onChange={e => setRenameName(e.target.value.slice(0, 60))} placeholder="Enter title…" autoFocus
                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Subject</label>
              <input value={editSubject} onChange={e => setEditSubject(e.target.value.slice(0, 30))} placeholder="Enter subject…"
                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1 block">Notes</label>
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value.slice(0, 500))} placeholder="Add notes…" rows={3}
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
            <button onClick={() => { setRenameTarget(null); setEditSubject(''); setEditNotes(''); setEditDate(''); setEditTime(''); }} className="text-sm font-bold px-4 py-2 rounded-xl border border-border text-muted-foreground">Cancel</button>
            <button onClick={handleRename} disabled={!renameName.trim()} className="text-sm font-bold px-4 py-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-30">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Move to Trash?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              "{deleteTarget?.name}" will be moved to Trash (Profile → Trash), where you can restore it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-500 text-white border-none">Move to Trash</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MoveToDialog
        open={moveDialogOpen} root={fm.root} nodeIds={moveNodeIds}
        onMove={(targetId) => {
          fm.bulkMove(targetId, moveNodeIds);
          setMoveDialogOpen(false);
          setMoveNodeIds([]);
          toast.success(`Moved ${moveNodeIds.length} item(s)`);
        }}
        onClose={() => { setMoveDialogOpen(false); setMoveNodeIds([]); }}
      />

      {/* Add Quiz from History Sheet */}
      <AddQuizSheet open={addQuizOpen} onClose={() => setAddQuizOpen(false)} quizzes={history} onAdd={handleAddQuizToFolder}
        existingNames={useMemo(() => {
          const names = new Set<string>();
          (fm.currentFolder?.children || []).forEach(c => { if (c.type === 'file') names.add(c.name); });
          return names;
        }, [fm.currentFolder])}
        existingQuestions={useMemo(() => {
          const keys = new Set<string>();
          (fm.currentFolder?.children || []).forEach(c => {
            if (c.type === 'file' && c.questions && c.questions.length > 0) {
              keys.add(`${c.questions[0].question}::${c.questions.length}`);
            }
          });
          return keys;
        }, [fm.currentFolder])} />

      {/* Bookmark Preview */}
      {bookmarkPreview && (
        <BookmarkPreviewModal
          node={bookmarkPreview}
          onClose={() => setBookmarkPreview(null)}
          onRemove={() => {
            handleRemoveBookmark(bookmarkPreview.id);
            setBookmarkPreview(null);
          }}
          onPractice={onPractice}
          onUpdateNotes={handleUpdateBookmarkNotes}
        />
      )}

      {/* Export/Import Modal */}
      <QuizExportImportModal
        key={exportQuizResult ? `fmexp-${exportQuizResult.timestamp}` : `fm-${exportImportTab}`}
        open={showExportImport}
        onClose={() => { setShowExportImport(false); setExportQuizResult(null); }}
        history={history}
        onStartQuiz={onStartQuiz || onPractice}
        initialTab={exportImportTab}
        selectedQuiz={exportQuizResult || undefined}
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

      {/* ── Bookmarks Hub (auto-shown when inside Bookmarks folder) ── */}
      {isInsideBookmarks && (
        <BookmarksHub onPractice={onPractice} onClose={() => fm.navigateHome()} onOpenReportPreview={onOpenReportPreview} />
      )}

      {/* ── Main Layout ── */}
      {!isInsideBookmarks && <div className="animate-fade-in pb-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-1 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {!isRoot && (
              <button onClick={fm.navigateBack}
                className="w-9 h-9 flex-shrink-0 rounded-xl bg-card border border-border flex items-center justify-center text-foreground/50 hover:text-foreground hover:border-foreground/20 transition-all active:scale-90">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-black text-foreground/30 uppercase tracking-[0.12em]">File Organizer</p>
              <h1 className="text-lg font-black text-foreground leading-tight truncate">
                {fm.currentFolder?.name || 'Home'}
              </h1>
            </div>
          </div>
          {!fm.showTrash && (
            <div className="flex-shrink-0 flex items-center gap-2.5 bg-card border border-border rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-foreground/45 tabular-nums shadow-sm"
              title={`${fm.stats.folders} folder${fm.stats.folders !== 1 ? 's' : ''} · ${fm.stats.files} file${fm.stats.files !== 1 ? 's' : ''} · ${fm.stats.totalQuestions} questions`}>
              {fm.selectMode && fm.selectedIds.size > 0 ? (
                <span className="text-primary font-black">{fm.selectedIds.size} selected</span>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1"><FolderOpen className="w-3 h-3" />{fm.stats.folders}</span>
                  <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3" />{fm.stats.files}</span>
                  <span className="inline-flex items-center gap-1"><HelpCircle className="w-3 h-3" />{fm.stats.totalQuestions}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Breadcrumbs */}
        {!fm.showTrash && !isRoot && (
          <div className="flex items-center gap-1 px-1 mb-3 overflow-x-auto no-scrollbar">
            <button onClick={fm.navigateHome}
              className="text-[11px] font-bold text-primary/70 hover:text-primary flex items-center gap-1 flex-shrink-0 transition-colors">
              <Home className="w-3 h-3" /> Home
            </button>
            {fm.breadcrumbs.slice(1).map((bc, i) => (
              <div key={bc.id} className="flex items-center gap-1 flex-shrink-0">
                <ChevronRight className="w-3 h-3 text-foreground/15" />
                <button onClick={() => fm.navigateTo(bc.id)}
                  className={`text-[11px] font-bold transition-colors max-w-[100px] truncate ${
                    i === fm.breadcrumbs.length - 2 ? 'text-foreground' : 'text-foreground/40 hover:text-foreground/70'
                  }`}>
                  {bc.name}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Command bar: search on top, filters and actions in ONE straight line below */}
        {!fm.showTrash && (
          <div className="space-y-2 mb-3">
            <SearchField
              value={fm.search}
              onChange={fm.setSearch}
              onClear={() => fm.setSearch('')}
              placeholder={`Search ${isRoot ? 'everywhere' : 'in ' + (fm.currentFolder?.name || '')}…`}
              right={fm.search ? (
                <button onClick={() => fm.setSearchScope(fm.searchScope === 'local' ? 'global' : 'local')}
                  className={`text-[9px] font-black px-2 h-7 rounded-lg border transition-all ${
                    fm.searchScope === 'global' ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-card border-border text-foreground/40'
                  }`}>
                  {fm.searchScope === 'global' ? '🌐 Global' : '📁 Local'}
                </button>
              ) : undefined}
            />
            <Toolbar>
              <ToolbarButton
                icon={<ArrowUpDown className={TB_ICON} />} label="Sort" title={`Sort: ${SORT_LABELS[sortBy]}`}
                active={sortBy !== 'name'}
                disabled={fm.displayItems.length < 2} disabledHint="Add more items to use sorting"
                onClick={() => setShowSortSheet(true)}
              />
              <SessionToolbarButton history={history} value={sessionMode} onChange={setSessionMode} />
              <ToolbarDivider />
              <ToolbarButton
                icon={viewMode === 'grid' ? <LayoutGrid className={TB_ICON} /> : <List className={TB_ICON} />}
                label={viewMode === 'grid' ? 'Grid' : 'List'}
                title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
                onClick={() => folderViewMap.set(fm.currentFolderId, viewMode === 'grid' ? 'list' : 'grid')}
              />
              <ToolbarButton
                icon={fm.selectMode ? <CheckSquare className={TB_ICON} /> : <Square className={TB_ICON} />}
                label={fm.selectMode ? 'Done' : 'Select'} title={fm.selectMode ? 'Exit selection mode' : 'Select multiple items'}
                active={fm.selectMode}
                onClick={() => fm.selectMode ? fm.clearSelection() : fm.enterSelectMode()}
              />
              <ToolbarButton
                icon={<Plus className={TB_ICON} />} label="New" title="Create folder or add quiz"
                active={showAddMenu} onClick={() => setShowAddMenu(true)}
              />
              <ToolbarDivider />
              <ToolbarButton
                icon={<Share2 className={TB_ICON} />} label="Export" title="Export & import quizzes"
                onClick={() => { setExportImportTab('export'); setShowExportImport(true); }}
              />
              <TrashToolbarButton onOpen={onOpenTrash} refreshKey={`${fm.trash.length}-${history.length}`} />
            </Toolbar>

            {(sessionMode !== 'main' || fm.selectMode) && (
              <ChipsBar>
                {sessionMode !== 'main' && (
                  <Chip tone="amber" label={`🏋️ ${getSessionLabel(sessionMode)}`} onRemove={() => setSessionMode('main')} />
                )}
                {fm.selectMode && (
                  <>
                    <button onClick={fm.selectAll} className="flex-shrink-0 h-7 px-3 rounded-full border border-primary/25 bg-primary/10 text-[11px] font-bold text-primary active:scale-95 transition-all">Select all</button>
                    <button onClick={fm.clearSelection} className="flex-shrink-0 h-7 px-3 rounded-full border border-border bg-card text-[11px] font-bold text-foreground/50 active:scale-95 transition-all">Clear</button>
                  </>
                )}
              </ChipsBar>
            )}
          </div>
        )}

        {/* Sort sheet */}
        <ToolbarSheet open={showSortSheet} onClose={() => setShowSortSheet(false)} title="Sort this folder">
          {(['name', 'newest', 'oldest', 'high_score', 'low_score', 'custom'] as const).map(key => (
            <SheetOption
              key={key}
              label={SORT_LABELS[key]}
              hint={key === 'custom' ? 'Use the arrows to place items exactly where you want them' : undefined}
              icon={key === 'custom' ? <GripVertical className="w-4 h-4" /> : (key === 'high_score' || key === 'low_score') ? <ArrowUpDown className="w-4 h-4" /> : undefined}
              selected={sortBy === key}
              onClick={() => { setSortBy(key); setReorderMode(key === 'custom'); setShowSortSheet(false); }}
            />
          ))}
        </ToolbarSheet>

        {/* New sheet */}
        <ToolbarSheet open={showAddMenu} onClose={() => setShowAddMenu(false)} title="Create">
          <SheetOption
            icon={<FolderPlus className="w-4 h-4 text-primary" />} label="New Folder" hint="Organise quizzes into a folder"
            onClick={() => { setCreateDialogType('folder'); setCreateName(''); setShowAddMenu(false); }}
          />
          {history.length > 0 && (
            <SheetOption
              icon={<Plus className="w-4 h-4 text-emerald-400" />} label="Add from History" hint="Pick quizzes you have already taken"
              onClick={() => { setAddQuizOpen(true); setShowAddMenu(false); }}
            />
          )}
        </ToolbarSheet>

        {/* Current Folder Stats Panel */}
        {!fm.showTrash && !fm.search && fm.currentFolder && fm.currentFolder.id !== ROOT_ID && (
          <FolderStatsPanel node={fm.currentFolder} history={sessionHistory} />
        )}

        {/* Content */}
        {!fm.showTrash && (
          <>
            {sortedItems.length === 0 ? (
              <div className="flex flex-col items-center text-center py-14">
                <div className="w-16 h-16 rounded-2xl bg-foreground/[0.04] border border-border flex items-center justify-center mb-4">
                  <span className="text-3xl">{fm.search ? '🔍' : '📂'}</span>
                </div>
                <h3 className="text-sm font-black text-foreground mb-1">
                  {fm.search ? 'No results found' : 'This folder is empty'}
                </h3>
                <p className="text-xs text-foreground/35 max-w-xs">
                  {fm.search ? 'Try a different search term or switch to global search.' : 'Create a folder, collection, or add a quiz from your history.'}
                </p>
                {fm.search && (
                  <button type="button" onClick={() => fm.setSearch('')}
                    className="mt-4 h-9 px-4 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] text-xs font-bold text-foreground transition-colors">
                    Clear search
                  </button>
                )}
                {!fm.search && (
                  <div className="flex flex-wrap gap-2 mt-4 justify-center">
                    <button onClick={() => { setCreateDialogType('folder'); setCreateName(''); }}
                      className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/25 text-primary hover:bg-primary/15 transition-all active:scale-95">
                      <FolderPlus className="w-3.5 h-3.5" /> New Folder
                    </button>
                    {history.length > 0 && (
                      <button onClick={() => setAddQuizOpen(true)}
                        className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/15 transition-all active:scale-95">
                        <Plus className="w-3.5 h-3.5" /> Add from History
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {sortedItems.map(node => {
                  const pinId = node.type === 'file' ? `fm_${node.id}` : '';
                  return (
                    <GridCard key={node.id} node={node}
                      selected={fm.selectedIds.has(node.id)} selectMode={fm.selectMode}
                      onOpen={() => handleOpenNode(node)}
                      onToggle={() => fm.toggleSelect(node.id)}
                      onContext={e => handleCtx(e, node.id)}
                      history={sessionHistory}
                      onPractice={onPractice}
                      onViewResult={onViewResult}
                      onTogglePin={node.type === 'file' ? () => togglePin(pinId) : undefined}
                      isPinned={node.type === 'file' ? isPinned(pinId) : false}
                      onEdit={node.type === 'file' ? () => { setRenameTarget(node); setRenameName(node.name); setEditSubject(node.tags?.[0] || ''); setEditNotes(''); const d = new Date(node.updatedAt); setEditDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); setEditTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`); } : undefined}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {sortedItems.map((node, idx) => (
                  <div key={node.id} className="flex items-center gap-1">
                    {reorderMode && sortBy === 'custom' && (
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button onClick={() => handleReorder(node.id, 'up')} disabled={idx === 0}
                          className="w-7 h-7 rounded-lg bg-card border border-border flex items-center justify-center text-foreground/30 hover:text-foreground/60 disabled:opacity-20 transition-all active:scale-90">
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleReorder(node.id, 'down')} disabled={idx === sortedItems.length - 1}
                          className="w-7 h-7 rounded-lg bg-card border border-border flex items-center justify-center text-foreground/30 hover:text-foreground/60 disabled:opacity-20 transition-all active:scale-90">
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <ListRow node={node}
                        selected={fm.selectedIds.has(node.id)} selectMode={fm.selectMode}
                        onOpen={() => handleOpenNode(node)}
                        onToggle={() => fm.toggleSelect(node.id)}
                        onContext={e => handleCtx(e, node.id)}
                        history={sessionHistory}
                        onPractice={onPractice}
                        onViewResult={onViewResult}
                        onTogglePin={node.type === 'file' ? () => togglePin(`fm_${node.id}`) : undefined}
                        isPinned={node.type === 'file' ? isPinned(`fm_${node.id}`) : false}
                        onEdit={node.type === 'file' ? () => { setRenameTarget(node); setRenameName(node.name); setEditSubject(node.tags?.[0] || ''); setEditNotes(''); const d = new Date(node.updatedAt); setEditDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); setEditTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`); } : undefined}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}



        {/* Clipboard Floating Bar */}
        {fm.clipboard && (
          <div className="fixed z-50 animate-fade-in
            top-20 left-4 right-4 flex flex-col gap-2 bg-card border border-border rounded-2xl px-4 py-3 shadow-2xl shadow-black/20
            md:top-auto md:bottom-8 md:left-1/2 md:-translate-x-1/2 md:right-auto md:flex-row md:items-center md:w-auto">
            <span className="text-xs font-bold text-muted-foreground text-center md:text-left">
              {fm.clipboard.action === 'cut' ? '✂️' : '📋'} {fm.clipboard.nodeIds.length} item(s) {fm.clipboard.action === 'cut' ? 'cut' : 'copied'}
            </span>
            <button onClick={fm.clipPaste}
              className="flex items-center justify-center gap-1.5 text-xs font-black text-primary-foreground bg-primary border border-primary px-4 py-2.5 rounded-xl hover:bg-primary/90 transition-all active:scale-95 w-full md:w-auto">
              <ClipboardPaste className="w-3.5 h-3.5" /> Paste Here
            </button>
            <button onClick={fm.clipCancel} className="text-xs font-bold text-muted-foreground px-3 py-2.5 rounded-xl hover:text-foreground transition-all w-full md:w-auto text-center">
              Cancel
            </button>
          </div>
        )}

        {/* Bulk Actions Bar */}
        {fm.selectMode && fm.selectedIds.size > 0 && !fm.clipboard && (
          <div className="fixed z-50 animate-fade-in
            top-20 left-4 right-4 flex flex-col gap-2 bg-card border border-border rounded-2xl px-4 py-3 shadow-2xl shadow-black/20
            md:top-auto md:bottom-8 md:left-1/2 md:-translate-x-1/2 md:right-auto md:flex-row md:items-center md:w-auto">
            <span className="text-xs font-bold text-muted-foreground text-center md:text-left md:mr-1">{fm.selectedIds.size} selected</span>
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-row md:gap-2">
              <button onClick={() => handleBulkAction('cut')}
                className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground px-3 py-2.5 rounded-xl bg-muted border border-border transition-all active:scale-95">
                <Scissors className="w-3.5 h-3.5" /> Cut
              </button>
              <button onClick={() => handleBulkAction('copy')}
                className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground px-3 py-2.5 rounded-xl bg-muted border border-border transition-all active:scale-95">
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
              <button onClick={() => handleBulkAction('move')}
                className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-white px-3 py-2.5 rounded-xl bg-primary border border-primary transition-all active:scale-95">
                <Move className="w-3.5 h-3.5" /> Move
              </button>
              <button onClick={() => handleBulkAction('delete')}
                className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-red-400 hover:text-red-300 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 transition-all active:scale-95">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
        )}
      </div>}
    </>
  );
}
