/**
 * Single source of truth for "how many questions are correct / wrong / skipped".
 *
 * Everything that shows these numbers (the Reports & downloads tiles, the status filter pills,
 * the Question Breakdown strip, the question lists) is fed by the functions in this file from ONE
 * master list of quiz attempts. Nothing in here mutates its input: every function returns new
 * arrays/objects, and `pickByStatus('all')` hands back the very same master array.
 */
import type { QuizQuestion, QuizResult, ReportOrder } from '../types/quiz';
import { reviewStatus, type ReviewStatus } from './reviewOptions';

export type StatusFilter = 'all' | ReviewStatus;
export type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';
export type Level = Exclude<DifficultyFilter, 'all'>;

export interface StatusCounts { all: number; correct: number; wrong: number; skipped: number }

/** One question of one attempt, with its status worked out once. */
export interface AttemptItem {
  /** unique and stable: `<resultKey>#<index in the attempt>` */
  key: string;
  resultKey: string;
  /** position in the attempt (attempt order) */
  index: number;
  q: QuizQuestion;
  userAnswer: string | null;
  status: ReviewStatus;
  level: Level;
  timestamp: number;
  quizTitle?: string;
  subject?: string;
}

export interface ScopeSummary extends StatusCounts {
  easy: number;
  medium: number;
  hard: number;
  /** quizzes whose question details are not on this device (their saved totals are used instead) */
  unavailableQuizzes: number;
  /** questions inside those quizzes */
  unavailableQuestions: number;
}

export const EMPTY_COUNTS: StatusCounts = Object.freeze({ all: 0, correct: 0, wrong: 0, skipped: 0 });

export const resultKey = (r: Pick<QuizResult, 'id' | 'timestamp'>): string => r.id || String(r.timestamp);

export const levelOf = (q: Pick<QuizQuestion, 'difficulty'>): Level => {
  const d = String(q.difficulty || '').toLowerCase();
  return d === 'easy' || d === 'hard' ? d : 'medium';
};

/** '' and undefined both mean "not answered" (same rule as the PDF engine). */
export const normalizeAnswer = (a: string | null | undefined): string | null => (a === null || a === undefined || a === '' ? null : a);

export const hasDetails = (r: Pick<QuizResult, 'quizData'>): boolean => Array.isArray(r.quizData) && r.quizData.length > 0;

/** All questions of all attempts, as new objects. Only attempts that carry their questions appear. */
export function flattenAttempts(results: readonly QuizResult[], difficulty: DifficultyFilter = 'all'): AttemptItem[] {
  const out: AttemptItem[] = [];
  for (const r of results) {
    if (!hasDetails(r)) continue;
    const rk = resultKey(r);
    r.quizData.forEach((q, index) => {
      const level = levelOf(q);
      if (difficulty !== 'all' && level !== difficulty) return;
      const userAnswer = normalizeAnswer(r.userAnswers?.[index]);
      out.push({ key: `${rk}#${index}`, resultKey: rk, index, q, userAnswer, status: reviewStatus(q, userAnswer), level, timestamp: r.timestamp, quizTitle: r.quizTitle, subject: r.subject });
    });
  }
  return out;
}

export function countStatuses(items: readonly { status: ReviewStatus }[]): StatusCounts {
  const c = { all: 0, correct: 0, wrong: 0, skipped: 0 };
  for (const it of items) { c.all++; c[it.status]++; }
  return c;
}

/**
 * Totals for a set of attempts. Attempts with their questions are counted question by question
 * (so the numbers match the lists and the PDFs exactly); attempts whose questions are not on this
 * device fall back to their saved counters so a total never shrinks or disappears.
 * With a difficulty filter, attempts without questions cannot be classified and are left out.
 * Difficulty counts always cover every question of the scope (they describe what you are filtering).
 */
export function summarizeResults(results: readonly QuizResult[], difficulty: DifficultyFilter = 'all'): ScopeSummary {
  const s: ScopeSummary = { all: 0, correct: 0, wrong: 0, skipped: 0, easy: 0, medium: 0, hard: 0, unavailableQuizzes: 0, unavailableQuestions: 0 };
  for (const r of results) {
    if (hasDetails(r)) {
      r.quizData.forEach((q, index) => {
        const level = levelOf(q);
        s[level]++;
        if (difficulty !== 'all' && level !== difficulty) return;
        s.all++; s[reviewStatus(q, normalizeAnswer(r.userAnswers?.[index]))]++;
      });
      continue;
    }
    const saved = (r.correct || 0) + (r.wrong || 0) + (r.skipped || 0);
    if (saved <= 0 && !(r.totalQuestions > 0)) continue;
    s.unavailableQuizzes++;
    s.unavailableQuestions += saved || r.totalQuestions || 0;
    if (difficulty !== 'all') continue;
    s.correct += r.correct || 0; s.wrong += r.wrong || 0; s.skipped += r.skipped || 0;
    s.all += saved;
  }
  return s;
}

