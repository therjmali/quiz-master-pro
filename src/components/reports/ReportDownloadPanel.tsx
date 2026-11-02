import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Loader2, BarChart2, CheckSquare, XSquare, SkipForward,
  Download, BookOpen, ClipboardList, ChevronRight, FileDown, Eye, FileEdit,
} from 'lucide-react';
import { generateReportPdf, revisionSheetPdf, generateRevisionSheet, getQuizDetail } from 'zitejs/api';
import { toast } from 'sonner';
import { QuizResult, ReportOrder, RationalePrefs, AIMode, QuizQuestion } from '../../types/quiz';
import { ExportFormat, QuestionFilter, DEFAULT_SECTIONS, ReportCardType } from '../../utils/reports/reportData';
import {
  buildSmartReportHtml, buildTextReport, buildDocReport,
  exportSmartReport, exportTextReport, getReportFilename,
  buildStudyNotesHtml, buildStudyNotesText,
  buildExamPaperHtml, buildExamPaperText,
  wrapHtmlForWord,
} from '../../utils/reports/htmlReportBuilder';
import { buildRevisionSheetHtml, buildRevisionSheetText } from '../../utils/reports/revisionHtmlBuilder';
import SmartPreviewModal from './SmartPreviewModal';
import { ReportPreviewData, ReportViewOptions } from './ReportPreviewPage';
import ReportOrderControls from '../ReportOrderControls';
import RationaleControlsButton from '../RationaleControlsButton';
import { explainQuestion } from 'zitejs/api';
import { getQuizDetailsFromIDB } from '../../hooks/useHistorySync';

/** Helper to parse server record into full QuizResult */
function parseFullRecord(r: any): QuizResult {
  let quizData: QuizQuestion[] = [];
  let userAnswers: (string | null)[] = [];
  try { quizData = JSON.parse(r.quizDataJson || '[]'); } catch {}
  try { userAnswers = JSON.parse(r.userAnswersJson || '[]'); } catch {}
  
  const correct = r.correctCount || 0;
  const wrong = r.wrongCount || 0;
  const skipped = r.skippedCount || 0;
  const score = r.score || 0;
  const maxScore = r.maxScore || 0;
  const accuracy = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
  const totalQuestions = r.totalQuestions || correct + wrong + skipped;
  const percentage = maxScore > 0 ? Math.max(0, Math.min(100, Math.round((score / maxScore) * 100))) : (r.percentage || 0);
  
  return {
    id: r.id, totalQuestions, quizData, userAnswers,
    score, maxScore, percentage,
    correct, wrong, skipped,
    gain: r.gain ?? correct,
    penalty: r.penalty ?? 0,
    netScore: score,
    accuracy,
    timeTaken: r.timeTakenSeconds || 0,
    difficulty: r.difficulty,
    timestamp: r.localTimestamp || (r.createdAt ? new Date(r.createdAt).getTime() : Date.now()),
    quizTitle: r.quizTitle || undefined,
    subject: r.subject || undefined,
    passMark: undefined,
    attemptType: r.attemptType === 'Practice' ? 'practice' : 'main',
    attemptNumber: r.attemptNumber || undefined,
    parentQuizId: r.parentQuizId || undefined,
    parentQuizTimestamp: undefined,
    notes: r.notes || undefined,
  };
}

interface Props {
  results: QuizResult[];
  rationaleCache: Record<string, string>;
  scope?: 'quiz' | 'profile';
  reportOrder: ReportOrder;
  onOrderChange: (v: ReportOrder) => void;
  rationalePrefs: RationalePrefs;
  onRationalePrefsChange: (p: RationalePrefs) => void;
  reportHelper: AIMode;
  onReportHelperChange: (m: AIMode) => void;
  onOpenPreviewPage?: (data: ReportPreviewData) => void;
  /** Controlled filter props — when provided, the panel uses these instead of internal state */
  controlledSubject?: string | null;
  controlledUnit?: string | null;
  controlledDiffFilter?: 'all' | 'easy' | 'medium' | 'hard';
  onSubjectChange?: (v: string | null) => void;
  onUnitChange?: (v: string | null) => void;
  onDiffFilterChange?: (v: 'all' | 'easy' | 'medium' | 'hard') => void;
}

interface CardConfig {
  type: ReportCardType;
  label: string;
  description: string;
  Icon: React.FC<{ className?: string }>;
  accent: string;
  bgGlass: string;
  borderCls: string;
  iconBg: string;
}

const CARDS: CardConfig[] = [
  { type: 'all', label: 'Full Report', description: 'Complete report with charts, insights & all questions', Icon: BarChart2, accent: 'text-indigo-400', bgGlass: 'bg-indigo-500/5', borderCls: 'border-indigo-500/20', iconBg: 'bg-indigo-500/15' },
  { type: 'correct', label: 'Correct Answers', description: 'Only correctly answered questions', Icon: CheckSquare, accent: 'text-emerald-400', bgGlass: 'bg-emerald-500/5', borderCls: 'border-emerald-500/20', iconBg: 'bg-emerald-500/15' },
  { type: 'wrong', label: 'Mistakes', description: 'Wrong answers — review & improve', Icon: XSquare, accent: 'text-red-400', bgGlass: 'bg-red-500/5', borderCls: 'border-red-500/20', iconBg: 'bg-red-500/15' },
  { type: 'skipped', label: 'Skipped', description: 'Questions not attempted', Icon: SkipForward, accent: 'text-amber-400', bgGlass: 'bg-amber-500/5', borderCls: 'border-amber-500/20', iconBg: 'bg-amber-500/15' },
  { type: 'notes', label: 'Study Notes', description: 'Q & A notes — answers in RED + explanations', Icon: BookOpen, accent: 'text-purple-400', bgGlass: 'bg-purple-500/5', borderCls: 'border-purple-500/20', iconBg: 'bg-purple-500/15' },
  { type: 'exam', label: 'Exam Paper', description: 'Official MCQ paper — toggle answers, book & AI rationale', Icon: ClipboardList, accent: 'text-teal-400', bgGlass: 'bg-teal-500/5', borderCls: 'border-teal-500/20', iconBg: 'bg-teal-500/15' },
  { type: 'revision', label: 'Revision Sheet', description: 'AI-generated revision notes from mistakes', Icon: FileEdit, accent: 'text-amber-400', bgGlass: 'bg-amber-500/5', borderCls: 'border-amber-500/20', iconBg: 'bg-amber-500/15' },
];

