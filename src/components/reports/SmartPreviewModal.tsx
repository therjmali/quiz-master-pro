import { useRef, useState, useCallback, useEffect } from 'react';
import {
  X, Download, FileType2, FileText, AlignLeft,
  Pencil, PencilOff, Loader2, Eye,
} from 'lucide-react';
import { ExportFormat } from '../../utils/reports/reportData';

interface ViewOpts {
  showAnswers: boolean;
  showBookRat: boolean;
  showAiRat: boolean;
  difficultyFilter?: 'all' | 'easy' | 'medium' | 'hard';
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  iframeHtml: string;
  loading: boolean;
  onDownload: (fmt: ExportFormat, editedHtml?: string) => void;
  showAnswers?: boolean;
  showBookRat?: boolean;
  showAiRat?: boolean;
  onRegenerate?: (opts: ViewOpts) => void;
  onExplainAll?: (opts: ViewOpts) => Promise<void>;
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

function ViewPill({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black border transition-all active:scale-95 whitespace-nowrap flex-shrink-0 ${
        active
          ? label === 'Answers' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
          : label === 'Book' ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
          : 'bg-violet-500/15 border-violet-500/30 text-violet-400'
          : 'bg-foreground/5 border-foreground/10 text-foreground/50 hover:text-foreground/70'
      }`}>
      <span>{icon}</span><span>{label}</span>
    </button>
  );
}

export default function SmartPreviewModal({
  open, onClose, title, iframeHtml, loading, onDownload,
  showAnswers: propShowAnswers, showBookRat: propShowBookRat, showAiRat: propShowAiRat,
  onRegenerate, onExplainAll,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [activeDownload, setActiveDownload] = useState<ExportFormat | null>(null);
  const [localAnswers, setLocalAnswers] = useState(propShowAnswers ?? false);
  const [localBookRat, setLocalBookRat] = useState(propShowBookRat ?? false);
  const [localAiRat, setLocalAiRat] = useState(propShowAiRat ?? false);
  const [localDiff, setLocalDiff] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const [diffPopupOpen, setDiffPopupOpen] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const isToggleReload = useRef(false);
  const savedIframeScroll = useRef(0);

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
    if (loading || activeDownload) return;
    setActiveDownload(fmt);
    onDownload(fmt, getEditedHtml());
    setTimeout(() => setActiveDownload(null), 1800);
  }, [loading, activeDownload, getEditedHtml, onDownload]);

  useEffect(() => {
    if (open) {
      setEditMode(false); setLocalAnswers(propShowAnswers ?? false);
      setLocalBookRat(propShowBookRat ?? false); setLocalAiRat(propShowAiRat ?? false);
      setLocalDiff('all'); setDiffPopupOpen(false); setDownloadOpen(false);
      document.body.style.overflow = 'hidden';
      window.scrollTo(0, 0);
    }
    return () => { if (open) document.body.style.overflow = ''; };
  }, [open, iframeHtml]); // eslint-disable-line

  useEffect(() => { return () => { document.body.style.overflow = ''; }; }, []);

  if (!open) return null;

  const saveScrollAndRegenerate = (opts: ViewOpts) => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) savedIframeScroll.current = doc.documentElement.scrollTop || doc.body.scrollTop;
    } catch { /* */ }
    isToggleReload.current = true;
    onRegenerate?.(opts);
  };
  const handleToggleAnswers = () => { const v = !localAnswers; setLocalAnswers(v); saveScrollAndRegenerate({ showAnswers: v, showBookRat: localBookRat, showAiRat: localAiRat, difficultyFilter: localDiff }); };
  const handleToggleBook = () => { const v = !localBookRat; setLocalBookRat(v); saveScrollAndRegenerate({ showAnswers: localAnswers, showBookRat: v, showAiRat: localAiRat, difficultyFilter: localDiff }); };
  const handleToggleAi = () => { const v = !localAiRat; setLocalAiRat(v); saveScrollAndRegenerate({ showAnswers: localAnswers, showBookRat: localBookRat, showAiRat: v, difficultyFilter: localDiff }); };
  const handleDiffChange = (val: 'all' | 'easy' | 'medium' | 'hard') => { setLocalDiff(val); setDiffPopupOpen(false); saveScrollAndRegenerate({ showAnswers: localAnswers, showBookRat: localBookRat, showAiRat: localAiRat, difficultyFilter: val }); };

  const diffIcon = localDiff === 'all' ? '🎯' : localDiff === 'easy' ? '🟢' : localDiff === 'medium' ? '🟡' : '🔴';
  const diffLabel = localDiff === 'all' ? 'All' : localDiff.charAt(0).toUpperCase() + localDiff.slice(1);
  const diffPillCls = localDiff !== 'all'
    ? localDiff === 'easy' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
    : localDiff === 'medium' ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
    : 'bg-red-500/15 border-red-500/30 text-red-400'
    : 'bg-foreground/5 border-foreground/10 text-foreground/50 hover:text-foreground/70';

  return (
    <div className="fixed inset-0 z-[110] flex flex-col smart-preview-modal" style={{ isolation: 'isolate' }}>
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center gap-3 smart-preview-topbar">
        <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/25 flex items-center justify-center flex-shrink-0">
          <Eye className="w-3.5 h-3.5 text-indigo-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-foreground truncate leading-tight">{title}</p>
          <p className="text-[9px] text-foreground/40 mt-0.5 hidden sm:block">Scroll to review · download below</p>
        </div>
        <button onClick={toggleEditMode} title={editMode ? 'Exit edit mode' : 'Edit report content before downloading'}
          className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-all flex-shrink-0 ${
            editMode ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-foreground/5 border-foreground/10 text-foreground/40 hover:text-foreground hover:bg-foreground/8'
          }`}>
          {editMode ? <PencilOff className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{editMode ? 'Done Editing' : 'Edit'}</span>
        </button>
        <button onClick={onClose}
          className="flex items-center gap-1.5 bg-foreground/5 hover:bg-red-500/20 border border-foreground/10 hover:border-red-500/30 text-foreground/40 hover:text-foreground text-[11px] font-bold px-3 py-2 rounded-xl transition-all flex-shrink-0">
          <X className="w-3.5 h-3.5" /><span className="hidden sm:inline">Close</span>
        </button>
      </div>

      {/* ── View Controls (Answers/Book/AI/Difficulty) — AT TOP ── */}
      {onRegenerate && (
        <div className="flex-shrink-0 border-b border-border smart-preview-strip bg-card/90 backdrop-blur-md">
          <div className="px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <ViewPill active={localAnswers} icon="👁" label="Answers" onClick={handleToggleAnswers} />
            <ViewPill active={localBookRat} icon="📖" label="Book" onClick={handleToggleBook} />
            <ViewPill active={localAiRat} icon="💡" label="AI" onClick={handleToggleAi} />

            {/* Difficulty filter */}
            <div className="relative flex-shrink-0">
              <button onClick={() => setDiffPopupOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black border transition-all active:scale-95 whitespace-nowrap ${diffPillCls}`}>
                <span>{diffIcon}</span><span>{diffLabel}</span>
                <span className="text-[8px] opacity-50">▾</span>
              </button>
              {diffPopupOpen && (
                <>
                  <div className="fixed inset-0 z-[111]" onClick={() => setDiffPopupOpen(false)} />
                  <div className="absolute top-full left-0 mt-1 z-[112] bg-card border border-border rounded-xl shadow-xl py-1 min-w-[130px] overflow-hidden">
                    {([['all', '🎯', 'All'], ['easy', '🟢', 'Easy'], ['medium', '🟡', 'Medium'], ['hard', '🔴', 'Hard']] as const).map(([val, icon, label]) => (
                      <button key={val} onClick={() => handleDiffChange(val)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold transition-colors ${
                          localDiff === val ? 'bg-primary/10 text-foreground' : 'text-foreground/60 hover:bg-foreground/5'
                        }`}>
                        <span>{icon}</span><span>{label}</span>
                        {localDiff === val && <span className="ml-auto text-primary">●</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {onExplainAll && (
              <button onClick={async () => {
                  if (explaining) return;
                  try {
                    const doc = iframeRef.current?.contentDocument;
                    if (doc) savedIframeScroll.current = doc.documentElement.scrollTop || doc.body.scrollTop;
                  } catch { /* */ }
                  isToggleReload.current = true;
                  setExplaining(true);
                  try { await onExplainAll({ showAnswers: localAnswers, showBookRat: localBookRat, showAiRat: true, difficultyFilter: localDiff }); setLocalAiRat(true); } catch {}
                  setExplaining(false);
                }} disabled={explaining}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black border bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border-violet-500/20 text-violet-400 hover:from-violet-500/20 hover:to-fuchsia-500/20 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap flex-shrink-0">
                {explaining ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>✨</span>}
                <span>{explaining ? 'Generating…' : 'AI Explain All'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Download Format (Collapsible) ── */}
      <div className="flex-shrink-0 border-b border-border smart-preview-strip">
        <button onClick={() => setDownloadOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 transition-all active:opacity-80">
          <div className="flex items-center gap-2">
            <Download className="w-3 h-3 text-foreground/30" />
            <span className="text-[9px] font-black uppercase tracking-widest text-foreground/30">Download Format</span>
            {editMode && <span className="text-[8px] font-black text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/15">✏️ Edits included</span>}
          </div>
          <span className={`text-foreground/40 text-xs transition-transform duration-200 ${downloadOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {downloadOpen && (
          <div className="px-4 pb-3 animate-fade-in">
            <div className="grid grid-cols-3 gap-2">
              {FORMAT_OPTIONS.map(opt => {
                const isActive = activeDownload === opt.fmt;
                return (
                  <button key={opt.fmt} onClick={() => handleDownload(opt.fmt)} disabled={!!loading || !!activeDownload}
                    className={`flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl bg-gradient-to-br ${opt.grad} disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition-all text-white shadow-lg font-black`}>
                    {isActive ? <Loader2 className="w-4 h-4 animate-spin" /> : opt.icon}
                    <span className="text-[11px] leading-tight">{opt.label}</span>
                    <span className="text-[8.5px] opacity-60 hidden md:block leading-tight">{opt.sublabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Preview iframe — clean, unobstructed ── */}
      <div className="flex-1 overflow-hidden relative smart-preview-iframe-bg">
        {editMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-amber-400 text-amber-950 text-[10px] font-black px-3 py-1 rounded-full shadow-lg pointer-events-none whitespace-nowrap">
            ✏️ Edit mode — click any text to modify
          </div>
        )}
        <iframe ref={iframeRef} srcDoc={iframeHtml}
          className="w-full h-full border-0" title="Report Preview" sandbox="allow-same-origin"
          onLoad={() => {
            try {
              const doc = iframeRef.current?.contentDocument;
              if (doc) {
                if (isToggleReload.current) {
                  const pos = savedIframeScroll.current;
                  requestAnimationFrame(() => {
                    try { doc.documentElement.scrollTop = pos; doc.body.scrollTop = pos; iframeRef.current?.contentWindow?.scrollTo(0, pos); } catch { /* */ }
                  });
                  isToggleReload.current = false;
                } else {
                  doc.documentElement.scrollTop = 0; doc.body.scrollTop = 0;
                  iframeRef.current?.contentWindow?.scrollTo(0, 0);
                }
              }
            } catch {}
          }}
        />
      </div>
    </div>
  );
}
