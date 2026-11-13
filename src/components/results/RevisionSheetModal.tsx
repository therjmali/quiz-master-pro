import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, FileDown, RefreshCw, BookOpen, Brain, Zap, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { QuizResult } from '../../types/quiz';
import { generateRevisionSheet } from 'zitejs/api';
import { exportMarkdownReport } from '../../utils/reports/exportReport';
import { Markdown } from '@project/components/markdown';
import GenerationProgressOverlay from '../GenerationProgressOverlay';
import Overlay from '../ui/Overlay';

interface Props {
  result: QuizResult;
  onClose: () => void;
}

const CACHE_PREFIX = 'qmp_revision_';

export default function RevisionSheetModal({ result, onClose }: Props) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const cacheKey = CACHE_PREFIX + result.timestamp;

  const wrongCount = result.quizData.filter((q, i) => {
    const ua = result.userAnswers[i];
    return ua !== null && ua !== q.correctAnswer;
  }).length;

  useEffect(() => {
    const cached = localStorage.getItem(cacheKey);
    if (cached) { setContent(cached); return; }
    generate();
  }, []); // eslint-disable-line

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const wrongQs = result.quizData
        .map((q, i) => ({ q, ua: result.userAnswers[i] }))
        .filter(({ q, ua }) => ua !== null && ua !== q.correctAnswer)
        .map(({ q, ua }) => ({
          question: q.question,
          correctAnswer: q.correctAnswer,
          userAnswer: ua || undefined,
          rationale: q.rationale,
        }));

      if (wrongQs.length === 0) {
        const perfect = '## 🎉 Perfect Score!\n\nYou answered every question correctly. Amazing work — no revision needed!\n\n> Keep up the momentum and challenge yourself with harder quizzes.';
        setContent(perfect);
        return;
      }

      const data = await generateRevisionSheet({
        wrongQuestions: wrongQs,
        subject: result.subject,
        quizTitle: result.quizTitle,
      });
      setContent(data.revisionSheet);
      try { localStorage.setItem(cacheKey, data.revisionSheet); } catch { /* */ }
    } catch {
      toast.error('Failed to generate revision sheet');
      setContent('## ⚠️ Generation Failed\n\nCould not generate the revision sheet. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [result, cacheKey]);

  const handleRegenerate = () => {
    localStorage.removeItem(cacheKey);
    setContent('');
    generate();
  };

  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await exportMarkdownReport(content, 'pdf', {
        title: `Revision Sheet${result.quizTitle ? ` — ${result.quizTitle}` : ''}`,
        filename: `Revision_${(result.quizTitle || 'Sheet').replace(/[^\w\-]+/g, '-').slice(0, 40)}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.pdf`,
        meta: [result.subject || '', result.quizTitle || ''].filter(Boolean),
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
    <GenerationProgressOverlay visible={loading} label="Generating Revision Sheet" sublabel={`Analyzing ${wrongCount} wrong answer${wrongCount !== 1 ? 's' : ''}`} />
    <Overlay open onClose={onClose} kind="sheet" layer="sheet" className="max-w-2xl" label="Revision sheet">
        {/* ── Sticky Header ── */}
        <div className="flex-shrink-0 border-b border-border bg-card px-5 pb-4 pt-5">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-black text-foreground flex items-center gap-2">
              📝 Revision Sheet
            </h2>
            <div className="flex items-center gap-1.5">
              {content && !loading && (
                <>
                  <button
                    onClick={handleRegenerate}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-foreground/40 hover:text-foreground/70 bg-foreground/5 border border-border px-2.5 py-2 rounded-xl transition-all active:scale-95"
                    title="Regenerate"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-3 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                  >
                    {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
                    {downloading ? 'Generating…' : 'Download PDF'}
                  </button>
                </>
              )}
              <button onClick={onClose} aria-label="Close" className="qmp-panel-close-inline">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Meta pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {result.subject && (
              <span className="text-[10px] font-black text-primary bg-primary/10 px-2.5 py-1 rounded-lg border border-primary/20 uppercase tracking-wider">
                {result.subject}
              </span>
            )}
            {result.quizTitle && (
              <span className="text-[10px] font-bold text-foreground/40 bg-foreground/5 px-2.5 py-1 rounded-lg border border-border truncate max-w-[200px]">
                {result.quizTitle}
              </span>
            )}
            {wrongCount > 0 && (
              <span className="text-[10px] font-bold text-destructive/70 bg-destructive/5 px-2.5 py-1 rounded-lg border border-destructive/15">
                {wrongCount} concept{wrongCount !== 1 ? 's' : ''} to revise
              </span>
            )}
          </div>

          {/* Section legend */}
          {content && !loading && (
            <div className="flex items-center gap-3 mt-3 text-[9px] font-bold text-foreground/30">
              <span className="flex items-center gap-1"><BookOpen className="w-3 h-3 text-primary/50" /> Key Facts</span>
              <span className="flex items-center gap-1"><Brain className="w-3 h-3 text-secondary/50" /> Memory Aids</span>
              <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-accent/50" /> Quick Recall</span>
              <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-destructive/50" /> Mistakes</span>
            </div>
          )}
        </div>

        {/* ── Scrollable Content ── */}
        <div className="qmp-panel-body revision-scroll px-5 py-5">
          {loading ? (
            <div className="flex flex-col items-center gap-4 py-16">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-primary animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-foreground/60">Generating revision notes…</p>
                <p className="text-[11px] text-foreground/30">Analyzing {wrongCount} wrong answer{wrongCount !== 1 ? 's' : ''}</p>
              </div>
              {/* Skeleton */}
              <div className="w-full space-y-4 mt-4">
                <div className="h-6 w-48 rounded-lg bg-foreground/5 animate-pulse" />
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-4 rounded-lg bg-foreground/[0.03] animate-pulse" style={{ width: `${85 - i * 8}%`, animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
                <div className="h-6 w-40 rounded-lg bg-foreground/5 animate-pulse mt-6" />
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-4 rounded-lg bg-foreground/[0.03] animate-pulse" style={{ width: `${90 - i * 12}%`, animationDelay: `${i * 150 + 600}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Markdown className="prose-sm prose-headings:text-foreground prose-headings:font-black prose-h2:text-base prose-h2:mb-4 prose-h2:mt-1 prose-h3:text-sm prose-h3:mt-6 prose-h3:mb-3 prose-p:text-foreground/70 prose-p:text-[13px] prose-p:leading-relaxed prose-strong:text-primary prose-strong:font-extrabold prose-li:text-foreground/70 prose-li:text-[13px] prose-li:leading-relaxed prose-li:marker:text-primary/40 prose-ul:space-y-1.5 prose-hr:border-border/50 prose-hr:my-5 prose-blockquote:border-primary/30 prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-xl prose-blockquote:py-1 prose-blockquote:text-foreground/60 prose-blockquote:not-italic prose-a:text-primary">
              {content}
            </Markdown>
          )}
        </div>

        {/* ── Bottom fade + safe area ── */}
        <div className="pointer-events-none h-6 flex-shrink-0 bg-gradient-to-t from-card to-transparent" />
    </Overlay>
    </>
  );
}
