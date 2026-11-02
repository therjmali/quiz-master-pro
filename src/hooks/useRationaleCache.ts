import { useState, useEffect, useRef, useCallback } from 'react';
import { idbGet, idbSet } from '../utils/indexedDB';
import { cleanExplanationBlock } from '../lib/rationaleFormat';

/** Strip emoji/symbols from already-saved AI explanations as they load. */
function cleanAll(cache: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cache)) { const c = cleanExplanationBlock(v); if (c) out[k] = c; }
  return out;
}

const IDB_KEY = 'rationale_cache';
const LS_KEY = 'qmp_rationale_cache'; // legacy
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ENTRIES = 800;

interface CacheEntry {
  text: string;
  ts: number;
}

type CacheStore = Record<string, CacheEntry>;

/** Load from IndexedDB (primary) or localStorage (legacy fallback) */
async function loadCacheAsync(): Promise<Record<string, string>> {
  const now = Date.now();

  // Try IndexedDB first
  try {
    const store = await idbGet<CacheStore>(IDB_KEY);
    if (store && Object.keys(store).length > 0) {
      const result: Record<string, string> = {};
      for (const [key, entry] of Object.entries(store)) {
        if (now - entry.ts < CACHE_TTL_MS) {
          result[key] = entry.text;
        }
      }
      return result;
    }
  } catch {}

  // Migrate from localStorage if available
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const legacyStore: CacheStore = JSON.parse(raw);
      const result: Record<string, string> = {};
      for (const [key, entry] of Object.entries(legacyStore)) {
        if (now - entry.ts < CACHE_TTL_MS) {
          result[key] = entry.text;
        }
      }
      // Migrate to IndexedDB and remove from localStorage
      await saveCacheAsync(result);
      try { localStorage.removeItem(LS_KEY); } catch {}
      return result;
    }
  } catch {}

  // Try old sessionStorage format
  try {
    const old = sessionStorage.getItem('qmp_rationale_cache');
    if (old) {
      const parsed = JSON.parse(old) as Record<string, string>;
      sessionStorage.removeItem('qmp_rationale_cache');
      await saveCacheAsync(parsed);
      return parsed;
    }
  } catch {}

  return {};
}

/** Synchronous fallback for initial state (reads localStorage) */
function loadCacheSync(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const store: CacheStore = JSON.parse(raw);
    const now = Date.now();
    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(store)) {
      if (now - entry.ts < CACHE_TTL_MS) {
        result[key] = entry.text;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Save cache to IndexedDB (primary) with localStorage fallback */
async function saveCacheAsync(cache: Record<string, string>): Promise<void> {
  const now = Date.now();

  // Load existing to preserve timestamps
  let existingStore: CacheStore = {};
  try {
    const existing = await idbGet<CacheStore>(IDB_KEY);
    if (existing) existingStore = existing;
  } catch {}

  const store: CacheStore = {};
  for (const [key, text] of Object.entries(cache)) {
    store[key] = { text, ts: existingStore[key]?.ts || now };
  }

  // Keep only most recent entries to prevent unbounded growth
  const entries = Object.entries(store)
    .sort((a, b) => b[1].ts - a[1].ts)
    .slice(0, MAX_ENTRIES);
  const trimmed = Object.fromEntries(entries);

  try {
    await idbSet(IDB_KEY, trimmed);
  } catch {
    // Fallback to localStorage
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
    } catch {}
  }
}

// Debounce saves to avoid hammering IndexedDB
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(cache: Record<string, string>) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveCacheAsync(cache), 500);
}

/**
 * Rationale cache — uses IndexedDB for large storage capacity.
 * Falls back to localStorage gracefully.
 * Preserves expensive AI-generated explanations across sessions (7-day TTL).
 */
export function useRationaleCache() {
  const [rationaleCache, setRationaleCache] = useState<Record<string, string>>(() => cleanAll(loadCacheSync()));
  const rationaleCacheRef = useRef<Record<string, string>>({});
  const initializedRef = useRef(false);

  // Async initialization — load from IndexedDB (may have more data than localStorage)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    loadCacheAsync().then((data) => {
      if (Object.keys(data).length > 0) {
        setRationaleCache((prev) => {
          // Merge: IndexedDB data + any new entries added during load
          const merged = cleanAll({ ...data, ...prev });
          return merged;
        });
      }
    });
  }, []);

  // Persist on changes
  useEffect(() => {
    rationaleCacheRef.current = rationaleCache;
    debouncedSave(rationaleCache);
  }, [rationaleCache]);

  const addToCache = useCallback((question: string, rationale: string) => {
    setRationaleCache((prev) => ({ ...prev, [question]: cleanExplanationBlock(rationale) }));
  }, []);

  return { rationaleCache, setRationaleCache, rationaleCacheRef, addToCache };
}
