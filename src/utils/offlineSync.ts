/**
 * Offline sync queue — stores operations when offline,
 * processes them when connectivity is restored.
 */

const QUEUE_KEY = 'qmp_sync_queue';

export interface SyncQueueItem {
  id: string;
  type: 'saveQuizResult';
  payload: any;
  timestamp: number;
}

export function loadSyncQueue(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSyncQueue(queue: SyncQueueItem[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch {}
}

export function addToSyncQueue(type: SyncQueueItem['type'], payload: any): void {
  const queue = loadSyncQueue();
  queue.push({
    id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    timestamp: Date.now(),
  });
  saveSyncQueue(queue);
}

export function removeFromQueue(id: string): void {
  saveSyncQueue(loadSyncQueue().filter(item => item.id !== id));
}

/** Drop queued uploads for a quiz (matched by its local timestamp), e.g. when it is deleted before syncing. */
export function removeFromSyncQueueByTimestamp(localTimestamp: number): void {
  saveSyncQueue(loadSyncQueue().filter(item => item.payload?.localTimestamp !== localTimestamp));
}

export function clearSyncQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

export function getQueueCount(): number {
  return loadSyncQueue().length;
}

/** Check if browser is online */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/** Register online listener to process queue */
export function registerOnlineSync(processor: (item: SyncQueueItem) => Promise<boolean>): () => void {
  const processQueue = async () => {
    const queue = loadSyncQueue();
    if (!queue.length || !isOnline()) return;

    for (const item of queue) {
      try {
        const ok = await processor(item);
        if (ok) removeFromQueue(item.id);
      } catch {
        // Keep in queue for next attempt
      }
    }
  };

  window.addEventListener('online', processQueue);
  // Also try on load
  if (isOnline()) setTimeout(processQueue, 5000);

  return () => window.removeEventListener('online', processQueue);
}
