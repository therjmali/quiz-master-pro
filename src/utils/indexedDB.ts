/**
 * Simple IndexedDB key-value store.
 * Falls back to localStorage if IndexedDB is unavailable.
 */

const DB_NAME = 'qmp_store';
const STORE_NAME = 'keyval';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    } catch (e) {
      dbPromise = null;
      reject(e);
    }
  });
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

/** Get a value from IndexedDB by key */
export async function idbGet<T = any>(key: string): Promise<T | undefined> {
  try {
    return await withStore<T>('readonly', (store) => store.get(key));
  } catch {
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem(`idb_${key}`);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }
}

/** Set a value in IndexedDB */
export async function idbSet(key: string, value: any): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.put(value, key));
  } catch {
    // Fallback to localStorage
    try {
      localStorage.setItem(`idb_${key}`, JSON.stringify(value));
    } catch {
      // Storage full — silently fail
    }
  }
}

/** Delete a key from IndexedDB */
export async function idbDelete(key: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(key));
  } catch {
    try {
      localStorage.removeItem(`idb_${key}`);
    } catch {}
  }
}

/** Get multiple values from IndexedDB by keys */
export async function idbGetMulti<T = any>(keys: string[]): Promise<Map<string, T>> {
  const result = new Map<string, T>();
  if (!keys.length) return result;
  try {
    const db = await openDB();
    return new Promise<Map<string, T>>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      let remaining = keys.length;
      keys.forEach(key => {
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result !== undefined) result.set(key, req.result);
          if (--remaining === 0) resolve(result);
        };
        req.onerror = () => {
          if (--remaining === 0) resolve(result);
        };
      });
    });
  } catch {
    // Fallback to localStorage
    keys.forEach(key => {
      try {
        const raw = localStorage.getItem(`idb_${key}`);
        if (raw) result.set(key, JSON.parse(raw));
      } catch {}
    });
    return result;
  }
}

/** Get all keys from IndexedDB */
export async function idbKeys(): Promise<string[]> {
  try {
    return await withStore<IDBValidKey[]>('readonly', (store) =>
      store.getAllKeys(),
    ) as string[];
  } catch {
    return [];
  }
}

/**
 * Estimate storage usage.
 * Returns { used, quota } in bytes, or null if not available.
 */
export async function estimateStorage(): Promise<{ used: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { used: usage || 0, quota: quota || 0 };
    }
  } catch {}
  return null;
}

/** Remove every key from the IndexedDB store (and the localStorage fallback copies). */
export async function idbClearAll(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.clear());
  } catch {}
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('idb_')) stale.push(k);
    }
    stale.forEach(k => localStorage.removeItem(k));
  } catch {}
}

/** Delete every IndexedDB key that starts with `prefix`. */
export async function idbDeleteByPrefix(prefix: string): Promise<void> {
  try {
    const keys = (await idbKeys()).filter(k => typeof k === 'string' && k.startsWith(prefix));
    for (const k of keys) await idbDelete(k);
  } catch {}
}
