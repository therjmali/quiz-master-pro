import { useEffect, useMemo, useState } from 'react';
import { BarChart2, CheckSquare, ChevronRight, ClipboardList, Download, Eye, FileEdit, FileText, Loader2, Share2, SkipForward, BookOpen, XSquare } from 'lucide-react';
import { toast } from 'sonner';
import { generateRevisionSheet, explainQuestion } from 'zitejs/api';
import type { AIMode, QuizResult, RationalePrefs, ReportOrder } from '../../types/quiz';
import type { ReportKind } from '../../utils/reports/pdf/types';
import { buildQuestionDoc, KIND_TITLES, reportFilename, styleFor, type Difficulty } from '../../utils/reports/pdf/model';
import { loadReportPrefs } from '../../utils/reports/reportPrefs';
import { loadFullResults } from '../../utils/reports/loadFull';
import { announceSaved, exportReportDoc, friendlyError, openSavedReportToast, shareSavedReportToast } from '../../utils/reports/exportReport';
import { getRevisionCache, setRevisionCache } from '../../utils/revisionCache';
import { listSavedReports, openSavedReport, shareSavedReport, hasNativeReportSaver, type SavedReport } from '../../platform/reportFiles';
import RationaleControlsButton from '../RationaleControlsButton';
import ReportPreviewPage from './ReportPreviewPage';
import type { ReportPreviewData, ReportSession } from './reportSession';

export type { ReportPreviewData } from './reportSession';

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
  getAiRationale?: ReportSession['getAiRationale'];
  controlledSubject?: string | null;
  controlledUnit?: string | null;
  controlledDiffFilter?: Difficulty;
  onSubjectChange?: (v: string | null) => void;
  onUnitChange?: (v: string | null) => void;
  onDiffFilterChange?: (v: Difficulty) => void;
}

