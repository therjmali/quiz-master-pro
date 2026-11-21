/**
 * The Create Quiz form keeps what you typed (`qmp_input`) so a half-written paste survives leaving the screen.
 * Once the quiz made from it is FINISHED the form must start empty again; otherwise the old text and name sit
 * there for the next quiz. Only the quiz that was started from the form clears it: practising mistakes from the
 * results, or finishing something started elsewhere, never wipes text you typed for another quiz.
 */
import { draftIdFor } from './drafts';

export const INPUT_KEY = 'qmp_input';
export const CREATED_QUIZ_KEY = 'qmp_create_quiz_id';

/** Remember which quiz came out of the Create form (called when "Generate & Start" begins it). */
export function markCreatedQuiz(questions: readonly { question: string }[]): void {
  try {
    if (questions?.length) localStorage.setItem(CREATED_QUIZ_KEY, draftIdFor(questions));
  } catch { /* storage full */ }
}

/**
 * Called when a quiz is finished. Returns true (and empties the stored form text) when this quiz was the one
 * started from the form, so the caller can also reset the in-memory name.
 */
export function resetCreateFormIfOwnQuiz(finished: readonly { question: string }[]): boolean {
  try {
    const mine = localStorage.getItem(CREATED_QUIZ_KEY);
    if (!mine || !finished?.length || mine !== draftIdFor(finished)) return false;
    localStorage.removeItem(INPUT_KEY);
    localStorage.removeItem(CREATED_QUIZ_KEY);
    return true;
  } catch { return false; }
}
