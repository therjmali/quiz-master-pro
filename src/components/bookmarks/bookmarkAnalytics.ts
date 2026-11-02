import { FileNode, BookmarkData, getAllBookmarks } from '../../utils/fileTree';

export interface BookmarkStats {
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number;
  easy: number;
  medium: number;
  hard: number;
}

export interface QuizGroup {
  quizTitle: string;
  bookmarks: FileNode[];
  stats: BookmarkStats;
}

export interface SubjectGroup {
  subject: string;
  icon: string;
  bookmarks: FileNode[];
  stats: BookmarkStats;
  quizzes: QuizGroup[];
}

function getSubjectIcon(subject: string): string {
  const l = subject.toLowerCase();
  if (l.includes('math')) return '📐';
  if (l.includes('science') || l.includes('physics') || l.includes('chemistry') || l.includes('bio')) return '🔬';
  if (l.includes('english') || l.includes('grammar') || l.includes('language')) return '📝';
  if (l.includes('history')) return '📜';
  if (l.includes('geo')) return '🌍';
  if (l.includes('computer') || l.includes('programming') || l.includes('coding')) return '💻';
  if (l.includes('economics') || l.includes('business')) return '📊';
  if (l.includes('law')) return '⚖️';
  if (l.includes('medical') || l.includes('anatomy') || l.includes('pharma')) return '🏥';
  if (l.includes('general')) return '📚';
  return '📖';
}

function getStatus(bm: BookmarkData): 'correct' | 'wrong' | 'skipped' {
  if (bm.userAnswer === null) return 'skipped';
  return bm.userAnswer === bm.correctAnswer ? 'correct' : 'wrong';
}

export function computeStats(bookmarks: FileNode[]): BookmarkStats {
  const total = bookmarks.length;
  let correct = 0, wrong = 0, skipped = 0, easy = 0, medium = 0, hard = 0;
  for (const b of bookmarks) {
    if (!b.bookmarkData) continue;
    const s = getStatus(b.bookmarkData);
    if (s === 'correct') correct++;
    else if (s === 'wrong') wrong++;
    else skipped++;
    const d = (b.bookmarkData.difficulty || 'medium').toLowerCase();
    if (d === 'easy') easy++;
    else if (d === 'hard') hard++;
    else medium++;
  }
  return { total, correct, wrong, skipped, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0, easy, medium, hard };
}

export function groupBySubject(root: FileNode): SubjectGroup[] {
  const all = getAllBookmarks(root);
  const map = new Map<string, FileNode[]>();
  for (const b of all) {
    const s = b.bookmarkData?.subject || 'General';
    if (!map.has(s)) map.set(s, []);
    map.get(s)!.push(b);
  }
  return Array.from(map.entries()).map(([subject, bookmarks]) => {
    const quizMap = new Map<string, FileNode[]>();
    for (const b of bookmarks) {
      const q = b.bookmarkData?.quizTitle || 'Untitled';
      if (!quizMap.has(q)) quizMap.set(q, []);
      quizMap.get(q)!.push(b);
    }
    const quizzes: QuizGroup[] = Array.from(quizMap.entries()).map(([quizTitle, qBookmarks]) => ({
      quizTitle,
      bookmarks: qBookmarks,
      stats: computeStats(qBookmarks),
    }));
    return {
      subject,
      icon: getSubjectIcon(subject),
      bookmarks,
      stats: computeStats(bookmarks),
      quizzes,
    };
  }).sort((a, b) => b.stats.total - a.stats.total);
}

export function getBookmarkStatus(bm: BookmarkData) { return getStatus(bm); }

// Revision notes cache
const NOTES_CACHE_KEY = 'qmp_revision_notes_cache';

export function getCachedNotes(key: string): string | null {
  try {
    const cache = JSON.parse(localStorage.getItem(NOTES_CACHE_KEY) || '{}');
    return cache[key] || null;
  } catch { return null; }
}

export function setCachedNotes(key: string, notes: string): void {
  try {
    const cache = JSON.parse(localStorage.getItem(NOTES_CACHE_KEY) || '{}');
    cache[key] = notes;
    localStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}
