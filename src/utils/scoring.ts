import { QuizQuestion, QuizResult, ScoreResult } from '../types/quiz';

/**
 * Derive the correct percentage from netScore and maxScore.
 * Always use this instead of trusting a stored `percentage` field,
 * which can become stale after negative marking changes or data imports.
 *
 * When `decimal` is true, returns up to 2 decimal places (e.g. 76.31).
 * When false (default), returns a rounded integer (e.g. 76).
 */
export function derivePercentage(netScore: number, maxScore: number, decimal?: boolean): number {
  if (!maxScore || maxScore <= 0) return 0;
  const raw = (netScore / maxScore) * 100;
  const clamped = Math.max(0, Math.min(100, raw));
  return decimal
    ? Math.round(clamped * 100) / 100   // 2 decimal places
    : Math.round(clamped);               // integer
}

/**
 * Format a percentage for display.
 * When `showDecimal` is true, shows up to 2 decimals (e.g. "76.31%").
 * When false, shows an integer (e.g. "76%").
 * Pass the raw ratio (netScore/maxScore) or a pre-computed percentage.
 */
export function formatPct(pct: number, showDecimal: boolean): string {
  if (showDecimal) {
    // Show up to 2 decimals, strip trailing zeros
    const fixed = pct.toFixed(2).replace(/\.?0+$/, '');
    return `${fixed}%`;
  }
  return `${Math.round(pct)}%`;
}

/** Compute a precise percentage (2 decimal places) from netScore and maxScore */
export function precisePct(netScore: number, maxScore: number): number {
  if (!maxScore || maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((netScore / maxScore) * 100) * 100) / 100));
}

/**
 * Self-heal a QuizResult by recomputing percentage from netScore/maxScore.
 * Call this when loading results from storage to fix stale percentage values.
 */
export function healResult(r: QuizResult): QuizResult {
  const net = r.netScore ?? r.score ?? 0;
  const max = r.maxScore ?? 0;
  const correctPct = derivePercentage(net, max);
  if (r.percentage !== correctPct && max > 0) {
    return { ...r, percentage: correctPct };
  }
  return r;
}

/**
 * Self-heal an array of QuizResults.
 */
export function healHistory(results: QuizResult[]): QuizResult[] {
  let changed = false;
  const healed = results.map(r => {
    const h = healResult(r);
    if (h !== r) changed = true;
    return h;
  });
  return changed ? healed : results;
}

export function calculateScore(
  quizData: QuizQuestion[],
  userAnswers: (string | null)[],
  marksPerQuestion: number,
  negativeMarking: boolean,
  negativeMarks: number
): ScoreResult {
  let correct = 0, wrong = 0, skipped = 0;
  quizData.forEach((q, i) => {
    const u = userAnswers[i];
    if (u === null || u === undefined) skipped++;
    else if (u === q.correctAnswer || q.correctAnswers?.includes(u)) correct++;
    else wrong++;
  });
  const gain = correct * marksPerQuestion;
  const penalty = negativeMarking ? parseFloat((wrong * negativeMarks).toFixed(2)) : 0;
  const netScore = Math.max(0, parseFloat((gain - penalty).toFixed(2)));
  const maxScore = quizData.length * marksPerQuestion;
  const percentage = maxScore > 0 ? Math.max(0, Math.min(100, Math.round((netScore / maxScore) * 100))) : 0;
  const accuracy = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
  return { correct, wrong, skipped, gain, penalty, netScore, maxScore, percentage, accuracy };
}

/**
 * Format seconds into a human-friendly duration string.
 * - mode omitted / 'short': "45s", "3m 12s", "1h 30m"
 * - mode 'hhmm': compact version — "<1m", "30m", "1h 30m" (no seconds)
 *
 * Rule: never show decimal hours like "0.5h" or "1.5h".
 */
export function formatTime(secs: number, mode?: 'short' | 'hhmm'): string {
  if (mode === 'hhmm') {
    if (secs < 60) return secs > 0 ? '<1m' : '0m';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h === 0) return `${m}m`;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Shared utility: format seconds into compact "Xh Ym" / "Ym" / "<1m".
 * Use this anywhere a duration needs to be displayed without decimal hours.
 */
export function fmtDuration(secs: number): string {
  if (secs < 60) return secs > 0 ? '<1m' : '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatTimeColon(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function calculateStreak(timestamps: number[]): number {
  if (!timestamps.length) return 0;
  const toDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daySet = new Set(timestamps.map(ts => toDay(new Date(ts))));

  let streak = 0;
  const check = new Date();

  // If no quiz today, allow starting from yesterday (grace period)
  if (!daySet.has(toDay(check))) {
    check.setDate(check.getDate() - 1);
  }

  // Count consecutive days backwards
  while (daySet.has(toDay(check))) {
    streak++;
    check.setDate(check.getDate() - 1);
  }

  return streak;
}
