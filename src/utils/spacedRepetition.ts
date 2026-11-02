import { QuizQuestion } from '../types/quiz';

const SR_STORAGE_KEY = 'qmp_spaced_rep_items';

export interface SRItem {
  id: string;
  question: string;
  correctAnswer: string;
  options: string[];
  difficulty: string;
  easeFactor: number;
  interval: number; // days
  repetitions: number;
  nextReviewDate: number; // timestamp ms
  lastReviewed: number;   // timestamp ms
  createdAt: number;
}

/** Load all SR items from localStorage */
export function loadSRItems(): SRItem[] {
  try {
    const raw = localStorage.getItem(SR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/** Save SR items to localStorage */
function saveSRItems(items: SRItem[]): void {
  try { localStorage.setItem(SR_STORAGE_KEY, JSON.stringify(items)); } catch {}
}

/** Get items due for review today (nextReviewDate <= now) */
export function getDueItems(): SRItem[] {
  const now = Date.now();
  return loadSRItems().filter(item => item.nextReviewDate <= now);
}

/** Count of due items */
export function getDueCount(): number {
  return getDueItems().length;
}

/**
 * Add wrong questions from a quiz to the SR system.
 * Deduplicates by question text.
 */
export function addWrongQuestionsToSR(wrongQuestions: QuizQuestion[]): number {
  const items = loadSRItems();
  const existingTexts = new Set(items.map(i => i.question));
  let added = 0;

  for (const q of wrongQuestions) {
    if (existingTexts.has(q.question)) continue;
    const now = Date.now();
    items.push({
      id: `sr_${now}_${Math.random().toString(36).slice(2, 8)}`,
      question: q.question,
      correctAnswer: q.correctAnswer,
      options: q.options,
      difficulty: q.difficulty,
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      nextReviewDate: now + 24 * 60 * 60 * 1000, // Tomorrow
      lastReviewed: now,
      createdAt: now,
    });
    existingTexts.add(q.question);
    added++;
  }

  saveSRItems(items);
  return added;
}

/**
 * SM-2 Algorithm: Update an SR item after review.
 * @param itemId - The SR item id
 * @param quality - Rating 0-5 (0=blackout, 5=perfect recall)
 *   Mapping: correct=5, almost=4, hard but correct=3, wrong=1
 */
export function reviewSRItem(itemId: string, quality: number): void {
  const items = loadSRItems();
  const idx = items.findIndex(i => i.id === itemId);
  if (idx === -1) return;

  const item = items[idx];
  const q = Math.max(0, Math.min(5, Math.round(quality)));

  // Update ease factor
  let ef = item.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ef = Math.max(1.3, ef); // Never go below 1.3

  let interval: number;
  let repetitions: number;

  if (q < 3) {
    // Failed recall — reset
    interval = 1;
    repetitions = 0;
  } else {
    repetitions = item.repetitions + 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(item.interval * ef);
  }

  const now = Date.now();
  items[idx] = {
    ...item,
    easeFactor: ef,
    interval,
    repetitions,
    nextReviewDate: now + interval * 24 * 60 * 60 * 1000,
    lastReviewed: now,
  };

  saveSRItems(items);
}

/** Remove a specific SR item */
export function removeSRItem(itemId: string): void {
  const items = loadSRItems().filter(i => i.id !== itemId);
  saveSRItems(items);
}

/** Clear all SR items */
export function clearAllSR(): void {
  localStorage.removeItem(SR_STORAGE_KEY);
}

/** Get total SR items count */
export function getTotalSRCount(): number {
  return loadSRItems().length;
}

/** Convert SR items to QuizQuestion array for practice */
export function srItemsToQuizQuestions(items: SRItem[]): QuizQuestion[] {
  return items.map(item => ({
    question: item.question,
    options: item.options,
    correctAnswer: item.correctAnswer,
    difficulty: item.difficulty as 'easy' | 'medium' | 'hard',
  }));
}
