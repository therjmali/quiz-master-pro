import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { Flag, ArrowLeft, Pencil, Check, X, FolderPlus, FileDown, Loader2, ChevronRight, Dumbbell } from 'lucide-react';
import { toast } from 'sonner';
import { QuizResult, QuizSettings, ReportOrder, RationalePrefs, AIMode } from '../../types/quiz';
import { getUserSubjects } from '../../utils/subjects';
import FolderPickerSheet from '../shared/FolderPickerSheet';
import { generateReportPdf } from 'zitejs/api';
import { applyNegativeMarking, removeNegativeMarking, getOriginalScore, getQuizKey } from '../../utils/negativeMarkingStore';
import { useProfileStore } from '../../hooks/useProfileStore';
import ScoreHero from './ScoreHero';
import ReviewSection from './ReviewSection';
import ResultsCharts from './ResultsCharts';
import ReportDownloadPanel from '../reports/ReportDownloadPanel';
import { ReportPreviewData } from '../reports/ReportPreviewPage';
import TimingBreakdown from './TimingBreakdown';
import WeakTopicsSummary from './WeakTopicsSummary';
import DifficultyRating from './DifficultyRating';
import EmailReportButton from './EmailReportButton';
import RevisionSheetModal from './RevisionSheetModal';
import { generateRevisionSheet, revisionSheetPdf } from 'zitejs/api';
import { buildRevisionSheetHtml, buildRevisionSheetText } from '../../utils/reports/revisionHtmlBuilder';
import { exportSmartReport, exportTextReport, wrapHtmlForWord } from '../../utils/reports/htmlReportBuilder';
import { getRevisionCache, setRevisionCache } from '../../utils/revisionCache';

type Filter = 'all' | 'correct' | 'wrong' | 'skipped' | 'bookmarked';

/** Staged reveal phases */
type RevealPhase = 'loading' | 'hero' | 'charts' | 'review' | 'complete';

interface Props {
  result: QuizResult;
  settings: QuizSettings;
  rationaleCache: Record<string, string>;
  history: QuizResult[];
  rationalePrefs: RationalePrefs;
  onRationalePrefsChange: (p: RationalePrefs) => void;
  reportHelper: AIMode;
  onReportHelperChange: (m: AIMode) => void;
  onHome: () => void;
  onRetry: () => void;
  onNewQuiz: () => void;
  onPracticeMistakes: () => void;
  onRetryAll: () => void;
  getAiRationale: (q: string, ca: string, ua: string | null, s: 'correct' | 'wrong' | 'skipped') => Promise<string>;
  onBackToProfile?: () => void;
  onViewResult?: (r: QuizResult) => void;
  onMoreLikeThis?: () => void;
  moreLikeThisLoading?: boolean;
  onUpdateMeta?: (title: string, subject: string, timestamp?: number, notes?: string) => void;
  onOpenReportPreview?: (data: ReportPreviewData) => void;
  onAskAI?: (context: { question: string; options: string[]; correctAnswer: string; userAnswer: string | null; rationale?: string; difficulty?: string; questionType?: string }) => void;
  // Swipe navigation between results
  historyIndex?: number;
  historyTotal?: number;
  onNavigateResult?: (direction: 'prev' | 'next') => void;
}

