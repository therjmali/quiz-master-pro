/**
 * Review option states: the single source of truth for how an MCQ option looks in the
 * review / report view. Status only ever shows as colour + icon, never as sentences.
 *
 *  correct  -> the option you picked: green + ✅
 *  wrong    -> the option you picked: red + ❌, the right option: green + ✅
 *  skipped  -> the right option: green + ✅ (no red anywhere)
 *
 * Everything else stays neutral.
 */
import type { QuizQuestion } from '../types/quiz';

export type ReviewStatus = 'correct' | 'wrong' | 'skipped';
export type OptionVisual = 'correct' | 'wrong' | 'neutral';

const same = (a: string, b: string) => a.trim() === b.trim();

/** An option is correct when it equals the answer (or any of the answers of a multi-answer question). */
export function isCorrectOption(q: Pick<QuizQuestion, 'correctAnswer' | 'correctAnswers'>, opt: string): boolean {
  if (same(opt, q.correctAnswer)) return true;
  return (q.correctAnswers ?? []).some(c => same(opt, c));
}

/** null / undefined means the question was not answered. */
export function reviewStatus(q: Pick<QuizQuestion, 'correctAnswer' | 'correctAnswers'>, userAnswer: string | null | undefined): ReviewStatus {
  if (userAnswer === null || userAnswer === undefined) return 'skipped';
  return isCorrectOption(q, userAnswer) ? 'correct' : 'wrong';
}

/**
 * One visual state per option, in display order.
 * With duplicate option texts only the first copy is marked as the wrong pick, so one wrong
 * answer never shows two red rows.
 */
export function optionVisuals(q: Pick<QuizQuestion, 'correctAnswer' | 'correctAnswers'>, opts: string[], userAnswer: string | null | undefined): OptionVisual[] {
  const status = reviewStatus(q, userAnswer);
  let wrongMarked = false;
  return opts.map(o => {
    if (isCorrectOption(q, o)) return 'correct';
    if (status === 'wrong' && !wrongMarked && userAnswer != null && same(o, userAnswer)) { wrongMarked = true; return 'wrong'; }
    return 'neutral';
  });
}

/** "(D) text" parts for the `Ans. - …` line; falls back to the bare answer when it is not among the options. */
export function answerLineText(q: Pick<QuizQuestion, 'correctAnswer' | 'correctAnswers'>, opts: string[]): string {
  const parts: string[] = [];
  opts.forEach((o, i) => { if (isCorrectOption(q, o)) parts.push(`(${String.fromCharCode(65 + i)}) ${o}`); });
  const body = parts.length ? parts.join(', ') : q.correctAnswer;
  return `Ans. - ${body}.`;
}
