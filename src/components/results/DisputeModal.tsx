import { useMemo, useState } from 'react';
import { Check, Loader2, Plus, Scale, Shield, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { QuizQuestion, QuizResult } from '../../types/quiz';
import Overlay, { OverlayBody, OverlayFooter, OverlayHeader } from '../ui/Overlay';
import { verifyQuestion } from 'zitejs/api';
import { saveDispute, getDispute, type DisputeRecord } from '../../utils/disputes';
import { MAX_OPTIONS, isEffectiveEdit, previewFix, validateEdit, type QuestionEdit } from '../../utils/questionFix';
import { announceFix, useQuestionFixApi } from '../../hooks/useQuestionFix';
import { hapticTap } from '../../utils/haptics';

interface Props {
  question: QuizQuestion;
  userAnswer?: string | null;
  /** which attempt / position the card belongs to (lets "this attempt only" and the score preview work) */
  resultKey?: string;
  index?: number;
  /** the full attempt when it is at hand (quiz dashboard): enables the exact score preview */
  result?: QuizResult;
  onClose: () => void;
}

type Tab = 'answer' | 'edit' | 'ai';
const LETTERS = 'ABCDEFGH';
const STATUS = {
  correct: { label: 'Correct', icon: '✅', cls: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
  wrong: { label: 'Wrong', icon: '❌', cls: 'border-red-500/35 bg-red-500/12 text-red-700 dark:text-red-300' },
  skipped: { label: 'Skipped', icon: '⏭️', cls: 'border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300' },
} as const;

/**
 * Dispute & fix: pick the right answer, edit the question text / options / rationale, or let the AI check it.
 * Saving re-scores the attempt (status, marks, percentage, reports) and, by default, every other attempt, saved quiz,
 * bookmark and mistake that holds the same question. A corrected question can be restored to the original.
 */
export default function DisputeModal({ question, userAnswer = null, resultKey, index, result, onClose }: Props) {
  const fix = useQuestionFixApi();
  const multi = (question.correctAnswers?.length ?? 0) > 1;
  const initialCorrect = useMemo(() => {
    const keys = multi ? question.correctAnswers! : [question.correctAnswer];
    return question.options.map((o, i) => (keys.some(k => k.trim().toLowerCase() === o.trim().toLowerCase()) ? i : -1)).filter(i => i >= 0);
  }, [question, multi]);

  const [tab, setTab] = useState<Tab>('answer');
  const [text, setText] = useState(question.question);
  const [options, setOptions] = useState<string[]>(() => [...question.options]);
  const [correctIdx, setCorrectIdx] = useState<number[]>(initialCorrect);
  const [rationale, setRationale] = useState(question.rationale || '');
  const [difficulty, setDifficulty] = useState<QuizQuestion['difficulty']>(question.difficulty);
  const [everywhere, setEverywhere] = useState(true);
  const [usedAi, setUsedAi] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI check
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [verdict, setVerdict] = useState<DisputeRecord | null>(() => getDispute(question.question) ?? null);
  const [error, setError] = useState<string | null>(null);

  const keyIdx = initialCorrect;
  const youIdx = userAnswer === null || userAnswer === undefined ? -1 : question.options.findIndex(o => o === userAnswer);
  const aiIdx = verdict?.suggestedAnswer ? options.findIndex(o => o.trim().toLowerCase() === verdict.suggestedAnswer!.trim().toLowerCase()) : -1;

  // what the owner changed (only changed fields go into the edit)
  const edit = useMemo<QuestionEdit>(() => {
    const e: QuestionEdit = {};
    if (text.trim() !== question.question.trim()) e.question = text;
    if (options.length !== question.options.length || options.some((o, i) => o.trim() !== question.options[i].trim())) e.options = options;
    const answers = correctIdx.filter(i => i < options.length).sort((a, b) => a - b).map(i => options[i]);
    if (multi || answers.length > 1) e.correctAnswers = answers;
    else if (answers.length === 1) e.correctAnswer = answers[0];
    else e.correctAnswer = '';
    if (rationale.trim() !== (question.rationale || '').trim()) e.rationale = rationale;
    if (difficulty !== question.difficulty) e.difficulty = difficulty;
    return e;
  }, [text, options, correctIdx, rationale, difficulty, question, multi]);

  const errors = useMemo(() => validateEdit(question, edit), [question, edit]);
  const changed = useMemo(() => isEffectiveEdit(question, edit), [question, edit]);
  const preview = useMemo(() => {
    const keyAfter = (edit.correctAnswers ?? (edit.correctAnswer ? [edit.correctAnswer] : [question.correctAnswer])).map(a => a.trim().toLowerCase());
    const mapped = userAnswer === null || userAnswer === undefined ? null : (options[question.options.findIndex(o => o === userAnswer)] ?? userAnswer);
    const before: 'correct' | 'wrong' | 'skipped' = userAnswer === null || userAnswer === undefined ? 'skipped' : (userAnswer === question.correctAnswer || !!question.correctAnswers?.includes(userAnswer)) ? 'correct' : 'wrong';
    const after: 'correct' | 'wrong' | 'skipped' = mapped === null ? 'skipped' : keyAfter.includes(mapped.trim().toLowerCase()) ? 'correct' : 'wrong';
    const exact = result && index !== undefined && errors.length === 0 ? previewFix(result, index, edit) : null;
    return { before, after, score: exact && exact.ok ? exact : null };
  }, [edit, question, userAnswer, options, result, index, errors.length]);

  const pickCorrect = (i: number) => {
    hapticTap();
    setUsedAi(false);
    setCorrectIdx(prev => multi ? (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]) : [i]);
  };

  const useAiAnswer = () => {
    if (aiIdx < 0) return;
    hapticTap(); setCorrectIdx([aiIdx]); setUsedAi(true); setTab('answer');
  };

  const runAi = async () => {
    setLoading(true); setError(null);
    try {
      const data = await verifyQuestion({ question: question.question, options: question.options, markedCorrectAnswer: question.correctAnswer, disputeReason: reason || undefined });
      const record = saveDispute(question.question, { verdict: data.verdict, verdictText: data.verdictText, confidence: data.confidence, suggestedAnswer: data.suggestedAnswer, reason, timestamp: Date.now() });
      setVerdict(record);
      if (data.verdict === 'confirmed') toast.success('✅ The answer key looks right'); else if (data.verdict === 'disputed') toast('⚠️ The answer key is disputed'); else toast.error('❌ The answer key may be wrong');
    } catch (e: any) {
      const msg = e?.message || 'AI check failed. Please try again.';
      setError(msg); toast.error(String(msg).slice(0, 80));
    } finally { setLoading(false); }
  };

  const save = async (revert = false) => {
    if (!fix || saving) return;
    setSaving(true);
    try {
      const summary = await fix({
        questionText: question.question,
        options: question.options,
        change: revert ? { revert: true } : { edit, by: usedAi ? 'ai' : 'user' },
        scope: everywhere ? 'all' : 'this', resultKey, index,
      });
      if (summary.questions === 0 && summary.libraryFiles + summary.bookmarks + summary.mistakes === 0) toast('Nothing changed');
      else announceFix(summary, revert);
      onClose();
    } catch (e: any) {
      toast.error(String(e?.message || 'Could not save the correction').slice(0, 90));
      setSaving(false);
    }
  };

  const verdictCls = verdict?.verdict === 'confirmed' ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
    : verdict?.verdict === 'disputed' ? 'border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300' : 'border-red-500/30 bg-red-500/12 text-red-700 dark:text-red-300';
  const canSave = !!fix && changed && errors.length === 0 && !saving;

  return (
    <Overlay open onClose={onClose} kind="sheet" label="Dispute and fix this question" hideClose className="qmp-fix-panel">
      <div className="flex min-h-0 flex-1 flex-col" data-testid="fix-sheet">
        <OverlayHeader title="Dispute & fix" subtitle={question.fix ? '✏️ Corrected before · you can undo' : 'Correct the answer or edit the question'} icon={<Scale className="h-4 w-4" />} onClose={onClose} />

        <div className="px-4 pt-3">
          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-foreground/[0.05] p-1" role="tablist" aria-label="Dispute sections">
            {([['answer', '✅ Answer'], ['edit', '✏️ Edit'], ['ai', '🤖 AI check']] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} data-testid={`fix-tab-${k}`} onClick={() => setTab(k)}
                className={`rounded-xl px-2 py-2 text-xs font-black transition-all active:scale-95 ${tab === k ? 'bg-foreground text-background shadow' : 'text-foreground/60'}`}>{label}</button>
            ))}
          </div>
        </div>

        <OverlayBody padded={false} className="qmp-fix-body">
          <div className="space-y-3 px-4 py-3">
            {tab !== 'edit' && (
              <p className="text-[0.95rem] font-semibold leading-relaxed text-foreground" data-testid="fix-question">{text}</p>
            )}

            {tab === 'answer' && (
              <>
                <p className="text-[11px] font-bold text-foreground/55">{multi ? 'Tick every correct answer.' : 'Tap the option that is really correct.'}</p>
                <ul className="space-y-2" data-testid="fix-options">
                  {options.map((o, i) => {
                    const on = correctIdx.includes(i);
                    return (
                      <li key={i}>
                        <button type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={on} data-testid={`fix-option-${i}`} data-correct={on}
                          onClick={() => pickCorrect(i)}
                          className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all active:scale-[0.985] ${on ? 'border-emerald-500/60 bg-emerald-500/12 ring-2 ring-emerald-500/25' : 'border-border bg-foreground/[0.03]'}`}>
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-black ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-border text-foreground/55'}`}>{on ? <Check className="h-4 w-4" aria-hidden /> : LETTERS[i]}</span>
                          <span className="min-w-0 flex-1 break-words text-[0.95rem] font-bold text-foreground">{o}</span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            {keyIdx.includes(i) && <span className="rounded-md border border-border bg-foreground/[0.06] px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-foreground/60">Key</span>}
                            {youIdx === i && <span className="rounded-md border border-indigo-500/35 bg-indigo-500/12 px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-300">You</span>}
                            {aiIdx === i && <span className="rounded-md border border-violet-500/35 bg-violet-500/12 px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-300">AI</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {aiIdx >= 0 && !correctIdx.includes(aiIdx) && (
                  <button type="button" onClick={useAiAnswer} data-testid="fix-use-ai" className="flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-500/35 bg-violet-500/12 py-2.5 text-xs font-black text-violet-700 active:scale-[0.98] dark:text-violet-300">
                    <Sparkles className="h-4 w-4" aria-hidden /> Use the AI's answer ({LETTERS[aiIdx]})
                  </button>
                )}
                {changed && errors.length === 0 && (
                  <div className="rounded-2xl border border-border bg-foreground/[0.04] p-3" data-testid="fix-preview">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45">What will change</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold">
                      <span className={`rounded-full border px-2.5 py-1 ${STATUS[preview.before].cls}`}>{STATUS[preview.before].icon} {STATUS[preview.before].label}</span>
                      <span aria-hidden className="text-foreground/40">→</span>
                      <span className={`rounded-full border px-2.5 py-1 ${STATUS[preview.after].cls}`} data-testid="fix-status-after">{STATUS[preview.after].icon} {STATUS[preview.after].label}</span>
                      {preview.before !== preview.after && <span className="text-[11px] text-foreground/55">moves to the {STATUS[preview.after].label} list</span>}
                    </div>
                    {preview.score && preview.score.before.netScore !== preview.score.after.netScore && (
                      <p className="mt-2 text-xs font-bold text-foreground/75" data-testid="fix-score-preview">
                        Score <span className="tabular-nums">{preview.score.before.netScore}</span> → <span className="tabular-nums text-foreground">{preview.score.after.netScore}</span>
                        <span className="ml-1 text-foreground/50">· {preview.score.before.percentage}% → {preview.score.after.percentage}%</span>
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {tab === 'edit' && (
              <div className="space-y-3" data-testid="fix-edit">
                <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45">Question
                  <textarea value={text} onChange={e => setText(e.target.value)} rows={3} data-testid="fix-edit-question"
                    className="mt-1 w-full resize-none rounded-2xl border border-border bg-foreground/[0.04] px-3 py-2.5 text-[0.95rem] font-semibold normal-case tracking-normal text-foreground outline-none focus:border-primary/50" />
                </label>
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45">Options <span className="font-bold normal-case tracking-normal text-foreground/35">· the green circle marks the correct one</span></p>
                  <ul className="space-y-2">
                    {options.map((o, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <button type="button" onClick={() => pickCorrect(i)} aria-label={`Mark option ${LETTERS[i]} as correct`} aria-pressed={correctIdx.includes(i)}
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-black ${correctIdx.includes(i) ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-border text-foreground/55'}`}>{correctIdx.includes(i) ? <Check className="h-4 w-4" aria-hidden /> : LETTERS[i]}</button>
                        <input value={o} onChange={e => setOptions(prev => prev.map((x, j) => (j === i ? e.target.value : x)))} data-testid={`fix-edit-option-${i}`} aria-label={`Option ${LETTERS[i]}`}
                          className="min-w-0 flex-1 rounded-xl border border-border bg-foreground/[0.04] px-3 py-2.5 text-[0.95rem] font-semibold text-foreground outline-none focus:border-primary/50" />
                        <button type="button" disabled={options.length <= 2} aria-label={`Remove option ${LETTERS[i]}`} data-testid={`fix-remove-option-${i}`}
                          onClick={() => { setOptions(prev => prev.filter((_, j) => j !== i)); setCorrectIdx(prev => prev.filter(x => x !== i).map(x => (x > i ? x - 1 : x))); }}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-foreground/50 disabled:opacity-30"><Trash2 className="h-4 w-4" aria-hidden /></button>
                      </li>
                    ))}
                  </ul>
                  {options.length < MAX_OPTIONS && (
                    <button type="button" onClick={() => setOptions(prev => [...prev, ''])} data-testid="fix-add-option"
                      className="mt-2 flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-bold text-foreground/65 active:scale-95"><Plus className="h-3.5 w-3.5" aria-hidden /> Add option</button>
                  )}
                </div>
                <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45">Explanation (rationale)
                  <textarea value={rationale} onChange={e => setRationale(e.target.value)} rows={3} data-testid="fix-edit-rationale"
                    className="mt-1 w-full resize-none rounded-2xl border border-border bg-foreground/[0.04] px-3 py-2.5 text-[0.95rem] font-medium normal-case tracking-normal text-foreground outline-none focus:border-primary/50" />
                </label>
                <div role="radiogroup" aria-label="Difficulty" className="flex items-center gap-1.5">
                  {(['easy', 'medium', 'hard'] as const).map(d => (
                    <button key={d} type="button" role="radio" aria-checked={difficulty === d} onClick={() => setDifficulty(d)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold ${difficulty === d ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-foreground/60'}`}>{d === 'easy' ? '🟢 Easy' : d === 'medium' ? '🟡 Medium' : '🔴 Hard'}</button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'ai' && (
              <div className="space-y-3" data-testid="fix-ai">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-foreground/60">
                  <span className="rounded-md border border-border bg-foreground/[0.05] px-2 py-1">Key: {keyIdx.map(i => `${LETTERS[i]}) ${question.options[i]}`).join(', ') || question.correctAnswer}</span>
                </div>
                {!verdict ? (
                  <>
                    <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Why do you think the key is wrong? (optional)"
                      className="w-full resize-none rounded-2xl border border-border bg-foreground/[0.04] px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-foreground/35 focus:border-primary/50" />
                    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-xs font-bold text-destructive/85">{error}</p>}
                    <button type="button" onClick={runAi} disabled={loading} data-testid="fix-run-ai"
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-black text-primary-foreground active:scale-[0.98] disabled:opacity-50">
                      {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</> : <><Shield className="h-4 w-4" /> {error ? 'Retry AI check' : 'Ask AI to check the key'}</>}
                    </button>
                  </>
                ) : (
                  <div className={`rounded-2xl border p-4 ${verdictCls}`} data-testid="fix-verdict">
                    <div className="mb-2 flex items-center gap-2"><span className="text-xl">{verdict.verdict === 'confirmed' ? '✅' : verdict.verdict === 'disputed' ? '⚠️' : '❌'}</span><span className="text-sm font-black capitalize">{verdict.verdict}</span><span className="ml-auto text-xs font-bold opacity-70">{verdict.confidence}% confident</span></div>
                    <p className="text-sm leading-relaxed opacity-90">{verdict.verdictText}</p>
                    {verdict.suggestedAnswer && <p className="mt-3 border-t border-current/15 pt-2.5 text-xs font-bold">Suggested answer: <span className="underline">{verdict.suggestedAnswer}</span></p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {aiIdx >= 0 && !correctIdx.includes(aiIdx) && <button type="button" onClick={useAiAnswer} className="rounded-full bg-foreground px-4 py-2 text-xs font-black text-background active:scale-95">Use this answer</button>}
                      <button type="button" onClick={() => setVerdict(null)} className="rounded-full border border-current/30 px-4 py-2 text-xs font-bold active:scale-95">Check again</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {errors.length > 0 && tab !== 'ai' && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-700 dark:text-red-300" role="alert" data-testid="fix-error">{errors[0]}</p>}
          </div>
        </OverlayBody>

        <OverlayFooter className="flex-col items-stretch gap-2">
          {fix && (
            <label className="flex items-start gap-2.5 text-[11px] font-semibold leading-snug text-foreground/65">
              <input type="checkbox" checked={everywhere} onChange={e => setEverywhere(e.target.checked)} data-testid="fix-everywhere" className="mt-0.5 h-4 w-4 accent-primary" />
              <span><b className="text-foreground">Apply everywhere</b> — every attempt of this question, your saved quizzes, bookmarks and mistakes list. Untick to change only this attempt.</span>
            </label>
          )}
          <div className="flex items-center justify-between gap-2">
            {fix && question.fix ? (
              <button type="button" onClick={() => save(true)} disabled={saving} data-testid="fix-revert" className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-bold text-foreground/70 active:scale-95 disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" aria-hidden /> Restore original</button>
            ) : <button type="button" onClick={onClose} className="rounded-full border border-border px-4 py-2 text-xs font-bold text-foreground/70 active:scale-95">Cancel</button>}
            {fix
              ? <button type="button" onClick={() => save(false)} disabled={!canSave} data-testid="fix-save" className="rounded-full bg-foreground px-5 py-2.5 text-xs font-black text-background active:scale-95 disabled:opacity-35">{saving ? 'Saving…' : 'Save & re-score'}</button>
              : <button type="button" onClick={onClose} className="rounded-full bg-foreground px-5 py-2.5 text-xs font-black text-background active:scale-95">Done</button>}
          </div>
        </OverlayFooter>
      </div>
    </Overlay>
  );
}
