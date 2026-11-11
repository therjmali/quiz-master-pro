import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, FileType2, Loader2, Minus, Plus, Share2, Sparkles, X, Code2, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageView, ensureFontFaces } from './PdfPages';
import type { ReportPreviewData } from './reportSession';
import { prepareReport } from '../../utils/reports/pdf/generate';
import { browserFontSource } from '../../utils/reports/pdf/browserFonts';
import { buildMarkdownDoc, buildQuestionDoc, reportFilename, styleFor, KIND_TITLES, type Difficulty } from '../../utils/reports/pdf/model';
import { htmlToBlocks } from '../../utils/reports/pdf/markdown';
import type { AnswerMode, LaidOutReport, ReportDoc, ReportKind, ReportStyle } from '../../utils/reports/pdf/types';
import { announceSaved, exportReportDoc, friendlyError, openSavedReportToast, shareSavedReportToast, type ExportFormat } from '../../utils/reports/exportReport';
import { useReportPrefs } from '../../utils/reports/reportPrefs';
import { shareSavedReport } from '../../platform/reportFiles';
import type { ReportFonts } from '../../utils/reports/pdf/reportFonts';

export type { ReportPreviewData } from './reportSession';

const TABS: { key: ReportKind; label: string; icon: string }[] = [
  { key: 'all', label: 'Full report', icon: '📊' }, { key: 'correct', label: 'Correct', icon: '✅' }, { key: 'wrong', label: 'Mistakes', icon: '❌' },
  { key: 'skipped', label: 'Skipped', icon: '⏭️' }, { key: 'notes', label: 'Study notes', icon: '📒' }, { key: 'exam', label: 'Exam paper', icon: '📝' }, { key: 'revision', label: 'Revision', icon: '✏️' },
];
const FORMATS: { fmt: ExportFormat; label: string; sub: string; Icon: typeof FileText }[] = [
  { fmt: 'pdf', label: 'PDF', sub: 'Best for printing and sharing', Icon: FileText },
  { fmt: 'doc', label: 'Word', sub: 'Editable .doc', Icon: FileType2 },
  { fmt: 'text', label: 'Plain text', sub: 'Copy into any app', Icon: FileText },
  { fmt: 'html', label: 'Web page', sub: 'Open in any browser', Icon: Code2 },
];
const ANSWER_LABEL: Record<AnswerMode, string> = { inline: 'Answers: after each', key: 'Answers: key at end', none: 'Answers: hidden' };
const NEXT_ANSWER: Record<AnswerMode, AnswerMode> = { inline: 'key', key: 'none', none: 'inline' };
const DIFFS: Difficulty[] = ['all', 'easy', 'medium', 'hard'];

interface Opts { kind: ReportKind; answers: AnswerMode | null; book: boolean; ai: boolean; difficulty: Difficulty; order: 'original' | 'attempt'; rev: number }
type Built = { status: 'loading' } | { status: 'error'; message: string } | { status: 'empty'; why: string } | { status: 'ready'; report: LaidOutReport; fonts: ReportFonts; doc: ReportDoc; style: ReportStyle };

const pill = (on: boolean) => `shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all active:scale-95 ${on ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-card/70 text-foreground/60'}`;

