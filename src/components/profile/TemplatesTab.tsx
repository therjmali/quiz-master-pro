import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Copy, ChevronDown, ChevronRight, Clock, Zap, Target } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@project/components/ui/dialog';
import {
  QuizTemplate, BUILT_IN_TEMPLATES, loadUserTemplates,
  createTemplate, updateTemplate, deleteTemplate, duplicateTemplate,
} from '../../utils/templates';
import { QuizSettings } from '../../types/quiz';
import { toast } from 'sonner';

const EMOJI_OPTIONS = ['📋', '⚡', '🏫', '🎯', '📝', '🔥', '💎', '🚀', '⏱️', '🧠', '🎮', '📚', '🏆', '✨', '💡', '🎓', '⚙️', '🎲', '🌟', '🔬'];

// ── Default settings for the form ─────────────────────────────────────────
const DEFAULT_PATCH: Partial<QuizSettings> = {
  mode: 'submit',
  timerMode: 'off',
  timerEnabled: false,
  timerValue: 30,
  timerUnit: 'sec',
  totalTimerValue: 60,
  totalTimerUnit: 'min',
  negativeMarking: false,
  negativeMarks: 0.25,
  marksPerQuestion: 1,
  passMark: 50,
};

interface FormState {
  label: string;
  desc: string;
  emoji: string;
  mode: 'submit' | 'live';
  timerMode: 'off' | 'per-question' | 'total';
  timerValue: number;
  timerUnit: 'sec' | 'min';
  totalTimerValue: number;
  totalTimerUnit: 'sec' | 'min';
  negativeMarking: boolean;
  negativeMarks: number;
  marksPerQuestion: number;
  passMark: number;
}

function formFromTemplate(t?: QuizTemplate): FormState {
  const p = t?.patch || DEFAULT_PATCH;
  return {
    label: t?.label || '',
    desc: t?.desc || '',
    emoji: t?.emoji || '📋',
    mode: (p.mode as 'submit' | 'live') || 'submit',
    timerMode: (p.timerMode as 'off' | 'per-question' | 'total') || 'off',
    timerValue: p.timerValue ?? 30,
    timerUnit: (p.timerUnit as 'sec' | 'min') || 'sec',
    totalTimerValue: p.totalTimerValue ?? 60,
    totalTimerUnit: (p.totalTimerUnit as 'sec' | 'min') || 'min',
    negativeMarking: p.negativeMarking ?? false,
    negativeMarks: p.negativeMarks ?? 0.25,
    marksPerQuestion: p.marksPerQuestion ?? 1,
    passMark: p.passMark ?? 50,
  };
}

function patchFromForm(f: FormState): Partial<QuizSettings> {
  return {
    mode: f.mode,
    timerMode: f.timerMode,
    timerEnabled: f.timerMode !== 'off',
    timerValue: f.timerValue,
    timerUnit: f.timerUnit,
    totalTimerValue: f.totalTimerValue,
    totalTimerUnit: f.totalTimerUnit,
    negativeMarking: f.negativeMarking,
    negativeMarks: f.negativeMarks,
    marksPerQuestion: f.marksPerQuestion,
    passMark: f.passMark,
  };
}

