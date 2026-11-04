/**
 * Tiny IndexedDB helper for the platform layer (sync bookkeeping, automatic backups).
 *
 * It uses its own database so it can never interfere with the app's quiz stores (`qmp_store`).
 * If IndexedDB is unavailable (private mode, old WebView) it degrades to an in-memory map so the
 * features keep working for the current session instead of throwing.
 */
const DB_NAME = 'qm-platform';
const DB_VERSION = 1;

export const STORE = { kv: 'kv', backups: 'backups' } as const;
export type StoreName = (typeof STORE)[keyof typeof STORE];

const memory: Record<StoreName, Map<string, unknown>> = { kv: new Map(), backups: new Map() };
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of Object.values(STORE)) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then(db => {
    if (!db) return undefined;
    return new Promise<T | undefined>(resolve => {
      try {
        const req = fn(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  });
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return memory[store].get(key) as T | undefined;
  return (await run<T>(store, 'readonly', s => s.get(key))) as T | undefined;
}

export async function idbPut(store: StoreName, value: unknown, key: string): Promise<boolean> {
  const db = await openDb();
  if (!db) { memory[store].set(key, value); return true; }
  return new Promise<boolean>(resolve => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  if (!db) { memory[store].delete(key); return; }
  await run(store, 'readwrite', s => s.delete(key));
}

export async function idbKeys(store: StoreName): Promise<string[]> {
  const db = await openDb();
  if (!db) return [...memory[store].keys()];
  const keys = await run<IDBValidKey[]>(store, 'readonly', s => s.getAllKeys());
  return (keys ?? []).map(String);
}

/** Test hook: forget the cached connection and in-memory fallback. */
export function __resetIdbForTests(): void {
  dbPromise = null;
  memory.kv.clear();
  memory.backups.clear();
}

/** Test hooks: switch the in-memory fallback between simulated devices. */
export function __snapshotIdbForTests(): Record<string, Array<[string, unknown]>> {
  return { kv: [...memory.kv.entries()], backups: [...memory.backups.entries()] };
}
export function __restoreIdbForTests(snap: Record<string, Array<[string, unknown]>> | null): void {
  dbPromise = null;
  memory.kv = new Map(snap?.kv ?? []);
  memory.backups = new Map(snap?.backups ?? []);
}
