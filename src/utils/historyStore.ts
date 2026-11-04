/**
 * Centralized History Store — single source of truth for quiz history.
 *
 * Uses IndexedDB as primary storage (virtually unlimited) with an in-memory
 * cache for synchronous reads.  Mirrors the most recent 50 summary records
 * to localStorage for instant first-paint before IDB finishes loading.
 *
 * All components that previously hit `localStorage.getItem('qmp_history')`
 * directly should import from here instead.
 */

import { QuizResult } from '../types/quiz';
import { idbGet, idbSet } from './indexedDB';
import { trashRemovedResults } from './historyTrash';

// ─── Constants ──────────────────────────────────────────────────────────────────

const IDB_KEY = 'qmp_history_idb';
const LS_MIRROR_KEY = 'qmp_history'; // keep same key for backward compat
const LS_MIRROR_MAX = 50;

// ─── In-memory cache ────────────────────────────────────────────────────────────

let _cache: QuizResult[] | null = null;
let _initPromise: Promise<void> | null = null;
let _writeLock = false;

// ─── Event bus ──────────────────────────────────────────────────────────────────

type Listener = (history: QuizResult[]) => void;
const _listeners = new Set<Listener>();

function _notify() {
  const snap = _cache ?? [];
  _listeners.forEach(fn => { try { fn(snap); } catch {} });
}

/** Subscribe to history changes. Returns an unsubscribe function. */
export function onHistoryChange(fn: Listener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────────

/** Eagerly load from IDB into the in-memory cache. Call once at app startup. */
export function initHistoryStore(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    // IndexedDB holds the FULL history (with quiz data) and is authoritative.
    // An existing-but-empty array is a valid state (e.g. after "Clear Local Data").
    try {
      const idbData = await idbGet<QuizResult[]>(IDB_KEY);
      if (Array.isArray(idbData)) {
        _cache = idbData;
        return;
      }
    } catch {}
    // Fallback: hydrate from localStorage mirror (first-ever migration or IDB failure)
    try {
      const raw = localStorage.getItem(LS_MIRROR_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        _cache = Array.isArray(parsed) ? parsed : [];
        // Persist to IDB so future loads are complete and fast
        if (_cache.length > 0) idbSet(IDB_KEY, _cache).catch(() => {});
        return;
      }
    } catch {}
    _cache = [];
  })();
  return _initPromise;
}

/** Forget the init promise so the next init re-reads storage (used after a full reset). */
export function resetHistoryStoreInit(): void {
  _initPromise = null;
}

// ─── Sync reads (from in-memory cache) ──────────────────────────────────────────

/**
 * Synchronous read — returns the in-memory cache instantly.
 * If the store hasn't initialized yet, falls back to localStorage mirror.
 */
export function getHistorySync(): QuizResult[] {
  if (_cache !== null) return _cache;
  // Fallback: read from localStorage for instant first paint
  try {
    const raw = localStorage.getItem(LS_MIRROR_KEY);
    if (raw) {
      _cache = JSON.parse(raw);
      return _cache!;
    }
  } catch {}
  return [];
}

/** Async read — ensures IDB is fully loaded first. */
export async function getHistory(): Promise<QuizResult[]> {
  await initHistoryStore();
  return _cache ?? [];
}

// ─── Writes ─────────────────────────────────────────────────────────────────────

/**
 * Replace the entire history array.
 * Updates in-memory cache synchronously, then persists to IDB + localStorage
 * mirror in the background.
 */
export function setHistory(history: QuizResult[]): void {
  const previous = _cache;
  _cache = history;
  // Anything that disappeared is parked in the local trash (restorable for 30 days by default).
  trashRemovedResults(previous, history);
  _persistAsync(history);
  _notify();
}

/**
 * Read-modify-write with a simple async lock to prevent concurrent overwrites.
 * The `updater` receives the current history and must return the new array.
 */
export async function updateHistory(
  updater: (current: QuizResult[]) => QuizResult[],
): Promise<QuizResult[]> {
  // Wait for any in-flight write to finish
  while (_writeLock) await new Promise(r => setTimeout(r, 10));
  const current = getHistorySync();
  const next = updater(current);
  setHistory(next);
  return next;
}

/**
 * Convenience: push a single result to the front of history.
 * Returns the updated array.
 */
export function pushResult(result: QuizResult): QuizResult[] {
  const current = getHistorySync();
  // Deduplicate by id or timestamp
  const key = result.id || String(result.timestamp);
  const filtered = current.filter(r => (r.id || String(r.timestamp)) !== key);
  const next = [result, ...filtered];
  setHistory(next);
  return next;
}

/**
 * Remove a single result by id or timestamp.
 */
export function removeResult(idOrTimestamp: string | number): QuizResult[] {
  const current = getHistorySync();
  const key = String(idOrTimestamp);
  const next = current.filter(r => (r.id || String(r.timestamp)) !== key);
  setHistory(next);
  return next;
}

// ─── Persistence (fire-and-forget) ──────────────────────────────────────────────

async function _persistAsync(history: QuizResult[]): Promise<void> {
  _writeLock = true;
  try {
    // 1. Write full data to IndexedDB (unlimited storage)
    await idbSet(IDB_KEY, history);
  } catch {}
  try {
    // 2. Mirror top N summaries to localStorage for instant first-paint
    const mirror = history.slice(0, LS_MIRROR_MAX).map(r => ({
      ...r,
      quizData: undefined,
      userAnswers: undefined,
    }));
    localStorage.setItem(LS_MIRROR_KEY, JSON.stringify(mirror));
  } catch {}
  _writeLock = false;
}

// ─── Utility ────────────────────────────────────────────────────────────────────

/** Completely clear the history store (for dev/testing). */
export async function clearHistoryStore(): Promise<void> {
  _cache = [];
  _initPromise = null;
  try { await idbSet(IDB_KEY, []); } catch {}
  try { localStorage.removeItem(LS_MIRROR_KEY); } catch {}
  _notify();
}