// ── Small select helper ───────────────────────────────────────────────────
function MiniSelect({ value, onChange, options, className = '' }: {
  value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; className?: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/40 ${className}`}>
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

// ── Template Card ─────────────────────────────────────────────────────────
function TemplateCard({ tpl, onEdit, onDuplicate, onDelete, index = 0 }: {
  tpl: QuizTemplate;
  onEdit?: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
  index?: number;
}) {
  const p = tpl.patch;
  const chips: string[] = [];
  if (p.mode === 'live') chips.push('Training');
  if (p.mode === 'submit') chips.push('Exam');
  if (p.timerMode === 'per-question') chips.push(`${p.timerValue || 30}${p.timerUnit === 'min' ? 'm' : 's'}/Q`);
  if (p.timerMode === 'total') chips.push(p.totalMinutesPerQuestion ? `${p.totalMinutesPerQuestion}m × Q total` : `${p.totalTimerValue || 60}${p.totalTimerUnit === 'min' ? 'm' : 's'} total`);
  if (p.timerMode === 'off') chips.push('No timer');
  if (p.negativeMarking) chips.push(`−${p.negativeMarks ?? 0.25}`);
  if ((p.marksPerQuestion ?? 1) !== 1) chips.push(`${p.marksPerQuestion} pts`);

  return (
    <div className={`premium-card-hover bg-card border rounded-2xl overflow-hidden group stagger-item ${tpl.isBuiltIn ? 'border-border/60' : 'border-primary/20 bg-primary/[0.02]'}`}
      style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex items-center gap-3 p-4">
        <div className="w-11 h-11 rounded-xl bg-foreground/[0.04] border border-border flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 group-hover:bg-primary/10 group-hover:border-primary/25 transition-all duration-300">
          {tpl.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-foreground truncate">{tpl.label}</p>
            {tpl.isBuiltIn && (
              <span className="text-[8px] font-bold text-foreground/25 bg-foreground/5 px-1.5 py-0.5 rounded-md uppercase tracking-wider flex-shrink-0">Built-in</span>
            )}
          </div>
          <p className="text-xs text-foreground/40 truncate mt-0.5">{tpl.desc}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {chips.map(c => (
              <span key={c} className="text-[9px] font-bold text-primary/60 bg-primary/8 px-1.5 py-0.5 rounded border border-primary/15">{c}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex border-t border-border">
        {onEdit && (
          <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold text-foreground/40 hover:text-primary hover:bg-primary/5 transition-all active:scale-95 ripple-press">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
        <button onClick={onDuplicate} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5 transition-all active:scale-95 border-l border-border ripple-press">
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </button>
        {onDelete && (
          <button onClick={onDelete} className="flex items-center justify-center gap-1.5 px-5 py-2.5 text-[11px] font-bold text-foreground/25 hover:text-red-400 hover:bg-red-500/5 transition-all active:scale-95 border-l border-border ripple-press">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function TemplatesTab() {
  const [userTemplates, setUserTemplates] = useState(() => loadUserTemplates());
  const [deleteTarget, setDeleteTarget] = useState<QuizTemplate | null>(null);
  const [editTarget, setEditTarget] = useState<QuizTemplate | null>(null); // null for "create new"
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(formFromTemplate());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [builtInExpanded, setBuiltInExpanded] = useState(true);
  const [customExpanded, setCustomExpanded] = useState(true);

  const refresh = () => setUserTemplates(loadUserTemplates());

  const openCreate = () => {
    setEditTarget(null);
    setForm(formFromTemplate());
    setShowEmojiPicker(false);
    setFormOpen(true);
  };

  const openEdit = (tpl: QuizTemplate) => {
    setEditTarget(tpl);
    setForm(formFromTemplate(tpl));
    setShowEmojiPicker(false);
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.label.trim()) { toast.error('Enter a template name'); return; }
    const patch = patchFromForm(form);
    if (editTarget) {
      updateTemplate(editTarget.id, { label: form.label.trim(), desc: form.desc.trim(), emoji: form.emoji, patch });
      toast.success('Template updated ✓');
    } else {
      createTemplate(form.label.trim(), form.desc.trim(), form.emoji, patch);
      toast.success('Template created! 🎉');
    }
    refresh();
    setFormOpen(false);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteTemplate(deleteTarget.id);
    refresh();
    setDeleteTarget(null);
    toast.success('Template deleted');
  };

  const handleDuplicate = (id: string) => {
    duplicateTemplate(id);
    refresh();
    toast.success('Template duplicated!');
  };

  const setF = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }));

  return (
    <>
      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border mx-4 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-bold">Delete Template?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              "{deleteTarget?.label}" will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-500 text-white border-none">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-md mx-4 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Template' : 'Create Template'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name + Emoji */}
            <div className="flex gap-2">
              <div className="relative">
                <button onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="w-12 h-12 rounded-xl bg-foreground/[0.04] border border-border flex items-center justify-center text-xl hover:border-foreground/20 transition-all">
                  {form.emoji}
                </button>
                {showEmojiPicker && (
                  <div className="absolute z-50 top-14 left-0 bg-card border border-border rounded-xl p-2.5 shadow-xl w-52">
                    <div className="grid grid-cols-7 gap-1">
                      {EMOJI_OPTIONS.map(em => (
                        <button key={em} onClick={() => { setF({ emoji: em }); setShowEmojiPicker(false); }}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-primary/15 transition-all ${form.emoji === em ? 'bg-primary/20 ring-1 ring-primary/40' : ''}`}>
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input value={form.label} onChange={e => setF({ label: e.target.value.slice(0, 30) })} placeholder="Template name"
                  className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-foreground/25 focus:outline-none focus:border-primary/40" />
                <input value={form.desc} onChange={e => setF({ desc: e.target.value.slice(0, 60) })} placeholder="Short description"
                  className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-foreground/25 focus:outline-none focus:border-primary/40" />
              </div>
            </div>

            {/* Quiz Mode */}
            <div>
              <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-2">Quiz Mode</p>
              <div className="grid grid-cols-2 gap-2">
                {([['submit', '📋 Classic Exam'], ['live', '🎯 Training']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setF({ mode: v })}
                    className={`text-xs font-bold py-2.5 rounded-xl border transition-all ${form.mode === v ? 'bg-primary/15 border-primary/35 text-foreground' : 'bg-card border-border text-foreground/50'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Timer */}
            <div>
              <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-2">Timer</p>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {([['off', '🚫 Off'], ['per-question', '⏱️ Per Q'], ['total', '⏳ Total']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setF({ timerMode: v })}
                    className={`text-xs font-bold py-2.5 rounded-xl border transition-all ${form.timerMode === v ? 'bg-primary/15 border-primary/35 text-foreground' : 'bg-card border-border text-foreground/50'}`}>
                    {l}
                  </button>
                ))}
              </div>
              {form.timerMode === 'per-question' && (
                <div className="flex gap-2">
                  <input type="number" value={form.timerValue} onChange={e => setF({ timerValue: Math.max(1, +e.target.value) })} min={1}
                    className="flex-1 bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/40" />
                  <MiniSelect value={form.timerUnit} onChange={v => setF({ timerUnit: v as 'sec' | 'min' })}
                    options={[{ v: 'sec', l: 'Seconds' }, { v: 'min', l: 'Minutes' }]} />
                </div>
              )}
              {form.timerMode === 'total' && (
                <div className="flex gap-2">
                  <input type="number" value={form.totalTimerValue} onChange={e => setF({ totalTimerValue: Math.max(1, +e.target.value) })} min={1}
                    className="flex-1 bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/40" />
                  <MiniSelect value={form.totalTimerUnit} onChange={v => setF({ totalTimerUnit: v as 'sec' | 'min' })}
                    options={[{ v: 'sec', l: 'Seconds' }, { v: 'min', l: 'Minutes' }]} />
                </div>
              )}
            </div>

            {/* Scoring */}
            <div>
              <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-2">Scoring</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-foreground/40 font-bold mb-1 block">Marks / Q</label>
                  <input type="number" value={form.marksPerQuestion} onChange={e => setF({ marksPerQuestion: Math.max(0.25, +e.target.value) })} step={0.25} min={0.25}
                    className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/40" />
                </div>
                <div>
                  <label className="text-[10px] text-foreground/40 font-bold mb-1 block">Pass Mark %</label>
                  <input type="number" value={form.passMark} onChange={e => setF({ passMark: Math.min(100, Math.max(0, +e.target.value)) })} min={0} max={100}
                    className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/40" />
                </div>
              </div>
              <div className="mt-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <button onClick={() => setF({ negativeMarking: !form.negativeMarking })}
                    className={`w-10 h-6 rounded-full transition-all flex-shrink-0 ${form.negativeMarking ? 'bg-red-500' : 'bg-foreground/15'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 mt-0.5 ${form.negativeMarking ? 'translate-x-4' : ''}`} />
                  </button>
                  <span className="text-xs font-bold text-foreground/60">Negative Marking</span>
                </label>
                {form.negativeMarking && (
                  <div className="mt-2">
                    <label className="text-[10px] text-foreground/40 font-bold mb-1 block">Deduction per wrong answer</label>
                    <input type="number" value={form.negativeMarks} onChange={e => setF({ negativeMarks: Math.max(0, +e.target.value) })} step={0.25} min={0}
                      className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/40" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <button onClick={() => setFormOpen(false)}
              className="text-sm font-bold px-5 py-2.5 rounded-xl border border-border text-foreground/50 hover:text-foreground transition-all w-full sm:w-auto">
              Cancel
            </button>
            <button onClick={handleSave}
              className="text-sm font-bold px-5 py-2.5 rounded-xl bg-primary text-primary-foreground transition-all active:scale-[0.98] w-full sm:w-auto">
              {editTarget ? 'Save Changes' : 'Create Template'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main content */}
      <div className="space-y-4">
        {/* Header with + button */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-foreground">Practice Modes</p>
            <p className="text-xs text-foreground/40 mt-0.5">Practice and Exam — one tap on Create Quiz applies the full configuration</p>
          </div>
        </div>

        {/* Built-in templates */}
        <div>
          <button onClick={() => setBuiltInExpanded(!builtInExpanded)}
            className="flex items-center gap-2 w-full text-left mb-2">
            {builtInExpanded ? <ChevronDown className="w-4 h-4 text-foreground/30" /> : <ChevronRight className="w-4 h-4 text-foreground/30" />}
            <span className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Modes</span>
            <span className="text-[10px] font-bold text-foreground/20 bg-foreground/5 px-2 py-0.5 rounded-full">{BUILT_IN_TEMPLATES.length}</span>
          </button>
          {builtInExpanded && (
            <div className="space-y-2 animate-fade-in">
              {BUILT_IN_TEMPLATES.map((tpl, i) => (
                <TemplateCard key={tpl.id} tpl={tpl} onDuplicate={() => handleDuplicate(tpl.id)} index={i} />
              ))}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