export const toCounts = (s: StatusCounts): StatusCounts => ({ all: s.all, correct: s.correct, wrong: s.wrong, skipped: s.skipped });

/** The visible slice. 'all' returns the master array itself (same reference), anything else a new filtered array. */
export function pickByStatus<T extends { status: ReviewStatus }>(items: readonly T[], filter: StatusFilter): readonly T[] {
  return filter === 'all' ? items : items.filter(i => i.status === filter);
}

export const isStatusFilter = (v: unknown): v is StatusFilter => v === 'all' || v === 'correct' || v === 'wrong' || v === 'skipped';

/** Book order: inside each attempt sort by `originalIndex`; attempts keep their order. Returns a new array. */
export function orderAttemptItems<T extends AttemptItem>(items: readonly T[], order: ReportOrder | undefined): T[] {
  if (order !== 'original') return [...items];
  const groups: T[][] = [];
  const at = new Map<string, number>();
  for (const it of items) {
    let gi = at.get(it.resultKey);
    if (gi === undefined) { gi = groups.length; at.set(it.resultKey, gi); groups.push([]); }
    groups[gi].push(it);
  }
  const pos = (it: AttemptItem) => (it.q as { originalIndex?: number }).originalIndex ?? it.index;
  return groups.flatMap(g => [...g].sort((a, b) => pos(a) - pos(b)));
}

/* ───────── multi-select filters (✅ ❌ ⏭️ 🔖 at the same time) ───────── */

export type FacetKey = 'correct' | 'wrong' | 'skipped' | 'bookmarked';
const FACET_ORDER: FacetKey[] = ['correct', 'wrong', 'skipped', 'bookmarked'];

export const isFacetKey = (v: unknown): v is FacetKey => v === 'correct' || v === 'wrong' || v === 'skipped' || v === 'bookmarked';

/** Clean a stored/typed selection: only known keys, no duplicates, canonical order. An empty selection means "All". */
export function normalizeFacets(input: unknown): FacetKey[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? [input] : [];
  const set = new Set(raw.filter(isFacetKey));
  return FACET_ORDER.filter(k => set.has(k));
}

/** Tap on a pill: "all" clears the selection, any other key toggles. The selection can never end up "nothing selected and not All". */
export function toggleFacet(selected: readonly FacetKey[], key: StatusFilter | 'bookmarked'): FacetKey[] {
  if (key === 'all') return [];
  const set = new Set(selected);
  if (set.has(key)) set.delete(key); else set.add(key);
  return FACET_ORDER.filter(k => set.has(k));
}

/**
 * Statuses (✅ ❌ ⏭️) widen the list (a question matching ANY selected status is kept), 🔖 narrows it
 * (only bookmarked questions). So ✅ + ❌ = correct and wrong; ❌ + 🔖 = your bookmarked mistakes.
 * No selection = every item (the very same array is returned).
 */
export function applyFacets<T extends { status: ReviewStatus }>(items: readonly T[], selected: readonly FacetKey[], isBookmarked: (item: T) => boolean): readonly T[] {
  if (selected.length === 0) return items;
  const statuses = selected.filter((k): k is ReviewStatus => k !== 'bookmarked');
  const needBookmark = selected.includes('bookmarked');
  return items.filter(it => (statuses.length === 0 || statuses.includes(it.status)) && (!needBookmark || isBookmarked(it)));
}

/** Older versions stored ONE filter under `qmp_pref_<key>` ("overview" / "all" / "wrong" ...). Turns it into a selection. */
export function readLegacyFacets(prefKey: string): FacetKey[] {
  try {
    const raw = localStorage.getItem(`qmp_pref_${prefKey}`);
    if (raw === null) return [];
    let v: unknown = raw;
    try { v = JSON.parse(raw); } catch { /* plain string */ }
    return normalizeFacets(v);
  } catch { return []; }
}
