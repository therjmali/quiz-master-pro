/**
 * Smart Bookmark Folders — organized by Subject / Quiz / Date
 * Now backed by IndexedDB with localStorage mirror.
 */

import { idbGet, idbSet } from './indexedDB';

export interface BookmarkedQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  userAnswer: string | null;
  difficulty?: string;
  questionType?: string;
  quizTitle?: string;
  subject?: string;
  bookmarkedAt: number;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  subject: string;
  quizTitle: string;
  date: string; // YYYY-MM-DD
  questions: BookmarkedQuestion[];
  createdAt: number;
}

export interface BookmarkStore {
  version: 2;
  folders: BookmarkFolder[];
}

const STORE_KEY = 'qmp_bookmarks_v2';
const OLD_KEY = 'qmp_bookmarks';
const IDB_KEY = 'qmp_bookmarks_idb';

// In-memory cache
let _cache: BookmarkStore | null = null;

function genId(): string {
  return `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Initialize from IDB, falling back to localStorage */
export async function initBookmarkStore(): Promise<BookmarkStore> {
  if (_cache) return _cache;
  try {
    const idbData = await idbGet<BookmarkStore>(IDB_KEY);
    if (idbData && Array.isArray(idbData.folders)) { _cache = idbData; return _cache; }
  } catch {}
  // Fall through to sync load
  const store = getBookmarkStore();
  idbSet(IDB_KEY, store).catch(() => {});
  return store;
}

/** Read bookmark store, migrating from v1 if needed */
export function getBookmarkStore(): BookmarkStore {
  if (_cache) return _cache;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { _cache = JSON.parse(raw); return _cache!; }
  } catch {}

  // Attempt migration from old flat bookmarks
  const store: BookmarkStore = { version: 2, folders: [] };
  try {
    const oldRaw = localStorage.getItem(OLD_KEY);
    if (oldRaw) {
      const oldSet: string[] = JSON.parse(oldRaw);
      if (Array.isArray(oldSet) && oldSet.length > 0) {
        const folder: BookmarkFolder = {
          id: genId(),
          name: 'Imported Bookmarks',
          subject: 'General',
          quizTitle: 'Imported',
          date: new Date().toISOString().split('T')[0],
          createdAt: Date.now(),
          questions: oldSet.map(q => ({
            question: q,
            options: [],
            correctAnswer: '',
            userAnswer: null,
            bookmarkedAt: Date.now(),
          })),
        };
        store.folders.push(folder);
      }
    }
  } catch {}
  _cache = store;
  saveBookmarkStore(store);
  return store;
}

export function saveBookmarkStore(store: BookmarkStore): void {
  _cache = store;
  idbSet(IDB_KEY, store).catch(() => {});
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    const allQs = store.folders.flatMap(f => f.questions.map(q => q.question));
    localStorage.setItem(OLD_KEY, JSON.stringify(allQs));
  } catch {}
}

/** Check if a question is bookmarked */
export function isBookmarked(store: BookmarkStore, questionText: string): boolean {
  return store.folders.some(f => f.questions.some(q => q.question === questionText));
}

/** Get all bookmarked question texts as a Set (for fast lookup) */
export function getBookmarkedSet(store: BookmarkStore): Set<string> {
  const set = new Set<string>();
  store.folders.forEach(f => f.questions.forEach(q => set.add(q.question)));
  return set;
}

/** Find folder key for auto-creation */
function folderKey(subject: string, quizTitle: string, date: string): string {
  return `${subject}||${quizTitle}||${date}`;
}

/** Add a bookmark — auto-creates folder by Subject / Quiz / Date */
export function addBookmark(
  store: BookmarkStore,
  question: BookmarkedQuestion,
  subject: string,
  quizTitle: string,
): BookmarkStore {
  // Already bookmarked?
  if (isBookmarked(store, question.question)) return store;

  const date = new Date().toISOString().split('T')[0];
  const sub = subject || 'General';
  const title = quizTitle || 'Untitled Quiz';
  const key = folderKey(sub, title, date);

  let folder = store.folders.find(f => folderKey(f.subject, f.quizTitle, f.date) === key);
  if (!folder) {
    folder = {
      id: genId(),
      name: `${sub} / ${title}`,
      subject: sub,
      quizTitle: title,
      date,
      createdAt: Date.now(),
      questions: [],
    };
    store.folders.unshift(folder);
  }

  folder.questions.push({ ...question, bookmarkedAt: Date.now() });
  saveBookmarkStore(store);
  return { ...store };
}

/** Remove a bookmark by question text — removes empty folders */
export function removeBookmark(store: BookmarkStore, questionText: string): BookmarkStore {
  for (const folder of store.folders) {
    folder.questions = folder.questions.filter(q => q.question !== questionText);
  }
  store.folders = store.folders.filter(f => f.questions.length > 0);
  saveBookmarkStore(store);
  return { ...store };
}

/** Toggle bookmark */
export function toggleBookmark(
  store: BookmarkStore,
  questionText: string,
  questionData?: BookmarkedQuestion,
  subject?: string,
  quizTitle?: string,
): { store: BookmarkStore; added: boolean } {
  if (isBookmarked(store, questionText)) {
    return { store: removeBookmark(store, questionText), added: false };
  }
  if (!questionData) return { store, added: false };
  return {
    store: addBookmark(store, questionData, subject || '', quizTitle || ''),
    added: true,
  };
}

/** Get total bookmark count */
export function totalBookmarks(store: BookmarkStore): number {
  return store.folders.reduce((a, f) => a + f.questions.length, 0);
}

/** Get subject icon */
export function getSubjectIcon(subject: string): string {
  const lower = subject.toLowerCase();
  if (lower.includes('math'))    return '📐';
  if (lower.includes('science') || lower.includes('physics') || lower.includes('chemistry') || lower.includes('bio')) return '🔬';
  if (lower.includes('english') || lower.includes('grammar') || lower.includes('language')) return '📝';
  if (lower.includes('history')) return '📜';
  if (lower.includes('geo'))    return '🌍';
  if (lower.includes('computer') || lower.includes('programming') || lower.includes('coding')) return '💻';
  if (lower.includes('economics') || lower.includes('business')) return '📊';
  if (lower.includes('law'))    return '⚖️';
  if (lower.includes('medical') || lower.includes('anatomy') || lower.includes('pharma')) return '🏥';
  if (lower.includes('general')) return '📚';
  return '📖';
}
