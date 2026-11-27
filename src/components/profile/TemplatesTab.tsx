import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, Pencil, Plus, RotateCcw, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Overlay, { OverlayBody, OverlayFooter, OverlayHeader } from '../ui/Overlay';
import { Segmented, Toggle } from './settings/controls';
import { hapticTap } from '../../utils/haptics';
import {
  MAX_TEMPLATES, TEMPLATES_EVENT, deleteTemplate, describeRules, duplicateTemplate, getTemplates, loadTemplateStore, moveTemplate,
  restoreFactoryTemplates, sanitizeRules, saveTemplate, setDefaultTemplate, templateDescription, totalSecondsFor,
  type QuizTemplate, type TemplateRules, type TimerKind,
} from '../../utils/quizTemplates';

const EMOJIS = ['🧭', '🎯', '🏥', '📝', '⚡', '🔥', '📚', '🧠', '⏱️', '🏆', '🩺', '💊'];

type Rationale = 'keep' | 'both' | 'book' | 'ai' | 'none';
const ratOf = (r: TemplateRules['rationale']): Rationale => (!r ? 'keep' : r.showBook && r.showAi ? 'both' : r.showBook ? 'book' : r.showAi ? 'ai' : 'none');
const ratTo = (v: Rationale): TemplateRules['rationale'] => (v === 'keep' ? null : { showBook: v === 'both' || v === 'book', showAi: v === 'both' || v === 'ai' });

interface Draft { id?: string; emoji: string; name: string; desc: string; rules: TemplateRules }
const blank = (): Draft => ({ emoji: '📝', name: '', desc: '', rules: sanitizeRules({ style: 'submit', timer: 'scaled', minutesPerQuestion: 1 }) });
const toDraft = (t: QuizTemplate): Draft => ({ id: t.id, emoji: t.emoji, name: t.name, desc: t.desc, rules: sanitizeRules(t.rules) });

/** A number box that keeps what you type (even an empty box or "0.") and only commits a valid number. */
function NumberField({ value, onCommit, min, max, step = 1, label, suffix, testId }: { value: number; onCommit: (n: number) => void; min: number; max: number; step?: number; label: string; suffix?: string; testId?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <label className="flex items-center gap-2 rounded-xl border border-border bg-foreground/[0.04] px-3 py-2 text-xs font-bold text-foreground/60">
      <span className="min-w-0 flex-1">{label}</span>
      <input type="number" inputMode="decimal" value={text} min={min} max={max} step={step} data-testid={testId} aria-label={label}
        onChange={e => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) onCommit(n); }}
        onBlur={() => setText(String(value))}
        className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-right text-sm font-black tabular-nums text-foreground outline-none focus:border-primary/50" />
      {suffix && <span className="w-9 shrink-0 text-[11px] text-foreground/45">{suffix}</span>}
    </label>
  );
}

