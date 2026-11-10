/** Learner rank from lifetime quiz count and accuracy, plus progress towards the next rank. Pure and unit-tested. */
export type RankKey = 'beginner' | 'intermediate' | 'master';

export interface RankInfo {
  key: RankKey;
  label: string;
  /** Next rank to reach, or null at the top. */
  next: { key: RankKey; label: string; quizzes: number; accuracy: number } | null;
  /** 0..1 towards the next rank (1 at the top). Complete only when BOTH the quiz count and accuracy targets are met. */
  progress: number;
  quizzesLeft: number;
  accuracyLeft: number;
}

const TIERS: { key: RankKey; label: string; quizzes: number; accuracy: number }[] = [
  { key: 'beginner', label: '🌱 Beginner', quizzes: 0, accuracy: 0 },
  { key: 'intermediate', label: '⚡ Intermediate', quizzes: 5, accuracy: 60 },
  { key: 'master', label: '🎓 Master', quizzes: 10, accuracy: 80 },
];

export function computeRank(quizCount: number, accuracyPct: number): RankInfo {
  const n = Number.isFinite(quizCount) ? Math.max(0, quizCount) : 0;
  const a = Number.isFinite(accuracyPct) ? Math.min(100, Math.max(0, accuracyPct)) : 0;
  let idx = 0;
  TIERS.forEach((t, i) => { if (n >= t.quizzes && a >= t.accuracy) idx = i; });
  const cur = TIERS[idx];
  const next = TIERS[idx + 1] ?? null;
  if (!next) return { key: cur.key, label: cur.label, next: null, progress: 1, quizzesLeft: 0, accuracyLeft: 0 };
  const q = Math.min(1, n / next.quizzes);
  const acc = Math.min(1, a / next.accuracy);
  return {
    key: cur.key, label: cur.label,
    next: { key: next.key, label: next.label, quizzes: next.quizzes, accuracy: next.accuracy },
    progress: (q + acc) / 2,
    quizzesLeft: Math.max(0, next.quizzes - n),
    accuracyLeft: Math.max(0, Math.ceil(next.accuracy - a)),
  };
}
