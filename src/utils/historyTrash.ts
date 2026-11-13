/**
 * Local trash for quiz history.
 *
 * Deleting a result from history never destroys it straight away: removed results wait here for the
 * retention period (30 days by default) and can be restored from Settings -> Data & Trash. Stored in
 * IndexedDB (results can be large) with a tiny localStorage summary for cheap counters and change
 * detection. Part of the cloud sync, so a delete on one device can be undone from another.
 */
import type { QuizResult } from '../types/quiz';
import { idbGet, idbSet } from './indexedDB';

export interface TrashedResult { result: QuizResult; deletedAt: number }

const IDB_KEY = 'qmp_history_trash_idb';
const META_KEY = 'qmp_history_trash_meta';
const RETENTION_KEY = 'qmp_trash_retention_days';
const MAX_ITEMS = 500;
export const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

let cache: TrashedResult[] | null = null;
let loading: Promise<TrashedResult[]> | null = null;
let suppress = 0;
const listeners = new Set<() => void>();

export function resultKey(r: Pick<QuizResult, 'id' | 'timestamp' | 'totalQuestions'>): string {
  return r.id ? String(r.id) : `ts_${r.timestamp}_${r.totalQuestions ?? 0}`;
}

export function getTrashRetentionDays(): number {
  try {
    const raw = localStorage.getItem(RETENTION_KEY);
    if (raw === null) return DEFAULT_RETENTION_DAYS;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_RETENTION_DAYS;
  } catch { return DEFAULT_RETENTION_DAYS; }
}

/** 0 = keep forever. */
export function setTrashRetentionDays(days: number): void {
  try { localStorage.setItem(RETENTION_KEY, String(Math.max(0, Math.floor(days)))); } catch { /* ignore */ }
}

export function onHistoryTrashChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function notify(): void { listeners.forEach(cb => { try { cb(); } catch { /* ignore */ } }); }

export async function loadHistoryTrash(): Promise<TrashedResult[]> {
  if (cache) return cache;
  if (!loading) {
    loading = (async () => {
      let stored: TrashedResult[] | undefined;
      try { stored = await idbGet<TrashedResult[]>(IDB_KEY); } catch { /* ignore */ }
      cache = Array.isArray(stored) ? stored.filter(t => t && t.result) : [];
      loading = null;
      return cache;
    })();
  }
  return loading;
}

export function getHistoryTrashSync(): TrashedResult[] { return cache ?? []; }

export async function saveHistoryTrash(items: TrashedResult[]): Promise<void> {
  const trimmed = [...items].sort((a, b) => b.deletedAt - a.deletedAt).slice(0, MAX_ITEMS);
  cache = trimmed;
  try { await idbSet(IDB_KEY, trimmed); } catch { /* ignore */ }
  try {
    localStorage.setItem(META_KEY, JSON.stringify(trimmed.map(t => ({ id: resultKey(t.result), deletedAt: t.deletedAt }))));
  } catch { /* ignore */ }
  notify();
}

/** Run `fn` without sending removed results to the trash (sync apply, restore from backup, resets). */
export function withoutHistoryTrash<T>(fn: () => T): T {
  suppress++;
  try { return fn(); } finally { suppress--; }
}

/** Called by historyStore.setHistory: whatever disappeared from the list is parked in the trash. */
export function trashRemovedResults(prev: readonly QuizResult[] | null | undefined, next: readonly QuizResult[]): void {
  if (suppress > 0 || !prev || prev.length === 0) return;
  const kept = new Set(next.map(resultKey));
  const removed = prev.filter(r => !kept.has(resultKey(r)));
  if (removed.length === 0) return;
  const now = Date.now();
  void (async () => {
    const current = await loadHistoryTrash();
    const known = new Set(current.map(t => resultKey(t.result)));
    const freshCandidates = removed.filter(r => !known.has(resultKey(r)));
    if (freshCandidates.length === 0) return;
    let hydrated = freshCandidates;
    try {
      const { loadFullResults } = await import('./reports/loadFull');
      hydrated = (await loadFullResults(freshCandidates)).results;
    } catch { /* fallback to unhydrated record if IDB unavailable */ }
    const fresh = hydrated.map(result => ({ result, deletedAt: now }));
    if (fresh.length) await saveHistoryTrash([...fresh, ...current]);
  })();
}

export async function deleteFromHistoryTrash(keys: readonly string[]): Promise<void> {
  const drop = new Set(keys);
  const current = await loadHistoryTrash();
  await saveHistoryTrash(current.filter(t => !drop.has(resultKey(t.result))));
}

export async function emptyHistoryTrash(): Promise<number> {
  const n = (await loadHistoryTrash()).length;
  await saveHistoryTrash([]);
  return n;
}

/** Permanently drop everything older than the retention period. Returns how many were purged. */
export async function purgeExpiredHistoryTrash(now = Date.now()): Promise<number> {
  const days = getTrashRetentionDays();
  if (days === 0) return 0;
  const current = await loadHistoryTrash();
  const cutoff = now - days * DAY_MS;
  const keep = current.filter(t => t.deletedAt >= cutoff);
  if (keep.length === current.length) return 0;
  await saveHistoryTrash(keep);
  return current.length - keep.length;
}

export function daysLeft(deletedAt: number, now = Date.now()): number | null {
  const days = getTrashRetentionDays();
  if (days === 0) return null;
  return Math.max(0, Math.ceil((deletedAt + days * DAY_MS - now) / DAY_MS));
}

/** Test hook. */
export function __resetHistoryTrashForTests(): void { cache = null; loading = null; suppress = 0; listeners.clear(); }
