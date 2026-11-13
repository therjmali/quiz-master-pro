import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { FileNode } from '../../utils/fileTree';
import {
  buildBookmarkExamPaperHtml,
  buildBookmarkExamPaperText,
  fileNodesToBookmarkItems,
  BookmarkViewOpts,
} from '../../utils/bookmarkExamPaperHtml';
import {
  exportSmartReport,
  exportTextReport,
  wrapHtmlForWord,
} from '../../utils/reports/htmlReportBuilder';
import { ExportFormat } from '../../utils/reports/reportData';
import SmartPreviewModal from '../reports/SmartPreviewModal';
import { ReportPreviewData } from '../reports/ReportPreviewPage';
import { hasBackend } from '../../platform/ai/caller';
import { generateBookmarksPdf } from 'zitejs/api';

interface Props {
  open: boolean;
  onClose: () => void;
  bookmarks: FileNode[];
  title?: string;
  onOpenReportPreview?: (data: ReportPreviewData) => void;
}

export default function PdfControlsModal({ open, onClose, bookmarks, title, onOpenReportPreview }: Props) {
  const [previewHtml, setPreviewHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const currentOptsRef = useRef<BookmarkViewOpts>({
    showAnswers: false, showBookRat: false, showAiRat: false, difficultyFilter: 'all',
  });

  const items = useMemo(() => fileNodesToBookmarkItems(bookmarks), [bookmarks]);

  // Build HTML when modal opens
  useEffect(() => {
    if (open && items.length > 0) {
      currentOptsRef.current = { showAnswers: false, showBookRat: false, showAiRat: false, difficultyFilter: 'all' };
      const html = buildBookmarkExamPaperHtml(items, title, currentOptsRef.current);
      setPreviewHtml(html);
    }
    if (!open) setPreviewHtml('');
  }, [open, items, title]);

  // Regenerate handler (called by preview toggle pills)
  const handleRegenerate = useCallback((viewOpts: { showAnswers: boolean; showBookRat: boolean; showAiRat: boolean; difficultyFilter?: 'all' | 'easy' | 'medium' | 'hard' }) => {
    const opts: BookmarkViewOpts = {
      showAnswers: viewOpts.showAnswers,
      showBookRat: viewOpts.showBookRat,
      showAiRat: viewOpts.showAiRat,
      difficultyFilter: viewOpts.difficultyFilter || 'all',
    };
    currentOptsRef.current = opts;
    const html = buildBookmarkExamPaperHtml(items, title, opts);
    setPreviewHtml(html);
    return html;
  }, [items, title]);

  // Download handler — PDF via server, DOC/TXT client-side
  const handleDownload = useCallback(async (fmt: ExportFormat, editedHtml?: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const fname = `QMP_Bookmarks_ExamPaper_${dateStr}`;
      const opts = currentOptsRef.current;

      if (fmt === 'pdf') {
        const html = editedHtml || previewHtml;
        if (!hasBackend()) {
          exportSmartReport(html, 'pdf', `${fname}.pdf`);
          toast.success('📄 PDF downloaded!');
        } else {
          try {
            toast.info('Generating PDF…');
            const bms = items.map(b => ({
              question: b.question,
              options: b.options,
              correctAnswer: b.correctAnswer,
              userAnswer: b.userAnswer,
              rationale: b.rationale,
              aiRationale: (b as any).aiRationale || undefined,
              difficulty: b.difficulty,
              questionType: b.questionType,
              quizTitle: b.quizTitle,
              subject: b.subject,
            }));
            const { url } = await generateBookmarksPdf({
              bookmarks: bms,
              title,
              showAnswers: opts.showAnswers,
              showBookRationale: opts.showBookRat,
              showAiRationale: opts.showAiRat,
              difficultyFilter: opts.difficultyFilter,
            });
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.click();
            toast.success('📄 PDF downloaded!');
          } catch {
            exportSmartReport(html, 'pdf', `${fname}.pdf`);
            toast.success('📄 PDF downloaded!');
          }
        }
      } else if (fmt === 'doc') {
        const html = editedHtml || previewHtml;
        exportSmartReport(wrapHtmlForWord(html, title || 'Bookmark Exam Paper'), 'doc', `${fname}.doc`);
        toast.success('📄 DOC downloaded!');
      } else {
        const text = buildBookmarkExamPaperText(items, title, opts);
        exportTextReport(text, `${fname}.txt`);
        toast.success('📄 TXT downloaded!');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Export failed');
    } finally {
      setLoading(false);
    }
  }, [items, title, previewHtml, loading]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Open in full-page preview when callback is available
  useEffect(() => {
    if (!open || !onOpenReportPreview || !previewHtml || items.length === 0) return;
    // Close the modal and open full-page preview
    const previewDiffRef = { current: 'all' as 'all' | 'easy' | 'medium' | 'hard' };

    const regenerateFn = (opts: { showAnswers: boolean; showBookRat: boolean; showAiRat: boolean; difficultyFilter?: 'all' | 'easy' | 'medium' | 'hard' }): string => {
      const bOpts: BookmarkViewOpts = {
        showAnswers: opts.showAnswers,
        showBookRat: opts.showBookRat,
        showAiRat: opts.showAiRat,
        difficultyFilter: opts.difficultyFilter || 'all',
      };
      currentOptsRef.current = bOpts;
      previewDiffRef.current = bOpts.difficultyFilter;
      return buildBookmarkExamPaperHtml(items, title, bOpts);
    };

    const downloadFn = (fmt: ExportFormat, editedHtml?: string) => {
      handleDownload(fmt, editedHtml);
    };

    onOpenReportPreview({
      html: previewHtml,
      title: `Bookmark Exam Paper${title ? ` — ${title}` : ''}`,
      activeCard: 'exam',
      showAnswers: false,
      showBookRat: false,
      showAiRat: false,
      onRegenerate: regenerateFn,
      onDownload: downloadFn,
    });
    onClose();
  }, [open, onOpenReportPreview, previewHtml, items.length]); // eslint-disable-line

  if (!open) return null;

  // If we have onOpenReportPreview, the effect above handles opening full-page
  // Show loading while waiting for previewHtml to build
  if (onOpenReportPreview) {
    if (items.length === 0) {
      return (
        <div className="fixed inset-0 z-[110] bg-background flex items-center justify-center">
          <div className="text-center p-8">
            <span className="text-4xl mb-4 block">📄</span>
            <p className="text-foreground/50 font-bold">No bookmarks to preview</p>
            <button onClick={handleClose} className="mt-4 text-sm font-bold text-primary">← Go Back</button>
          </div>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 z-[110] bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
          <p className="text-sm font-bold text-foreground/40">Building Exam Paper…</p>
        </div>
      </div>
    );
  }

  // Fallback: use SmartPreviewModal when no full-page preview callback
  if (items.length === 0) {
    return (
      <div className="fixed inset-0 z-[110] bg-background flex items-center justify-center">
        <div className="text-center p-8">
          <span className="text-4xl mb-4 block">📄</span>
          <p className="text-foreground/50 font-bold">No bookmarks to preview</p>
          <button onClick={handleClose} className="mt-4 text-sm font-bold text-primary">← Go Back</button>
        </div>
      </div>
    );
  }

  if (!previewHtml) {
    return (
      <div className="fixed inset-0 z-[110] bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
          <p className="text-sm font-bold text-foreground/40">Building Exam Paper…</p>
        </div>
      </div>
    );
  }

  return (
    <SmartPreviewModal
      open={open}
      onClose={handleClose}
      title={`Exam Paper Preview${title ? ` — ${title}` : ''}`}
      iframeHtml={previewHtml}
      loading={loading}
      onDownload={handleDownload}
      showAnswers={false}
      showBookRat={false}
      showAiRat={false}
      onRegenerate={handleRegenerate}
    />
  );
}
