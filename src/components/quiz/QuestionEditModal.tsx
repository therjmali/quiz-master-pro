import { useState, useEffect, useRef } from 'react';
import { X, Save, RotateCcw, Plus, Trash2, GripVertical, Check } from 'lucide-react';
import { QuizQuestion } from '../../types/quiz';

interface Props {
  question: QuizQuestion;
  questionIndex: number;
  onSave: (idx: number, updated: QuizQuestion) => void;
  onClose: () => void;
}

export default function QuestionEditModal({ question, questionIndex, onSave, onClose }: Props) {
  const [questionText, setQuestionText] = useState(question.question);
  const [options, setOptions] = useState<string[]>([...(question.shuffledOpts || question.options)]);
  const [correctAnswer, setCorrectAnswer] = useState(question.correctAnswer);
  const [rationale, setRationale] = useState(question.rationale || '');
  const [shakeField, setShakeField] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportH, setViewportH] = useState<number | null>(null);

  // Track visual viewport for keyboard avoidance on mobile
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setViewportH(vv.height);
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // Escape closes the editor (keyboard / hardware-keyboard tablets)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleOptionChange = (idx: number, value: string) => {
    const next = [...options];
    if (next[idx] === correctAnswer) setCorrectAnswer(value);
    next[idx] = value;
    setOptions(next);
  };

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions(prev => [...prev, '']);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
  };

  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    const removed = options[idx];
    const next = options.filter((_, i) => i !== idx);
    setOptions(next);
    if (removed === correctAnswer && next.length > 0) setCorrectAnswer(next[0]);
  };

  const canSave = questionText.trim().length > 0
    && options.filter(o => o.trim()).length >= 2
    && correctAnswer.trim().length > 0
    && options.some(o => o.trim() === correctAnswer.trim());

  const handleSave = () => {
    if (!questionText.trim()) { setShakeField('question'); setTimeout(() => setShakeField(null), 500); return; }
    const trimmedOpts = options.map(o => o.trim()).filter(Boolean);
    if (trimmedOpts.length < 2) { setShakeField('options'); setTimeout(() => setShakeField(null), 500); return; }
    if (!trimmedOpts.includes(correctAnswer.trim())) { setShakeField('correct'); setTimeout(() => setShakeField(null), 500); return; }
    const updated: QuizQuestion = {
      ...question,
      question: questionText.trim(),
      options: trimmedOpts,
      shuffledOpts: trimmedOpts,
      correctAnswer: correctAnswer.trim(),
      rationale: rationale.trim() || undefined,
    };
    onSave(questionIndex, updated);
  };

  const dynamicHeight = viewportH ? `${viewportH}px` : '100dvh';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      style={{ height: dynamicHeight }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-card border border-border/50
          rounded-t-3xl sm:rounded-2xl shadow-2xl
          flex flex-col
          max-h-[100%] sm:max-h-[85vh]"
        style={{ maxHeight: viewportH ? `${viewportH}px` : undefined }}
      >
        {/* ── Drag handle (mobile) ── */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-0">
          <div className="w-10 h-1 rounded-full bg-foreground/15" />
        </div>

        {/* ── Header ── */}
        <div className="flex-shrink-0 px-5 py-3.5 sm:py-4 flex items-center justify-between border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="text-lg leading-none">✏️</span>
            </div>
            <div>
              <h3 className="text-sm font-black text-foreground leading-tight">Edit Question {questionIndex + 1}</h3>
              <p className="text-[10px] text-foreground/35 font-medium">Changes reset your answer</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center text-foreground/40 hover:text-foreground/70 transition-colors active:scale-95"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">

          {/* Question text */}
          <div className={shakeField === 'question' ? 'animate-shake' : ''}>
            <label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-2 block">
              Question Text
            </label>
            <textarea
              value={questionText}
              onChange={e => setQuestionText(e.target.value)}
              rows={3}
              className="w-full bg-foreground/[0.04] border border-border/50 rounded-2xl px-4 py-3 text-[15px] text-foreground
                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40
                resize-none leading-relaxed placeholder:text-foreground/20"
              placeholder="Enter question text…"
            />
          </div>

          {/* Options */}
          <div className={shakeField === 'options' ? 'animate-shake' : ''}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">
                Answer Options
              </label>
              <span className="text-[10px] text-foreground/25 font-bold">{options.length}/6</span>
            </div>
            <div className="space-y-2.5">
              {options.map((opt, i) => {
                const isCorrect = opt === correctAnswer && opt.trim().length > 0;
                return (
                  <div key={i} className="flex items-center gap-2">
                    {/* Letter badge */}
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black flex-shrink-0 transition-all ${
                      isCorrect
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-foreground/[0.04] text-foreground/30 border border-border/40'
                    }`}>
                      {String.fromCharCode(97 + i)}
                    </span>

                    {/* Input */}
                    <input
                      value={opt}
                      onChange={e => handleOptionChange(i, e.target.value)}
                      className={`flex-1 min-w-0 bg-foreground/[0.04] border rounded-xl px-3.5 py-2.5 text-[14px] text-foreground
                        focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${
                        isCorrect ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-border/40'
                      }`}
                      placeholder={`Option ${String.fromCharCode(97 + i)}`}
                    />

                    {/* Set correct */}
                    <button
                      onClick={() => setCorrectAnswer(opt)}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90 ${
                        isCorrect
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-foreground/[0.04] text-foreground/20 border border-border/40 hover:border-emerald-500/30 hover:text-emerald-400/50'
                      }`}
                      title="Set as correct answer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>

                    {/* Remove */}
                    {options.length > 2 && (
                      <button
                        onClick={() => removeOption(i)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0
                          bg-foreground/[0.04] text-foreground/15 border border-border/40
                          hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30
                          transition-all active:scale-90"
                        title="Remove option"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add option */}
            {options.length < 6 && (
              <button
                onClick={addOption}
                className="mt-2.5 w-full flex items-center justify-center gap-2 text-xs font-bold text-foreground/30
                  py-2.5 rounded-xl border border-dashed border-border/40
                  hover:border-primary/30 hover:text-primary/60 transition-all active:scale-[0.98]"
              >
                <Plus className="w-3.5 h-3.5" /> Add Option
              </button>
            )}
          </div>

          {/* Rationale */}
          <div>
            <label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-2 block">
              Rationale <span className="normal-case text-foreground/20">(optional)</span>
            </label>
            <textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              rows={2}
              className="w-full bg-foreground/[0.04] border border-border/50 rounded-2xl px-4 py-3 text-[14px] text-foreground
                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40
                resize-none leading-relaxed placeholder:text-foreground/20"
              placeholder="Explain why this is the correct answer…"
            />
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2.5 bg-amber-500/[0.06] border border-amber-500/15 rounded-2xl px-4 py-3">
            <RotateCcw className="w-3.5 h-3.5 text-amber-400/70 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-400/60 leading-relaxed">
              <strong className="text-amber-400/80">Your answer will be reset</strong> so you can attempt this question fresh.
            </p>
          </div>

          {/* Extra padding for safe area */}
          <div className="h-2" />
        </div>

        {/* ── Footer ── */}
        <div
          className="flex-shrink-0 border-t border-border/40 px-5 py-3.5 flex items-center gap-2.5"
          style={{ paddingBottom: 'max(0.875rem, var(--qmp-inset-bottom))' }}
        >
          <button
            onClick={onClose}
            className="flex-1 sm:flex-none text-xs font-bold text-foreground/40 hover:text-foreground/60
              px-4 py-3 sm:py-2.5 rounded-xl border border-border/40 transition-colors active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-[2] sm:flex-none flex items-center justify-center gap-2
              bg-primary text-primary-foreground font-black text-xs
              px-6 py-3 sm:py-2.5 rounded-xl transition-all active:scale-[0.97]
              disabled:opacity-30 disabled:cursor-not-allowed
              shadow-lg shadow-primary/20"
          >
            <Save className="w-3.5 h-3.5" /> Save & Reset
          </button>
        </div>
      </div>
    </div>
  );
}
