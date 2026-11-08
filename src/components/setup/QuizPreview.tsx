import { useState } from 'react';
import { Eye, ChevronDown, Check, AlertTriangle, FileText, Sparkles } from 'lucide-react';
import type { QuizQuestion } from '../../types/quiz';

interface Props {
  questions: QuizQuestion[];
  issues: number;
  duplicates: number;
  words: number;
  text: string;
  fileNames: string[];
  pending?: boolean;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const COLLAPSED = 3;

/** Live preview of what will be created: parsed MCQs (with answers marked), or a notes summary for AI. */
export default function QuizPreview({ questions, issues, duplicates, words, text, fileNames, pending }: Props) {
  const [showAll, setShowAll] = useState(false);
  const hasText = text.trim().length > 20;
  const hasQs = questions.length > 0;
  const withAnswer = questions.filter(q => q.correctAnswer).length;
  const shown = showAll ? questions : questions.slice(0, COLLAPSED);

  return (
    <section className="cq-card" aria-live="polite">
      <div className="cq-card-head">
        <span className="cq-card-icon" aria-hidden="true"><Eye className="w-4 h-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="cq-card-title">Preview</h2>
          <p className="cq-card-sub">
            {!hasText && fileNames.length === 0 ? 'Shows here as soon as you paste or upload'
              : hasQs ? `${questions.length} question${questions.length !== 1 ? 's' : ''} found · ${withAnswer} with answer`
              : fileNames.length > 0 && !hasText ? `${fileNames.length} file${fileNames.length !== 1 ? 's' : ''} attached`
              : `${words.toLocaleString()} words of notes`}
            {pending ? ' · updating…' : ''}
          </p>
        </div>
      </div>

      <div className="cq-card-body space-y-3">
        {!hasText && fileNames.length === 0 && (
          <p className="cq-empty">Nothing to preview yet. Paste MCQs to see them parsed here, or paste notes and AI will build the questions.</p>
        )}

        {fileNames.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {fileNames.map(n => (
              <li key={n} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.05] px-3 py-1.5 text-xs font-semibold text-foreground/70">
                <FileText className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" /><span className="truncate">{n}</span>
              </li>
            ))}
          </ul>
        )}

        {(issues > 0 || duplicates > 0) && hasQs && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" aria-hidden="true" />
            <span>{issues > 0 && `${issues} question${issues !== 1 ? 's' : ''} need a look (missing options or answer)`}{issues > 0 && duplicates > 0 && ' · '}{duplicates > 0 && `${duplicates} duplicate${duplicates !== 1 ? 's' : ''} skipped`}</span>
          </div>
        )}

        {hasQs && (
          <ol className="space-y-2.5">
            {shown.map((q, i) => (
              <li key={i} className="cq-prev-q">
                <p className="cq-prev-qtext"><span className="cq-prev-num">{i + 1}</span>{q.question}</p>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {q.options.map((o, oi) => {
                    const ok = o === q.correctAnswer || q.correctAnswers?.includes(o);
                    return (
                      <li key={oi} className={`cq-prev-opt ${ok ? 'is-correct' : ''}`}>
                        <span className="cq-prev-letter">{LETTERS[oi]}</span>
                        <span className="min-w-0 break-words">{o}</span>
                        {ok && <Check className="ml-auto w-3.5 h-3.5 flex-shrink-0" strokeWidth={3} aria-label="Correct answer" />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}

        {hasQs && questions.length > COLLAPSED && (
          <button type="button" onClick={() => setShowAll(v => !v)} className="cq-prev-more" aria-expanded={showAll}>
            {showAll ? 'Show fewer' : `Show all ${questions.length} questions`}
            <ChevronDown className={`w-4 h-4 transition-transform ${showAll ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}

        {hasText && !hasQs && (
          <div className="space-y-2.5">
            <p className="cq-prev-notes">{text.trim().slice(0, 420)}{text.trim().length > 420 ? '…' : ''}</p>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> No ready-made questions found — AI will generate them from these notes
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