const REPORT_TABS: { key: string; label: string; icon: string }[] = [
  { key: 'all', label: 'Full Report', icon: '📊' },
  { key: 'correct', label: 'Correct', icon: '✅' },
  { key: 'wrong', label: 'Mistakes', icon: '❌' },
  { key: 'skipped', label: 'Skipped', icon: '⏭' },
  { key: 'notes', label: 'Study Notes', icon: '📖' },
  { key: 'exam', label: 'Exam Paper', icon: '📝' },
  { key: 'revision', label: 'Revision', icon: '✏️' },
];

/**
 * Difficulty sorting is handled ONLY in the report builder (htmlReportBuilder.ts).
 * This panel just passes the diffFilter value through — no array reordering here.
 * This avoids the double-sort bug where questions were sorted in the panel AND the builder.
 */

export default function ReportDownloadPanel({
  results, rationaleCache, scope = 'profile',
  reportOrder, onOrderChange,
  rationalePrefs, onRationalePrefsChange,
  reportHelper, onReportHelperChange,
  onOpenPreviewPage,
  controlledSubject, controlledUnit, controlledDiffFilter,
  onSubjectChange, onUnitChange, onDiffFilterChange,
}: Props) {
  const isControlled = controlledSubject !== undefined;
  const [_selectedSubject, _setSelectedSubject] = useState<string | null>(null);
  const [_selectedUnit, _setSelectedUnit]       = useState<string | null>(null);
  const [_diffFilter, _setDiffFilter]           = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const selectedSubject = isControlled ? controlledSubject : _selectedSubject;
  const setSelectedSubject = isControlled ? (v: string | null) => onSubjectChange?.(v) : _setSelectedSubject;
  const selectedUnit = isControlled ? (controlledUnit ?? null) : _selectedUnit;
  const setSelectedUnit = isControlled ? (v: string | null) => onUnitChange?.(v) : _setSelectedUnit;
  const diffFilter = isControlled ? (controlledDiffFilter ?? 'all') : _diffFilter;
  const setDiffFilter = isControlled ? (v: 'all' | 'easy' | 'medium' | 'hard') => onDiffFilterChange?.(v) : _setDiffFilter;
  const [previewOpen, setPreviewOpen]         = useState(false);
  const [previewHtml, setPreviewHtml]         = useState('');
  const [previewTitle, setPreviewTitle]       = useState('');
  const [activeCard, setActiveCard]           = useState<ReportCardType>('all');
  const [loadingCard, setLoadingCard]         = useState<ReportCardType | null>(null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [examInlineAnswers, setExamInlineAnswers] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Cache revision markdown so downloads can reuse it
  const revisionMdRef = useRef('');
  const [fetchingDetails, setFetchingDetails] = useState(false);

  // Store full-detail results so closures (downloadForPage, buildRegenerate) can access them
  const fullResultsRef = useRef<QuizResult[]>([]);

  const sections = DEFAULT_SECTIONS;

  /** Fetch full quiz details for all lightweight summaries */
  const fetchAllFullDetails = async (summaries: QuizResult[]): Promise<QuizResult[]> => {
    const needsFetch = summaries.filter(r => !r.quizData || r.quizData.length === 0);
    if (needsFetch.length === 0) {
      // All results already have full data
      return summaries;
    }

    setFetchingDetails(true);
    toast.info(`Loading ${needsFetch.length} quiz details...`);
    
    try {
      // Step 1: Try IDB cache first for ALL records (works offline and for records without id)
      const idbKeys = needsFetch.map(r => r.id || String(r.timestamp));
      // Also try timestamp-based keys as fallback
      const timestampKeys = needsFetch.map(r => String(r.timestamp));
      const allKeys = [...new Set([...idbKeys, ...timestampKeys])];
      const idbResults = await getQuizDetailsFromIDB(allKeys);
      
      // Step 2: For records not found in IDB, fetch from server (requires id)
      const stillNeeded = needsFetch.filter(r => {
        const fromIdb = idbResults.get(r.id || '') || idbResults.get(String(r.timestamp));
        return !fromIdb || !fromIdb.quizData?.length;
      });

      const serverFetched = new Map<string, QuizResult>();
      if (stillNeeded.length > 0) {
        const serverResults = await Promise.allSettled(
          stillNeeded.map(async (r) => {
            if (!r.id) return { key: String(r.timestamp), result: null };
            try {
              const resp = await getQuizDetail({ id: r.id });
              if (resp.record) {
                const full = parseFullRecord(resp.record);
                if (full.quizData.length > 0) {
                  return { key: r.id, result: full };
                }
              }
            } catch (e: any) {
              console.warn(`Failed to fetch quiz detail for ${r.id}:`, e?.message);
            }
            return { key: r.id || String(r.timestamp), result: null };
          })
        );
        
        serverResults.forEach(sr => {
          if (sr.status === 'fulfilled' && sr.value.result) {
            serverFetched.set(sr.value.key, sr.value.result);
          }
        });
      }

      // Step 3: Merge everything back
      const merged = summaries.map(r => {
        // Already has full data
        if (r.quizData?.length) return r;
        
        // Check server fetch first (freshest)
        if (r.id && serverFetched.has(r.id)) return serverFetched.get(r.id)!;
        
        // Check IDB by id
        const idbById = r.id ? idbResults.get(r.id) : undefined;
        if (idbById?.quizData?.length) return { ...r, ...idbById, id: r.id };
        
        // Check IDB by timestamp
        const idbByTs = idbResults.get(String(r.timestamp));
        if (idbByTs?.quizData?.length) return { ...r, ...idbByTs };
        
        // No full data available — return as-is (stats only)
        return r;
      });
      
      // Warn if some records still have no question data
      const stillEmpty = merged.filter(r => !r.quizData?.length && r.totalQuestions > 0);
      if (stillEmpty.length > 0) {
        console.warn(`${stillEmpty.length} quiz(es) have no question data available`);
      }
      
      setFetchingDetails(false);
      return merged;
    } catch (e: any) {
      setFetchingDetails(false);
      toast.error(e?.message || 'Failed to load quiz details');
      // Return summaries as-is rather than throwing — partial data is better than none
      return summaries;
    }
  };

  useEffect(() => { if (!isControlled) _setSelectedUnit(null); }, [selectedSubject, isControlled]);

  const subjects = useMemo(() => {
    const set = new Set(results.map(r => r.subject).filter(Boolean));
    return Array.from(set) as string[];
  }, [results]);

  const units = useMemo(() => {
    const base = selectedSubject ? results.filter(r => r.subject === selectedSubject) : results;
    const set = new Set(base.map(r => r.quizTitle).filter(Boolean));
    return Array.from(set) as string[];
  }, [results, selectedSubject]);

  const filteredResults = useMemo(() => {
    // When controlled from profile, results are already filtered by subject+unit
    if (isControlled) return results;
    let res = results;
    if (selectedSubject) res = res.filter(r => r.subject === selectedSubject);
    if (selectedUnit)    res = res.filter(r => r.quizTitle === selectedUnit);
    // Difficulty sorting is handled by the builder functions, not here
    return res;
  }, [results, selectedSubject, selectedUnit, diffFilter, isControlled]);

  // Clear cached full results when the filter changes
  useEffect(() => { fullResultsRef.current = []; }, [filteredResults]);

  const counts = useMemo(() => {
    let correct = 0, wrong = 0, skipped = 0;
    
    // CRITICAL FIX: History contains lightweight summaries with empty quizData arrays.
    // Use the aggregated correct/wrong/skipped counts from each result instead of
    // iterating through quizData (which would be empty for summaries).
    filteredResults.forEach(r => {
      // For lightweight summaries, use the pre-calculated totals
      if (!r.quizData || r.quizData.length === 0) {
        correct += r.correct;
        wrong += r.wrong;
        skipped += r.skipped;
      } else {
        // For full results (e.g., from ResultsScreen), iterate through questions
        r.quizData.forEach((q, i) => {
          if (diffFilter !== 'all' && q.difficulty !== diffFilter) return;
          const ua = r.userAnswers[i];
          if (ua === null) skipped++;
          else if (ua === q.correctAnswer) correct++;
          else wrong++;
        });
      }
    });
    
    return { quizzes: filteredResults.length, correct, wrong, skipped, all: correct + wrong + skipped };
  }, [filteredResults, diffFilter]);

  const cardCount = (type: ReportCardType): number => {
    if (type === 'all' || type === 'notes' || type === 'exam') return counts.all;
    if (type === 'revision') return counts.wrong;
    return counts[type as keyof typeof counts] as number ?? 0;
  };

  const rationaleStatusLabel = (() => {
    if (!rationalePrefs.showBook && !rationalePrefs.showAi) return '🙈 Hidden';
    if (rationalePrefs.showBook && rationalePrefs.showAi)  return '📖 Full';
    if (rationalePrefs.showBook)                            return '📖 Book';
    return '💡 AI';
  })();

  // ── Shared: open preview once html/title are ready ──
  const openPreviewWithData = (type: ReportCardType, html: string, title: string) => {
    setActiveCard(type);

    if (onOpenPreviewPage) {
      const cardType = type;
      const capturedMd = revisionMdRef.current;
      // Mutable ref so downloadForPage always uses the latest difficulty the user picked in preview
      const previewDiffRef = { current: diffFilter as 'all' | 'easy' | 'medium' | 'hard' };
      const downloadForPage = (fmt: ExportFormat, editedHtml?: string) => {
        try {
          // Use full-detail results (not lightweight summaries)
          const dfResults = fullResultsRef.current.length > 0 ? fullResultsRef.current : filteredResults;
          const subject   = dfResults[0]?.subject || '';
          const titleBase = dfResults[0]?.quizTitle || 'Report';
          const subSuffix = subject ? `_${subject.replace(/[<>:"/\\|?*]/g, '')}` : '';
          const dateStr   = new Date().toISOString().slice(0, 10).replace(/-/g, '');

          if (cardType === 'revision' && capturedMd) {
            const fname = `Revision${subSuffix}_${dateStr}`;
            if (fmt === 'text') {
              exportTextReport(buildRevisionSheetText(capturedMd), `${fname}.txt`);
            } else if (fmt === 'doc') {
              const h = editedHtml || buildRevisionSheetHtml(capturedMd, { quizTitle: titleBase, subject });
              exportSmartReport(wrapHtmlForWord(h, `Revision Sheet — ${titleBase}`), 'doc', `${fname}.doc`);
            } else {
              // Server-side PDF for quality
              (async () => {
                try {
                  toast.info('Generating PDF…');
                  const { url } = await revisionSheetPdf({ markdownContent: capturedMd, subject: subject || undefined, quizTitle: titleBase || undefined });
                  const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click();
                  toast.success('📥 PDF downloaded!');
                } catch {
                  const h = editedHtml || buildRevisionSheetHtml(capturedMd, { quizTitle: titleBase, subject });
                  exportSmartReport(h, 'pdf', `${fname}.pdf`);
                  toast.success('📥 PDF downloaded!');
                }
              })();
              return;
            }
          } else if (cardType === 'notes') {
            const fname = `StudyNotes${subSuffix}_${dateStr}`;
            if (fmt === 'text') {
              exportTextReport(buildStudyNotesText(dfResults, rationaleCache, reportOrder, rationalePrefs, previewDiffRef.current), `${fname}.txt`);
            } else if (fmt === 'doc') {
              const h = editedHtml || buildStudyNotesHtml(dfResults, rationaleCache, false, reportOrder, rationalePrefs, false, previewDiffRef.current);
              exportSmartReport(wrapHtmlForWord(h, `Study Notes — ${titleBase}`), 'doc', `${fname}.doc`);
            } else {
              const h = editedHtml || buildStudyNotesHtml(dfResults, rationaleCache, fmt === 'pdf', reportOrder, rationalePrefs, false, previewDiffRef.current);
              exportSmartReport(h, fmt, `${fname}.pdf`);
            }
          } else if (cardType === 'exam') {
            const fname = `ExamPaper${subSuffix}_${dateStr}`;
            if (fmt === 'text') {
              exportTextReport(buildExamPaperText(dfResults, true, reportOrder, previewDiffRef.current), `${fname}.txt`);
            } else if (fmt === 'doc') {
              const h = editedHtml || buildExamPaperHtml(dfResults, !examInlineAnswers, false, reportOrder, examInlineAnswers, rationaleCache, rationalePrefs, previewDiffRef.current);
              exportSmartReport(wrapHtmlForWord(h, `Exam Paper — ${titleBase}`), 'doc', `${fname}.doc`);
            } else {
              const h = editedHtml || buildExamPaperHtml(dfResults, !examInlineAnswers, fmt === 'pdf', reportOrder, examInlineAnswers, rationaleCache, rationalePrefs, previewDiffRef.current);
              exportSmartReport(h, fmt, `${fname}.pdf`);
            }
          } else {
            if (fmt === 'text') {
              const text = buildTextReport(dfResults, cardType as QuestionFilter, rationaleCache, reportOrder, rationalePrefs, previewDiffRef.current);
              exportTextReport(text, getReportFilename(dfResults, 'text'));
            } else if (fmt === 'doc') {
              const docHtml = editedHtml || buildDocReport(dfResults, sections, cardType as QuestionFilter, rationaleCache, reportOrder, rationalePrefs, false, previewDiffRef.current);
              exportSmartReport(docHtml, 'doc', getReportFilename(dfResults, 'doc'));
            } else {
              const h = editedHtml || buildSmartReportHtml(dfResults, sections, cardType as QuestionFilter, rationaleCache, fmt === 'pdf', reportOrder, rationalePrefs, false, previewDiffRef.current);
              exportSmartReport(h, fmt, getReportFilename(dfResults, fmt));
            }
          }
          toast.success(`📥 ${fmt.toUpperCase()} downloaded!`);
        } catch (e: any) {
          toast.error(e?.message || 'Export failed.');
        }
      };

      const buildRegenerate = (cardType: ReportCardType) => (opts: ReportViewOptions): string => {
        const rPrefs = { showBook: opts.showBookRat, showAi: opts.showAiRat };
        const hideAns = !opts.showAnswers;
        const df = opts.difficultyFilter || 'all';
        previewDiffRef.current = df;
        // Use full-detail results (not lightweight summaries)
        const res = fullResultsRef.current.length > 0 ? fullResultsRef.current : filteredResults;
        if (cardType === 'exam') {
          setExamInlineAnswers(opts.showAnswers);
          return buildExamPaperHtml(res, !opts.showAnswers, false, reportOrder, opts.showAnswers,
            rationaleCache, rPrefs, df);
        } else if (cardType === 'notes') {
          return buildStudyNotesHtml(res, rationaleCache, false, reportOrder, rPrefs, hideAns, df);
        } else {
          return buildSmartReportHtml(res, sections, cardType as QuestionFilter, rationaleCache, false, reportOrder, rPrefs, hideAns, df);
        }
      };

      const buildExplainAll = (cardType: ReportCardType) => async (opts: ReportViewOptions): Promise<string> => {
        const df = opts.difficultyFilter || previewDiffRef.current || 'all';
        // Use full-detail results (not lightweight summaries)
        const res = fullResultsRef.current.length > 0 ? fullResultsRef.current : filteredResults;
        const questions = res.flatMap(r => r.quizData);
        const missing = questions.filter(q => !rationaleCache[q.question]);
        const batchSize = 3;
        for (let i = 0; i < missing.length; i += batchSize) {
          const batch = missing.slice(i, i + batchSize);
          const results2 = await Promise.allSettled(
            batch.map(q => explainQuestion({
              question: q.question,
              correctAnswer: q.correctAnswer,
              options: q.options,
              status: 'correct' as const,
            }))
          );
          results2.forEach((r2, j) => {
            if (r2.status === 'fulfilled') {
              rationaleCache[batch[j].question] = r2.value.rationale;
            }
          });
        }
        const rPrefs = { showBook: opts.showBookRat, showAi: true };
        const hideAns = !opts.showAnswers;
        if (cardType === 'exam') {
          return buildExamPaperHtml(res, !opts.showAnswers, false, reportOrder, opts.showAnswers,
            rationaleCache, rPrefs, df);
        } else if (cardType === 'notes') {
          return buildStudyNotesHtml(res, rationaleCache, false, reportOrder, rPrefs, hideAns, df);
        } else {
          return buildSmartReportHtml(res, sections, cardType as QuestionFilter, rationaleCache, false, reportOrder, rPrefs, hideAns, df);
        }
      };

      const isRevision = type === 'revision';
      onOpenPreviewPage({
        html,
        title,
        activeCard: type,
        showAnswers: type === 'exam' ? examInlineAnswers : true,
        showBookRat: rationalePrefs.showBook,
        showAiRat: rationalePrefs.showAi,
        onRegenerate: !isRevision ? buildRegenerate(type) : undefined,
        onExplainAll: !isRevision ? buildExplainAll(type) : undefined,
        onDownload: downloadForPage,
        availableReports: REPORT_TABS,
        onSwitchReport: (key: string) => handlePreview(key as ReportCardType),
      });
    } else {
      setPreviewHtml(html);
      setPreviewTitle(title);
      setPreviewOpen(true);
    }
  };

  // ── Preview (sync reports) ──────────────────────────────────────────────────
  const handlePreview = async (type: ReportCardType) => {
    if (!filteredResults.length) { toast.error('No data to preview.'); return; }

    // Revision is async — handle separately
    if (type === 'revision') { handleRevisionPreview(); return; }

    setLoadingCard(type);
    try {
      // CRITICAL: Fetch full quiz details if we have lightweight summaries
      const fullResults = await fetchAllFullDetails(filteredResults);
      fullResultsRef.current = fullResults;
      
      const baseTitle = scope === 'quiz'
        ? (fullResults[0]?.quizTitle || 'Quiz')
        : 'Profile Analysis';

      let html = '', title = '';

      if (type === 'notes') {
        html  = buildStudyNotesHtml(fullResults, rationaleCache, false, reportOrder, rationalePrefs, false, diffFilter);
        title = `Study Notes — ${baseTitle}`;
      } else if (type === 'exam') {
        html  = buildExamPaperHtml(fullResults, !examInlineAnswers, false, reportOrder, examInlineAnswers, rationaleCache, rationalePrefs, diffFilter);
        title = `Exam Paper — ${baseTitle}`;
      } else {
        const titleMap: Record<QuestionFilter, string> = {
          all: 'Full Report', correct: 'Correct Answers',
          wrong: 'Mistakes Report', skipped: 'Skipped Questions',
        };
        html  = buildSmartReportHtml(fullResults, sections, type as QuestionFilter, rationaleCache, false, reportOrder, rationalePrefs, false, diffFilter);
        title = `${titleMap[type as QuestionFilter]} — ${baseTitle}`;
      }

      revisionMdRef.current = '';
      openPreviewWithData(type, html, title);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate preview.');
    } finally {
      setLoadingCard(null);
    }
  };

  // ── Revision Sheet Preview (async — may need AI generation) ─────────────────
  const handleRevisionPreview = async () => {
    setLoadingCard('revision');
    try {
      // CRITICAL: Fetch full quiz details if we have lightweight summaries
      const fullResults = await fetchAllFullDetails(filteredResults);
      fullResultsRef.current = fullResults;

      const baseTitle = scope === 'quiz'
        ? (fullResults[0]?.quizTitle || 'Quiz')
        : 'Profile Analysis';
      const subject = fullResults[0]?.subject || '';

      const wrongQs = fullResults.flatMap(r =>
        r.quizData
          .map((q, i) => ({ q, ua: r.userAnswers[i] }))
          .filter(({ q, ua }) => ua !== null && ua !== q.correctAnswer)
          .map(({ q, ua }) => ({
            question: q.question,
            correctAnswer: q.correctAnswer,
            userAnswer: ua || undefined,
            rationale: q.rationale,
          }))
      );

      if (wrongQs.length === 0) {
        const perfectMd = '## 🎉 Perfect Score!\n\nYou answered every question correctly. Amazing work — no revision needed!\n\n> Keep up the momentum and challenge yourself with harder quizzes.';
        revisionMdRef.current = perfectMd;
        const html = buildRevisionSheetHtml(perfectMd, { quizTitle: baseTitle, subject });
        openPreviewWithData('revision', html, `Revision Sheet — ${baseTitle}`);
        return;
      }

      // Check localStorage cache
      let markdownContent = '';
      const cacheKey = scope === 'quiz' && filteredResults.length === 1
        ? 'qmp_revision_' + filteredResults[0].timestamp
        : '';
      if (cacheKey) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) markdownContent = cached;
      }

      // Generate if not cached
      if (!markdownContent) {
        const data = await generateRevisionSheet({
          wrongQuestions: wrongQs,
          subject: subject || undefined,
          quizTitle: baseTitle || undefined,
        });
        markdownContent = data.revisionSheet;
        if (cacheKey) {
          try { localStorage.setItem(cacheKey, markdownContent); } catch { /* */ }
        }
      }

      revisionMdRef.current = markdownContent;
      const html = buildRevisionSheetHtml(markdownContent, { quizTitle: baseTitle, subject });
      openPreviewWithData('revision', html, `Revision Sheet — ${baseTitle}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate revision sheet.');
    } finally {
      setLoadingCard(null);
    }
  };

  // ── Toggle exam inline answers ────────────────────────────────────────────────
  const handleToggleExamAnswers = (val: boolean) => {
    setExamInlineAnswers(val);
    const res = fullResultsRef.current.length > 0 ? fullResultsRef.current : filteredResults;
    if (res.length && activeCard === 'exam') {
      const baseTitle = scope === 'quiz'
        ? (res[0]?.quizTitle || 'Quiz')
        : 'Profile Analysis';
      const html = buildExamPaperHtml(res, !val, false, reportOrder, val, rationaleCache, rationalePrefs, diffFilter);
      setPreviewHtml(html);
      setPreviewTitle(`Exam Paper — ${baseTitle}`);
    }
  };

  // ── Download (SmartPreviewModal path) ─────────────────────────────────────────
  const handleDownload = (fmt: ExportFormat, editedHtml?: string) => {
    if (downloadLoading) return;
    setDownloadLoading(true);
    requestAnimationFrame(() => {
      try {
        // Use full-detail results when available
        const fr = fullResultsRef.current.length > 0 ? fullResultsRef.current : filteredResults;
        const subject   = fr[0]?.subject || '';
        const titleBase = fr[0]?.quizTitle || 'Report';
        const subSuffix = subject ? `_${subject.replace(/[<>:"/\\|?*]/g, '')}` : '';
        const dateStr   = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        if (activeCard === 'notes') {
          const fname = `StudyNotes${subSuffix}_${dateStr}`;
          if (fmt === 'text') {
            exportTextReport(buildStudyNotesText(fr, rationaleCache, reportOrder, rationalePrefs, diffFilter), `${fname}.txt`);
          } else if (fmt === 'doc') {
            const html = editedHtml || buildStudyNotesHtml(fr, rationaleCache, false, reportOrder, rationalePrefs, false, diffFilter);
            exportSmartReport(wrapHtmlForWord(html, `Study Notes — ${titleBase}`), 'doc', `${fname}.doc`);
          } else {
            const html = editedHtml || buildStudyNotesHtml(fr, rationaleCache, fmt === 'pdf', reportOrder, rationalePrefs, false, diffFilter);
            exportSmartReport(html, fmt, `${fname}.pdf`);
          }
        } else if (activeCard === 'exam') {
          const fname = `ExamPaper${subSuffix}_${dateStr}`;
          if (fmt === 'text') {
            exportTextReport(buildExamPaperText(fr, true, reportOrder, diffFilter), `${fname}.txt`);
          } else if (fmt === 'doc') {
            const html = editedHtml || buildExamPaperHtml(fr, !examInlineAnswers, false, reportOrder, examInlineAnswers, rationaleCache, rationalePrefs, diffFilter);
            exportSmartReport(wrapHtmlForWord(html, `Exam Paper — ${titleBase}`), 'doc', `${fname}.doc`);
          } else {
            const html = editedHtml || buildExamPaperHtml(fr, !examInlineAnswers, fmt === 'pdf', reportOrder, examInlineAnswers, rationaleCache, rationalePrefs, diffFilter);
            exportSmartReport(html, fmt, `${fname}.pdf`);
          }
        } else {
          if (fmt === 'text') {
            const text = buildTextReport(fr, activeCard as QuestionFilter, rationaleCache, reportOrder, rationalePrefs, diffFilter);
            exportTextReport(text, getReportFilename(fr, 'text'));
          } else if (fmt === 'doc') {
            const docHtml = editedHtml || buildDocReport(fr, sections, activeCard as QuestionFilter, rationaleCache, reportOrder, rationalePrefs, false, diffFilter);
            exportSmartReport(docHtml, 'doc', getReportFilename(fr, 'doc'));
          } else {
            const html = editedHtml || buildSmartReportHtml(fr, sections, activeCard as QuestionFilter, rationaleCache, fmt === 'pdf', reportOrder, rationalePrefs, false, diffFilter);
            exportSmartReport(html, fmt, getReportFilename(fr, fmt));
          }
        }
      } catch (e: any) {
        toast.error(e?.message || 'Export failed.');
      } finally {
        setTimeout(() => setDownloadLoading(false), 300);
      }
    });
  };

  if (!results.length) return null;

  return (
    <>
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-lg mb-6">

        {/* ── Panel header ── */}
        <div
          className="px-5 py-4 border-b border-border"
          style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--accent) / 0.05))' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
                <Download className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-foreground tracking-tight">Download Reports</h3>
                <p className="text-[10px] text-foreground/40 mt-0.5 leading-relaxed">
                  Exam-paper layout · PDF · DOC · TXT
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <RationaleControlsButton
                  prefs={rationalePrefs}
                  onChange={onRationalePrefsChange}
                  reportHelper={reportHelper}
                  onReportHelperChange={onReportHelperChange}
                />
                <ReportOrderControls value={reportOrder} onChange={onOrderChange} />
              </div>
              <div className="flex items-center gap-2 pr-0.5">
                <span className="text-[9px] text-foreground/30 leading-none">
                  {rationaleStatusLabel} rationale
                </span>
                <span className="text-foreground/15 text-[9px]">·</span>
                <span className="text-[9px] text-foreground/30 leading-none">
                  {reportOrder === 'original' ? '📖 Book order' : '🎯 Attempt order'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5">
          {/* ── Collapsible Filters (hidden when controlled from profile) ── */}
          <div className={`mb-4 ${isControlled ? 'hidden' : ''}`}>
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className="w-full flex items-center justify-between py-2 group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[9px] font-black uppercase tracking-widest text-foreground/30 flex-shrink-0">🔖 Filters</span>
                {(selectedSubject || selectedUnit || diffFilter !== 'all') && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                )}
                <span className="text-[10px] font-bold text-foreground/40 truncate">
                  {isControlled
                    ? `${controlledSubject || 'All Subjects'}${controlledUnit ? ` · ${controlledUnit}` : ''}${controlledDiffFilter && controlledDiffFilter !== 'all' ? ` · ${controlledDiffFilter === 'easy' ? '🟢' : controlledDiffFilter === 'medium' ? '🟡' : '🔴'} ${controlledDiffFilter}` : ''}`
                    : `${selectedSubject || 'All Subjects'}${units.length > 1 ? ` · ${selectedUnit || 'All Units'}` : ''}${diffFilter !== 'all' ? ` · ${diffFilter === 'easy' ? '🟢' : diffFilter === 'medium' ? '🟡' : '🔴'} ${diffFilter}` : ''}`
                  }
                </span>
              </div>
              <span className={`text-foreground/25 text-xs transition-transform duration-200 flex-shrink-0 ${filtersOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${filtersOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="pt-2 space-y-3">
                {subjects.length > 0 && !isControlled && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-foreground/25 mb-2">🔖 Subject</p>
                    <div className="flex flex-wrap gap-1.5">
                      <FilterBtn active={!selectedSubject} onClick={() => setSelectedSubject(null)}>🌐 All</FilterBtn>
                      {subjects.map(s => (
                        <FilterBtn key={s} active={selectedSubject === s} onClick={() => setSelectedSubject(s)}>{s}</FilterBtn>
                      ))}
                    </div>
                  </div>
                )}
                {/* Difficulty Filter — only show when not controlled from profile */}
                {!isControlled && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-foreground/25 mb-2">🎯 Sort by Difficulty</p>
                    <div className="flex flex-wrap gap-1.5">
                      <FilterBtn active={diffFilter === 'all'} onClick={() => setDiffFilter('all')}>All</FilterBtn>
                      <FilterBtn active={diffFilter === 'easy'} onClick={() => setDiffFilter('easy')}>🟢 Easy</FilterBtn>
                      <FilterBtn active={diffFilter === 'medium'} onClick={() => setDiffFilter('medium')}>🟡 Medium</FilterBtn>
                      <FilterBtn active={diffFilter === 'hard'} onClick={() => setDiffFilter('hard')}>🔴 Hard</FilterBtn>
                    </div>
                  </div>
                )}
                {units.length > 1 && !isControlled && (
                  <div className="pl-3 border-l border-border">
                    <p className="text-[9px] font-black uppercase tracking-widest text-foreground/20 mb-2">📁 Unit / Topic</p>
                    <div className="flex flex-wrap gap-1.5">
                      <FilterBtn active={!selectedUnit} onClick={() => setSelectedUnit(null)} small>All Units</FilterBtn>
                      {units.map(u => (
                        <FilterBtn key={u} active={selectedUnit === u} onClick={() => setSelectedUnit(u)} small>
                          {u.length > 22 ? u.slice(0, 22) + '…' : u}
                        </FilterBtn>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active filters badge (controlled mode) with question breakdown */}
          {isControlled && (controlledSubject || controlledUnit || (controlledDiffFilter && controlledDiffFilter !== 'all')) && (
            <div className="flex items-center gap-2 p-2.5 mb-4 bg-primary/8 border border-primary/15 rounded-xl">
              <span className="text-[9px]">🔍</span>
              <p className="text-[10px] font-bold text-primary/70 flex-1 truncate">
                {[
                  controlledSubject || null,
                  controlledUnit || null,
                  controlledDiffFilter && controlledDiffFilter !== 'all' ? `${controlledDiffFilter === 'easy' ? '🟢' : controlledDiffFilter === 'medium' ? '🟡' : '🔴'} ${controlledDiffFilter}` : null,
                ].filter(Boolean).join(' · ')}
                {' · '}{counts.all}Q ({counts.correct}✓ {counts.wrong}✗ {counts.skipped}⏭)
              </p>
            </div>
          )}

          {/* ── Stats Row ── */}
          <div className="mb-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-foreground/30 mb-2">
              TAP TO PREVIEW REPORT ↓
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { v: counts.quizzes, l: 'QUIZZES', border: 'border-foreground/15', text: 'text-foreground',    type: 'all'     as ReportCardType },
                { v: counts.correct, l: 'CORRECT', border: 'border-emerald-500/25', text: 'text-emerald-500', type: 'correct' as ReportCardType },
                { v: counts.wrong,   l: 'WRONG',   border: 'border-red-500/25',     text: 'text-red-400',     type: 'wrong'   as ReportCardType },
                { v: counts.skipped, l: 'SKIPPED', border: 'border-amber-500/25',   text: 'text-amber-500',   type: 'skipped' as ReportCardType },
              ].map(({ v, l, border, text, type }) => (
                <button key={l} onClick={() => v > 0 && handlePreview(type)} disabled={v === 0}
                  className={`text-center py-2.5 rounded-xl border ${border} bg-foreground/[0.02] transition-all hover:bg-foreground/5 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}>
                  <div className={`text-lg font-black ${text}`}>{v}</div>
                  <div className="text-[8px] text-foreground/35 uppercase tracking-widest font-bold">{l}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Report Cards ── */}
          <div className="grid grid-cols-2 gap-2.5">
            {CARDS.map(({ type, label, description, Icon, accent, bgGlass, borderCls, iconBg }) => {
              const count     = cardCount(type);
              const isLoading = loadingCard === type;
              const isEmpty   = count === 0;

              return (
                <button
                  key={type}
                  onClick={() => !isEmpty && handlePreview(type)}
                  disabled={isLoading || isEmpty}
                  className={`
                    group relative flex flex-col p-3.5 rounded-xl border
                    ${bgGlass} ${borderCls}
                    hover:border-foreground/20 hover:bg-foreground/5
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-all duration-150 text-left active:scale-[0.97]
                  `}
                >
                  <div className="flex items-start justify-between mb-2.5">
                    <div className={`w-10 h-10 rounded-xl ${iconBg} border ${borderCls} flex items-center justify-center`}>
                      {isLoading ? <Loader2 className={`w-4 h-4 animate-spin ${accent}`} /> : <Icon className={`w-4 h-4 ${accent}`} />}
                    </div>
                    <span className={`text-[10px] font-black ${accent} px-2 py-0.5 rounded-md ${iconBg} border ${borderCls}`}>
                      {count}Q
                    </span>
                  </div>

                  <p className="text-sm font-black text-foreground leading-tight">{label}</p>
                  <p className="text-[10px] text-foreground/40 leading-snug mt-0.5 line-clamp-2">{description}</p>

                  <div className="flex items-center gap-1.5 mt-auto pt-3 border-t border-foreground/[0.06]">
                    <Eye className={`w-3.5 h-3.5 ${accent}`} />
                    <span className={`text-[11px] font-bold ${accent}`}>Preview & Download</span>
                    <ChevronRight className={`w-3 h-3 ${accent} opacity-50 ml-auto`} />
                  </div>
                </button>
              );
            })}
          </div>

          <QuickPdfButton results={fullResultsRef.current.length > 0 ? fullResultsRef.current : filteredResults} filter={activeCard as any} rationaleCache={rationaleCache} />

          <p className="text-[9px] text-foreground/25 text-center mt-3 leading-relaxed">
            Click any card to preview → choose <span className="text-foreground/45 font-black">PDF · DOC · TXT</span> format
          </p>
        </div>
      </div>

      <SmartPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={previewTitle}
        iframeHtml={previewHtml}
        loading={downloadLoading}
        onDownload={handleDownload}
        showAnswers={activeCard === 'exam' ? examInlineAnswers : true}
        showBookRat={rationalePrefs.showBook}
        showAiRat={rationalePrefs.showAi}
        onRegenerate={activeCard !== 'revision' ? (opts) => {
          const rPrefs = { showBook: opts.showBookRat, showAi: opts.showAiRat };
          const hideAns = !opts.showAnswers;
          const dfVal = opts.difficultyFilter || 'all';
          const res = fullResultsRef.current.length > 0 ? fullResultsRef.current : filteredResults;
          let newHtml: string;
          if (activeCard === 'exam') {
            setExamInlineAnswers(opts.showAnswers);
            newHtml = buildExamPaperHtml(res, !opts.showAnswers, false, reportOrder, opts.showAnswers, rationaleCache, rPrefs, dfVal);
          } else if (activeCard === 'notes') {
            newHtml = buildStudyNotesHtml(res, rationaleCache, false, reportOrder, rPrefs, hideAns, dfVal);
          } else {
            newHtml = buildSmartReportHtml(res, sections, activeCard as QuestionFilter, rationaleCache, false, reportOrder, rPrefs, hideAns, dfVal);
          }
          setPreviewHtml(newHtml);
        } : undefined}
        onExplainAll={activeCard !== 'revision' ? async (opts) => {
          const dfVal2 = opts.difficultyFilter || 'all';
          const res = fullResultsRef.current.length > 0 ? fullResultsRef.current : filteredResults;
          const questions = res.flatMap(r => r.quizData);
          const missing = questions.filter(q => !rationaleCache[q.question]);
          const batchSize = 3;
          for (let i = 0; i < missing.length; i += batchSize) {
            const batch = missing.slice(i, i + batchSize);
            const results2 = await Promise.allSettled(
              batch.map(q => explainQuestion({
                question: q.question,
                correctAnswer: q.correctAnswer,
                options: q.options,
                status: 'correct' as const,
              }))
            );
            results2.forEach((r2, j) => {
              if (r2.status === 'fulfilled') {
                rationaleCache[batch[j].question] = r2.value.rationale;
              }
            });
          }
          const rPrefs = { showBook: opts.showBookRat, showAi: true };
          const hideAns = !opts.showAnswers;
          let newHtml: string;
          if (activeCard === 'exam') {
            newHtml = buildExamPaperHtml(res, !opts.showAnswers, false, reportOrder, opts.showAnswers, rationaleCache, rPrefs, dfVal2);
          } else if (activeCard === 'notes') {
            newHtml = buildStudyNotesHtml(res, rationaleCache, false, reportOrder, rPrefs, hideAns, dfVal2);
          } else {
            newHtml = buildSmartReportHtml(res, sections, activeCard as QuestionFilter, rationaleCache, false, reportOrder, rPrefs, hideAns, dfVal2);
          }
          setPreviewHtml(newHtml);
        } : undefined}
      />
    </>
  );
}

