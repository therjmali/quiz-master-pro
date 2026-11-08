/**
 * Pure navigation + timer helpers for the running quiz (unit-tested, no React).
 *
 * Rules (per-question timer):
 *  - when a question's time runs out it is "expired": it moves on by itself, shows its correct
 *    answer, and can never be re-entered (no Previous, no jumping back, no skipping into it);
 *  - Next / Previous / palette jumps always land on the nearest question that is still open.
 */

/** First open (non-expired) question after `current`, or -1 when none is left. */
export function nextOpenIndex(current: number, expired: readonly boolean[], total: number): number {
  for (let i = current + 1; i < total; i++) if (!expired[i]) return i;
  return -1;
}

/** Nearest open (non-expired) question before `current`, or -1 when none is left / going back is off. */
export function prevOpenIndex(current: number, expired: readonly boolean[], backAllowed = true): number {
  if (!backAllowed) return -1;
  for (let i = current - 1; i >= 0; i--) if (!expired[i]) return i;
  return -1;
}

/** May the student open question `idx` from `current`? Never an expired one; never backwards in mock-exam mode. */
export function canEnterQuestion(idx: number, current: number, expired: readonly boolean[], mockExam: boolean): boolean {
  if (idx === current) return true;
  if (expired[idx]) return false;
  if (mockExam && idx < current) return false;
  return true;
}

/**
 * Whole seconds to charge for one timer tick. The OS may throttle or freeze timers (screen off,
 * app in background), so time is measured against the clock instead of counting ticks.
 * `maxSeconds` caps one catch-up so a clock change can never wipe out a whole quiz.
 */
export function tickSeconds(now: number, last: number, maxSeconds = 3600): number {
  const d = Math.floor((now - last) / 1000);
  if (!Number.isFinite(d) || d < 0) return 0;
  return Math.min(d, maxSeconds);
}
