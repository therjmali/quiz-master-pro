/**
 * Revision sheet cache — uses IndexedDB for large markdown content.
 * Falls back to localStorage for backwards compatibility.
 */
import { idbGet, idbSet } from './indexedDB';

const IDB_PREFIX = 'revision_';
const LS_PREFIX = 'qmp_revision_';

/** Get a cached revision sheet */
export async function getRevisionCache(timestamp: number): Promise<string | null> {
  const key = String(timestamp);

  // Try IndexedDB first
  try {
    const val = await idbGet<string>(IDB_PREFIX + key);
    if (val) return val;
  } catch {}

  // Fallback to localStorage
  try {
    const val = localStorage.getItem(LS_PREFIX + key);
    if (val) {
      // Migrate to IndexedDB
      setRevisionCache(timestamp, val).catch(() => {});
      try { localStorage.removeItem(LS_PREFIX + key); } catch {}
      return val;
    }
  } catch {}

  return null;
}

/** Save a revision sheet to cache */
export async function setRevisionCache(timestamp: number, content: string): Promise<void> {
  const key = String(timestamp);
  try {
    await idbSet(IDB_PREFIX + key, content);
  } catch {
    // Fallback to localStorage
    try { localStorage.setItem(LS_PREFIX + key, content); } catch {}
  }
}

/** Synchronous check — only checks localStorage (for initial render guards) */
export function hasRevisionCacheSync(timestamp: number): boolean {
  try {
    return !!localStorage.getItem(LS_PREFIX + String(timestamp));
  } catch {
    return false;
  }
}