function Editor({ draft: initial, onClose }: { draft: Draft; onClose: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const r = d.rules;
  const set = (patch: Partial<TemplateRules>) => setD(prev => ({ ...prev, rules: sanitizeRules({ ...prev.rules, ...patch }) }));
  const nameOk = d.name.trim().length > 0;
  const example = r.timer === 'scaled' ? `50 questions → ${Math.round(totalSecondsFor(r, 50) / 60 * 100) / 100} min` : null;

  const save = () => {
    if (!nameOk) return;
    try {
      saveTemplate({ id: d.id, emoji: d.emoji, name: d.name, desc: d.desc, rules: r });
      toast.success(d.id ? '✅ Template saved' : '✅ Template created');
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save the template'); }
  };

  return (
    <Overlay open onClose={onClose} kind="sheet" label={d.id ? 'Edit template' : 'New template'} hideClose className="qmp-tpl-panel">
      <div className="flex min-h-0 flex-1 flex-col" data-testid="template-editor">
        <OverlayHeader title={d.id ? 'Edit template' : 'New template'} subtitle="Rules applied with one tap on the Create screen" icon={<Pencil className="h-4 w-4" />} onClose={onClose} />
        <OverlayBody padded={false}>
          <div className="space-y-4 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-border bg-foreground/[0.05] text-3xl" aria-hidden>{d.emoji}</div>
              <div className="min-w-0 flex-1 space-y-2">
                <input value={d.name} maxLength={24} onChange={e => setD({ ...d, name: e.target.value })} placeholder="Template name" aria-label="Template name" data-testid="tpl-name"
                  className="w-full rounded-xl border border-border bg-foreground/[0.04] px-3 py-2.5 text-[0.95rem] font-black text-foreground outline-none focus:border-primary/50" />
                <input value={d.desc} maxLength={60} onChange={e => setD({ ...d, desc: e.target.value })} placeholder="Short note (optional)" aria-label="Description" data-testid="tpl-desc"
                  className="w-full rounded-xl border border-border bg-foreground/[0.04] px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
              {EMOJIS.map(e => (
                <button key={e} type="button" role="radio" aria-checked={d.emoji === e} onClick={() => setD({ ...d, emoji: e })}
                  className={`grid h-9 w-9 place-items-center rounded-xl border text-lg active:scale-90 ${d.emoji === e ? 'border-primary bg-primary/15' : 'border-border bg-foreground/[0.03]'}`}>{e}</button>
              ))}
            </div>

            <section className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45">Style</p>
              <Segmented label="Quiz style" value={r.style} onChange={v => set({ style: v as TemplateRules['style'] })} options={[{ value: 'submit', label: 'Submit at end' }, { value: 'live', label: 'Instant feedback' }]} />
            </section>

            <section className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45">Timer</p>
              <Segmented label="Timer" value={r.timer} onChange={v => set({ timer: v as TimerKind })} options={[{ value: 'off', label: 'Off' }, { value: 'question', label: 'Per Q' }, { value: 'total', label: 'Total' }, { value: 'scaled', label: 'Min / Q' }]} />
              {r.timer === 'question' && <NumberField label="Seconds for each question" value={r.perQuestionSeconds} min={5} max={3600} suffix="sec" onCommit={n => set({ perQuestionSeconds: n })} testId="tpl-seconds" />}
              {r.timer === 'total' && <NumberField label="Whole quiz" value={r.totalMinutes} min={1} max={600} suffix="min" onCommit={n => set({ totalMinutes: n })} testId="tpl-total" />}
              {r.timer === 'scaled' && (
                <>
                  <NumberField label="Minutes for each question" value={r.minutesPerQuestion} min={0.25} max={30} step={0.25} suffix="min" onCommit={n => set({ minutesPerQuestion: n })} testId="tpl-scaled" />
                  <p className="px-1 text-[11px] font-semibold text-foreground/55" data-testid="tpl-scaled-example">The clock grows with the quiz: {example}.</p>
                </>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45">Marking</p>
              <NumberField label="Marks per correct answer" value={r.marksPerQuestion} min={0.25} max={100} step={0.25} onCommit={n => set({ marksPerQuestion: n })} testId="tpl-marks" />
              <div className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.04] px-3 py-2.5">
                <span className="text-xs font-bold text-foreground/70">Negative marking</span>
                <Toggle checked={r.negativeMarking} onChange={v => set({ negativeMarking: v })} label="Negative marking" />
              </div>
              {r.negativeMarking && <NumberField label="Marks lost per wrong answer" value={r.negativeMarks} min={0} max={100} step={0.25} onCommit={n => set({ negativeMarks: n })} testId="tpl-neg" />}
              <NumberField label="Pass mark" value={r.passMark} min={1} max={100} suffix="%" onCommit={n => set({ passMark: n })} testId="tpl-pass" />
              <div className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.04] px-3 py-2.5">
                <span className="text-xs font-bold text-foreground/70">Show marks while answering</span>
                <Toggle checked={r.showLiveMarks} onChange={v => set({ showLiveMarks: v })} label="Show marks while answering" />
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45">Explanations</p>
              <Segmented label="Explanations" value={ratOf(r.rationale)} onChange={v => set({ rationale: ratTo(v as Rationale) })} options={[{ value: 'keep', label: 'Keep' }, { value: 'both', label: 'Both' }, { value: 'book', label: 'Book' }, { value: 'ai', label: 'AI' }, { value: 'none', label: 'None' }]} />
              <p className="px-1 text-[11px] font-semibold text-foreground/50">"Keep" leaves your current explanation choice alone.</p>
            </section>

            <p className="rounded-2xl border border-primary/20 bg-primary/8 px-3 py-2.5 text-xs font-bold text-foreground/75" data-testid="tpl-summary">{d.emoji} {d.name.trim() || 'Template'} · {describeRules(r)}</p>
          </div>
        </OverlayBody>
        <OverlayFooter className="justify-between">
          <button type="button" onClick={onClose} className="rounded-full border border-border px-4 py-2 text-xs font-bold text-foreground/70 active:scale-95">Cancel</button>
          <button type="button" onClick={save} disabled={!nameOk} data-testid="tpl-save" className="rounded-full bg-foreground px-5 py-2.5 text-xs font-black text-background active:scale-95 disabled:opacity-35">{d.id ? 'Save changes' : 'Create template'}</button>
        </OverlayFooter>
      </div>
    </Overlay>
  );
}

function Confirm({ title, body, action, onYes, onClose }: { title: string; body: string; action: string; onYes: () => void; onClose: () => void }) {
  return (
    <Overlay open onClose={onClose} kind="sheet" label={title} hideClose>
      <div className="flex min-h-0 flex-1 flex-col" data-testid="template-confirm">
        <OverlayHeader title={title} onClose={onClose} />
        <OverlayBody><p className="text-sm font-medium leading-relaxed text-foreground/75">{body}</p></OverlayBody>
        <OverlayFooter className="justify-between">
          <button type="button" onClick={onClose} className="rounded-full border border-border px-4 py-2 text-xs font-bold text-foreground/70 active:scale-95">Cancel</button>
          <button type="button" onClick={() => { onYes(); onClose(); }} data-testid="template-confirm-yes" className="rounded-full bg-red-600 px-5 py-2.5 text-xs font-black text-white active:scale-95">{action}</button>
        </OverlayFooter>
      </div>
    </Overlay>
  );
}

/** Settings -> Quiz templates: add, edit, duplicate, reorder, delete and choose the default template. */
export default function TemplatesTab() {
  const [, bump] = useState(0);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete'; t: QuizTemplate } | { kind: 'restore' } | null>(null);
  useEffect(() => {
    const on = () => bump(n => n + 1);
    window.addEventListener(TEMPLATES_EVENT, on);
    return () => window.removeEventListener(TEMPLATES_EVENT, on);
  }, []);
  const templates = getTemplates();
  const defaultId = loadTemplateStore().defaultId;
  const full = templates.length >= MAX_TEMPLATES;
  const only = templates.length <= 1;
  const rows = useMemo(() => templates, [templates]);

  return (
    <div className="space-y-4" data-testid="templates-tab">
      <div className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-violet-500/8 p-4">
        <h2 className="text-lg font-black text-foreground">Quiz templates</h2>
        <p className="mt-1 text-xs font-semibold leading-relaxed text-foreground/60">One-tap rules for the Create screen: timer, marking, pass mark and explanations. The <b className="text-foreground">★ Default</b> template is applied by itself when you paste questions and press Start, so a plain Start always uses it.</p>
      </div>

      <ul className="space-y-2.5" data-testid="template-list">
        {rows.map((t, i) => (
          <li key={t.id} data-testid="template-row" data-template-id={t.id} className="rounded-3xl border border-border bg-card p-3.5">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-foreground/[0.05] text-2xl" aria-hidden>{t.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="truncate text-[0.95rem] font-black text-foreground" data-testid="template-name">{t.name}</h3>
                  {t.id === defaultId && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary" data-testid="template-default-badge">★ Default</span>}
                  {t.builtIn && <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-foreground/45">Built-in</span>}
                </div>
                <p className="mt-0.5 text-[11px] font-semibold leading-snug text-foreground/55">{templateDescription(t)}</p>
                <p className="mt-1 text-[10px] font-bold text-foreground/40">{describeRules(t.rules)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => { hapticTap(); setEditing(toDraft(t)); }} data-testid="template-edit" className="flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs font-black text-background active:scale-95"><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</button>
              {t.id !== defaultId && <button type="button" onClick={() => { hapticTap(); setDefaultTemplate(t.id); toast.success(`★ ${t.name} is now the default`); }} data-testid="template-make-default" className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-bold text-foreground/70 active:scale-95"><Star className="h-3.5 w-3.5" aria-hidden /> Make default</button>}
              <button type="button" disabled={full} onClick={() => { duplicateTemplate(t.id); toast.success('Template duplicated'); }} aria-label={`Duplicate ${t.name}`} data-testid="template-duplicate" className="grid h-9 w-9 place-items-center rounded-full border border-border text-foreground/60 active:scale-90 disabled:opacity-30"><Copy className="h-4 w-4" aria-hidden /></button>
              <button type="button" disabled={i === 0} onClick={() => moveTemplate(t.id, -1)} aria-label={`Move ${t.name} up`} data-testid="template-up" className="grid h-9 w-9 place-items-center rounded-full border border-border text-foreground/60 active:scale-90 disabled:opacity-30"><ArrowUp className="h-4 w-4" aria-hidden /></button>
              <button type="button" disabled={i === rows.length - 1} onClick={() => moveTemplate(t.id, 1)} aria-label={`Move ${t.name} down`} data-testid="template-down" className="grid h-9 w-9 place-items-center rounded-full border border-border text-foreground/60 active:scale-90 disabled:opacity-30"><ArrowDown className="h-4 w-4" aria-hidden /></button>
              <button type="button" disabled={only} onClick={() => setConfirm({ kind: 'delete', t })} aria-label={`Delete ${t.name}`} data-testid="template-delete" className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-red-500/30 text-red-600 active:scale-90 disabled:opacity-30 dark:text-red-400"><Trash2 className="h-4 w-4" aria-hidden /></button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={full} onClick={() => setEditing(blank())} data-testid="template-new" className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/50 bg-primary/8 px-4 py-3 text-sm font-black text-foreground active:scale-[0.98] disabled:opacity-40"><Plus className="h-4 w-4" aria-hidden /> New template</button>
        <button type="button" onClick={() => setConfirm({ kind: 'restore' })} data-testid="template-restore" className="flex items-center justify-center gap-2 rounded-2xl border border-border px-4 py-3 text-xs font-bold text-foreground/65 active:scale-[0.98]"><RotateCcw className="h-4 w-4" aria-hidden /> Restore factory templates</button>
      </div>
      <p className="px-1 text-[11px] font-semibold text-foreground/45">{templates.length} of {MAX_TEMPLATES} templates{only ? ' · the last template can not be deleted' : ''}.</p>

      {editing && <Editor draft={editing} onClose={() => setEditing(null)} />}
      {confirm?.kind === 'delete' && <Confirm title={`Delete “${confirm.t.name}”?`} body={confirm.t.id === defaultId ? 'This is your default template. The first template left becomes the default.' : 'This removes the template from the Create screen. You can bring the built-in ones back with “Restore factory templates”.'} action="Delete" onYes={() => { deleteTemplate(confirm.t.id); toast.success('Template deleted'); }} onClose={() => setConfirm(null)} />}
      {confirm?.kind === 'restore' && <Confirm title="Restore factory templates?" body="Default, Practice and Exam go back to how they shipped (edited or deleted ones come back). Your own templates stay." action="Restore" onYes={() => { restoreFactoryTemplates(); toast.success('Factory templates restored'); }} onClose={() => setConfirm(null)} />}
    </div>
  );
}
