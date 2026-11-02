/**
 * Global Mistakes Store — persists wrong answers across all quizzes.
 * Single source of truth for mistake tracking.
 */

import { QuizResult, QuizQuestion } from '../types/quiz';
import { idbGet, idbSet } from './indexedDB';

export interface MistakeEntry {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  userAnswer: string;
  rationale?: string;
  difficulty?: string;
  questionType?: string;
  quizTitle?: string;
  subject?: string;
  quizTimestamp: number;
  addedAt: number;
  /** How many times this was practiced */
  practiceCount: number;
  /** Whether last practice was correct */
  lastCorrect: boolean;
  /** If mastered (correct 2+ times consecutively), hide from active pool */
  mastered: boolean;
}

export interface GlobalMistakeStore {
  version: 1;
  entries: MistakeEntry[];
}

const STORE_KEY = 'qmp_global_mistakes_v1';
const IDB_KEY = 'qmp_mistakes_idb';

// In-memory cache for sync reads
let _cache: GlobalMistakeStore | null = null;

function genId(): string {
  return `gm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Initialize from IDB, falling back to localStorage */
export async function initMistakeStore(): Promise<GlobalMistakeStore> {
  if (_cache) return _cache;
  try {
    const idbData = await idbGet<GlobalMistakeStore>(IDB_KEY);
    if (idbData && idbData.entries) { _cache = idbData; return _cache; }
  } catch {}
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      _cache = JSON.parse(raw);
      if (_cache) { idbSet(IDB_KEY, _cache).catch(() => {}); return _cache; }
    }
  } catch {}
  _cache = { version: 1, entries: [] };
  return _cache;
}

export function loadMistakeStore(): GlobalMistakeStore {
  if (_cache) return _cache;
  // Sync fallback for first call before init completes
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { _cache = JSON.parse(raw); return _cache!; }
  } catch {}
  _cache = { version: 1, entries: [] };
  return _cache;
}

export function saveMistakeStore(store: GlobalMistakeStore): void {
  _cache = store;
  // Fire-and-forget IDB write
  idbSet(IDB_KEY, store).catch(() => {});
  // Mirror to localStorage (best-effort, may fail if full)
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {}
}

/** Add mistakes from a completed quiz — deduplicates by question text */
export function addMistakesFromResult(result: QuizResult): GlobalMistakeStore {
  const store = loadMistakeStore();
  if (!result.quizData?.length) return store;

  const existingQuestions = new Set(store.entries.map(e => e.question));
  let added = 0;

  result.quizData.forEach((q, i) => {
    const ua = result.userAnswers[i];
    if (ua === null) return; // skipped, not a mistake
    const isCorrect = ua === q.correctAnswer || (ua !== null && q.correctAnswers?.includes(ua));
    if (isCorrect) return;

    // Check if already exists
    if (existingQuestions.has(q.question)) {
      // Update existing entry if answered wrong again
      const existing = store.entries.find(e => e.question === q.question);
      if (existing) {
        existing.userAnswer = ua;
        existing.lastCorrect = false;
        existing.mastered = false;
        existing.quizTimestamp = result.timestamp;
        if (result.quizTitle) existing.quizTitle = result.quizTitle;
        if (result.subject) existing.subject = result.subject;
      }
      return;
    }

    store.entries.push({
      id: genId(),
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      userAnswer: ua,
      rationale: q.rationale,
      difficulty: q.difficulty,
      questionType: q.questionType,
      quizTitle: result.quizTitle,
      subject: result.subject,
      quizTimestamp: result.timestamp,
      addedAt: Date.now(),
      practiceCount: 0,
      lastCorrect: false,
      mastered: false,
    });
    added++;
    existingQuestions.add(q.question);
  });

  if (added > 0) saveMistakeStore(store);
  return store;
}

/** After practicing mistakes, update their status */
export function updateMistakesAfterPractice(
  practiceResult: QuizResult
): GlobalMistakeStore {
  const store = loadMistakeStore();
  if (!practiceResult.quizData?.length) return store;

  practiceResult.quizData.forEach((q, i) => {
    const ua = practiceResult.userAnswers[i];
    const entry = store.entries.find(e => e.question === q.question);
    if (!entry) return;

    entry.practiceCount++;
    const isCorrect = ua === q.correctAnswer || (ua !== null && q.correctAnswers?.includes(ua));
    entry.lastCorrect = !!isCorrect;
    entry.userAnswer = ua || entry.userAnswer;

    // Mastered: correct 2+ consecutive practice attempts
    if (isCorrect && entry.practiceCount >= 2 && entry.lastCorrect) {
      entry.mastered = true;
    }
    // If wrong again, reset mastery
    if (!isCorrect) {
      entry.mastered = false;
    }
  });

  saveMistakeStore(store);
  return store;
}

/** Get active (non-mastered) mistakes */
export function getActiveMistakes(store?: GlobalMistakeStore): MistakeEntry[] {
  const s = store || loadMistakeStore();
  return s.entries.filter(e => !e.mastered);
}

/** Get all mistakes (including mastered) */
export function getAllMistakes(store?: GlobalMistakeStore): MistakeEntry[] {
  const s = store || loadMistakeStore();
  return s.entries;
}

/** Convert mistake entries to quiz questions for practice */
export function mistakesToQuizQuestions(mistakes: MistakeEntry[]): QuizQuestion[] {
  return mistakes.map(m => ({
    question: m.question,
    options: m.options,
    correctAnswer: m.correctAnswer,
    rationale: m.rationale,
    difficulty: m.difficulty as any || 'medium',
    questionType: m.questionType,
  }));
}

/** Get mistake count */
export function getMistakeCount(): { total: number; active: number; mastered: number } {
  const store = loadMistakeStore();
  const active = store.entries.filter(e => !e.mastered).length;
  const mastered = store.entries.filter(e => e.mastered).length;
  return { total: store.entries.length, active, mastered };
}

/** Remove a specific mistake by id */
export function removeMistake(id: string): GlobalMistakeStore {
  const store = loadMistakeStore();
  store.entries = store.entries.filter(e => e.id !== id);
  saveMistakeStore(store);
  return store;
}

/** Clear all mastered mistakes */
export function clearMastered(): GlobalMistakeStore {
  const store = loadMistakeStore();
  store.entries = store.entries.filter(e => !e.mastered);
  saveMistakeStore(store);
  return store;
}
