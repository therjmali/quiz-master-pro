import { useRef, useState, useCallback, useEffect } from 'react';
import {
  ArrowLeft, Download, FileType2, FileText, AlignLeft,
  Pencil, PencilOff, Loader2, Eye, X, Printer,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { ExportFormat } from '../../utils/reports/reportData';

export interface ReportTab {
  key: string;
  label: string;
  icon: string;
}

export interface ReportViewOptions {
  showAnswers: boolean;
  showBookRat: boolean;
  showAiRat: boolean;
  difficultyFilter?: 'all' | 'easy' | 'medium' | 'hard';
}

/** @deprecated Use ReportViewOptions */
export type ExamViewOptions = ReportViewOptions;

export interface ReportPreviewData {
  html: string;
  title: string;
  activeCard: string;
  showAnswers?: boolean;
  showBookRat?: boolean;
  showAiRat?: boolean;
  onRegenerate?: (opts: ReportViewOptions) => string;
  onExplainAll?: (opts: ReportViewOptions) => Promise<string>;
  onDownload: (fmt: ExportFormat, editedHtml?: string) => void;
  availableReports?: ReportTab[];
  onSwitchReport?: (key: string) => void;
}

interface Props {
  data: ReportPreviewData;
  onBack: () => void;
}

const FORMAT_OPTIONS: {
  fmt: ExportFormat;
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  grad: string;
}[] = [
  { fmt: 'pdf', icon: <FileType2 className="w-4 h-4" />, label: 'PDF', sublabel: 'Print → Save as PDF', grad: 'from-blue-600 to-blue-500' },
  { fmt: 'doc', icon: <FileText className="w-4 h-4" />, label: 'DOC', sublabel: 'Word / Google Docs', grad: 'from-accent to-primary' },
  { fmt: 'text', icon: <AlignLeft className="w-4 h-4" />, label: 'TXT', sublabel: 'Plain text file', grad: 'from-teal-600 to-emerald-600' },
];

/* ── View Control Pill ── */
function ViewPill({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black border transition-all active:scale-95 whitespace-nowrap flex-shrink-0 ${
        active
          ? label === 'Answers' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
          : label === 'Book' ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
          : 'bg-violet-500/15 border-violet-500/30 text-violet-400'
          : 'bg-foreground/5 border-foreground/10 text-foreground/50 hover:text-foreground/70'
      }`}
    >
      <span>{icon}</span><span>{label}</span>
    </button>
  );
}

export default function ReportPreviewPage({ data, onBack }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const swipeAreaRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [activeDownload, setActiveDownload] = useState<ExportFormat | null>(null);
  const [iframeHtml, setIframeHtml] = useState(data.html);
  const [examAnswers, setExamAnswers] = useState(data.showAnswers ?? false);
  const [examBookRat, setExamBookRat] = useState(data.showBookRat ?? false);
  const [examAiRat, setExamAiRat] = useState(data.showAiRat ?? false);
  const [explaining, setExplaining] = useState(false);
  const [explainDifficulty, setExplainDifficulty] = useState<string>('all');
  const [diffPopupOpen, setDiffPopupOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const [zoomScale, setZoomScale] = useState(1);
  const initialDistance = useRef(0);
  const initialScale = useRef(1);
  const lastDoubleTapZoom = useRef(0);
  const isToggleReload = useRef(false);
  const savedIframeScroll = useRef(0);

  const reports = data.availableReports || [];
  const activeIdx = reports.findIndex(r => r.key === data.activeCard);

  const swipeTouchX = useRef<number | null>(null);
  const swipeTouchCount = useRef(0);

  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    swipeTouchCount.current = e.touches.length;
    if (e.touches.length === 1) { swipeTouchX.current = e.touches[0].clientX; } else { swipeTouchX.current = null; }
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialDistance.current = Math.sqrt(dx * dx + dy * dy);
      initialScale.current = zoomScale;
    }
  }, [zoomScale]);

  const handleSwipeTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length >= 2) { swipeTouchX.current = null; }
    if (e.touches.length !== 2 || initialDistance.current === 0) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    setZoomScale(Math.max(0.5, Math.min(3, initialScale.current * (dist / initialDistance.current))));
  }, []);

  const handleSwipeTouchEnd = useCallback((e: React.TouchEvent) => {
    initialDistance.current = 0;
    if (swipeTouchX.current === null || swipeTouchCount.current !== 1) { swipeTouchX.current = null; return; }
    const dx = e.changedTouches[0].clientX - swipeTouchX.current;
    swipeTouchX.current = null;
    if (reports.length <= 1) return;
    if (dx < -60 && activeIdx < reports.length - 1) { setSwitching(true); data.onSwitchReport?.(reports[activeIdx + 1].key); }
    else if (dx > 60 && activeIdx > 0) { setSwitching(true); data.onSwitchReport?.(reports[activeIdx - 1].key); }
  }, [reports, activeIdx, data]);

  const handleDoubleClickZoom = useCallback(() => {
    const now = Date.now();
    if (now - lastDoubleTapZoom.current < 300) { setZoomScale(1); lastDoubleTapZoom.current = 0; }
    else { lastDoubleTapZoom.current = now; }
  }, []);

  useEffect(() => {
    setIframeHtml(data.html); setEditMode(false);
    setExamAnswers(data.showAnswers ?? false); setExamBookRat(data.showBookRat ?? false); setExamAiRat(data.showAiRat ?? false);
    setExplainDifficulty('all'); setDiffPopupOpen(false); setSwitching(false); setDownloadOpen(false);
  }, [data.html, data.activeCard]); // eslint-disable-line

  useEffect(() => {
    if (!pillsRef.current || activeIdx < 0) return;
    const pill = pillsRef.current.children[activeIdx] as HTMLElement;
    if (pill) pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeIdx]);

  const leftViaBackRef = useRef(false);
  useEffect(() => {
    const handlePop = () => { leftViaBackRef.current = true; onBack(); };
    window.history.pushState({ reportPreview: true }, '');
    window.addEventListener('popstate', handlePop);
    return () => { window.removeEventListener('popstate', handlePop); if (!leftViaBackRef.current) window.history.back(); };
  }, []); // eslint-disable-line

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onBack]);

  const getEditedHtml = useCallback((): string | undefined => {
    if (!editMode) return undefined;
    try { return iframeRef.current?.contentDocument?.documentElement?.outerHTML; } catch { return undefined; }
  }, [editMode]);

  const toggleEditMode = useCallback(() => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      const next = !editMode;
      doc.designMode = next ? 'on' : 'off';
      setEditMode(next);
    } catch { /* sandboxed */ }
  }, [editMode]);

  const handleDownload = useCallback((fmt: ExportFormat) => {
    if (activeDownload) return;
    setActiveDownload(fmt);
    data.onDownload(fmt, getEditedHtml());
    setTimeout(() => setActiveDownload(null), 1800);
  }, [activeDownload, getEditedHtml, data]);

  const handlePrint = useCallback(() => {
    try { iframeRef.current?.contentWindow?.print(); } catch { window.print(); }
  }, []);

  const regenerateReport = (answers: boolean, book: boolean, ai: boolean, diff?: string) => {
    if (data.onRegenerate) {
      // Save iframe scroll position before regeneration
      try {
        const doc = iframeRef.current?.contentDocument;
        if (doc) savedIframeScroll.current = doc.documentElement.scrollTop || doc.body.scrollTop;
      } catch { /* sandboxed */ }
      isToggleReload.current = true;
      const d = (diff ?? explainDifficulty) as ReportViewOptions['difficultyFilter'];
      setIframeHtml(data.onRegenerate({ showAnswers: answers, showBookRat: book, showAiRat: ai, difficultyFilter: d }));
    }
  };
  const handleDifficultyChange = (val: string) => { setExplainDifficulty(val); setDiffPopupOpen(false); regenerateReport(examAnswers, examBookRat, examAiRat, val); };
  const handleToggleExamAnswers = () => { const n = !examAnswers; setExamAnswers(n); regenerateReport(n, examBookRat, examAiRat); };
  const handleToggleBookRat = () => { const n = !examBookRat; setExamBookRat(n); regenerateReport(examAnswers, n, examAiRat); };
  const handleToggleAiRat = () => { const n = !examAiRat; setExamAiRat(n); regenerateReport(examAnswers, examBookRat, n); };
  const handleExplainAll = async () => {
    if (!data.onExplainAll || explaining) return;
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) savedIframeScroll.current = doc.documentElement.scrollTop || doc.body.scrollTop;
    } catch { /* */ }
    isToggleReload.current = true;
    setExplaining(true);
    try {
      const d = explainDifficulty as ReportViewOptions['difficultyFilter'];
      const newHtml = await data.onExplainAll({ showAnswers: examAnswers, showBookRat: examBookRat, showAiRat: true, difficultyFilter: d });
      setExamAiRat(true); setIframeHtml(newHtml);
    } catch { /* handled upstream */ }
    setExplaining(false);
  };

  const diffIcon = explainDifficulty === 'all' ? '🎯' : explainDifficulty === 'easy' ? '🟢' : explainDifficulty === 'medium' ? '🟡' : '🔴';
  const diffLabel = explainDifficulty === 'all' ? 'All' : explainDifficulty.charAt(0).toUpperCase() + explainDifficulty.slice(1);
  const diffPillCls = explainDifficulty !== 'all'
    ? explainDifficulty === 'easy' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
    : explainDifficulty === 'medium' ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
    : 'bg-red-500/15 border-red-500/30 text-red-400'
    : 'bg-foreground/5 border-foreground/10 text-foreground/50 hover:text-foreground/70';

  return (
    <div className="flex flex-col h-[100dvh] -m-3 md:-m-4">
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 px-3 py-2.5 border-b border-border bg-card flex items-center gap-2">
        <button onClick={onBack}
          className="flex items-center gap-1 text-xs font-bold text-foreground/50 hover:text-foreground bg-foreground/5 hover:bg-foreground/10 border border-border px-2.5 py-1.5 rounded-xl transition-all flex-shrink-0">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/25 flex items-center justify-center flex-shrink-0">
          <Eye className="w-3 h-3 text-indigo-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black text-foreground truncate leading-tight">{data.title}</p>
        </div>
        <button onClick={toggleEditMode} title={editMode ? 'Exit edit mode' : 'Edit report'}
          className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-xl border transition-all flex-shrink-0 ${
            editMode ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-foreground/5 border-foreground/10 text-foreground/40 hover:text-foreground'
          }`}>
          {editMode ? <PencilOff className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
          <span className="hidden sm:inline">{editMode ? 'Done' : 'Edit'}</span>
        </button>
        <button onClick={onBack}
          className="w-8 h-8 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive hover:bg-destructive/20 transition-all flex-shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Report Type Pills ── */}
      {reports.length > 1 && (
        <div className="flex-shrink-0 border-b border-border bg-card/90 relative">
          <div className="flex items-center">
            {activeIdx > 0 && (
              <button onClick={() => data.onSwitchReport?.(reports[activeIdx - 1].key)}
                className="flex-shrink-0 w-7 h-full flex items-center justify-center text-foreground/30 hover:text-foreground/60 transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
            <div ref={pillsRef} className="flex-1 flex items-center gap-1 px-2 py-2 overflow-x-auto no-scrollbar" data-no-swipe>
              {reports.map((r) => {
                const isActive = r.key === data.activeCard;
                return (
                  <button key={r.key} onClick={() => !isActive && data.onSwitchReport?.(r.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all flex-shrink-0 border active:scale-95 ${
                      isActive ? 'bg-primary/15 border-primary/30 text-foreground shadow-sm shadow-primary/10' : 'bg-transparent border-transparent text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5'
                    }`}>
                    <span className="text-xs">{r.icon}</span><span>{r.label}</span>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                  </button>
                );
              })}
            </div>
            {activeIdx < reports.length - 1 && (
              <button onClick={() => data.onSwitchReport?.(reports[activeIdx + 1].key)}
                className="flex-shrink-0 w-7 h-full flex items-center justify-center text-foreground/30 hover:text-foreground/60 transition-colors">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex justify-center gap-1 pb-1.5">
            {reports.map((r, i) => (
              <div key={r.key} className={`h-0.5 rounded-full transition-all duration-300 ${i === activeIdx ? 'w-4 bg-primary' : 'w-1.5 bg-foreground/15'}`} />
            ))}
          </div>
        </div>
      )}

      {/* ── View Controls (Answers/Book/AI/Difficulty) — MOVED TO TOP ── */}
      {data.onRegenerate && (
        <div className="flex-shrink-0 bg-card/90 backdrop-blur-md border-b border-border">
          <div className="px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <ViewPill active={examAnswers} icon="👁" label="Answers" onClick={handleToggleExamAnswers} />
            <ViewPill active={examBookRat} icon="📖" label="Book" onClick={handleToggleBookRat} />
            <ViewPill active={examAiRat} icon="💡" label="AI" onClick={handleToggleAiRat} />

            {/* Difficulty filter */}
            <div className="relative flex-shrink-0">
              <button onClick={() => setDiffPopupOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black border transition-all active:scale-95 whitespace-nowrap ${diffPillCls}`}>
                <span>{diffIcon}</span><span>{diffLabel}</span>
                <span className="text-[8px] opacity-50">▾</span>
              </button>
              {diffPopupOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDiffPopupOpen(false)} />
                  <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[130px] overflow-hidden">
                    {([['all', '🎯', 'All'], ['easy', '🟢', 'Easy'], ['medium', '🟡', 'Medium'], ['hard', '🔴', 'Hard']] as const).map(([val, icon, label]) => (
                      <button key={val} onClick={() => handleDifficultyChange(val)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold transition-colors ${
                          explainDifficulty === val ? 'bg-primary/10 text-foreground' : 'text-foreground/60 hover:bg-foreground/5'
                        }`}>
                        <span>{icon}</span><span>{label}</span>
                        {explainDifficulty === val && <span className="ml-auto text-primary">●</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {data.onExplainAll && (
              <button onClick={handleExplainAll} disabled={explaining}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black border bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border-violet-500/20 text-violet-400 hover:from-violet-500/20 hover:to-fuchsia-500/20 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap flex-shrink-0">
                {explaining ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>✨</span>}
                <span>{explaining ? 'Generating…' : 'AI Explain All'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Download Format (Collapsible) ── */}
      <div className="flex-shrink-0 border-b border-border bg-card/80">
        <button onClick={() => setDownloadOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5 transition-all active:opacity-80">
          <div className="flex items-center gap-2">
            <Download className="w-3.5 h-3.5 text-foreground/40" />
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/50">Download Format</span>
            {editMode && <span className="text-[8px] font-black text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/15">✏️ Edits included</span>}
          </div>
          <span className={`text-foreground/40 text-xs transition-transform duration-200 ${downloadOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {downloadOpen && (
          <div className="px-3 pb-3 animate-fade-in space-y-2">
            <div className="flex items-center gap-2">
              {FORMAT_OPTIONS.map(opt => {
                const isActive = activeDownload === opt.fmt;
                return (
                  <button key={opt.fmt} onClick={() => handleDownload(opt.fmt)} disabled={!!activeDownload}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-gradient-to-br ${opt.grad} disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition-all text-white shadow-md font-black text-xs`}>
                    {isActive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : opt.icon}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Print / Save PDF */}
            <button onClick={handlePrint}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600/90 hover:bg-blue-500 text-white text-[11px] font-black transition-all active:scale-95 shadow-md">
              <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
            </button>
          </div>
        )}
      </div>

      {/* ── Preview iframe (swipeable area) — clean, unobstructed ── */}
      <div
        ref={swipeAreaRef}
        className="flex-1 overflow-auto relative smart-preview-iframe-bg flex justify-center pt-4 pb-8 px-2 md:px-6"
        onTouchStart={handleSwipeTouchStart}
        onTouchMove={handleSwipeTouchMove}
        onTouchEnd={handleSwipeTouchEnd}
        onClick={handleDoubleClickZoom}
      >
        {editMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-amber-400 text-amber-950 text-[10px] font-black px-3 py-1 rounded-full shadow-lg pointer-events-none whitespace-nowrap">
            ✏️ Edit mode — click any text to modify
          </div>
        )}
        {switching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}
        {zoomScale !== 1 && (
          <div className="absolute top-2 right-2 z-10 bg-card/90 backdrop-blur-sm border border-border text-foreground/60 text-[10px] font-black px-2.5 py-1 rounded-full shadow-md pointer-events-none">
            {Math.round(zoomScale * 100)}%
          </div>
        )}
        <div className="w-full max-w-[800px] bg-white rounded-lg shadow-2xl shadow-black/30 overflow-hidden" style={{ minHeight: '60vh' }}>
          <iframe ref={iframeRef} srcDoc={iframeHtml}
            className="w-full border-0 bg-white origin-top-left transition-transform duration-100"
            style={{ transform: `scale(${zoomScale})`, width: `${100 / zoomScale}%`, height: `${100 / zoomScale}%`, minHeight: '80vh' }}
            title="Report Preview" sandbox="allow-same-origin"
            onLoad={() => {
              try {
                const doc = iframeRef.current?.contentDocument;
                if (doc) {
                  if (isToggleReload.current) {
                    // Restore scroll position after toggle reload
                    const pos = savedIframeScroll.current;
                    requestAnimationFrame(() => {
                      try {
                        doc.documentElement.scrollTop = pos;
                        doc.body.scrollTop = pos;
                        iframeRef.current?.contentWindow?.scrollTo(0, pos);
                      } catch { /* */ }
                    });
                    isToggleReload.current = false;
                  } else {
                    doc.documentElement.scrollTop = 0;
                    doc.body.scrollTop = 0;
                    iframeRef.current?.contentWindow?.scrollTo(0, 0);
                  }
                }
              } catch {}
            }}
          />
        </div>
      </div>
    </div>
  );
}