// ─── Small helper component ───────────────────────────────────────────────────
function QuickPdfButton({ results, filter, rationaleCache }: { results: QuizResult[]; filter: string; rationaleCache: Record<string, string> }) {
  const [loading, setLoading] = useState(false);
  const handleGenerate = async () => {
    if (!results.length) { toast.error('No data to export.'); return; }
    setLoading(true);
    try {
      const payload = {
        results: results.map(r => ({
          quizTitle: r.quizTitle,
          subject: r.subject,
          percentage: r.percentage,
          netScore: r.netScore,
          maxScore: r.maxScore,
          correct: r.correct,
          wrong: r.wrong,
          skipped: r.skipped,
          totalQuestions: r.totalQuestions,
          accuracy: r.accuracy,
          gain: r.gain,
          penalty: r.penalty,
          timeTaken: r.timeTaken,
          timestamp: r.timestamp,
          passMark: r.passMark ?? 50,
          quizData: r.quizData.map(q => ({
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            difficulty: q.difficulty || 'medium',
            rationale: q.rationale,
            imageUrl: (q as any).imageUrl,
            questionType: q.questionType,
          })),
          userAnswers: r.userAnswers,
        })),
        filter: (['all', 'correct', 'wrong', 'skipped'].includes(filter) ? filter : 'all') as any,
        reportType: 'full' as const,
        rationaleCache,
        includeRationale: true,
      };
      const { url } = await generateReportPdf(payload);
      window.open(url, '_blank');
      toast.success('📄 PDF generated!');
    } catch (e: any) {
      toast.error(e?.message || 'PDF generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleGenerate}
      disabled={loading || !results.length}
      className="w-full mt-3 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border border-primary/25 bg-primary/8 hover:bg-primary/15 text-primary font-bold text-sm transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading
        ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…</>
        : <><FileDown className="w-4 h-4" /> Generate PDF Report (Server-side)</>}
    </button>
  );
}

function FilterBtn({
  active, onClick, children, small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        font-bold rounded-lg border transition-all leading-none
        ${small ? 'text-[10px] px-2.5 py-1' : 'text-xs px-3 py-1.5'}
        ${active
          ? 'bg-primary/15 border-primary/30 text-foreground'
          : 'bg-muted/30 border-border text-foreground/40 hover:text-foreground/70 hover:bg-muted/50'
        }
      `}
    >
      {children}
    </button>
  );
}