interface Card { type: ReportKind; label: string; desc: string; Icon: React.FC<{ className?: string }>; tone: string }
const CARDS: Card[] = [
  { type: 'all', label: 'Full Report', desc: 'Every question with answers, your choices and explanations', Icon: BarChart2, tone: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  { type: 'correct', label: 'Correct Answers', desc: 'Only what you got right', Icon: CheckSquare, tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { type: 'wrong', label: 'Mistakes', desc: 'Wrong answers to review and fix', Icon: XSquare, tone: 'text-red-400 bg-red-500/10 border-red-500/20' },
  { type: 'skipped', label: 'Skipped', desc: 'Questions you did not attempt', Icon: SkipForward, tone: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { type: 'notes', label: 'Study Notes', desc: 'Question, answer and explanation, ready to revise', Icon: BookOpen, tone: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  { type: 'exam', label: 'Exam Paper', desc: 'Clean paper with an answer key at the end', Icon: ClipboardList, tone: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
  { type: 'revision', label: 'Revision Sheet', desc: 'AI revision notes from your mistakes', Icon: FileEdit, tone: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
];
const DIFFS: { v: Difficulty; l: string }[] = [{ v: 'all', l: 'All levels' }, { v: 'easy', l: '🟢 Easy' }, { v: 'medium', l: '🟡 Medium' }, { v: 'hard', l: '🔴 Hard' }];

const when = (t: number) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const size = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

export default function ReportDownloadPanel({
  results, rationaleCache, scope = 'profile', reportOrder, onOrderChange, rationalePrefs, onRationalePrefsChange, reportHelper, onReportHelperChange,
  onOpenPreviewPage, getAiRationale, controlledSubject, controlledUnit, controlledDiffFilter, onDiffFilterChange,
}: Props) {
  const [diffLocal, setDiffLocal] = useState<Difficulty>('all');
  const difficulty = controlledDiffFilter ?? diffLocal;
  const setDifficulty = (d: Difficulty) => { if (onDiffFilterChange) onDiffFilterChange(d); else setDiffLocal(d); };
  const [busy, setBusy] = useState<{ type: ReportKind; mode: 'preview' | 'pdf' } | null>(null);
  const [local, setLocal] = useState<ReportPreviewData | null>(null);
  const [recent, setRecent] = useState<SavedReport[]>(() => listSavedReports().slice(0, 5));
  useEffect(() => {
    const on = () => setRecent(listSavedReports().slice(0, 5));
    window.addEventListener('qm:reports-changed', on);
    return () => window.removeEventListener('qm:reports-changed', on);
  }, []);

  const filtered = useMemo(() => results.filter(r => (!controlledSubject || r.subject === controlledSubject) && (!controlledUnit || r.quizTitle === controlledUnit)), [results, controlledSubject, controlledUnit]);
  const counts = useMemo(() => {
    const c = filtered.reduce((a, r) => ({ correct: a.correct + (r.correct || 0), wrong: a.wrong + (r.wrong || 0), skipped: a.skipped + (r.skipped || 0) }), { correct: 0, wrong: 0, skipped: 0 });
    return { all: c.correct + c.wrong + c.skipped, correct: c.correct, wrong: c.wrong, skipped: c.skipped, notes: c.correct + c.wrong + c.skipped, exam: c.correct + c.wrong + c.skipped, revision: c.wrong } as Record<ReportKind, number>;
  }, [filtered]);

  const makeSession = (full: QuizResult[], kind: ReportKind): ReportSession => {
    const subject = full[0]?.subject;
    const title = full.length === 1 ? full[0].quizTitle : undefined;
    return {
      scope, results: full, rationaleCache, kind, order: reportOrder, difficulty, rationale: rationalePrefs, onRationalePrefsChange, onOrderChange,
      getAiRationale: getAiRationale ?? (async (question, correctAnswer, userAnswer, status, options) => {
        const r = await explainQuestion({ question, correctAnswer, userAnswer: userAnswer ?? undefined, options, status });
        return r.rationale;
      }),
      getRevisionMarkdown: async () => {
        const wrong = full.flatMap(r => (r.quizData || []).map((q, i) => ({ q, ua: r.userAnswers?.[i] ?? null })).filter(x => x.ua && x.ua.trim() !== x.q.correctAnswer.trim())
          .map(x => ({ question: x.q.question, correctAnswer: x.q.correctAnswer, userAnswer: x.ua ?? undefined, rationale: x.q.rationale || rationaleCache[x.q.question] || undefined })));
        if (!wrong.length) return '## 🎉 Perfect Score!\n\nYou answered every question correctly. Amazing work — no revision needed!\n\n> Keep up the momentum and challenge yourself with harder quizzes.';
        const cacheKey = full.length === 1 ? full[0].timestamp : null;
        if (cacheKey) { const cached = await getRevisionCache(cacheKey); if (cached) return cached; }
        const data = await generateRevisionSheet({ wrongQuestions: wrong.slice(0, 40), subject: subject || undefined, quizTitle: title || undefined });
        if (cacheKey && data.revisionSheet) await setRevisionCache(cacheKey, data.revisionSheet).catch(() => undefined);
        return data.revisionSheet;
      },
    };
  };

  const prepare = async (type: ReportKind): Promise<QuizResult[] | null> => {
    if (!filtered.length) { toast.error('No quizzes match the current filters.'); return null; }
    const { results: full, missing } = await loadFullResults(filtered);
    if (!full.some(r => r.quizData?.length)) { toast.error('The questions of this quiz are not stored on this device. Open it once while online to cache it.'); return null; }
    if (missing > 0) toast.warning(`${missing} older quiz${missing === 1 ? '' : 'zes'} could not be loaded and ${missing === 1 ? 'was' : 'were'} left out.`);
    void type;
    return full.filter(r => r.quizData?.length);
  };

  const preview = async (type: ReportKind) => {
    if (busy) return;
    setBusy({ type, mode: 'preview' });
    try {
      const full = await prepare(type); if (!full) return;
      const base = scope === 'quiz' ? (full[0].quizTitle || 'Quiz') : 'Profile Analysis';
      const data: ReportPreviewData = { title: `${KIND_TITLES[type]} — ${base}`, session: makeSession(full, type) };
      if (onOpenPreviewPage) onOpenPreviewPage(data); else setLocal(data);
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
  };

  const quickPdf = async (type: ReportKind) => {
    if (busy) return;
    if (type === 'revision') { await preview(type); return; }
    setBusy({ type, mode: 'pdf' });
    const tid = toast.loading('Building PDF…');
    try {
      const full = await prepare(type); if (!full) return;
      const doc = buildQuestionDoc(full, { kind: type, order: reportOrder, difficulty, rationale: rationalePrefs, rationaleCache, scope });
      if (!doc.items?.length) { toast.error(type === 'wrong' ? 'No mistakes to put in a report. 🎉' : 'No questions match these options.'); return; }
      const prefs = loadReportPrefs();
      const saved = await exportReportDoc(doc, styleFor(type, prefs), 'pdf', { filename: reportFilename(type, full, 'pdf') });
      announceSaved(saved, openSavedReportToast, shareSavedReportToast);
    } catch (e) { toast.error(friendlyError(e)); } finally { toast.dismiss(tid); setBusy(null); }
  };

  const [showSaved, setShowSaved] = useState(false);
  const TILE: Record<ReportKind, { short: string; grad: string; ring: string; text: string }> = {
    all: { short: 'Full', grad: 'from-indigo-500/20 to-indigo-500/5', ring: 'border-indigo-500/30', text: 'text-indigo-500' },
    correct: { short: 'Correct', grad: 'from-emerald-500/20 to-emerald-500/5', ring: 'border-emerald-500/30', text: 'text-emerald-500' },
    wrong: { short: 'Mistakes', grad: 'from-red-500/20 to-red-500/5', ring: 'border-red-500/30', text: 'text-red-500' },
    skipped: { short: 'Skipped', grad: 'from-amber-500/20 to-amber-500/5', ring: 'border-amber-500/30', text: 'text-amber-500' },
    notes: { short: 'Notes', grad: 'from-purple-500/20 to-purple-500/5', ring: 'border-purple-500/30', text: 'text-purple-500' },
    exam: { short: 'Exam', grad: 'from-teal-500/20 to-teal-500/5', ring: 'border-teal-500/30', text: 'text-teal-500' },
    revision: { short: 'Revise', grad: 'from-orange-500/20 to-orange-500/5', ring: 'border-orange-500/30', text: 'text-orange-500' },
    custom: { short: 'Report', grad: 'from-slate-500/20 to-slate-500/5', ring: 'border-slate-500/30', text: 'text-slate-500' },
  };

  return (
    <section className="glass-card relative mb-4 overflow-hidden p-4" aria-label="Reports">
      <div className="pointer-events-none absolute -left-10 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-foreground/35">Reports &amp; downloads</p>
          <h3 className="text-lg font-black leading-tight text-foreground">Download your report</h3>
        </div>
        <RationaleControlsButton prefs={rationalePrefs} onChange={onRationalePrefsChange} reportHelper={reportHelper} onReportHelperChange={onReportHelperChange} />
      </div>
      <p className="relative mt-0.5 whitespace-nowrap text-[11px] text-foreground/50" data-testid="reports-subtitle">Made on your device. Works offline. Saved to Downloads.</p>

      {/* filters: one straight, swipeable capsule line */}
      <div className="qmp-capsules relative mt-3" data-testid="report-filters">
        <button type="button" className="qmp-capsule" aria-pressed={reportOrder === 'original'} onClick={() => onOrderChange('original')}>📖 Book order</button>
        <button type="button" className="qmp-capsule" aria-pressed={reportOrder === 'attempt'} onClick={() => onOrderChange('attempt')}>🎯 Attempt order</button>
        {DIFFS.map(d => (
          <button key={d.v} type="button" className={`qmp-capsule ${d.v === 'all' ? '' : 'qmp-capsule--emoji'}`} aria-pressed={difficulty === d.v} aria-label={d.l} title={d.l} onClick={() => setDifficulty(d.v)}>
            {d.v === 'all' ? 'All levels' : d.l.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* compact grid: two straight lines of squircle tiles */}
      <div className="relative mt-3 grid grid-cols-4 gap-2" role="list" data-testid="report-grid">
        {CARDS.map(c => {
          const t = TILE[c.type];
          const n = counts[c.type] ?? 0;
          const disabled = !!busy || filtered.length === 0;
          const isBusy = busy?.type === c.type;
          return (
            <div key={c.type} role="listitem" className={`relative rounded-[22px] border bg-gradient-to-b ${t.grad} ${t.ring} shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]`}>
              <button type="button" onClick={() => void preview(c.type)} disabled={disabled} aria-label={`Preview ${c.label}`} title={c.desc}
                className="flex h-[84px] w-full flex-col items-center justify-center gap-1 rounded-[22px] px-1 pt-1 active:scale-95 disabled:opacity-45 transition-transform">
                {isBusy && busy?.mode === 'preview' ? <Loader2 className={`h-5 w-5 animate-spin ${t.text}`} /> : <c.Icon className={`h-5 w-5 ${t.text}`} />}
                <span className="text-[11px] font-black leading-none text-foreground">{t.short}</span>
                <span className="h-3 text-[9px] font-bold leading-none text-foreground/45">{difficulty === 'all' && n > 0 && c.type !== 'revision' ? n : ''}</span>
              </button>
              <button type="button" onClick={() => void quickPdf(c.type)} disabled={disabled} aria-label={c.type === 'revision' ? `Open ${c.label}` : `Download ${c.label} as PDF`}
                style={{ minHeight: 0, minWidth: 0 }} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-md active:scale-90 disabled:opacity-40">
                {isBusy && busy?.mode === 'pdf' ? <Loader2 className="h-3 w-3 animate-spin" /> : c.type === 'revision' ? <Eye className="h-3 w-3" /> : <Download className="h-3 w-3" />}
              </button>
            </div>
          );
        })}
        <div role="listitem" className="relative rounded-[22px] border border-border bg-gradient-to-b from-foreground/[0.06] to-foreground/[0.02]">
          <button type="button" onClick={() => setShowSaved(v => !v)} aria-pressed={showSaved} aria-label="Recently saved reports"
            className="flex h-[84px] w-full flex-col items-center justify-center gap-1 rounded-[22px] px-1 pt-1 active:scale-95 transition-transform">
            <FileText className="h-5 w-5 text-foreground/60" />
            <span className="text-[11px] font-black leading-none text-foreground">Saved</span>
            <span className="h-3 text-[9px] font-bold leading-none text-foreground/45">{recent.length || ''}</span>
          </button>
        </div>
      </div>

      {showSaved && (
        <div className="relative mt-3">
          {recent.length === 0 ? <p className="rounded-xl border border-border bg-card/50 px-3 py-3 text-center text-[12px] text-foreground/45">Reports you download appear here.</p> : (
            <ul className="space-y-1.5">
              {recent.map(r => (
                <li key={r.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-card/50 px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-bold text-foreground">{r.name}</span><span className="block text-[10px] text-foreground/40">{when(r.savedAt)} · {size(r.size)}{r.pages ? ` · ${r.pages} pages` : ''}</span></span>
                  {hasNativeReportSaver() && r.uri && (
                    <>
                      <button type="button" aria-label={`Open ${r.name}`} onClick={async () => { if (!(await openSavedReport(r))) toast.error('No app can open this file, or it was moved. Try Share.'); }} className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold active:scale-95">Open</button>
                      <button type="button" aria-label={`Share ${r.name}`} onClick={() => void shareSavedReport(r)} className="grid h-7 w-7 place-items-center rounded-lg border border-border active:scale-95"><Share2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {local && <ReportPreviewPage data={local} onBack={() => setLocal(null)} />}
    </section>
  );
}