export default function ReportPreviewPage({ data, onBack }: { data: ReportPreviewData; onBack: () => void }) {
  const session = data.session;
  const [prefs, setPrefs] = useReportPrefs();
  const [opts, setOpts] = useState<Opts>({
    kind: session?.kind ?? 'custom', answers: null, book: session?.rationale.showBook ?? true, ai: session?.rationale.showAi ?? true,
    difficulty: session?.difficulty ?? 'all', order: session?.order ?? 'attempt', rev: 0,
  });
  const [built, setBuilt] = useState<Built>({ status: 'loading' });
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);
  const aiCancel = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(360);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;

  const patch = (p: Partial<Opts>) => setOpts(o => ({ ...o, ...p }));

  // ── build + lay out whenever an option changes ──
  useEffect(() => {
    let cancelled = false;
    setBuilt(b => (b.status === 'ready' ? b : { status: 'loading' }));
    const t = setTimeout(async () => {
      try {
        let doc: ReportDoc;
        if (session && opts.kind !== 'revision') {
          doc = buildQuestionDoc(session.results, { kind: opts.kind, order: opts.order, difficulty: opts.difficulty, rationale: { showBook: opts.book, showAi: opts.ai }, rationaleCache: session.rationaleCache, scope: session.scope });
          if (!doc.items?.length) { if (!cancelled) setBuilt({ status: 'empty', why: emptyWhy(opts.kind, session.results.some(r => r.quizData?.length)) }); return; }
        } else if (session) {
          if (!session.getRevisionMarkdown) { setBuilt({ status: 'empty', why: 'Revision sheets are not available here.' }); return; }
          const md = await session.getRevisionMarkdown();
          doc = buildMarkdownDoc('revision', `Revision Sheet — ${session.results[0]?.quizTitle || 'Profile Analysis'}`, md, [new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })]);
        } else {
          doc = { kind: 'custom', title: data.title, meta: [new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })], blocks: htmlToBlocks(data.html || '') };
          if (!doc.blocks?.length) { setBuilt({ status: 'empty', why: 'There is nothing to show in this report.' }); return; }
        }
        const base = styleFor(doc.kind, { columns: doc.blocks ? 1 : prefs.columns, fontSize: prefs.fontSize, paper: prefs.paper, brand: prefs.brand, showUserAnswer: prefs.showUserAnswer });
        const style: ReportStyle = { ...base, answers: opts.answers ?? base.answers };
        const { report, fonts } = await prepareReport(doc, style, browserFontSource);
        await ensureFontFaces(fonts.set.regular.concat(fonts.set.bold).map(f => f.id));
        if (!cancelled) { setBuilt({ status: 'ready', report, fonts, doc, style }); setPage(1); scroller.current?.scrollTo({ top: 0 }); }
      } catch (e) {
        if (!cancelled) setBuilt({ status: 'error', message: friendlyError(e) });
      }
    }, 140);
    return () => { cancelled = true; clearTimeout(t); };
  }, [opts, prefs.columns, prefs.fontSize, prefs.paper, prefs.brand, prefs.showUserAnswer, session, data.html, data.title]);

  // ── page width follows the screen; pinch to zoom ──
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el); setBoxW(el.clientWidth);
    let d0 = 0, z0 = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const start = (e: TouchEvent) => { if (e.touches.length === 2) { d0 = dist(e.touches); z0 = zoomRef.current; } };
    const move = (e: TouchEvent) => { if (e.touches.length === 2 && d0 > 0) { e.preventDefault(); setZoom(Math.min(3, Math.max(0.6, z0 * (dist(e.touches) / d0)))); } };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); };
  }, []);
  const fitWidth = Math.min(Math.max(boxW - 24, 240), 860);
  const pageWidth = Math.round(fitWidth * zoom);
  const onVisible = useCallback((i: number) => setPage(i + 1), []);
  const total = built.status === 'ready' ? built.report.pages.length : 0;
  const goto = (n: number) => {
    const el = scroller.current?.querySelector(`[data-page="${Math.min(Math.max(n, 1), total)}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── AI explanations (on-device keys) ──
  const missingAi = useMemo(() => (built.status === 'ready' && opts.ai && session?.getAiRationale ? (built.doc.items ?? []).filter(i => !i.ai?.trim()).length : 0), [built, opts.ai, session]);
  const generateAi = async () => {
    if (built.status !== 'ready' || !session?.getAiRationale) return;
    const todo = (built.doc.items ?? []).filter(i => !i.ai?.trim());
    aiCancel.current = false; setAiProgress({ done: 0, total: todo.length });
    let ok = 0, failed = 0;
    for (const it of todo) {
      if (aiCancel.current) break;
      try {
        const txt = await session.getAiRationale(it.question, it.correct[0] ?? '', it.user, it.status === 'unknown' ? 'skipped' : it.status, it.options);
        if (txt?.trim()) { session.rationaleCache[it.question] = txt.trim(); ok++; } else failed++;
      } catch (e) {
        failed++;
        const m = e instanceof Error ? e.message : '';
        if (/key|auth|offline|network|unavailable/i.test(m)) { toast.error(/key/i.test(m) ? 'Add an AI key in Settings → AI first.' : 'AI is not reachable right now. Try again when online.'); break; }
      }
      setAiProgress(p => (p ? { ...p, done: p.done + 1 } : p));
    }
    setAiProgress(null);
    if (ok) { toast.success(`Added ${ok} AI explanation${ok === 1 ? '' : 's'}`); patch({ rev: opts.rev + 1 }); }
    else if (failed && !aiCancel.current) toast.error('Could not create explanations.');
  };

  // ── export ──
  const nameFor = (ext: string) => (session ? reportFilename(opts.kind, session.results, ext) : `${data.title.replace(/[^\w\- ]+/g, '').trim().replace(/ +/g, '_') || 'Report'}.${ext}`);
  const doExport = async (fmt: ExportFormat, share = false) => {
    if (built.status !== 'ready' || busy) return;
    setMenu(false); setBusy(fmt === 'pdf' ? 'Building your PDF…' : 'Saving…');
    try {
      const saved = await exportReportDoc(built.doc, built.style, fmt, { filename: nameFor('x'), onStage: s => setBusy(s) });
      if (share) { if (!(await shareSavedReport(saved))) announceSaved(saved, openSavedReportToast, shareSavedReportToast); }
      else announceSaved(saved, openSavedReportToast, shareSavedReportToast);
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
  };

  const items = built.status === 'ready' ? built.doc.items : undefined;
  const showUserToggle = !!items && (opts.kind === 'all' || opts.kind === 'wrong');
  const answerMode = built.status === 'ready' ? built.style.answers : (opts.answers ?? 'inline');

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground animate-fade-in" style={{ paddingTop: 'var(--qmp-inset-top, 0px)' }} data-screen="report-preview">
      {/* top bar */}
      <header className="flex items-center gap-2 border-b border-border bg-card/80 px-3 py-2.5 backdrop-blur-xl">
        <button type="button" onClick={onBack} aria-label="Back" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-border bg-card text-foreground/70 active:scale-95"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-foreground/35">Report preview</p>
          <h2 className="truncate text-[15px] font-black leading-tight">{built.status === 'ready' ? built.doc.title : data.title}</h2>
        </div>
        {built.status === 'ready' && <span className="hidden shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-black text-foreground/55 min-[380px]:inline">{page}/{total}</span>}
        <button type="button" onClick={() => void doExport('pdf')} disabled={built.status !== 'ready' || !!busy} aria-label="Download PDF"
          className="flex h-10 items-center gap-1.5 rounded-2xl bg-primary px-3.5 text-[12px] font-black text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-95 disabled:opacity-40">
          <Download className="h-4 w-4" /> PDF
        </button>
        <button type="button" onClick={() => setMenu(true)} disabled={built.status !== 'ready' || !!busy} aria-label="More formats and share"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-border bg-card text-foreground/70 active:scale-95 disabled:opacity-40"><Share2 className="h-4 w-4" /></button>
      </header>

      {/* report type tabs */}
      {session && (
        <nav className="flex gap-1.5 overflow-x-auto border-b border-border bg-card/40 px-3 py-2 [scrollbar-width:none]" role="tablist" aria-label="Report type">
          {TABS.map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={opts.kind === t.key} onClick={() => patch({ kind: t.key, answers: null })}
              className={`shrink-0 whitespace-nowrap rounded-xl border px-3 py-2 text-[12px] font-black transition-all active:scale-95 ${opts.kind === t.key ? 'border-primary/40 bg-primary/15 text-primary' : 'border-transparent text-foreground/50'}`}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      )}

      {/* options */}
      {session && opts.kind !== 'revision' && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-border bg-background px-3 py-2 [scrollbar-width:none]" aria-label="Report options">
          <button type="button" className={pill(answerMode !== 'none')} onClick={() => patch({ answers: NEXT_ANSWER[answerMode] })}>{ANSWER_LABEL[answerMode]}</button>
          {showUserToggle && <button type="button" className={pill(prefs.showUserAnswer)} onClick={() => setPrefs({ showUserAnswer: !prefs.showUserAnswer })}>Your answer</button>}
          <button type="button" className={pill(opts.book)} onClick={() => { patch({ book: !opts.book }); session.onRationalePrefsChange?.({ showBook: !opts.book, showAi: opts.ai }); }}>📖 Book rationale</button>
          <button type="button" className={pill(opts.ai)} onClick={() => { patch({ ai: !opts.ai }); session.onRationalePrefsChange?.({ showBook: opts.book, showAi: !opts.ai }); }}>💡 AI rationale</button>
          <button type="button" className={pill(prefs.columns === 2)} onClick={() => setPrefs({ columns: prefs.columns === 2 ? 1 : 2 })}>{prefs.columns === 2 ? '2 columns' : '1 column'}</button>
          <button type="button" className={pill(false)} onClick={() => setPrefs({ fontSize: prefs.fontSize === 'sm' ? 'md' : prefs.fontSize === 'md' ? 'lg' : 'sm' })}>Text: {prefs.fontSize === 'sm' ? 'Small' : prefs.fontSize === 'md' ? 'Medium' : 'Large'}</button>
          <button type="button" className={pill(opts.difficulty !== 'all')} onClick={() => patch({ difficulty: DIFFS[(DIFFS.indexOf(opts.difficulty) + 1) % DIFFS.length] })}>Level: {opts.difficulty === 'all' ? 'All' : opts.difficulty[0].toUpperCase() + opts.difficulty.slice(1)}</button>
          <button type="button" className={pill(false)} onClick={() => { const o = opts.order === 'original' ? 'attempt' : 'original'; patch({ order: o }); session.onOrderChange?.(o); }}>Order: {opts.order === 'original' ? 'Book' : 'Attempt'}</button>
        </div>
      )}
      {missingAi > 0 && (
        <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/5 px-3 py-2 text-[11px]">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          {aiProgress ? (
            <>
              <span className="flex-1 font-bold">Writing AI explanations… {aiProgress.done}/{aiProgress.total}</span>
              <button type="button" onClick={() => { aiCancel.current = true; }} className="rounded-full border border-border px-3 py-1 font-bold">Stop</button>
            </>
          ) : (
            <>
              <span className="flex-1 text-foreground/70">{missingAi} question{missingAi === 1 ? ' has' : 's have'} no AI explanation yet.</span>
              <button type="button" onClick={() => void generateAi()} className="rounded-full bg-primary px-3 py-1.5 font-black text-primary-foreground active:scale-95">Generate</button>
            </>
          )}
        </div>
      )}

      {/* pages */}
      <main ref={scroller} className="relative min-h-0 flex-1 overflow-auto bg-muted/60 px-3 pb-28 pt-4 [overscroll-behavior:contain]" style={{ touchAction: 'pan-x pan-y' }}>
        {built.status === 'loading' && (
          <div className="mx-auto mt-6 flex max-w-sm flex-col items-center gap-3 text-center" role="status">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm font-bold">Laying out your report…</p>
            <div className="w-full animate-pulse rounded-[3px] bg-card shadow-lg" style={{ height: 380 }} />
          </div>
        )}
        {built.status === 'error' && (
          <div className="mx-auto mt-10 max-w-sm rounded-3xl border border-destructive/30 bg-destructive/10 p-5 text-center" role="alert">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive" />
            <p className="text-sm font-black">Could not build this report</p>
            <p className="mt-1 text-[12px] text-foreground/60">{built.message}</p>
            <button type="button" onClick={() => patch({ rev: opts.rev + 1 })} className="mt-3 rounded-2xl bg-primary px-4 py-2 text-[12px] font-black text-primary-foreground active:scale-95">Try again</button>
          </div>
        )}
        {built.status === 'empty' && (
          <div className="mx-auto mt-10 max-w-sm rounded-3xl border border-border bg-card p-6 text-center">
            <p className="text-3xl">🗂️</p>
            <p className="mt-2 text-sm font-black">Nothing to show here</p>
            <p className="mt-1 text-[12px] text-foreground/55">{built.why}</p>
            {session && opts.kind !== 'all' && <button type="button" onClick={() => patch({ kind: 'all', answers: null, difficulty: 'all' })} className="mt-3 rounded-2xl border border-border px-4 py-2 text-[12px] font-bold active:scale-95">Show full report</button>}
          </div>
        )}
        {built.status === 'ready' && (
          <div style={{ width: Math.max(pageWidth, 0), margin: '0 auto' }} data-testid="report-pages">
            {built.report.pages.map((p, i) => <PageView key={`${opts.rev}-${i}-${built.report.pages.length}`} page={p} set={built.fonts.set} width={pageWidth} index={i} onVisible={onVisible} />)}
          </div>
        )}
      </main>

      {/* floating page / zoom controls */}
      {built.status === 'ready' && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: 'calc(var(--qmp-inset-bottom, 0px) + 14px)' }}>
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card/90 p-1 shadow-2xl backdrop-blur-xl">
            <button type="button" aria-label="Previous page" onClick={() => goto(page - 1)} disabled={page <= 1} className="grid h-9 w-9 place-items-center rounded-full active:scale-90 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-[54px] text-center text-[12px] font-black tabular-nums" data-testid="page-indicator">{page} / {total}</span>
            <button type="button" aria-label="Next page" onClick={() => goto(page + 1)} disabled={page >= total} className="grid h-9 w-9 place-items-center rounded-full active:scale-90 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            <span className="mx-1 h-5 w-px bg-border" />
            <button type="button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.6, +(z - 0.2).toFixed(2)))} className="grid h-9 w-9 place-items-center rounded-full active:scale-90"><Minus className="h-4 w-4" /></button>
            <button type="button" aria-label="Fit to width" onClick={() => setZoom(1)} className="grid h-9 min-w-[44px] place-items-center rounded-full px-1 text-[11px] font-black active:scale-90">{zoom === 1 ? <Maximize2 className="h-3.5 w-3.5" /> : `${Math.round(zoom * 100)}%`}</button>
            <button type="button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(3, +(z + 0.2).toFixed(2)))} className="grid h-9 w-9 place-items-center rounded-full active:scale-90"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* formats sheet */}
      {menu && (
        <div className="absolute inset-0 z-10 flex items-end bg-black/50 backdrop-blur-sm" onClick={() => setMenu(false)} role="dialog" aria-modal="true" aria-label="Download or share">
          <div className="w-full rounded-t-3xl border-t border-border bg-card p-4 pb-6" style={{ paddingBottom: 'calc(var(--qmp-inset-bottom, 0px) + 20px)' }} onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-foreground/15" />
            <div className="mb-2 flex items-center justify-between"><h3 className="text-base font-black">Save or share</h3><button type="button" aria-label="Close" onClick={() => setMenu(false)} className="grid h-8 w-8 place-items-center rounded-full bg-foreground/5"><X className="h-4 w-4" /></button></div>
            <div className="space-y-2">
              {FORMATS.map(f => (
                <button key={f.fmt} type="button" onClick={() => void doExport(f.fmt)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background/60 p-3 text-left active:scale-[0.99]">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><f.Icon className="h-5 w-5" /></span>
                  <span className="flex-1"><span className="block text-sm font-black">{f.label}</span><span className="block text-[11px] text-foreground/50">{f.sub}</span></span>
                  <Download className="h-4 w-4 text-foreground/35" />
                </button>
              ))}
              <button type="button" onClick={() => void doExport('pdf', true)} className="flex w-full items-center gap-3 rounded-2xl bg-primary p-3 text-left text-primary-foreground active:scale-[0.99]">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20"><Share2 className="h-5 w-5" /></span>
                <span className="flex-1"><span className="block text-sm font-black">Share PDF</span><span className="block text-[11px] opacity-80">WhatsApp, Drive, e-mail…</span></span>
              </button>
            </div>
            <p className="mt-3 text-center text-[10px] text-foreground/40">Reports are created on your device and work offline. Saved to Downloads/R.J QUIZ on Android.</p>
          </div>
        </div>
      )}

      {busy && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="flex w-64 flex-col items-center gap-3 rounded-3xl border border-border bg-card p-6 shadow-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-center text-sm font-black">{busy}</p>
            <p className="text-center text-[11px] text-foreground/50">No internet needed</p>
          </div>
        </div>
      )}
    </div>
  );
}

function emptyWhy(kind: ReportKind, hasData: boolean): string {
  if (!hasData) return 'The question details for this quiz are not on this device, so a report cannot be built. Open the quiz once while online to cache it.';
  if (kind === 'wrong') return 'No mistakes match these options. Great work!';
  if (kind === 'skipped') return 'No skipped questions match these options.';
  if (kind === 'correct') return 'No correct answers match these options.';
  return 'No questions match the current level or filters. Try "Level: All".';
}

void KIND_TITLES;
