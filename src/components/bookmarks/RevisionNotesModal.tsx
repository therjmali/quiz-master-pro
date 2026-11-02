import { useState, useEffect } from 'react';
import { X, Copy, Download, Loader2, RefreshCw, FileType2, FileText, AlignLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { toast } from 'sonner';
import { FileNode } from '../../utils/fileTree';
import { generateRevisionNotes } from 'zitejs/api';
import { getCachedNotes, setCachedNotes } from './bookmarkAnalytics';
import { Markdown } from '@project/components/markdown';
import { buildRevisionSheetHtml, buildRevisionSheetText } from '../../utils/reports/revisionHtmlBuilder';
import { exportSmartReport, exportTextReport, wrapHtmlForWord } from '../../utils/reports/htmlReportBuilder';
import GenerationProgressOverlay from '../GenerationProgressOverlay';

interface Props {
  open: boolean;
  onClose: () => void;
  bookmarks: FileNode[];
  subject?: string;
  quizTitle?: string;
}

const FORMAT_BTNS: { fmt: 'pdf' | 'doc' | 'text'; label: string; icon: React.ReactNode; grad: string }[] = [
  { fmt: 'pdf', label: 'PDF', icon: <FileType2 className="w-3.5 h-3.5" />, grad: 'from-blue-600 to-blue-500' },
  { fmt: 'doc', label: 'DOC', icon: <FileText className="w-3.5 h-3.5" />, grad: 'from-accent to-primary' },
  { fmt: 'text', label: 'TXT', icon: <AlignLeft className="w-3.5 h-3.5" />, grad: 'from-teal-600 to-emerald-600' },
];

export default function RevisionNotesModal({ open, onClose, bookmarks, subject, quizTitle }: Props) {
  const cacheKey = `${subject || 'all'}__${quizTitle || 'all'}__${bookmarks.length}`;
  const [notes, setNotes] = useState(() => getCachedNotes(cacheKey) || '');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!open || notes || loading) return;
    fetchNotes();
  }, [open]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const qs = bookmarks.filter(b => b.bookmarkData).map(b => ({
        question: b.bookmarkData!.question,
        options: b.bookmarkData!.options,
        correctAnswer: b.bookmarkData!.correctAnswer,
        rationale: b.bookmarkData!.rationale,
        difficulty: b.bookmarkData!.difficulty,
      }));
      const result = await generateRevisionNotes({ questions: qs, subject, quizTitle });
      setNotes(result.notes);
      setCachedNotes(cacheKey, result.notes);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate notes');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(notes);
    toast.success('📋 Copied to clipboard!');
  };

  const handleDownload = (fmt: 'pdf' | 'doc' | 'text') => {
    if (!notes || downloading) return;
    setDownloading(fmt);
    try {
      const title = quizTitle || 'Revision Notes';
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const subSuffix = subject ? `_${subject.replace(/[<>:"/\\|?*]/g, '')}` : '';
      const fname = `RevisionNotes${subSuffix}_${dateStr}`;

      if (fmt === 'text') {
        exportTextReport(buildRevisionSheetText(notes), `${fname}.txt`);
      } else if (fmt === 'doc') {
        const html = buildRevisionSheetHtml(notes, { quizTitle: title, subject });
        exportSmartReport(wrapHtmlForWord(html, `Revision Notes — ${title}`), 'doc', `${fname}.doc`);
      } else {
        const html = buildRevisionSheetHtml(notes, { quizTitle: title, subject });
        exportSmartReport(html, 'pdf', `${fname}.pdf`);
      }
      toast.success(`📥 ${fmt.toUpperCase()} downloaded!`);
    } catch (e: any) {
      toast.error(e?.message || 'Download failed');
    } finally {
      setTimeout(() => setDownloading(null), 400);
    }
  };

  return (
    <>
    <GenerationProgressOverlay visible={loading} label="Generating Notes" sublabel={`Analyzing ${bookmarks.length} bookmarked questions`} />
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col p-0 top-[6%] translate-y-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-foreground font-bold text-left flex items-center gap-2">
              <span className="text-lg">📝</span> AI Revision Notes
            </DialogTitle>
            <div className="flex items-center gap-1.5">
              {notes && (
                <>
                  <button onClick={handleCopy} className="p-2 rounded-lg hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-all">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setNotes(''); fetchNotes(); }} className="p-2 rounded-lg hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-all">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
          {(subject || quizTitle) && (
            <p className="text-[11px] text-foreground/35 mt-1">
              {subject && <span className="font-bold text-primary/60">{subject}</span>}
              {subject && quizTitle && <span className="mx-1.5">·</span>}
              {quizTitle && <span>{quizTitle}</span>}
            </p>
          )}
        </DialogHeader>

        {/* ── Download Format Bar ── */}
        {notes && (
          <div className="flex-shrink-0 px-5 py-2.5 border-b border-border bg-foreground/[0.02]">
            <div className="flex items-center gap-2">
              <Download className="w-3.5 h-3.5 text-foreground/30 flex-shrink-0" />
              <span className="text-[9px] font-black uppercase tracking-widest text-foreground/30 flex-shrink-0 mr-1">Export</span>
              {FORMAT_BTNS.map(({ fmt, label, icon, grad }) => (
                <button key={fmt} onClick={() => handleDownload(fmt)} disabled={!!downloading}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-to-br ${grad} text-white text-[11px] font-black transition-all active:scale-95 hover:brightness-110 disabled:opacity-50 shadow-sm`}>
                  {downloading === fmt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm font-bold text-foreground/40">Generating revision notes…</p>
              <p className="text-[10px] text-foreground/25">Analyzing {bookmarks.length} bookmarked questions</p>
            </div>
          ) : notes ? (
            <div className="prose prose-sm prose-invert max-w-none">
              <Markdown>{notes}</Markdown>
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="text-3xl mb-3">📝</span>
              <p className="text-sm font-bold text-foreground/40">Ready to generate</p>
              <button onClick={fetchNotes} className="mt-3 text-xs font-bold text-primary">Generate Notes →</button>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 border-t border-border px-5 py-3">
          <button onClick={onClose} className="w-full text-sm font-bold py-3 rounded-xl bg-primary text-primary-foreground transition-all active:scale-[0.98]">
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
