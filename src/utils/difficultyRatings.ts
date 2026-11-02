/**
 * User-rated question difficulty storage.
 * Maps question text → array of difficulty levels.
 */

const STORAGE_KEY = 'qmp_difficulty_ratings';

export interface DifficultyRating {
  questionHash: string;
  rating: string; // 'easy' | 'medium' | 'hard'
  timestamp: number;
}

function hashQuestion(q: string): string {
  return q.slice(0, 80).replace(/\s+/g, ' ').trim().toLowerCase();
}

export function getAllRatings(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export function rateQuestion(question: string, rating: string): void {
  const all = getAllRatings();
  const key = hashQuestion(question);
  if (!all[key]) all[key] = [];
  all[key].push(rating);
  if (all[key].length > 10) all[key] = all[key].slice(-10);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getAverageRating(question: string): string | null {
  const all = getAllRatings();
  const key = hashQuestion(question);
  const ratings = all[key];
  if (!ratings || ratings.length === 0) return null;
  // Return the most recent rating
  return ratings[ratings.length - 1];
}

export function rateBulk(questions: { question: string; rating: string }[]): void {
  const all = getAllRatings();
  questions.forEach(({ question, rating }) => {
    const key = hashQuestion(question);
    if (!all[key]) all[key] = [];
    all[key].push(rating);
    if (all[key].length > 10) all[key] = all[key].slice(-10);
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