export default function ResultsScreen({
  result: rawResult, settings, rationaleCache, history,
  rationalePrefs, onRationalePrefsChange, reportHelper, onReportHelperChange,
  onHome, onRetry, onNewQuiz, onPracticeMistakes, onRetryAll, getAiRationale,
  onBackToProfile, onViewResult, onMoreLikeThis, moreLikeThisLoading, onUpdateMeta, onOpenReportPreview, onAskAI,
  historyIndex, historyTotal, onNavigateResult,
}: Props) {
  const { profile } = useProfileStore();
  // ── Negative marking local override — keeps UI in sync after apply/remove ──
  const [nmOverride, setNmOverride] = useState<Partial<QuizResult> | null>(null);
  const result = useMemo(() => nmOverride ? { ...rawResult, ...nmOverride } as QuizResult : rawResult, [rawResult, nmOverride]);
  // Reset override when navigating to a different result
  const resultKey0 = rawResult.id || String(rawResult.timestamp);
  useEffect(() => { setNmOverride(null); }, [resultKey0]);

  const [reviewFilter, setReviewFilter] = usePersistedState<Filter>('results_review_filter', 'all');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [editTitle, setEditTitle] = useState(result.quizTitle || '');
  const [editSubject, setEditSubject] = useState(result.subject || '');
  const [editNotes, setEditNotes] = useState(result.notes || '');
  const [editDate, setEditDate] = useState(() => new Date(result.timestamp).toISOString().split('T')[0]);
  const [editTime, setEditTime] = useState(() => {
    const d = new Date(result.timestamp);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showRevisionSheet, setShowRevisionSheet] = useState(false);
  const [revisionLoading, setRevisionLoading] = useState(false);

  // Swipe navigation between results — with velocity & diagonal rejection
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const swipeStartTime = useRef<number>(0);
  const swipeContainerRef = useRef<HTMLDivElement>(null);

  const handleResultSwipeStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      swipeStartX.current = e.touches[0].clientX;
      swipeStartY.current = e.touches[0].clientY;
      swipeStartTime.current = Date.now();
    }
  }, []);

  const handleResultSwipeEnd = useCallback((e: React.TouchEvent) => {
    if (swipeStartX.current === null || swipeStartY.current === null || !onNavigateResult) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    const elapsed = Math.max(Date.now() - swipeStartTime.current, 1);
    swipeStartX.current = null;
    swipeStartY.current = null;

    // Reject diagonal swipes
    if (Math.abs(dy) > Math.abs(dx) * 0.5) return;
    // Require minimum velocity (0.3 px/ms) AND minimum distance (80px)
    const velocity = Math.abs(dx) / elapsed;
    if (velocity < 0.3 || Math.abs(dx) < 80) return;

    if (dx < -80 && historyIndex !== undefined && historyTotal !== undefined && historyIndex < historyTotal - 1) {
      onNavigateResult('next');
    } else if (dx > 80 && historyIndex !== undefined && historyIndex > 0) {
      onNavigateResult('prev');
    }
  }, [onNavigateResult, historyIndex, historyTotal]);

  // ── Pre-generate revision sheet in background ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await getRevisionCache(result.timestamp);
      if (cached || cancelled) return;
      const wrongQs = result.quizData
        .map((q, i) => ({ q, ua: result.userAnswers[i] }))
        .filter(({ q, ua }) => ua !== null && ua !== q.correctAnswer)
        .map(({ q, ua }) => ({
          question: q.question,
          correctAnswer: q.correctAnswer,
          userAnswer: ua || undefined,
          rationale: q.rationale,
        }));
      if (wrongQs.length === 0) return;
      try {
        const data = await generateRevisionSheet({
          wrongQuestions: wrongQs,
          subject: result.subject,
          quizTitle: result.quizTitle,
        });
        if (!cancelled) await setRevisionCache(result.timestamp, data.revisionSheet);
      } catch { /* silent background fail */ }
    })();
    return () => { cancelled = true; };
  }, [result.timestamp]); // eslint-disable-line

  // ── Staged reveal ──
  const [phase, setPhase] = useState<RevealPhase>('loading');
  const resultKey = result.id || String(result.timestamp);

  // Reset form states when result changes
  useEffect(() => {
    setReviewFilter('all');
    setEditingMeta(false);
    setShowFolderPicker(false);
    setEditTitle(result.quizTitle || '');
    setEditSubject(result.subject || '');
    setEditNotes(result.notes || '');
    const d = new Date(result.timestamp);
    setEditDate(d.toISOString().split('T')[0]);
    setEditTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  }, [resultKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPhase('loading');
    const t1 = setTimeout(() => setPhase('hero'), 400);
    const t2 = setTimeout(() => setPhase('charts'), 2000);
    const t3 = setTimeout(() => setPhase('review'), 2400);
    const t4 = setTimeout(() => setPhase('complete'), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [resultKey]);

  const availableSubjects = useMemo(() => {
    const saved = getUserSubjects();
    const fromHistory = history.map(r => r.subject).filter(Boolean) as string[];
    return Array.from(new Set([...saved, ...fromHistory]));
  }, [history]);

  const handleSaveMeta = () => {
    let newTs: number | undefined;
    try {
      if (editDate) {
        const [y, m, d] = editDate.split('-').map(Number);
        const [hh, mm] = (editTime || '00:00').split(':').map(Number);
        const dt = new Date(y, m - 1, d, hh || 0, mm || 0);
        if (!isNaN(dt.getTime()) && dt.getTime() !== result.timestamp) newTs = dt.getTime();
      }
    } catch { /* keep original */ }
    onUpdateMeta?.(editTitle.trim(), editSubject.trim(), newTs, editNotes.trim());
    setEditingMeta(false);
  };

  const [reportOrder, setReportOrder] = useState<ReportOrder>('original');

  const flaggedItems = result.flaggedQuestions
    ? result.quizData.map((q, i) => ({ q, i, ua: result.userAnswers[i], flagged: result.flaggedQuestions![i] })).filter(x => x.flagged)
    : [];

  const handleFilterReview = (f: Filter) => {
    setReviewFilter(f);
    setTimeout(() => {
      document.getElementById('review-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // ── PDF generation via backend ──
  const handleGeneratePdf = async (filter: 'all' | 'correct' | 'wrong' | 'skipped' = 'all') => {
    setPdfLoading(true);
    try {
      const payload = {
        results: [{
          quizTitle: result.quizTitle,
          subject: result.subject,
          percentage: result.maxScore > 0 ? Math.max(0, Math.min(100, Math.round((result.netScore / result.maxScore) * 100))) : result.percentage,
          netScore: result.netScore,
          maxScore: result.maxScore,
          correct: result.correct,
          wrong: result.wrong,
          skipped: result.skipped,
          totalQuestions: result.totalQuestions,
          accuracy: result.accuracy,
          gain: result.gain,
          penalty: result.penalty,
          timeTaken: result.timeTaken,
          timestamp: result.timestamp,
          passMark: result.passMark ?? settings.passMark ?? 50,
          quizData: result.quizData.map(q => ({
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            difficulty: q.difficulty || 'medium',
            rationale: q.rationale,
            imageUrl: (q as any).imageUrl,
            questionType: q.questionType,
          })),
          userAnswers: result.userAnswers,
        }],
        filter,
        reportType: 'full' as const,
        rationaleCache,
        includeRationale: true,
      };
      const { url } = await generateReportPdf(payload);
      window.open(url, '_blank');
      toast.success('📄 PDF report generated!');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Open revision sheet in ReportPreviewPage or fallback to modal ──
  const handleOpenRevisionSheet = async () => {
    if (!onOpenReportPreview) {
      setShowRevisionSheet(true);
      return;
    }

    setRevisionLoading(true);
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

      let markdownContent = '';

      if (wrongQs.length === 0) {
        markdownContent = '## 🎉 Perfect Score!\n\nYou answered every question correctly. Amazing work — no revision needed!\n\n> Keep up the momentum and challenge yourself with harder quizzes.';
      } else {
        const cached = await getRevisionCache(result.timestamp);
        if (cached) {
          markdownContent = cached;
        } else {
          const data = await generateRevisionSheet({
            wrongQuestions: wrongQs,
            subject: result.subject,
            quizTitle: result.quizTitle,
          });
          markdownContent = data.revisionSheet;
          await setRevisionCache(result.timestamp, markdownContent);
        }
      }

      const baseTitle = result.quizTitle || 'Quiz';
      const subject = result.subject || '';
      const html = buildRevisionSheetHtml(markdownContent, { quizTitle: baseTitle, subject });
      const capturedMd = markdownContent;

      const downloadHandler = (fmt: 'pdf' | 'html' | 'text' | 'doc', editedHtml?: string) => {
        try {
          const subSuffix = subject ? `_${subject.replace(/[<>:"/\\|?*]/g, '')}` : '';
          const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const fname = `Revision${subSuffix}_${dateStr}`;

          if (fmt === 'text') {
            exportTextReport(buildRevisionSheetText(capturedMd), `${fname}.txt`);
          } else if (fmt === 'doc') {
            const h = editedHtml || buildRevisionSheetHtml(capturedMd, { quizTitle: baseTitle, subject });
            exportSmartReport(wrapHtmlForWord(h, `Revision Sheet — ${baseTitle}`), 'doc', `${fname}.doc`);
          } else {
            (async () => {
              try {
                toast.info('Generating PDF…');
                const { url } = await revisionSheetPdf({ markdownContent: capturedMd, subject: subject || undefined, quizTitle: baseTitle || undefined });
                const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click();
                toast.success('📥 PDF downloaded!');
              } catch {
                const h = editedHtml || buildRevisionSheetHtml(capturedMd, { quizTitle: baseTitle, subject });
                exportSmartReport(h, 'pdf', `${fname}.pdf`);
                toast.success('📥 PDF downloaded!');
              }
            })();
            return;
          }
          toast.success(`📥 ${fmt.toUpperCase()} downloaded!`);
        } catch (e: any) {
          toast.error(e?.message || 'Export failed.');
        }
      };

      onOpenReportPreview({
        html,
        title: `Revision Sheet — ${baseTitle}`,
        activeCard: 'revision',
        onDownload: downloadHandler,
      });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate revision sheet');
      // Fallback to modal
      setShowRevisionSheet(true);
    } finally {
      setRevisionLoading(false);
    }
  };

  const speedoReady = phase !== 'loading';

  // ── Loading skeleton ──
  if (phase === 'loading') {
    return (
      <div className="max-w-4xl mx-auto pb-12 flex flex-col items-center gap-6 pt-8">
        <div className="glass-card w-full p-8 flex flex-col items-center gap-6">
          {/* Emoji placeholder */}
          <div className="w-16 h-16 rounded-full bg-foreground/5 shimmer" />
          {/* Title */}
          <div className="h-8 w-48 rounded-xl bg-foreground/5 shimmer" />
          {/* Badge */}
          <div className="h-7 w-32 rounded-full bg-foreground/5 shimmer" />
          {/* Speedometer placeholder */}
          <div className="w-[280px] h-[220px] rounded-full bg-foreground/[0.03] shimmer flex items-center justify-center">
            <div className="qmp-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          </div>
          {/* Stat cards placeholder */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-md">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-foreground/[0.03] shimmer" />
            ))}
          </div>
        </div>
        <p className="text-xs text-foreground/30 font-bold animate-pulse">Analyzing your performance...</p>
      </div>
    );
  }

  return (
    <div
      ref={swipeContainerRef}
      className="max-w-4xl mx-auto pb-12 animate-fade-in"
      onTouchStart={onNavigateResult ? handleResultSwipeStart : undefined}
      onTouchEnd={onNavigateResult ? handleResultSwipeEnd : undefined}
    >
      {/* Result navigation indicator */}
      {historyIndex !== undefined && historyTotal !== undefined && historyTotal > 1 && onNavigateResult && (
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            onClick={() => onNavigateResult('prev')}
            disabled={historyIndex <= 0}
            className="flex items-center gap-1 text-xs font-bold text-foreground/40 hover:text-foreground disabled:opacity-20 bg-foreground/5 border border-border px-3 py-1.5 rounded-xl transition-all active:scale-95"
          >
            <ArrowLeft className="w-3 h-3" /> Prev
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-foreground/40">
              {historyIndex + 1} of {historyTotal}
            </span>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(historyTotal, 10) }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i === historyIndex ? 'w-4 bg-primary' : 'w-1.5 bg-foreground/15'
                  }`}
                />
              ))}
              {historyTotal > 10 && <span className="text-[8px] text-foreground/20 font-bold ml-0.5">+{historyTotal - 10}</span>}
            </div>
          </div>
          <button
            onClick={() => onNavigateResult('next')}
            disabled={historyIndex >= historyTotal - 1}
            className="flex items-center gap-1 text-xs font-bold text-foreground/40 hover:text-foreground disabled:opacity-20 bg-foreground/5 border border-border px-3 py-1.5 rounded-xl transition-all active:scale-95"
          >
            Next <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {onBackToProfile && (
        <button
          onClick={onBackToProfile}
          className="flex items-center gap-1.5 text-xs font-bold text-foreground/40 hover:text-foreground transition-colors mb-4 px-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      )}

      {/* ── Session Switcher ── */}
      {onViewResult && (() => {
        const isMain = (result.attemptType || 'main') === 'main';
        const parentTs = isMain ? result.timestamp : (result.parentQuizTimestamp || result.timestamp);
        const parentId = isMain ? result.id : result.parentQuizId;

        const mainQuiz = isMain ? result : history.find(r =>
          (r.attemptType || 'main') === 'main' &&
          ((parentId && r.id === parentId) || r.timestamp === parentTs)
        );
        const practices = history.filter(r =>
          r.attemptType === 'practice' &&
          ((parentId && r.parentQuizId === parentId) || r.parentQuizTimestamp === parentTs)
        ).sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));

        if (practices.length === 0) return null;

        const allSessions = [...(mainQuiz ? [mainQuiz] : []), ...practices];
        const first = allSessions[0];
        const last = allSessions[allSessions.length - 1];
        const diff = last.percentage - first.percentage;
        const sc = (p: number) => p >= 80 ? 'text-emerald-400' : p >= 60 ? 'text-amber-400' : 'text-red-400';

        return (
          <div className="bg-card/60 rounded-2xl border border-border px-4 py-3 mb-4 animate-fade-in">
            <p className="text-[9px] font-black text-foreground/25 uppercase tracking-widest mb-2">📋 Session Navigator</p>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {allSessions.map((s, i) => {
                const sMain = (s.attemptType || 'main') === 'main';
                const active = (s.id && s.id === result.id) || s.timestamp === result.timestamp;
                const prev = i > 0 ? allSessions[i - 1].percentage : null;
                const trend = prev !== null ? (s.percentage > prev ? '▲' : s.percentage < prev ? '▼' : '') : '';
                return (
                  <button key={s.id || s.timestamp} onClick={() => !active && onViewResult(s)}
                    className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                      active
                        ? sMain ? 'bg-primary/15 border-primary/30 text-foreground shadow-sm' : 'bg-amber-500/15 border-amber-500/30 text-amber-300 shadow-sm'
                        : 'bg-transparent border-transparent text-foreground/30 hover:text-foreground/50 hover:bg-foreground/3'
                    }`}>
                    {!sMain && <Dumbbell className="w-2.5 h-2.5" />}
                    <span>{sMain ? 'Main' : `P${s.attemptNumber || i}`}</span>
                    <span className={sc(s.percentage)}>{s.percentage}%</span>
                    {trend && <span className={`text-[9px] ${trend === '▲' ? 'text-emerald-400' : 'text-red-400'}`}>{trend}</span>}
                  </button>
                );
              })}
            </div>
            {allSessions.length > 1 && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                <span className="text-[9px] text-foreground/25">Progress:</span>
                <span className={`text-[10px] font-bold ${sc(first.percentage)}`}>{first.percentage}%</span>
                <span className="text-foreground/15 text-[10px]">→</span>
                <span className={`text-[10px] font-bold ${sc(last.percentage)}`}>{last.percentage}%</span>
                <span className={`text-[10px] font-black ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ({diff >= 0 ? '+' : ''}{diff}%{diff >= 0 ? ' ▲' : ' ▼'})
                </span>
                <span className="text-[9px] text-foreground/20 ml-auto">{allSessions.length} sessions</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Inline Quiz Meta Editor ── */}
      {onUpdateMeta && (
        <div className="bg-card/60 rounded-2xl border border-border px-4 py-3 mb-4">
          {!editingMeta ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {result.attemptType === 'practice' && (
                  <span className="text-[9px] font-black text-amber-400 bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded-md uppercase tracking-widest flex-shrink-0">
                    🏋️ Practice #{result.attemptNumber || '?'}
                  </span>
                )}
                <span className="text-[9px] font-black text-foreground/30 uppercase tracking-widest flex-shrink-0">Quiz:</span>
                <span className="text-sm font-bold text-foreground/70 truncate max-w-[200px]">
                  {result.quizTitle || <span className="text-foreground/25 italic font-normal">Untitled</span>}
                </span>
                {result.subject && (
                  <>
                    <span className="text-foreground/15 flex-shrink-0">·</span>
                    <span className="text-[10px] font-bold text-primary/80 bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/20 flex-shrink-0">
                      {result.subject}
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => { setEditTitle(result.quizTitle || ''); setEditSubject(result.subject || ''); setEditingMeta(true); }}
                  className="flex items-center gap-1.5 text-[10px] text-foreground/40 hover:text-foreground/70 bg-foreground/5 hover:bg-foreground/10 border border-border px-3 py-1.5 rounded-lg transition-all font-bold"
                >
                  <Pencil className="w-3 h-3" /> Edit Info
                </button>
                <button
                  onClick={() => onBackToProfile?.() || onHome()}
                  className="flex items-center gap-1.5 text-[10px] text-foreground/40 hover:text-foreground/70 bg-foreground/5 hover:bg-foreground/10 border border-border px-3 py-1.5 rounded-lg transition-all font-bold"
                >
                  <X className="w-3 h-3" /> Close
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <datalist id="result-subjects">
                {availableSubjects.map(s => <option key={s} value={s} />)}
              </datalist>
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value.slice(0, 60))}
                placeholder="Quiz title / topic…"
                autoFocus
                className="flex-1 bg-muted/30 border border-border focus:border-primary/50 rounded-xl px-3 py-2 text-sm text-foreground placeholder-foreground/30 focus:outline-none"
              />
              <input
                value={editSubject}
                onChange={e => setEditSubject(e.target.value.slice(0, 30))}
                placeholder="Subject…"
                list="result-subjects"
                className="w-full sm:w-36 bg-muted/30 border border-border focus:border-primary/50 rounded-xl px-3 py-2 text-sm text-foreground placeholder-foreground/30 focus:outline-none"
              />
              <input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                className="w-full sm:w-36 bg-muted/30 border border-border focus:border-primary/50 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none [color-scheme:dark]"
              />
              <input
                type="time"
                value={editTime}
                onChange={e => setEditTime(e.target.value)}
                className="w-24 bg-muted/30 border border-border focus:border-primary/50 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none [color-scheme:dark]"
              />
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={handleSaveMeta}
                  className="flex items-center gap-1 bg-primary hover:bg-primary/80 text-primary-foreground text-xs font-black px-4 py-2 rounded-xl transition-all"
                >
                  <Check className="w-3 h-3" /> Save
                </button>
                <button
                  onClick={() => setEditingMeta(false)}
                  className="text-xs text-foreground/40 hover:text-foreground/70 bg-foreground/5 border border-border px-3 py-2 rounded-xl transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add to Folder */}
      <FolderPickerSheet
        open={showFolderPicker}
        onClose={() => setShowFolderPicker(false)}
        questions={result.quizData}
        defaultName={result.quizTitle || ''}
        tags={result.subject ? [result.subject] : []}
        sourceResultId={result.id}
        sourceTimestamp={result.timestamp}
      />
      <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setShowFolderPicker(true)}
            className="flex items-center gap-2 text-xs font-bold text-foreground/40 hover:text-foreground/70 bg-foreground/5 border border-border px-4 py-2.5 rounded-xl transition-all active:scale-95"
          >
            <FolderPlus className="w-3.5 h-3.5" /> Add to Folder
          </button>
          <EmailReportButton result={result} rationaleCache={rationaleCache} />
          {/* Revision Sheet */}
          <button onClick={handleOpenRevisionSheet}
            disabled={revisionLoading}
            className="flex items-center gap-2 text-xs font-bold text-amber-400/70 hover:text-amber-400 bg-amber-500/5 border border-amber-500/20 px-4 py-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-50">
            {revisionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            📝 Revision Sheet
          </button>
          {/* Practice Attempts Dropdown */}
          {(() => {
            const parentTs = result.attemptType === 'practice'
              ? (result.parentQuizTimestamp || result.timestamp)
              : result.timestamp;
            const practices = history.filter(
              r => r.attemptType === 'practice' && r.parentQuizTimestamp === parentTs
            ).sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));
            if (practices.length === 0) return null;
            return (
              <div className="relative">
                <select
                  value=""
                  onChange={e => {
                    const ts = Number(e.target.value);
                    const found = history.find(r => r.timestamp === ts);
                    if (found && onViewResult) {
                      onViewResult(found);
                    }
                  }}
                  className="appearance-none bg-violet-500/8 border border-violet-500/20 text-violet-300 text-xs font-bold pl-8 pr-7 py-2.5 rounded-xl cursor-pointer hover:border-violet-500/40 focus:outline-none transition-all"
                >
                  <option value="" disabled>🏋️ Practice ({practices.length})</option>
                  {practices.map(p => (
                    <option key={p.timestamp} value={p.timestamp}>
                      {p.quizTitle || `Practice #${p.attemptNumber}`} — {p.percentage}%
                    </option>
                  ))}
                </select>
                <Dumbbell className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-violet-400 pointer-events-none" />
                <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-violet-400/40 pointer-events-none rotate-90" />
              </div>
            );
          })()}
          {/* Quick PDF download */}
          <button
            onClick={() => handleGeneratePdf('all')}
            disabled={pdfLoading}
            className="flex items-center gap-2 text-xs font-bold text-primary/70 hover:text-primary bg-primary/5 border border-primary/20 px-4 py-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-50"
          >
            {pdfLoading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
              : <><FileDown className="w-3.5 h-3.5" /> Download PDF</>}
          </button>
        </div>

      {/* Adaptive Skill Level Badge */}
      {result.isAdaptive && result.adaptiveSkillLevel && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-purple-500/10 border border-purple-500/25 rounded-xl">
          <span className="text-lg">🧠</span>
          <div>
            <p className="text-xs font-black text-purple-300">Adaptive Quiz — Calibrated Skill Level</p>
            <p className="text-sm font-black text-foreground mt-0.5">{result.adaptiveSkillLevel}</p>
          </div>
        </div>
      )}

      {/* Revision Sheet Modal */}
      {showRevisionSheet && <RevisionSheetModal result={result} onClose={() => setShowRevisionSheet(false)} />}

      {/* Hero section — always visible after loading phase */}
      <ScoreHero
        result={result}
        settings={settings}
        activeFilter={reviewFilter}
        startAnimation={speedoReady}
        onHome={onHome}
        onRetry={onRetry}
        onNewQuiz={onNewQuiz}
        onPracticeMistakes={onPracticeMistakes}
        onRetryAll={onRetryAll}
        onFilterReview={handleFilterReview}
        onMoreLikeThis={onMoreLikeThis}
        moreLikeThisLoading={moreLikeThisLoading}
        quizData={result.quizData}
        userAnswers={result.userAnswers}
        showDecimalPct={profile.showDecimalPct}
        onApplyMarking={(marksPerQ, negMarks, simResult) => {
          const quizId = result.id || String(result.timestamp);
          applyNegativeMarking(quizId, marksPerQ, negMarks);
          // Update local display immediately with simulated result
          setNmOverride({
            correct: simResult.correct,
            wrong: simResult.wrong,
            skipped: simResult.skipped,
            gain: simResult.gain,
            penalty: simResult.penalty,
            netScore: simResult.netScore,
            maxScore: simResult.maxScore,
            percentage: simResult.percentage,
            accuracy: simResult.accuracy,
            score: simResult.netScore,
          });
        }}
        onRemoveMarking={() => {
          const quizId = result.id || String(result.timestamp);
          const originalScore = getOriginalScore(quizId);
          removeNegativeMarking(quizId);
          // Restore original scores to display
          if (originalScore) {
            setNmOverride({
              correct: originalScore.correct,
              wrong: originalScore.wrong,
              skipped: originalScore.skipped,
              gain: originalScore.gain,
              penalty: originalScore.penalty,
              netScore: originalScore.netScore,
              maxScore: originalScore.maxScore,
              percentage: originalScore.percentage,
              accuracy: originalScore.accuracy,
              score: originalScore.score,
            });
          } else {
            setNmOverride(null);
          }
        }}
      />

      {/* Visual charts — revealed after hero animation */}
      <div className={`transition-all duration-700 ${phase === 'hero' ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0'}`}>
        <ResultsCharts result={result} history={history} />
      </div>

      {/* Timing Breakdown */}
      <div className={`transition-all duration-700 delay-100 ${phase === 'hero' ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0'}`}>
        {result.timeTaken > 0 && <TimingBreakdown result={result} />}
      </div>

      {/* Weak Topics */}
      <div className={`transition-all duration-700 delay-200 ${phase === 'hero' ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0'}`}>
        {result.wrong > 0 && <WeakTopicsSummary result={result} />}
      </div>

      {/* Flagged Questions */}
      {flaggedItems.length > 0 && (
        <div className={`glass-card px-5 py-4 mb-6 transition-all duration-700 delay-300 ${['loading', 'hero', 'charts'].includes(phase) ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0'}`}>
          <div className="flex items-center gap-2 text-amber-400 text-[10px] font-black uppercase tracking-widest mb-4">
            <Flag className="w-3.5 h-3.5" />
            Flagged Questions ({flaggedItems.length})
            <span className="text-foreground/30 font-normal normal-case">— questions you marked for review</span>
          </div>
          <div className="space-y-3">
            {flaggedItems.map(({ q, i, ua }) => {
              const isCorrect = ua === q.correctAnswer;
              const isSkipped = ua === null;
              const statusColor = isSkipped ? 'text-amber-400' : isCorrect ? 'text-emerald-400' : 'text-red-400';
              const statusLabel = isSkipped ? '⏭ Skipped' : isCorrect ? '✓ Correct' : '✗ Wrong';
              return (
                <div key={i} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[10px] font-bold text-amber-400/60">🚩 Q{i + 1}</span>
                    <span className={`text-[10px] font-bold ${statusColor}`}>{statusLabel}</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-2 leading-relaxed">{q.question}</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg font-bold">
                      ✓ {q.correctAnswer}
                    </span>
                    {ua && ua !== q.correctAnswer && (
                      <span className="bg-red-500/20 text-red-300 border border-red-500/30 px-2.5 py-1 rounded-lg font-bold">
                        ✗ {ua}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Difficulty Rating */}
      <div className={`transition-all duration-700 delay-200 ${phase === 'hero' ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0'}`}>
        <DifficultyRating result={result} />
      </div>

      {/* Report Download Panel */}
      <div className={`transition-all duration-700 delay-300 ${['loading', 'hero', 'charts'].includes(phase) ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0'}`}>
        <ReportDownloadPanel
          results={[result]}
          rationaleCache={rationaleCache}
          scope="quiz"
          reportOrder={reportOrder}
          onOrderChange={setReportOrder}
          rationalePrefs={rationalePrefs}
          onRationalePrefsChange={onRationalePrefsChange}
          reportHelper={reportHelper}
          onReportHelperChange={onReportHelperChange}
          onOpenPreviewPage={onOpenReportPreview}
        />
      </div>

      {/* Question Review */}
      <div id="review-section" className={`transition-all duration-700 delay-400 ${['loading', 'hero', 'charts'].includes(phase) ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0'}`}>
        <div className="flex items-center gap-5 mb-5 px-2 text-[10px] text-foreground/40 uppercase font-bold tracking-wider">
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Correct</div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Wrong</div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Skipped</div>
        </div>
        <ReviewSection
          result={result}
          settings={settings}
          rationaleCache={rationaleCache}
          getAiRationale={getAiRationale}
          activeFilter={reviewFilter}
          onFilterChange={setReviewFilter}
          reportOrder={reportOrder}
          rationalePrefs={rationalePrefs}
          onRationalePrefsChange={onRationalePrefsChange}
          reportHelper={reportHelper}
          onReportHelperChange={onReportHelperChange}
          onAskAI={onAskAI}
        />
      </div>

    </div>
  );
}
