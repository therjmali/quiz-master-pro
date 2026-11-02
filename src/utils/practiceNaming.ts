import { QuizResult } from '../types/quiz';
import { format } from 'date-fns';

/**
 * Get ordinal suffix for a number: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd, 23rd, etc.
 */
export function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Count how many practice attempts already exist for a given parent quiz timestamp.
 */
export function countPracticeAttempts(history: QuizResult[], parentTimestamp: number): number {
  return history.filter(
    r => r.attemptType === 'practice' && r.parentQuizTimestamp === parentTimestamp
  ).length;
}

/**
 * Generate a practice quiz label like "Practice 1st 0306"
 * @param attemptNumber - 1, 2, 3, ...
 * @param timestamp - optional Unix ms, defaults to now
 */
export function getPracticeLabel(attemptNumber: number, timestamp?: number): string {
  const date = new Date(timestamp ?? Date.now());
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `Practice ${attemptNumber}${getOrdinalSuffix(attemptNumber)} ${dd}${mm}`;
}

/**
 * Build the full practice title including parent quiz name
 */
export function buildPracticeTitle(parentTitle: string | undefined, attemptNumber: number, timestamp?: number): string {
  const label = getPracticeLabel(attemptNumber, timestamp);
  if (parentTitle) return `${parentTitle} — ${label}`;
  return label;
}
